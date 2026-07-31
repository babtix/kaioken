import { isAuthed, sendJSON, type Req, type Res } from "./_lib/http.js"
import { storageMode, storageMustBeDurable } from "./_lib/store.js"

// GET /api/session — lets the admin page decide what to render on load.
//
// It also reports where posts are being kept. Without that the admin has no way
// to tell a working deployment from one that accepts posts and drops them on
// the next cold start, which is the same thing from the author's chair right up
// until the work is gone.
export default async function handler(req: Req, res: Res) {
  sendJSON(res, 200, {
    authed: await isAuthed(req),
    storage: storageMode(),
    durable: storageMode() === "kv" || !storageMustBeDurable(),
  })
}
