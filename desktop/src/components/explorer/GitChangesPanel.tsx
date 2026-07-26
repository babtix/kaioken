import { GitBranch, RefreshCw } from "lucide-react"
import { useExplorerStore } from "@/store/explorer"
import { useWorkspaceStore } from "@/store/workspace"
import { fileIcon, fileIconColor, pathExt } from "./fileIcon"
import { Spinner } from "@/components/ui"
import { cn } from "@/lib/utils"
import type { GitChange } from "@/lib/types"

// GitChangesPanel is the explorer's source-control navigator: per-file A/M/D
// classification with a staged/unstaged split, the structured view the aggregate
// dirty_count in the top bar only summarises.
export default function GitChangesPanel() {
  const git = useExplorerStore((s) => s.git)
  const loading = useExplorerStore((s) => s.gitLoading)
  const loadGitStatus = useExplorerStore((s) => s.loadGitStatus)
  const ws = useWorkspaceStore((s) => s.active)

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-1.5 border-b border-border px-2 py-1.5">
        {git?.is_repo ? (
          <>
            <GitBranch size={12} className="shrink-0 text-kai-amber" />
            <span className="truncate font-mono text-[10px] text-kai-text">{git.branch}</span>
            <span className="shrink-0 font-mono text-[10px] text-kai-dim">·{git.dirty_count}</span>
          </>
        ) : (
          <span className="font-mono text-[10px] text-kai-dim">
            {git && !git.is_repo ? "not a git repo" : "git"}
          </span>
        )}
        <button
          type="button"
          title="Refresh"
          onClick={() => ws && loadGitStatus(ws.id)}
          disabled={!ws || loading}
          className="ml-auto flex size-6 items-center justify-center rounded text-kai-dim outline-none transition-colors hover:bg-panel hover:text-kai-text focus-visible:ring-2 focus-visible:ring-kai-orange/50 disabled:opacity-30"
        >
          <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {loading && !git ? (
          <div className="flex items-center gap-2 px-3 py-4 font-mono text-[10px] text-kai-dim">
            <Spinner size={12} /> reading git status…
          </div>
        ) : !git ? (
          <div className="px-3 py-4 font-mono text-[10px] text-kai-dim">no git status yet.</div>
        ) : !git.is_repo ? (
          <div className="px-3 py-4 font-mono text-[10px] text-kai-dim">
            this workspace is not a git repository.
          </div>
        ) : git.changes.length === 0 ? (
          <div className="px-3 py-4 font-mono text-[10px] text-kai-dim">
            working tree clean — nothing to commit.
          </div>
        ) : (
          <GitGroups changes={git.changes} />
        )}
      </div>
    </div>
  )
}

function GitGroups({ changes }: { changes: GitChange[] }) {
  const staged = changes.filter((c) => c.staged)
  const unstaged = changes.filter((c) => c.unstaged && !c.staged)
  const untracked = changes.filter((c) => c.kind === "untracked")
  return (
    <div className="py-1">
      <Group label="Staged" count={staged.length}>
        {staged.map((c) => (
          <ChangeRow key={c.path} change={c} />
        ))}
      </Group>
      <Group label="Changes" count={unstaged.length}>
        {unstaged.map((c) => (
          <ChangeRow key={c.path} change={c} />
        ))}
      </Group>
      <Group label="Untracked" count={untracked.length}>
        {untracked.map((c) => (
          <ChangeRow key={c.path} change={c} />
        ))}
      </Group>
    </div>
  )
}

function Group({
  label,
  count,
  children,
}: {
  label: string
  count: number
  children: React.ReactNode
}) {
  if (count === 0) return null
  return (
    <div className="mb-1">
      <div className="flex items-center gap-1.5 px-2 py-1">
        <span className="font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-kai-dim">
          {label}
        </span>
        <span className="font-mono text-[9px] text-kai-dim">{count}</span>
      </div>
      <div>{children}</div>
    </div>
  )
}

function ChangeRow({ change }: { change: GitChange }) {
  const selectFile = useExplorerStore((s) => s.selectFile)
  const addRecent = useExplorerStore((s) => s.addRecent)
  const selected = useExplorerStore((s) => s.selectedPath === change.path)
  const name = change.path.split("/").pop() ?? change.path
  const dir = change.path.includes("/")
    ? change.path.slice(0, change.path.lastIndexOf("/"))
    : ""
  const ext = pathExt(change.path)
  const Icon = fileIcon(ext)
  return (
    <button
      type="button"
      onClick={() => {
        selectFile(change.path)
        addRecent(change.path)
      }}
      className={cn(
        "flex w-full items-center gap-1.5 px-2 py-0.5 text-left outline-none transition-colors",
        "focus-visible:ring-2 focus-visible:ring-kai-orange/50",
        selected ? "bg-accent/60" : "hover:bg-panel/60"
      )}
    >
      <KindBadge kind={change.kind} />
      <Icon size={13} className={cn("shrink-0", fileIconColor(ext))} />
      <span
        className={cn(
          "truncate font-mono text-[11px]",
          selected ? "text-kai-orange" : "text-kai-muted"
        )}
      >
        {name}
      </span>
      {dir && (
        <span className="ml-auto shrink-0 truncate pl-2 font-mono text-[9px] text-kai-dim">
          {dir}
        </span>
      )}
    </button>
  )
}

function KindBadge({ kind }: { kind: GitChange["kind"] }) {
  const spec = KIND_SPEC[kind] ?? KIND_SPEC.modified
  const letter = spec.letter
  return (
    <span
      className={cn(
        "flex size-4 shrink-0 items-center justify-center rounded-sm font-mono text-[9px] font-bold",
        spec.tone
      )}
    >
      {letter}
    </span>
  )
}

const KIND_SPEC: Record<GitChange["kind"], { letter: string; tone: string }> = {
  added: { letter: "A", tone: "bg-kai-green/15 text-kai-green" },
  modified: { letter: "M", tone: "bg-kai-amber/15 text-kai-amber" },
  deleted: { letter: "D", tone: "bg-kai-rose/15 text-kai-rose" },
  renamed: { letter: "R", tone: "bg-kai-blue/15 text-kai-blue" },
  untracked: { letter: "U", tone: "bg-panel text-kai-dim" },
}
