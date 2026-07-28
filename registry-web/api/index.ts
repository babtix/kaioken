import { fetchIndex } from "./_lib/github.js"
import { sendError, sendJSON, type Req, type Res } from "./_lib/http.js"
import { enrichIndex } from "./_lib/registry.js"

// GET /api/index — the community index enriched with live release data.
//
// The response is a bare JSON array whose entries are a superset of the
// CLI's RegistryEntry, so pointing `ext_registry` at this endpoint works.
// Edge-cached: five minutes fresh, an hour stale-while-revalidate — release
// counts are approximate by design, availability is not.
export default async function handler(req: Req, res: Res) {
  if (req.method !== "GET") return sendError(res, 405, "Use GET.")

  let entries
  try {
    entries = await fetchIndex()
  } catch (e) {
    return sendError(res, 502, `registry index unreachable: ${e instanceof Error ? e.message : String(e)}`)
  }

  // Enrichment failing wholesale must not empty the shelf.
  let out = entries
  try {
    out = await enrichIndex(entries)
  } catch {
    // serve the raw index
  }
  sendJSON(res, 200, out, "s-maxage=300, stale-while-revalidate=3600")
}
