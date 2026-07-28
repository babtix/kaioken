import { deletePost, getPost, updatePost, type Post } from "../_lib/store.js"
import {
  firstQuery,
  isAuthed,
  readBody,
  requireAuth,
  sendError,
  sendJSON,
  type Req,
  type Res,
} from "../_lib/http.js"
import { normaliseTags } from "../posts.js"

// GET    /api/posts/:id — one post (drafts require a session)
// PUT    /api/posts/:id — update (admin only)
// DELETE /api/posts/:id — remove (admin only)
export default async function handler(req: Req, res: Res) {
  const id = firstQuery(req, "id")
  if (!id) return sendError(res, 400, "Missing post id.")

  if (req.method === "GET") {
    const post = await getPost(id)
    if (!post) return sendError(res, 404, "No such post.")
    // A draft is not public: 404 rather than 403, so its existence stays private.
    if (!post.published && !(await isAuthed(req))) return sendError(res, 404, "No such post.")
    return sendJSON(res, 200, { post })
  }

  if (req.method === "PUT") {
    if (!(await requireAuth(req, res))) return
    const input = readBody<Partial<Post>>(req)
    const patch: Partial<Post> = {}
    if (typeof input.title === "string") {
      const title = input.title.trim()
      if (!title) return sendError(res, 400, "Title cannot be empty.")
      patch.title = title
    }
    if (typeof input.summary === "string") patch.summary = input.summary.trim()
    if (typeof input.body === "string") patch.body = input.body
    if (typeof input.published === "boolean") patch.published = input.published
    if (input.tags !== undefined) patch.tags = normaliseTags(input.tags)

    const post = await updatePost(id, patch)
    if (!post) return sendError(res, 404, "No such post.")
    return sendJSON(res, 200, { post })
  }

  if (req.method === "DELETE") {
    if (!(await requireAuth(req, res))) return
    if (!(await deletePost(id))) return sendError(res, 404, "No such post.")
    return sendJSON(res, 200, { ok: true })
  }

  sendError(res, 405, "Use GET, PUT or DELETE.")
}
