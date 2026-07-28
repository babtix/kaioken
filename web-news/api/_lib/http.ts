import { readCookie, SESSION_COOKIE, verifySession } from "./auth.js"

// Vercel's Node runtime passes Node-shaped req/res objects. Typing them
// structurally keeps this deployable without pulling in @vercel/node just for
// two interfaces.
export type Req = {
  method?: string
  url?: string
  headers: Record<string, string | string[] | undefined>
  body?: unknown
  query?: Record<string, string | string[] | undefined>
}

export type Res = {
  status: (code: number) => Res
  setHeader: (name: string, value: string) => void
  json: (body: unknown) => void
  end: (body?: string) => void
}

export function sendJSON(res: Res, code: number, body: unknown) {
  res.status(code)
  res.setHeader("Content-Type", "application/json; charset=utf-8")
  // The admin API must never be cached by a CDN sitting in front of it.
  res.setHeader("Cache-Control", "no-store")
  res.json(body)
}

export function sendError(res: Res, code: number, message: string) {
  sendJSON(res, code, { error: { message } })
}

/** True when the request carries a valid admin session. */
export async function isAuthed(req: Req): Promise<boolean> {
  const header = req.headers.cookie
  const raw = Array.isArray(header) ? header.join("; ") : header
  return verifySession(readCookie(raw, SESSION_COOKIE))
}

/** Guards a mutating handler; replies 401 and returns false when unauthorised. */
export async function requireAuth(req: Req, res: Res): Promise<boolean> {
  if (await isAuthed(req)) return true
  sendError(res, 401, "Sign in first.")
  return false
}

/** Parses a JSON body whether the runtime pre-parsed it or handed over a string. */
export function readBody<T>(req: Req): T {
  if (req.body && typeof req.body === "object") return req.body as T
  if (typeof req.body === "string" && req.body) return JSON.parse(req.body) as T
  return {} as T
}

export function firstQuery(req: Req, key: string): string | undefined {
  const v = req.query?.[key]
  return Array.isArray(v) ? v[0] : v
}
