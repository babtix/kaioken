import { isAuthed, sendJSON, type Req, type Res } from "./_lib/http"

// GET /api/session — lets the admin page decide what to render on load.
export default async function handler(req: Req, res: Res) {
  sendJSON(res, 200, { authed: await isAuthed(req) })
}
