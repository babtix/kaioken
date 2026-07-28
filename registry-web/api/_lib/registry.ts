// Index enrichment: merge live GitHub release data (latest version, release
// date, asset download counts) onto the raw index. Best effort by design —
// GitHub being down must never take discovery down with it, so any per-entry
// failure just leaves that entry un-enriched.

import { fetchLatestRelease, validRepo, type Fetcher } from "./github.js"
import type { EnrichedEntry, IndexEntry } from "./types.js"

export async function enrichIndex(entries: IndexEntry[], f: Fetcher = fetch): Promise<EnrichedEntry[]> {
  return Promise.all(
    entries.map(async (e): Promise<EnrichedEntry> => {
      if (!validRepo(e.repo)) return e
      try {
        const rel = await fetchLatestRelease(e.repo, f)
        if (!rel) return e
        return {
          ...e,
          version: rel.tag.replace(/^v/, ""),
          released_at: rel.published_at,
          downloads: rel.downloads,
        }
      } catch {
        return e
      }
    }),
  )
}
