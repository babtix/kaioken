import { allPosts, createPost, publishedPosts, sortPosts, type Post } from "./_lib/store"
import { isAuthed, readBody, requireAuth, sendError, sendJSON, type Req, type Res } from "./_lib/http"

type PostInput = Partial<Pick<Post, "title" | "summary" | "body" | "tags" | "published">>

// GET  /api/posts — published posts, or every post for a signed-in admin.
// POST /api/posts — create (admin only).
export default async function handler(req: Req, res: Res) {
  if (req.method === "GET") {
    // An admin needs to see drafts; everyone else must not.
    const posts = (await isAuthed(req)) ? sortPosts(await allPosts()) : await publishedPosts()
    return sendJSON(res, 200, { posts })
  }

  if (req.method === "POST") {
    if (!(await requireAuth(req, res))) return
    const input = readBody<PostInput>(req)
    const title = (input.title ?? "").trim()
    if (!title) return sendError(res, 400, "Title is required.")
    const post = await createPost({
      title,
      summary: (input.summary ?? "").trim(),
      body: input.body ?? "",
      tags: normaliseTags(input.tags),
      published: input.published ?? false,
    })
    return sendJSON(res, 201, { post })
  }

  sendError(res, 405, "Use GET or POST.")
}

/** Trims, drops blanks and de-duplicates, so tags stay a clean set. */
export function normaliseTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return []
  const seen = new Set<string>()
  for (const t of tags) {
    if (typeof t !== "string") continue
    const clean = t.trim().toLowerCase()
    if (clean) seen.add(clean)
  }
  return [...seen].slice(0, 8)
}
