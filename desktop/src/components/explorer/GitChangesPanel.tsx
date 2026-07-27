import { useMemo, useState } from "react"
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  ChevronRight,
  GitBranch,
  GitCommitHorizontal,
  Minus,
  RefreshCw,
  Search,
  TriangleAlert,
  Undo2,
  X,
} from "lucide-react"
import { useExplorerStore } from "@/store/explorer"
import { useWorkspaceStore } from "@/store/workspace"
import { Button, Kbd, Modal, Spinner } from "@/components/ui"
import { cn } from "@/lib/utils"
import type { GitChange } from "@/lib/types"
import GitDiffModal from "./GitDiffModal"

// GitChangesPanel is the source-control panel, modelled on Zed's: a branch
// header with tracking position, a filter, a flat checkbox list where "checked"
// means staged, and a commit box pinned to the bottom. Checking a box is the
// stage action itself — there is no separate staged/unstaged split to drag
// files between.
export default function GitChangesPanel() {
  const ws = useWorkspaceStore((s) => s.active)
  const git = useExplorerStore((s) => s.git)
  const loading = useExplorerStore((s) => s.gitLoading)
  const loadGitStatus = useExplorerStore((s) => s.loadGitStatus)
  const stagePaths = useExplorerStore((s) => s.stagePaths)
  const unstagePaths = useExplorerStore((s) => s.unstagePaths)

  const [filter, setFilter] = useState("")
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [discarding, setDiscarding] = useState<string[] | null>(null)
  const [diffPath, setDiffPath] = useState<string | null>(null)
  const [diffStaged, setDiffStaged] = useState(false)

  const changes = git?.changes ?? []
  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return changes
    return changes.filter((c) => c.path.toLowerCase().includes(q))
  }, [changes, filter])

  // Zed's grouping: everything git already knows about, then the files it has
  // never seen. Untracked entries are the ones a "stage all" is most likely to
  // sweep in by accident, so they stay visually separate.
  const tracked = visible.filter((c) => c.kind !== "untracked")
  const untracked = visible.filter((c) => c.kind === "untracked")

  const toggle = (paths: string[], shouldStage: boolean) => {
    if (!ws || paths.length === 0) return
    void (shouldStage ? stagePaths(ws.id, paths) : unstagePaths(ws.id, paths))
  }

  const allVisiblePaths = visible.map((c) => c.path)
  const anyUnstaged = visible.some((c) => !c.staged)

  if (!git) {
    return (
      <PanelFrame>
        <div className="flex items-center gap-2 px-3 py-4 font-mono text-[10px] text-kai-dim">
          {loading ? (
            <>
              <Spinner size={12} /> reading git status…
            </>
          ) : (
            "no git status yet."
          )}
        </div>
      </PanelFrame>
    )
  }

  if (!git.is_repo) {
    return (
      <PanelFrame>
        <div className="px-3 py-4 font-mono text-[10px] text-kai-dim">
          this workspace is not a git repository.
        </div>
      </PanelFrame>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Branch header — name, tracking position, refresh. */}
      <div className="flex shrink-0 items-center gap-1.5 border-b border-border px-2 py-1.5">
        <GitBranch size={12} className="shrink-0 text-kai-amber" />
        <span className="min-w-0 truncate font-mono text-[11px] text-kai-text" title={git.branch}>
          {git.branch}
        </span>
        {git.upstream ? (
          <span
            className="flex shrink-0 items-center gap-1 font-mono text-[10px]"
            title={`Tracking ${git.upstream}`}
          >
            {git.ahead > 0 && (
              <span className="flex items-center text-kai-green">
                <ArrowUp size={9} />
                {git.ahead}
              </span>
            )}
            {git.behind > 0 && (
              <span className="flex items-center text-kai-blue">
                <ArrowDown size={9} />
                {git.behind}
              </span>
            )}
            {git.ahead === 0 && git.behind === 0 && <span className="text-kai-dim">up to date</span>}
          </span>
        ) : (
          <span className="shrink-0 font-mono text-[10px] text-kai-dim" title="No tracking branch">
            local
          </span>
        )}
        <button
          type="button"
          title="Refresh"
          onClick={() => ws && loadGitStatus(ws.id)}
          disabled={!ws || loading}
          className="ml-auto flex size-6 shrink-0 items-center justify-center rounded text-kai-dim outline-none transition-colors hover:bg-panel hover:text-kai-text focus-visible:ring-2 focus-visible:ring-kai-orange/50 disabled:opacity-30"
        >
          <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* Filter + stage-all. */}
      {changes.length > 0 && (
        <div className="flex shrink-0 items-center gap-1 border-b border-border px-1.5 py-1.5">
          <div className="flex min-w-0 flex-1 items-center gap-1.5 rounded border border-border bg-background px-1.5 py-1 transition-colors focus-within:border-kai-orange/50">
            <Search size={11} className="shrink-0 text-kai-dim" />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter files…"
              className="min-w-0 flex-1 bg-transparent font-mono text-[10.5px] text-kai-text placeholder:text-kai-dim focus:outline-none"
            />
            {filter && (
              <button
                type="button"
                onClick={() => setFilter("")}
                aria-label="Clear filter"
                className="shrink-0 text-kai-dim hover:text-kai-text"
              >
                <X size={10} />
              </button>
            )}
          </div>
          <button
            type="button"
            title={anyUnstaged ? "Stage all" : "Unstage all"}
            onClick={() => toggle(allVisiblePaths, anyUnstaged)}
            disabled={visible.length === 0}
            className="shrink-0 rounded px-1.5 py-1 font-mono text-[10px] text-kai-dim outline-none transition-colors hover:bg-panel hover:text-kai-text focus-visible:ring-2 focus-visible:ring-kai-orange/50 disabled:opacity-30"
          >
            {anyUnstaged ? "Stage all" : "Unstage all"}
          </button>
        </div>
      )}

      {/* File list. */}
      <div className="min-h-0 flex-1 overflow-auto">
        {changes.length === 0 ? (
          <div className="px-3 py-4 font-mono text-[10px] text-kai-dim">
            working tree clean — nothing to commit.
          </div>
        ) : visible.length === 0 ? (
          <div className="px-3 py-4 font-mono text-[10px] text-kai-dim">
            no files match “{filter}”.
          </div>
        ) : (
          <div className="py-1">
            <Section
              label="Tracked"
              changes={tracked}
              collapsed={collapsed.has("tracked")}
              onToggleCollapse={() => toggleSet(setCollapsed, "tracked")}
              onToggleStage={toggle}
              onDiscard={setDiscarding}
              onOpenDiff={(p, staged) => {
                setDiffPath(p)
                setDiffStaged(staged)
              }}
            />
            <Section
              label="New"
              changes={untracked}
              collapsed={collapsed.has("new")}
              onToggleCollapse={() => toggleSet(setCollapsed, "new")}
              onToggleStage={toggle}
              onDiscard={setDiscarding}
              onOpenDiff={(p, staged) => {
                setDiffPath(p)
                setDiffStaged(staged)
              }}
            />
          </div>
        )}
      </div>

      <CommitBox />

      {discarding && (
        <DiscardConfirm paths={discarding} onClose={() => setDiscarding(null)} />
      )}
      {ws && (
        <GitDiffModal
          wsId={ws.id}
          path={diffPath}
          staged={diffStaged}
          onClose={() => setDiffPath(null)}
        />
      )}
    </div>
  )
}

// PanelFrame keeps the branch header's chrome for the states that have no
// status to show, so the panel does not visibly reflow once one arrives.
function PanelFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-1.5 border-b border-border px-2 py-1.5">
        <GitBranch size={12} className="shrink-0 text-kai-dim" />
        <span className="font-mono text-[10px] text-kai-dim">git</span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">{children}</div>
    </div>
  )
}

function Section({
  label,
  changes,
  collapsed,
  onToggleCollapse,
  onToggleStage,
  onDiscard,
  onOpenDiff,
}: {
  label: string
  changes: GitChange[]
  collapsed: boolean
  onToggleCollapse: () => void
  onToggleStage: (paths: string[], stage: boolean) => void
  onDiscard: (paths: string[]) => void
  onOpenDiff: (path: string, staged: boolean) => void
}) {
  if (changes.length === 0) return null
  const staged = changes.filter((c) => c.staged).length
  const state: CheckState = staged === 0 ? "off" : staged === changes.length ? "on" : "mixed"

  return (
    <div className="mb-0.5">
      <div className="flex items-center gap-1 px-1.5 py-1">
        <Checkbox
          state={state}
          label={`${state === "on" ? "Unstage" : "Stage"} all ${label.toLowerCase()} files`}
          onChange={() =>
            onToggleStage(
              changes.map((c) => c.path),
              state !== "on"
            )
          }
        />
        <button
          type="button"
          onClick={onToggleCollapse}
          className="flex min-w-0 flex-1 items-center gap-1 rounded py-0.5 text-left outline-none transition-colors hover:text-kai-text focus-visible:ring-2 focus-visible:ring-kai-orange/50"
        >
          {collapsed ? (
            <ChevronRight size={11} className="shrink-0 text-kai-dim" />
          ) : (
            <ChevronDown size={11} className="shrink-0 text-kai-dim" />
          )}
          <span className="font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-kai-dim">
            {label}
          </span>
          <span className="ml-auto shrink-0 pr-1 font-mono text-[9px] text-kai-dim">
            {changes.length}
          </span>
        </button>
      </div>
      {!collapsed &&
        changes.map((c) => (
          <ChangeRow
            key={c.path}
            change={c}
            onToggleStage={onToggleStage}
            onDiscard={onDiscard}
            onOpenDiff={onOpenDiff}
          />
        ))}
    </div>
  )
}

function ChangeRow({
  change,
  onToggleStage,
  onDiscard,
  onOpenDiff,
}: {
  change: GitChange
  onToggleStage: (paths: string[], stage: boolean) => void
  onDiscard: (paths: string[]) => void
  onOpenDiff: (path: string, staged: boolean) => void
}) {
  const selectFile = useExplorerStore((s) => s.selectFile)
  const addRecent = useExplorerStore((s) => s.addRecent)
  const selected = useExplorerStore((s) => s.selectedPath === change.path)
  const busy = useExplorerStore((s) => s.gitBusy.has(change.path))

  const name = change.path.split("/").pop() ?? change.path
  const dir = change.path.includes("/")
    ? change.path.slice(0, change.path.lastIndexOf("/"))
    : ""
  const spec = KIND_SPEC[change.kind] ?? KIND_SPEC.modified
  // A file changed in both the index and the working tree is only partly
  // staged; Zed shows that as an indeterminate box rather than a ticked one.
  const state: CheckState = !change.staged ? "off" : change.unstaged ? "mixed" : "on"

  return (
    <div
      className={cn(
        "group flex w-full items-center gap-1 py-0.5 pl-1.5 pr-1 transition-colors",
        selected ? "bg-accent/60" : "hover:bg-panel/60"
      )}
    >
      <Checkbox
        state={state}
        disabled={busy}
        label={`${state === "off" ? "Stage" : "Unstage"} ${change.path}`}
        onChange={() => onToggleStage([change.path], state === "off")}
      />

      <button
        type="button"
        title={`${change.path} — click to view the diff`}
        onClick={() => {
          selectFile(change.path)
          addRecent(change.path)
          onOpenDiff(change.path, change.staged && !change.unstaged)
        }}
        className="flex min-w-0 flex-1 items-center gap-1.5 rounded text-left outline-none focus-visible:ring-2 focus-visible:ring-kai-orange/50"
      >
        <span
          className={cn(
            "w-3 shrink-0 text-center font-mono text-[10px] font-bold",
            spec.tone
          )}
          aria-label={change.kind}
        >
          {spec.letter}
        </span>
        <span
          className={cn(
            "truncate font-mono text-[11px]",
            change.kind === "deleted" && "line-through decoration-kai-dim",
            selected ? "text-kai-orange" : "text-kai-text"
          )}
        >
          {name}
        </span>
        {dir && (
          <span className="min-w-0 shrink truncate font-mono text-[9px] text-kai-dim">{dir}</span>
        )}
      </button>

      {/* Line counts give way to the discard button on hover — the row is too
          narrow to carry both, and the counts are the resting state. */}
      <span className="shrink-0 font-mono text-[9px] tabular-nums group-hover:hidden">
        {busy ? (
          <Spinner size={9} />
        ) : (
          <>
            {change.added > 0 && <span className="text-kai-green">+{change.added}</span>}
            {change.added > 0 && change.removed > 0 && " "}
            {change.removed > 0 && <span className="text-kai-rose">−{change.removed}</span>}
          </>
        )}
      </span>
      <button
        type="button"
        title={`Discard changes to ${name}`}
        onClick={() => onDiscard([change.path])}
        className="hidden size-5 shrink-0 items-center justify-center rounded text-kai-dim outline-none transition-colors hover:bg-kai-rose/15 hover:text-kai-rose focus-visible:ring-2 focus-visible:ring-kai-orange/50 group-hover:flex"
      >
        <Undo2 size={11} />
      </button>
    </div>
  )
}

// CommitBox is pinned below the list: a message field plus the commit action,
// exactly where Zed puts it. Ctrl/Cmd+Enter commits without leaving the field.
function CommitBox() {
  const ws = useWorkspaceStore((s) => s.active)
  const git = useExplorerStore((s) => s.git)
  const committing = useExplorerStore((s) => s.gitCommitting)
  const commit = useExplorerStore((s) => s.commit)
  const [message, setMessage] = useState("")

  if (!git?.is_repo) return null

  const staged = git.staged_count
  const canCommit = staged > 0 && message.trim().length > 0 && !committing

  const submit = async () => {
    if (!ws || !canCommit) return
    if (await commit(ws.id, message)) setMessage("")
  }

  return (
    <div className="shrink-0 border-t border-border p-1.5">
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
            e.preventDefault()
            void submit()
          }
        }}
        rows={2}
        placeholder={staged > 0 ? "Commit message…" : "Stage files to commit"}
        className={cn(
          "w-full resize-none rounded border border-border bg-background px-2 py-1.5",
          "font-mono text-[11px] leading-relaxed text-kai-text placeholder:text-kai-dim",
          "transition-colors focus:border-kai-orange/50 focus:outline-none"
        )}
      />
      <div className="mt-1.5 flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate font-mono text-[9px] text-kai-dim">
          {staged === 0
            ? `${git.dirty_count} change${git.dirty_count === 1 ? "" : "s"}, none staged`
            : `${staged} file${staged === 1 ? "" : "s"} staged`}
        </span>
        <span className="hidden shrink-0 items-center gap-0.5 sm:flex">
          <Kbd>Ctrl</Kbd>
          <Kbd>⏎</Kbd>
        </span>
        <Button
          variant="primary"
          size="sm"
          onClick={submit}
          disabled={!canCommit}
          loading={committing}
          title={
            staged === 0
              ? "Stage at least one file first"
              : message.trim()
                ? "Commit staged changes"
                : "Write a commit message first"
          }
        >
          {!committing && <GitCommitHorizontal size={11} />}
          Commit
        </Button>
      </div>
    </div>
  )
}

// DiscardConfirm gates the one irreversible action in this panel. git keeps no
// reflog for uncommitted work, so there is nothing to undo with afterwards.
function DiscardConfirm({ paths, onClose }: { paths: string[]; onClose: () => void }) {
  const ws = useWorkspaceStore((s) => s.active)
  const discardPaths = useExplorerStore((s) => s.discardPaths)
  const [running, setRunning] = useState(false)

  const run = async () => {
    if (!ws) return
    setRunning(true)
    try {
      await discardPaths(ws.id, paths)
      onClose()
    } finally {
      setRunning(false)
    }
  }

  return (
    <Modal open onClose={onClose} labelledBy="discard-title" className="max-w-md">
      <div className="flex items-start gap-3 p-4">
        <TriangleAlert size={18} className="mt-0.5 shrink-0 text-kai-rose" />
        <div className="min-w-0">
          <h2 id="discard-title" className="font-mono text-sm text-kai-text">
            Discard {paths.length === 1 ? "changes" : `${paths.length} files`}?
          </h2>
          <p className="mt-1 font-mono text-[11px] leading-relaxed text-kai-dim">
            This throws away uncommitted work and deletes files git has never seen. It cannot be
            undone.
          </p>
          <ul className="mt-2 max-h-40 space-y-0.5 overflow-auto">
            {paths.map((p) => (
              <li key={p} className="truncate font-mono text-[10px] text-kai-muted">
                {p}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="flex justify-end gap-2 border-t border-border p-3">
        <Button size="sm" onClick={onClose} disabled={running}>
          Cancel
        </Button>
        <Button variant="danger" size="sm" onClick={run} loading={running}>
          Discard
        </Button>
      </div>
    </Modal>
  )
}

// ── Checkbox ───────────────────────────────────────────────────────────────

type CheckState = "on" | "off" | "mixed"

function Checkbox({
  state,
  onChange,
  label,
  disabled,
}: {
  state: CheckState
  onChange: () => void
  label: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={state === "mixed" ? "mixed" : state === "on"}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onChange}
      className={cn(
        "flex size-3.5 shrink-0 items-center justify-center rounded-[3px] border transition-colors",
        "outline-none focus-visible:ring-2 focus-visible:ring-kai-orange/50",
        "disabled:opacity-40",
        state === "off"
          ? "border-kai-line hover:border-kai-dim"
          : "border-kai-orange/70 bg-kai-orange/20 text-kai-orange"
      )}
    >
      {state === "on" && <Check size={9} strokeWidth={3.5} />}
      {state === "mixed" && <Minus size={9} strokeWidth={3.5} />}
    </button>
  )
}

function toggleSet(
  setter: React.Dispatch<React.SetStateAction<Set<string>>>,
  key: string
) {
  setter((prev) => {
    const next = new Set(prev)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    return next
  })
}

const KIND_SPEC: Record<GitChange["kind"], { letter: string; tone: string }> = {
  added: { letter: "A", tone: "text-kai-green" },
  modified: { letter: "M", tone: "text-kai-amber" },
  deleted: { letter: "D", tone: "text-kai-rose" },
  renamed: { letter: "R", tone: "text-kai-blue" },
  untracked: { letter: "U", tone: "text-kai-sage" },
}
