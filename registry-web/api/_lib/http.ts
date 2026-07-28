// Vercel's Node runtime passes Node-shaped req/res objects. Typing them
// structurally keeps this deployable without pulling in @vercel/node just
// for two interfaces (same pattern as web-news). This API is entirely
// public-read: no auth, no cookies, no sessions.

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

export function sendJSON(res: Res, code: number, body: unknown, cacheControl = "no-store") {
  res.status(code)
  res.setHeader("Content-Type", "application/json; charset=utf-8")
  res.setHeader("Cache-Control", cacheControl)
  res.json(body)
}

export function sendError(res: Res, code: number, message: string) {
  sendJSON(res, code, { error: { message } })
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
