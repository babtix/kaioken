import { useEffect, useMemo, useRef, useState } from "react"
import { Search } from "lucide-react"
import { useExplorerStore, flattenFiles } from "@/store/explorer"
import { Modal } from "@/components/ui"
import { fileIcon, fileIconColor, pathExt } from "./fileIcon"
import { cn } from "@/lib/utils"
import type { FileTreeNode } from "@/lib/types"

// QuickSwitcher is the Ctrl+P file navigator: type to fuzzy-find any file the
// scanner sees, Enter to select + record it. The same flattened tree the file
// panel renders is its source, so the two never disagree about what exists.
export default function QuickSwitcher({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const tree = useExplorerStore((s) => s.tree)
  const selectFile = useExplorerStore((s) => s.selectFile)
  const addRecent = useExplorerStore((s) => s.addRecent)
  const [q, setQ] = useState("")
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const files = useMemo(() => flattenFiles(tree?.children), [tree])

  const results = useMemo(() => {
    const query = q.trim().toLowerCase()
    if (!query) return files.slice(0, 100)
    const scored: { node: FileTreeNode; score: number }[] = []
    for (const f of files) {
      const m = fuzzy(f.path.toLowerCase(), query)
      if (m) scored.push({ node: f, score: m })
    }
    scored.sort((a, b) => b.score - a.score)
    return scored.slice(0, 100).map((s) => s.node)
  }, [files, q])

  useEffect(() => {
    if (open) {
      setQ("")
      setActive(0)
      // Focus on next tick so the input is mounted.
      const id = setTimeout(() => inputRef.current?.focus(), 0)
      return () => clearTimeout(id)
    }
  }, [open])

  useEffect(() => {
    setActive(0)
  }, [q])

  if (!open) return null

  const choose = (node: FileTreeNode) => {
    selectFile(node.path)
    addRecent(node.path)
    onClose()
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setActive((i) => Math.min(results.length - 1, i + 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setActive((i) => Math.max(0, i - 1))
    } else if (e.key === "Enter") {
      e.preventDefault()
      const node = results[active]
      if (node) choose(node)
    }
  }

  return (
    <Modal open={open} onClose={onClose} className="max-w-xl">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
        <Search size={14} className="shrink-0 text-kai-dim" />
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="go to file…"
          className="flex-1 bg-transparent font-mono text-xs text-kai-text outline-none placeholder:text-kai-dim"
        />
        <span className="font-mono text-[10px] text-kai-dim">{results.length}</span>
      </div>
      <div className="max-h-80 overflow-auto">
        {results.length === 0 ? (
          <div className="px-3 py-6 text-center font-mono text-[11px] text-kai-dim">
            no files match {q ? `“${q}”` : "—"}
          </div>
        ) : (
          <ul>
            {results.map((node, i) => (
              <li key={node.path}>
                <button
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose(node)}
                  className={cn(
                    "flex w-full items-center gap-2 px-3 py-1.5 text-left outline-none",
                    i === active ? "bg-accent/60" : "hover:bg-panel/60"
                  )}
                >
                  {(() => {
                    const ext = pathExt(node.path)
                    const Icon = fileIcon(ext)
                    return <Icon size={13} className={cn("shrink-0", fileIconColor(ext))} />
                  })()}
                  <span
                    className={cn(
                      "truncate font-mono text-[11px]",
                      i === active ? "text-kai-orange" : "text-kai-muted"
                    )}
                  >
                    {node.name}
                  </span>
                  <span className="ml-auto shrink-0 truncate pl-2 font-mono text-[9px] text-kai-dim">
                    {dirOf(node.path)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  )
}

function dirOf(path: string): string {
  const i = path.lastIndexOf("/")
  return i < 0 ? "" : path.slice(0, i)
}

// fuzzy scores path against query (both lowercased). Returns 0 when matched,
// higher is better; null when query is not a subsequence of path. Bonus for
// consecutive matches, matches at word boundaries (/ . _ -), and matches near
// the path's end (basename).
function fuzzy(path: string, query: string): number | null {
  if (query.length === 0) return 0
  let qi = 0
  let score = 0
  let prevMatch = -2
  const baseStart = path.lastIndexOf("/") + 1
  for (let i = 0; i < path.length && qi < query.length; i++) {
    if (path[i] !== query[qi]) continue
    // Boundary bonus: previous char is / . _ - or start.
    const boundary = i === 0 || "/._- ".includes(path[i - 1])
    if (boundary) score += 8
    // Consecutive-match bonus.
    if (i === prevMatch + 1) score += 6
    // Basename bonus: matches in the file name rank higher.
    if (i >= baseStart) score += 4
    score += 1
    prevMatch = i
    qi++
  }
  if (qi < query.length) return null
  // Prefer shorter paths on ties — less to read.
  score -= path.length * 0.05
  return score
}
