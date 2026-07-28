import type { EnrichedEntry, IndexEntry } from "../../api/_lib/types"

// Pure browse-page logic, kept out of the component so it is testable
// without a DOM: visibility (the malicious kill switch), search, type/tag
// filtering and sorting.

export type SortKey = "name" | "downloads" | "recent"

export function hasFlag(e: IndexEntry, flag: string): boolean {
  return (e.flags ?? []).some((f) => f.toLowerCase() === flag.toLowerCase())
}

/** Flagged-malicious entries are never rendered, mirroring the CLI's browse. */
export function visibleEntries<T extends IndexEntry>(entries: T[]): T[] {
  return entries.filter((e) => !hasFlag(e, "malicious"))
}

export type BrowseFilter = { q?: string; type?: string; tag?: string }

export function filterEntries<T extends IndexEntry>(entries: T[], f: BrowseFilter): T[] {
  const q = (f.q ?? "").trim().toLowerCase()
  return entries.filter((e) => {
    if (f.type && entryType(e) !== f.type) return false
    if (f.tag && !(e.tags ?? []).includes(f.tag)) return false
    if (!q) return true
    const hay = [e.id, e.repo, e.name, e.description, e.author, ...(e.tags ?? [])].join(" ").toLowerCase()
    return hay.includes(q)
  })
}

export function sortEntries<T extends EnrichedEntry>(entries: T[], key: SortKey): T[] {
  const out = [...entries]
  switch (key) {
    case "downloads":
      out.sort((a, b) => (b.downloads ?? 0) - (a.downloads ?? 0) || a.name.localeCompare(b.name))
      break
    case "recent":
      out.sort((a, b) => (b.released_at ?? "").localeCompare(a.released_at ?? "") || a.name.localeCompare(b.name))
      break
    default:
      out.sort((a, b) => a.name.localeCompare(b.name))
  }
  return out
}

/** An absent type means declarative — the code-free default tier. */
export function entryType(e: IndexEntry): string {
  return e.type && e.type !== "" ? e.type : "declarative"
}

export function allTags(entries: IndexEntry[]): string[] {
  const tags = new Set<string>()
  for (const e of entries) for (const t of e.tags ?? []) tags.add(t)
  return [...tags].sort()
}

export function installCommand(e: IndexEntry): string {
  return `kaioken ext install ${e.repo}`
}
