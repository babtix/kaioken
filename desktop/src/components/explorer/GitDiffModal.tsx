import { useEffect, useMemo, useState } from "react"
import { FileDiff, X } from "lucide-react"
import { api } from "@/lib/api"
import { parseUnifiedDiff } from "@/lib/diff"
import { humanize } from "@/lib/errors"
import DiffView from "@/components/chat/DiffView"
import { Badge, Modal, Spinner } from "@/components/ui"
import { cn } from "@/lib/utils"

// GitDiffModal shows one file's patch full-size. The source-control panel is
// too narrow to read a diff in, and the centre pane belongs to the routes, so
// the diff opens over the app the way Zed opens it in an editor tab.
export default function GitDiffModal({
  wsId,
  path,
  staged,
  onClose,
}: {
  wsId: string
  path: string | null
  staged: boolean
  onClose: () => void
}) {
  const [raw, setRaw] = useState<string | null>(null)
  const [truncated, setTruncated] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Which side is shown: the working tree's changes or what is in the index.
  const [showStaged, setShowStaged] = useState(staged)

  useEffect(() => setShowStaged(staged), [staged, path])

  useEffect(() => {
    if (!path) return
    let cancelled = false
    setLoading(true)
    setError(null)
    api
      .gitDiff(wsId, path, showStaged)
      .then((res) => {
        if (cancelled) return
        setRaw(res.diff)
        setTruncated(res.truncated)
      })
      .catch((err) => {
        if (!cancelled) setError(humanize(err).title)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [wsId, path, showStaged])

  const parsed = useMemo(() => (raw && path ? parseUnifiedDiff(raw, path) : null), [raw, path])

  return (
    <Modal open={path !== null} onClose={onClose} labelledBy="git-diff-title" className="max-w-4xl">
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
        <FileDiff size={13} className="shrink-0 text-kai-orange" />
        <h2 id="git-diff-title" className="min-w-0 truncate font-mono text-xs text-kai-text">
          {path}
        </h2>
        {parsed && (
          <span className="flex shrink-0 items-center gap-1.5 font-mono text-[10px]">
            <span className="text-kai-green">+{parsed.added}</span>
            <span className="text-kai-rose">−{parsed.removed}</span>
          </span>
        )}

        <div className="ml-auto flex shrink-0 items-center gap-0.5 rounded-md border border-border bg-background p-0.5">
          <SideTab active={!showStaged} onClick={() => setShowStaged(false)}>
            Working tree
          </SideTab>
          <SideTab active={showStaged} onClick={() => setShowStaged(true)}>
            Staged
          </SideTab>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Close diff"
          className="flex size-6 shrink-0 items-center justify-center rounded text-kai-dim outline-none transition-colors hover:bg-panel hover:text-kai-text focus-visible:ring-2 focus-visible:ring-kai-orange/50"
        >
          <X size={13} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-3">
        {loading ? (
          <div className="flex items-center gap-2 py-8 font-mono text-[11px] text-kai-dim">
            <Spinner size={13} /> reading diff…
          </div>
        ) : error ? (
          <p className="py-8 font-mono text-[11px] text-kai-rose">{error}</p>
        ) : !parsed ? (
          <p className="py-8 font-mono text-[11px] text-kai-dim">
            {showStaged
              ? "Nothing staged for this file."
              : "No changes in the working tree for this file."}
          </p>
        ) : (
          <>
            {truncated && (
              <div className="mb-2">
                <Badge tone="amber">Diff truncated — open the file to see the rest</Badge>
              </div>
            )}
            <DiffView diff={parsed} className="max-h-[60vh]" />
          </>
        )}
      </div>
    </Modal>
  )
}

function SideTab({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded px-2 py-0.5 font-mono text-[10px] outline-none transition-colors",
        "focus-visible:ring-2 focus-visible:ring-kai-orange/50",
        active ? "bg-accent text-kai-orange" : "text-kai-dim hover:text-kai-text"
      )}
    >
      {children}
    </button>
  )
}
