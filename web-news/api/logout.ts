import { clearCookie } from "./_lib/auth.js"
import { sendJSON, type Req, type Res } from "./_lib/http.js"

// POST /api/logout
export default async function handler(_req: Req, res: Res) {
  res.setHeader("Set-Cookie", clearCookie())
  sendJSON(res, 200, { ok: true })
}
