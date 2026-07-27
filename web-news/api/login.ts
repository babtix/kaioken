import { checkPassword, createSession, sessionCookie } from "./_lib/auth"
import { readBody, sendError, sendJSON, type Req, type Res } from "./_lib/http"

// POST /api/login  {"password": "..."}
export default async function handler(req: Req, res: Res) {
  if (req.method !== "POST") return sendError(res, 405, "Use POST.")
  const { password } = readBody<{ password?: string }>(req)
  if (!password) return sendError(res, 400, "Password is required.")

  try {
    if (!checkPassword(password)) return sendError(res, 401, "Incorrect password.")
    res.setHeader("Set-Cookie", sessionCookie(await createSession()))
    sendJSON(res, 200, { ok: true })
  } catch (err) {
    // A missing ADMIN_PASSWORD/AUTH_SECRET is a deployment fault, not a bad
    // credential — say so rather than reporting a wrong password.
    sendError(res, 500, err instanceof Error ? err.message : "Auth is misconfigured.")
  }
}
