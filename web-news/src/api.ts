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

export class ApiError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = "ApiError"
    this.status = status
  }
}

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    // The session lives in an HttpOnly cookie, so it has to ride along.
    credentials: "same-origin",
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!res.ok) {
    let message = `Request failed (${res.status})`
    try {
      const parsed = (await res.json()) as { error?: { message?: string } }
      if (parsed?.error?.message) message = parsed.error.message
    } catch {
      // Non-JSON error body — keep the generic message.
    }
    throw new ApiError(res.status, message)
  }
  return (await res.json()) as T
}

export type Session = {
  authed: boolean
  /** where posts are kept — "memory" means they vanish on a cold start */
  storage: "kv" | "memory"
  /** false when this deployment would lose posts; the admin warns on it */
  durable: boolean
}

export const api = {
  session: () => req<Session>("GET", "/api/session"),
  login: (password: string) => req<{ ok: true }>("POST", "/api/login", { password }),
  logout: () => req<{ ok: true }>("POST", "/api/logout"),

  list: () => req<{ posts: Post[] }>("GET", "/api/posts"),
  get: (id: string) => req<{ post: Post }>("GET", `/api/posts/${encodeURIComponent(id)}`),
  create: (input: Partial<Post>) => req<{ post: Post }>("POST", "/api/posts", input),
  update: (id: string, input: Partial<Post>) =>
    req<{ post: Post }>("PUT", `/api/posts/${encodeURIComponent(id)}`, input),
  remove: (id: string) => req<{ ok: true }>("DELETE", `/api/posts/${encodeURIComponent(id)}`),
}

/** "12 Mar 2026" — short, unambiguous, and locale-independent. */
export function formatDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
}
