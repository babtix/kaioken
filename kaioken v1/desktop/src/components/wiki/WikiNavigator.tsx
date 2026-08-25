import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  ChevronDown,
  ChevronRight,
  Crosshair,
  FileText,
  ListCollapse,
  Search,
  Text,
  X,
} from "lucide-react"
import { fuzzyMatch } from "@/lib/fuzzy"
import ResizeHandle, { readWidth, writeWidth } from "@/components/common/ResizeHandle"
import { cn } from "@/lib/utils"

export type NavDoc = {
  title: string
  rel: string
  reading_minutes: number
}
export type NavSection = { name: string; docs: NavDoc[] }
export type NavHit = { path: string; title: string; line: number; snippet: string }

// A flattened row is what keyboard navigation actually moves through: the tree
// is rendered nested, but ↑/↓ have to treat it as one list.
type Row =
  | { kind: "section"; key: string; name: string; count: number; collapsed: boolean; depth: 0 }
  | { kind: "doc"; key: string; doc: NavDoc; section: string; depth: 1; indices: number[] }
  | { kind: "hit"; key: string; hit: NavHit; depth: 1 }
  | { kind: "hits-header"; key: string; count: number; depth: 0 }

const WIDTH_KEY = "kaioken.wiki.navWidth"
const MIN_WIDTH = 180
const MAX_WIDTH = 460
const DEFAULT_WIDTH = 256

/**
 * WikiNavigator is the wiki's left-hand tree, built the way Cursor's and Claude
 * Code's sidebars are: filter as you type with the matched characters
 * highlighted, indent guides down each level, arrow-key navigation over the
 * whole tree, a reveal-the-open-document action, and a drag handle to resize.
 *
 * The filter is local and instant — it narrows titles without a round trip.
 * Full-text hits from the daemon are a separate group below it, so typing never
 * blocks on the network to show something useful.
 */
export default function WikiNavigator({
  sections,
  activePath,
  onOpen,
  query,
  onQueryChange,
  hits,
  searchRef,
}: {
  sections: NavSection[]
  activePath: string | null
  onOpen: (rel: string) => void
  query: string
  onQueryChange: (q: string) => void
  /** Full-text results from the daemon; null while no search is running. */
  hits: NavHit[] | null
  searchRef?: React.RefObject<HTMLInputElement | null>
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [cursor, setCursor] = useState(0)
  const [width, setWidth] = useState(() =>
    readWidth(WIDTH_KEY, DEFAULT_WIDTH, MIN_WIDTH, MAX_WIDTH)
  )

  // Persist outside the drag loop so resizing does not write on every frame.
  useEffect(() => {
    const id = setTimeout(() => writeWidth(WIDTH_KEY, width), 250)
    return () => clearTimeout(id)
  }, [width])
  const listRef = useRef<HTMLDivElement>(null)
  const rowRefs = useRef(new Map<string, HTMLElement>())

  const trimmed = query.trim()

  // Filtering: a section survives if its own name matches or any of its
  // documents do, and a matching section shows all of its documents. That is
  // what makes typing a section name a way to browse it, not just to find it.
  const filtered = useMemo(() => {
    if (!trimmed) {
      return sections.map((s) => ({
        section: s,
        docs: s.docs.map((d) => ({ doc: d, indices: [] as number[] })),
      }))
    }
    const out: { section: NavSection; docs: { doc: NavDoc; indices: number[] }[] }[] = []
    for (const s of sections) {
      const sectionHit = fuzzyMatch(s.name, trimmed)
      const docs: { doc: NavDoc; indices: number[]; score: number }[] = []
      for (const d of s.docs) {
        const m = fuzzyMatch(d.title, trimmed)
        if (m) docs.push({ doc: d, indices: m.indices, score: m.score })
        else if (sectionHit) docs.push({ doc: d, indices: [], score: -1 })
      }
      if (docs.length === 0) continue
      docs.sort((a, b) => b.score - a.score)
      out.push({ section: s, docs: docs.map(({ doc, indices }) => ({ doc, indices })) })
    }
    return out
  }, [sections, trimmed])

  // A filter that narrows to a handful of documents should show them, not make
  // the user re-expand every section by hand.
  const effectivelyCollapsed = useCallback(
    (name: string) => (trimmed ? false : collapsed.has(name)),
    [trimmed, collapsed]
  )

  const rows = useMemo(() => {
    const list: Row[] = []
    for (const { section, docs } of filtered) {
      const isCollapsed = effectivelyCollapsed(section.name)
      list.push({
        kind: "section",
        key: `s:${section.name}`,
        name: section.name,
        count: docs.length,
        collapsed: isCollapsed,
        depth: 0,
      })
      if (isCollapsed) continue
      for (const { doc, indices } of docs) {
        list.push({
          kind: "doc",
          key: `d:${doc.rel}`,
          doc,
          section: section.name,
          depth: 1,
          indices,
        })
      }
    }
    if (hits && hits.length > 0) {
      list.push({ kind: "hits-header", key: "hits", count: hits.length, depth: 0 })
      hits.forEach((h, i) => list.push({ kind: "hit", key: `h:${h.path}:${i}`, hit: h, depth: 1 }))
    }
    return list
  }, [filtered, effectivelyCollapsed, hits])

  // Keep the cursor inside the list as it shrinks and grows under the filter.
  useEffect(() => {
    setCursor((c) => Math.min(c, Math.max(0, rows.length - 1)))
  }, [rows.length])

  const scrollRowIntoView = useCallback((key: string) => {
    rowRefs.current.get(key)?.scrollIntoView({ block: "nearest" })
  }, [])

  const moveCursor = useCallback(
    (delta: number) => {
      setCursor((c) => {
        const next = Math.max(0, Math.min(rows.length - 1, c + delta))
        const row = rows[next]
        if (row) scrollRowIntoView(row.key)
        return next
      })
    },
    [rows, scrollRowIntoView]
  )

  const toggleSection = useCallback((name: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }, [])

  // Reveal: expand the open document's section and scroll to it. Also runs on
  // arrival so a deep link does not land on a collapsed tree.
  const reveal = useCallback(() => {
    if (!activePath) return
    const owner = sections.find((s) => s.docs.some((d) => d.rel === activePath))
    if (owner) {
      setCollapsed((prev) => {
        if (!prev.has(owner.name)) return prev
        const next = new Set(prev)
        next.delete(owner.name)
        return next
      })
    }
    requestAnimationFrame(() => scrollRowIntoView(`d:${activePath}`))
  }, [activePath, sections, scrollRowIntoView])

  useEffect(() => {
    reveal()
    // Only on a change of open document — re-running on every render would
    // fight the user's own collapsing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePath])

  const onKeyDown = (e: React.KeyboardEvent) => {
    const row = rows[cursor]
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault()
        moveCursor(1)
        break
      case "ArrowUp":
        e.preventDefault()
        moveCursor(-1)
        break
      case "Home":
        e.preventDefault()
        setCursor(0)
        if (rows[0]) scrollRowIntoView(rows[0].key)
        break
      case "End":
        e.preventDefault()
        setCursor(rows.length - 1)
        if (rows.at(-1)) scrollRowIntoView(rows[rows.length - 1].key)
        break
      case "ArrowRight":
        if (row?.kind === "section" && row.collapsed) {
          e.preventDefault()
          toggleSection(row.name)
        } else if (row?.kind === "section") {
          e.preventDefault()
          moveCursor(1)
        }
        break
      case "ArrowLeft":
        if (row?.kind === "section" && !row.collapsed) {
          e.preventDefault()
          toggleSection(row.name)
        } else if (row?.kind === "doc") {
          // Jump back up to the owning section, the way a tree view does.
          e.preventDefault()
          const idx = rows.findIndex((r) => r.kind === "section" && r.name === row.section)
          if (idx >= 0) {
            setCursor(idx)
            scrollRowIntoView(rows[idx].key)
          }
        }
        break
      case "Enter":
        if (!row) break
        e.preventDefault()
        if (row.kind === "section") toggleSection(row.name)
        else if (row.kind === "doc") onOpen(row.doc.rel)
        else if (row.kind === "hit") onOpen(row.hit.path)
        break
      case "Escape":
        if (query) {
          e.preventDefault()
          onQueryChange("")
        }
        break
    }
  }

  const docCount = sections.reduce((n, s) => n + s.docs.length, 0)
  const shownCount = filtered.reduce((n, f) => n + f.docs.length, 0)

  return (
    <aside
      className="relative flex shrink-0 flex-col border-r border-border bg-card"
      style={{ width }}
    >
      {/* Header — title and the tree-wide actions, as in an IDE sidebar. */}
      <div className="group/head flex shrink-0 items-center gap-1 border-b border-border px-2 py-1.5">
        <span className="font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-kai-dim">
          Explorer
        </span>
        <span className="font-mono text-[9px] text-kai-dim">
          {trimmed ? `${shownCount}/${docCount}` : docCount}
        </span>
        <div className="ml-auto flex items-center gap-0.5 opacity-0 transition-opacity group-hover/head:opacity-100 focus-within:opacity-100">
          <HeaderAction
            label="Reveal open document"
            onClick={reveal}
            disabled={!activePath}
            icon={Crosshair}
          />
          <HeaderAction
            label="Collapse all"
            onClick={() => setCollapsed(new Set(sections.map((s) => s.name)))}
            icon={ListCollapse}
          />
        </div>
      </div>

      {/* Filter. Typing narrows titles instantly; content hits arrive after. */}
      <div className="shrink-0 border-b border-border p-1.5">
        <div className="flex items-center gap-1.5 rounded border border-border bg-background px-1.5 py-1 transition-colors focus-within:border-kai-orange/50">
          <Search size={11} className="shrink-0 text-kai-dim" />
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Filter documents…"
            aria-label="Filter wiki documents"
            className="min-w-0 flex-1 bg-transparent font-mono text-[11px] text-kai-text placeholder:text-kai-dim focus:outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => onQueryChange("")}
              aria-label="Clear filter"
              className="shrink-0 text-kai-dim hover:text-kai-text"
            >
              <X size={10} />
            </button>
          )}
        </div>
      </div>

      {/* Tree. */}
      <div
        ref={listRef}
        role="tree"
        tabIndex={0}
        aria-label="Wiki documents"
        onKeyDown={onKeyDown}
        className="min-h-0 flex-1 overflow-auto py-1 outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-kai-orange/40"
      >
        {rows.length === 0 ? (
          <p className="px-3 py-4 font-mono text-[10px] text-kai-dim">
            No documents match “{trimmed}”.
          </p>
        ) : (
          rows.map((row, i) => {
            const focused = i === cursor
            const register = (el: HTMLElement | null) => {
              if (el) rowRefs.current.set(row.key, el)
              else rowRefs.current.delete(row.key)
            }
            if (row.kind === "section") {
              return (
                <SectionRow
                  key={row.key}
                  rowRef={register}
                  name={row.name}
                  count={row.count}
                  collapsed={row.collapsed}
                  focused={focused}
                  onClick={() => {
                    setCursor(i)
                    toggleSection(row.name)
                  }}
                />
              )
            }
            if (row.kind === "hits-header") {
              return (
                <div
                  key={row.key}
                  ref={register as (el: HTMLDivElement | null) => void}
                  className="mt-2 flex items-center gap-1.5 border-t border-border px-2 pb-1 pt-2"
                >
                  <Text size={10} className="shrink-0 text-kai-dim" />
                  <span className="font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-kai-dim">
                    In page text
                  </span>
                  <span className="ml-auto font-mono text-[9px] text-kai-dim">{row.count}</span>
                </div>
              )
            }
            if (row.kind === "hit") {
              return (
                <HitRow
                  key={row.key}
                  rowRef={register}
                  hit={row.hit}
                  focused={focused}
                  onClick={() => {
                    setCursor(i)
                    onOpen(row.hit.path)
                  }}
                />
              )
            }
            return (
              <DocRow
                key={row.key}
                rowRef={register}
                doc={row.doc}
                indices={row.indices}
                active={activePath === row.doc.rel}
                focused={focused}
                onClick={() => {
                  setCursor(i)
                  onOpen(row.doc.rel)
                }}
              />
            )
          })
        )}
      </div>

      <ResizeHandle
        side="right"
        width={width}
        onWidth={setWidth}
        min={MIN_WIDTH}
        max={MAX_WIDTH}
        defaultWidth={DEFAULT_WIDTH}
        label="Resize navigator"
      />
    </aside>
  )
}

// ── Rows ───────────────────────────────────────────────────────────────────

type RowRef = (el: HTMLButtonElement | null) => void

function SectionRow({
  rowRef,
  name,
  count,
  collapsed,
  focused,
  onClick,
}: {
  rowRef: RowRef
  name: string
  count: number
  collapsed: boolean
  focused: boolean
  onClick: () => void
}) {
  return (
    <button
      ref={rowRef}
      type="button"
      role="treeitem"
      aria-expanded={!collapsed}
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-1 px-2 py-[3px] text-left outline-none transition-colors",
        focused ? "bg-panel" : "hover:bg-panel/60"
      )}
    >
      {collapsed ? (
        <ChevronRight size={11} className="shrink-0 text-kai-dim" />
      ) : (
        <ChevronDown size={11} className="shrink-0 text-kai-dim" />
      )}
      <span className="truncate font-mono text-[11px] font-semibold text-kai-text">{name}</span>
      <span className="ml-auto shrink-0 pl-2 font-mono text-[9px] text-kai-dim">{count}</span>
    </button>
  )
}

function DocRow({
  rowRef,
  doc,
  indices,
  active,
  focused,
  onClick,
}: {
  rowRef: RowRef
  doc: NavDoc
  indices: number[]
  active: boolean
  focused: boolean
  onClick: () => void
}) {
  return (
    <button
      ref={rowRef}
      type="button"
      role="treeitem"
      aria-current={active ? "page" : undefined}
      onClick={onClick}
      title={doc.title}
      className={cn(
        "relative flex w-full items-center gap-1.5 py-[3px] pl-2 pr-2 text-left outline-none transition-colors",
        active ? "bg-accent" : focused ? "bg-panel" : "hover:bg-panel/60"
      )}
    >
      {active && <span className="absolute inset-y-0 left-0 w-0.5 bg-kai-orange" aria-hidden />}
      {/* Indent guide — the vertical rule that makes nesting readable. */}
      <span className="ml-1 h-4 w-px shrink-0 bg-border" aria-hidden />
      <FileText
        size={11}
        className={cn("shrink-0", active ? "text-kai-orange" : "text-kai-dim")}
      />
      <span
        className={cn(
          "min-w-0 flex-1 truncate font-mono text-[10.5px]",
          active ? "text-kai-orange" : "text-kai-muted"
        )}
      >
        <Highlight text={doc.title} indices={indices} />
      </span>
      {doc.reading_minutes > 0 && (
        <span className="shrink-0 font-mono text-[9px] text-kai-dim">{doc.reading_minutes}m</span>
      )}
    </button>
  )
}

function HitRow({
  rowRef,
  hit,
  focused,
  onClick,
}: {
  rowRef: RowRef
  hit: NavHit
  focused: boolean
  onClick: () => void
}) {
  return (
    <button
      ref={rowRef}
      type="button"
      role="treeitem"
      onClick={onClick}
      className={cn(
        "block w-full py-1 pl-4 pr-2 text-left outline-none transition-colors",
        focused ? "bg-panel" : "hover:bg-panel/60"
      )}
    >
      <span className="flex items-baseline gap-1.5">
        <span className="truncate font-mono text-[10.5px] text-kai-blue">{hit.title}</span>
        <span className="shrink-0 font-mono text-[9px] text-kai-dim">:{hit.line}</span>
      </span>
      <span className="mt-0.5 block truncate font-mono text-[9px] text-kai-muted">
        {hit.snippet}
      </span>
    </button>
  )
}

/** Renders `text` with the fuzzy-matched characters picked out. */
function Highlight({ text, indices }: { text: string; indices: number[] }) {
  if (indices.length === 0) return <>{text}</>
  const marked = new Set(indices)
  return (
    <>
      {Array.from(text).map((ch, i) =>
        marked.has(i) ? (
          <span key={i} className="font-semibold text-kai-amber">
            {ch}
          </span>
        ) : (
          <span key={i}>{ch}</span>
        )
      )}
    </>
  )
}

// ── Chrome ─────────────────────────────────────────────────────────────────

function HeaderAction({
  label,
  onClick,
  icon: Icon,
  disabled,
}: {
  label: string
  onClick: () => void
  icon: typeof Crosshair
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="flex size-5 items-center justify-center rounded text-kai-dim outline-none transition-colors hover:bg-panel hover:text-kai-text focus-visible:ring-2 focus-visible:ring-kai-orange/50 disabled:opacity-30"
    >
      <Icon size={11} />
    </button>
  )
}

