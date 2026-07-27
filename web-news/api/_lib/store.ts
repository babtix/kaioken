// Post storage.
//
// Serverless functions have no disk that survives an invocation, so production
// keeps posts in a Redis-compatible KV store reached over its REST API (Vercel
// KV and Upstash both speak this). No SDK, just fetch — one less dependency to
// keep current.
//
// With no KV configured the module falls back to an in-process map so the site
// runs locally with `npm run dev` before any infrastructure exists. That
// fallback is per-process and disappears on restart, which is fine for
// development and would be wrong in production — hence the warning.

export type Post = {
  id: string
  title: string
  summary: string
  body: string
  tags: string[]
  published: boolean
  created: string
  updated: string
}

const KEY = "kaioken:news:posts"

const restUrl = process.env.KV_REST_API_URL
const restToken = process.env.KV_REST_API_TOKEN
const useKV = Boolean(restUrl && restToken)

if (!useKV && process.env.NODE_ENV === "production") {
  console.warn(
    "web-news: KV_REST_API_URL/KV_REST_API_TOKEN are unset — posts will not survive a cold start."
  )
}

// Module-scoped fallback. Survives warm invocations only, by design.
let memory: Post[] = []

async function kv(command: unknown[]): Promise<unknown> {
  const res = await fetch(restUrl!, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${restToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
  })
  if (!res.ok) throw new Error(`KV request failed: ${res.status} ${await res.text()}`)
  const json = (await res.json()) as { result?: unknown }
  return json.result
}

export async function allPosts(): Promise<Post[]> {
  if (!useKV) return [...memory]
  const raw = (await kv(["GET", KEY])) as string | null
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as Post[]) : []
  } catch {
    return []
  }
}

async function writeAll(posts: Post[]): Promise<void> {
  if (!useKV) {
    memory = posts
    return
  }
  await kv(["SET", KEY, JSON.stringify(posts)])
}

/** Newest first — the order a news feed is read in. */
export function sortPosts(posts: Post[]): Post[] {
  return [...posts].sort((a, b) => b.created.localeCompare(a.created))
}

export async function publishedPosts(): Promise<Post[]> {
  return sortPosts(await allPosts()).filter((p) => p.published)
}

export async function getPost(id: string): Promise<Post | undefined> {
  return (await allPosts()).find((p) => p.id === id)
}

export async function createPost(
  input: Pick<Post, "title" | "summary" | "body" | "tags" | "published">
): Promise<Post> {
  const now = new Date().toISOString()
  const post: Post = { ...input, id: slugId(input.title), created: now, updated: now }
  const posts = await allPosts()
  // A repeated title would otherwise silently overwrite the earlier post.
  if (posts.some((p) => p.id === post.id)) post.id = `${post.id}-${Date.now().toString(36)}`
  await writeAll([post, ...posts])
  return post
}

export async function updatePost(id: string, patch: Partial<Post>): Promise<Post | undefined> {
  const posts = await allPosts()
  const at = posts.findIndex((p) => p.id === id)
  if (at < 0) return undefined
  // id and created are identity, not content — a patch must not move them.
  const next: Post = {
    ...posts[at],
    ...patch,
    id: posts[at].id,
    created: posts[at].created,
    updated: new Date().toISOString(),
  }
  posts[at] = next
  await writeAll(posts)
  return next
}

export async function deletePost(id: string): Promise<boolean> {
  const posts = await allPosts()
  const remaining = posts.filter((p) => p.id !== id)
  if (remaining.length === posts.length) return false
  await writeAll(remaining)
  return true
}

/** URL-safe id derived from the title, so links read as words not numbers. */
export function slugId(title: string): string {
  const slug = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
  return slug || `post-${Date.now().toString(36)}`
}
