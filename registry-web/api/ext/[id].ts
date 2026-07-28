import {
  fetchIndex,
  fetchLatestRelease,
  fetchRawFile,
  fetchReadme,
  fetchReleases,
} from "../_lib/github.js"
import { firstQuery, sendError, sendJSON, type Req, type Res } from "../_lib/http.js"
import { parseManifest, validateManifest } from "../_lib/manifest.js"
import type { ExtDetail, ManifestData } from "../_lib/types.js"

// GET /api/ext/[id] — everything the detail page shows for one listing:
// the index entry, the manifest at the latest release (falling back to the
// default branch pre-release), the README, and the release history.
//
// Flagged entries are served too: the front-end renders a warning page for
// them instead of install instructions, which beats a hole in the shelf.
export default async function handler(req: Req, res: Res) {
  if (req.method !== "GET") return sendError(res, 405, "Use GET.")
  const id = (firstQuery(req, "id") ?? "").trim()
  if (!id) return sendError(res, 400, "Missing extension id.")

  let entries
  try {
    entries = await fetchIndex()
  } catch (e) {
    return sendError(res, 502, `registry index unreachable: ${e instanceof Error ? e.message : String(e)}`)
  }
  const entry = entries.find((e) => e.id === id)
  if (!entry) return sendError(res, 404, `No extension ${JSON.stringify(id)} in the registry.`)

  const detail: ExtDetail = { entry, manifest: null, manifest_problems: [], readme: null, releases: [] }

  // Every GitHub sub-fetch degrades independently: a repo with a broken
  // README still shows its releases, and vice versa.
  try {
    const latest = await fetchLatestRelease(entry.repo)
    if (latest) {
      detail.entry = {
        ...entry,
        version: latest.tag.replace(/^v/, ""),
        released_at: latest.published_at,
        downloads: latest.downloads,
      }
    }
    const src = await fetchRawFile(entry.repo, latest?.tag ?? "HEAD", "extension.yaml")
    if (src !== null) {
      const parsed = parseManifest(src)
      if (parsed.manifest) {
        detail.manifest = scrubManifest(parsed.manifest)
        detail.manifest_problems = validateManifest(parsed.manifest)
      } else if (parsed.error) {
        detail.manifest_problems = [parsed.error]
      }
    } else {
      detail.manifest_problems = ["no extension.yaml found at the latest release"]
    }
  } catch {
    // release/manifest unavailable — the entry still renders
  }
  try {
    detail.readme = await fetchReadme(entry.repo)
  } catch {
    // no readme is fine
  }
  try {
    detail.releases = await fetchReleases(entry.repo)
  } catch {
    // no release history is fine
  }

  sendJSON(res, 200, detail, "s-maxage=300, stale-while-revalidate=3600")
}

/** Keep only the manifest fields the page renders — never echo arbitrary YAML. */
function scrubManifest(m: ManifestData): ManifestData {
  return {
    id: m.id,
    name: m.name,
    version: m.version,
    description: m.description,
    author: m.author,
    repo: m.repo,
    type: m.type,
    mcp: m.mcp ? { command: m.mcp.command, args: m.mcp.args, env: m.mcp.env } : undefined,
    wasm: m.wasm ? { entry: m.wasm.entry } : undefined,
    permissions: m.permissions,
    minKaiokenVersion: m.minKaiokenVersion,
  }
}
