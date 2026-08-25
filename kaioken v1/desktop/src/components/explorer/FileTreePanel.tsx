import { ChevronDown, ChevronRight, Folder, FolderOpen, RefreshCw } from "lucide-react"
import { useExplorerStore } from "@/store/explorer"
import { useWorkspaceStore } from "@/store/workspace"
import { fileIcon, fileIconColor } from "./fileIcon"
import { Spinner } from "@/components/ui"
import { cn } from "@/lib/utils"
import type { FileTreeNode } from "@/lib/types"
import { useOpenFile } from "@/lib/openFile"

// FileTreePanel renders the scope-aware file tree from GET /tree. Directories
// expand/collapse in the explorer store; files select + record a recent. Kept
// non-virtual: the explorer's purpose is navigation across a bounded, scanned
// set, not browsing a million-node workspace, and a plain recursive render
// stays readable and dependency-free.
export default function FileTreePanel() {
  const tree = useExplorerStore((s) => s.tree)
  const treeLoading = useExplorerStore((s) => s.treeLoading)
  const error = useExplorerStore((s) => s.treeError)
  const expandAll = useExplorerStore((s) => s.expandAll)
  const collapseAll = useExplorerStore((s) => s.collapseAll)
  const loadTree = useExplorerStore((s) => s.loadTree)
  const ws = useWorkspaceStore((s) => s.active)
  const git = useExplorerStore((s) => s.git)

  // Build a map of path -> change kind for quick lookup
  const changeMap = new Map<string, string>()
  if (git?.changes) {
    for (const c of git.changes) {
      changeMap.set(c.path, c.kind)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-1 border-b border-border px-2 py-1.5">
        <span className="font-mono text-[10px] text-kai-dim">
          {tree ? `${tree.total} files` : "files"}
        </span>
        <div className="ml-auto flex items-center gap-0.5">
          <ToolbarButton
            title="Expand all"
            onClick={expandAll}
            disabled={!tree}
          >
            <ChevronDown size={13} />
          </ToolbarButton>
          <ToolbarButton
            title="Collapse all"
            onClick={collapseAll}
            disabled={!tree}
          >
            <ChevronRight size={13} />
          </ToolbarButton>
          <ToolbarButton
            title="Rescan"
            onClick={() => ws && loadTree(ws.id, true)}
            disabled={!ws || treeLoading}
          >
            <RefreshCw size={12} className={treeLoading ? "animate-spin" : ""} />
          </ToolbarButton>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {treeLoading && !tree ? (
          <div className="flex items-center gap-2 px-3 py-4 font-mono text-[10px] text-kai-dim">
            <Spinner size={12} /> scanning…
          </div>
        ) : error ? (
          <div className="px-3 py-4 font-mono text-[10px] text-kai-rose">{error}</div>
        ) : !tree || tree.children.length === 0 ? (
          <div className="px-3 py-4 font-mono text-[10px] text-kai-dim">
            no files in scope. adjust the workspace exclude patterns or run a scan.
          </div>
        ) : (
          <ul className="py-1">
            {tree.children.map((n) => (
              <TreeNode key={n.path} node={n} depth={0} changeMap={changeMap} />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function TreeNode({
  node,
  depth,
  changeMap,
}: {
  node: FileTreeNode
  depth: number
  changeMap: Map<string, string>
}) {
  const expanded = useExplorerStore((s) => s.expanded.has(node.path))
  const selected = useExplorerStore((s) => s.selectedPath === node.path)
  const toggleDir = useExplorerStore((s) => s.toggleDir)
  const openFile = useOpenFile()

  const changeKind = changeMap.get(node.path)

  if (node.type === "directory") {
    const open = expanded
    return (
      <li>
        <Row
          depth={depth}
          active={false}
          onClick={() => toggleDir(node.path)}
          ariaExpanded={open}
        >
          <span className="flex size-4 shrink-0 items-center justify-center text-kai-dim">
            {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </span>
          {open ? (
            <FolderOpen size={13} className="shrink-0 text-kai-amber" />
          ) : (
            <Folder size={13} className="shrink-0 text-kai-amber" />
          )}
          <span className="truncate font-mono text-[11px] text-kai-text">{node.name}</span>
        </Row>
        {open && node.children && (
          <ul>
            {node.children.map((c) => (
              <TreeNode key={c.path} node={c} depth={depth + 1} changeMap={changeMap} />
            ))}
          </ul>
        )}
      </li>
    )
  }

  return (
    <li>
      <Row
        depth={depth}
        active={selected}
        onClick={() => {
          openFile(node.path)
        }}
      >
        <span className="size-4 shrink-0" />
        {(() => {
          const Icon = fileIcon(node.ext)
          return <Icon size={13} className={cn("shrink-0", fileIconColor(node.ext))} />
        })()}
        <span
          className={cn(
            "truncate font-mono text-[11px]",
            selected ? "text-kai-orange" : "text-kai-muted"
          )}
        >
          {node.name}
        </span>
        {changeKind && <ChangeBadge kind={changeKind} />}
        {node.lines !== undefined && node.lines > 0 && (
          <span className="ml-auto shrink-0 pl-2 font-mono text-[9px] text-kai-dim">
            {node.lines}
          </span>
        )}
      </Row>
    </li>
  )
}

function ChangeBadge({ kind }: { kind: string }) {
  const spec = CHANGE_SPEC[kind] ?? CHANGE_SPEC.modified
  return (
    <span
      className={cn(
        "ml-1 flex size-4 shrink-0 items-center justify-center rounded-sm font-mono text-[9px] font-bold",
        spec.tone
      )}
    >
      {spec.letter}
    </span>
  )
}

const CHANGE_SPEC: Record<string, { letter: string; tone: string }> = {
  added: { letter: "A", tone: "bg-kai-green/15 text-kai-green" },
  modified: { letter: "M", tone: "bg-kai-amber/15 text-kai-amber" },
  deleted: { letter: "D", tone: "bg-kai-rose/15 text-kai-rose" },
  renamed: { letter: "R", tone: "bg-kai-blue/15 text-kai-blue" },
  untracked: { letter: "U", tone: "bg-panel text-kai-dim" },
}

function Row({
  depth,
  active,
  onClick,
  ariaExpanded,
  children,
}: {
  depth: number
  active: boolean
  onClick: () => void
  ariaExpanded?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={ariaExpanded}
      className={cn(
        "flex w-full items-center gap-1.5 py-0.5 pr-2 text-left outline-none transition-colors",
        "focus-visible:ring-2 focus-visible:ring-kai-orange/50",
        active ? "bg-accent/60" : "hover:bg-panel/60"
      )}
      style={{ paddingLeft: depth * 14 + 6 }}
    >
      {children}
    </button>
  )
}

function ToolbarButton({
  title,
  onClick,
  disabled,
  children,
}: {
  title: string
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex size-6 items-center justify-center rounded text-kai-dim outline-none transition-colors",
        "hover:bg-panel hover:text-kai-text focus-visible:ring-2 focus-visible:ring-kai-orange/50",
        "disabled:pointer-events-none disabled:opacity-30"
      )}
    >
      {children}
    </button>
  )
}
