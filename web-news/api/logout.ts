import { clearCookie } from "./_lib/auth"
import { sendJSON, type Req, type Res } from "./_lib/http"

// POST /api/logout
export default async function handler(_req: Req, res: Res) {
  res.setHeader("Set-Cookie", clearCookie())
  sendJSON(res, 200, { ok: true })
}
