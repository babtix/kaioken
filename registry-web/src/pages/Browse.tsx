import { useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import type { EnrichedEntry } from "../../api/_lib/types"
import { EntryBadges } from "../components/TypeBadge"
import { api } from "../lib/api"
import { allTags, filterEntries, sortEntries, visibleEntries, type SortKey } from "../lib/filter"

const TYPES = ["declarative", "mcp", "wasm"] as const

export default function Browse() {
  const [entries, setEntries] = useState<EnrichedEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState("")
  const [type, setType] = useState("")
  const [tag, setTag] = useState("")
  const [sort, setSort] = useState<SortKey>("name")

  useEffect(() => {
    api
      .index()
      .then((e) => setEntries(visibleEntries(e)))
      .catch((e: Error) => setError(e.message))
  }, [])

  const tags = useMemo(() => (entries ? allTags(entries) : []), [entries])
  const shown = useMemo(
    () => (entries ? sortEntries(filterEntries(entries, { q, type, tag }), sort) : []),
    [entries, q, type, tag, sort],
  )

  return (
    <div className="animate-rise">
      <p className="mb-6 max-w-2xl text-sm text-kai-muted">
        Community extensions for the Kaioken terminal AI coding assistant: skills the agent reads,
        MCP tools, and sandboxed WASM plugins. Everything installs from the author's own GitHub
        releases — <code className="font-mono text-xs text-kai-text">kaioken ext install owner/repo</code>.
      </p>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="search extensions…"
          className="h-9 w-full max-w-xs rounded-md border border-kai-line bg-kai-panel px-3 font-mono text-xs text-kai-text outline-none focus:border-kai-orange/60"
        />
        {TYPES.map((t) => (
          <button
            key={t}
            onClick={() => setType(type === t ? "" : t)}
            className={`h-9 rounded-md border px-3 font-mono text-xs transition-colors ${
              type === t
                ? "border-kai-orange/70 bg-kai-orange/10 text-kai-orange"
                : "border-kai-line bg-kai-panel text-kai-muted hover:text-kai-text"
            }`}
          >
            {t}
          </button>
        ))}
        <select
          value={tag}
          onChange={(e) => setTag(e.target.value)}
          className="h-9 rounded-md border border-kai-line bg-kai-panel px-2 font-mono text-xs text-kai-muted outline-none transition-colors focus:border-kai-orange/60"
        >
          <option value="">all tags</option>
          {tags.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          className="h-9 rounded-md border border-kai-line bg-kai-panel px-2 font-mono text-xs text-kai-muted outline-none transition-colors focus:border-kai-orange/60"
        >
          <option value="name">sort: name</option>
          <option value="downloads">sort: downloads</option>
          <option value="recent">sort: recently released</option>
        </select>
      </div>

      {error && (
        <p className="rounded-md border border-kai-amber/30 bg-kai-amber/5 p-3 font-mono text-xs text-kai-amber">
          Registry unreachable ({error}) — direct install still works: kaioken ext install owner/repo
        </p>
      )}
      {!error && entries === null && <p className="font-mono text-xs text-kai-dim">loading the index…</p>}
      {entries !== null && shown.length === 0 && (
        <p className="font-mono text-xs text-kai-dim">no matching extensions.</p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {shown.map((e) => (
          <Link
            key={e.id}
            to={`/ext/${encodeURIComponent(e.id)}`}
            className="lift group rounded-md border border-kai-line bg-kai-ink p-4 hover:border-kai-orange/50"
          >
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="font-mono text-sm font-bold text-kai-white transition-colors group-hover:text-kai-orange">
                {e.name}
              </span>
              <EntryBadges entry={e} />
            </div>
            <p className="font-mono text-[11px] text-kai-dim">
              {e.id}
              {e.version ? ` · v${e.version}` : ""}
              {typeof e.downloads === "number" ? ` · ${e.downloads} downloads` : ""}
            </p>
            <p className="mt-2 line-clamp-2 text-xs text-kai-muted">{e.description}</p>
            {(e.tags ?? []).length > 0 && (
              <p className="mt-2 font-mono text-[10px] text-kai-dim">
                {(e.tags ?? []).map((t) => `#${t}`).join("  ")}
              </p>
            )}
          </Link>
        ))}
      </div>
    </div>
  )
}
