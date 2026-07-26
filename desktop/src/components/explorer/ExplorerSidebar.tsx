import { useEffect } from "react"
import {
  BookOpen,
  Clock,
  Files,
  GitBranch,
  Layers,
  PanelRightClose,
  PanelRightOpen,
} from "lucide-react"
import { useExplorerStore, type ExplorerPanel } from "@/store/explorer"
import { useWorkspaceStore } from "@/store/workspace"
import { cn } from "@/lib/utils"
import FileTreePanel from "./FileTreePanel"
import GitChangesPanel from "./GitChangesPanel"
import ModuleStatusPanel from "./ModuleStatusPanel"
import WikiOutlinePanel from "./WikiOutlinePanel"
import RecentFilesPanel from "./RecentFilesPanel"

// ExplorerSidebar is the right-side project navigator: file tree, git changes,
// module status, wiki outline and recent/pinned files behind a tab strip. It
// mirrors what VS Code's Explorer does, on the right per the product's layout.
export default function ExplorerSidebar() {
  const ws = useWorkspaceStore((s) => s.active)
  const open = useExplorerStore((s) => s.open)
  const panel = useExplorerStore((s) => s.panel)
  const setOpen = useExplorerStore((s) => s.setOpen)
  const setPanel = useExplorerStore((s) => s.setPanel)
  const initForWorkspace = useExplorerStore((s) => s.initForWorkspace)
  const loadTree = useExplorerStore((s) => s.loadTree)
  const loadGitStatus = useExplorerStore((s) => s.loadGitStatus)
  const git = useExplorerStore((s) => s.git)

  // Re-initialise per-workspace state and fetch the tree when the active
  // workspace changes. The tree is the explorer's primary content and the
  // quick switcher's source, so it loads eagerly regardless of the active tab.
  useEffect(() => {
    if (!ws) return
    initForWorkspace(ws.id)
    void loadTree(ws.id)
  }, [ws?.id, initForWorkspace, loadTree])

  // Load git status lazily — only when the user lands on the git panel and it
  // has not been fetched yet for this workspace.
  useEffect(() => {
    if (ws && panel === "git" && !git) void loadGitStatus(ws.id)
  }, [ws?.id, panel, git, loadGitStatus])

  // Collapsed: a thin strip with a single affordance to reopen. Keeping the
  // strip (rather than rendering nothing) means the toggle is always visible.
  if (!open) {
    return (
      <div className="flex w-7 shrink-0 flex-col items-center border-l border-border bg-card py-2">
        <button
          type="button"
          title="Show explorer (Ctrl+B)"
          onClick={() => setOpen(true)}
          className="flex size-6 items-center justify-center rounded text-kai-dim outline-none transition-colors hover:bg-panel hover:text-kai-text focus-visible:ring-2 focus-visible:ring-kai-orange/50"
        >
          <PanelRightOpen size={15} />
        </button>
      </div>
    )
  }

  return (
    <aside className="flex w-72 shrink-0 flex-col border-l border-border bg-card">
      <div className="flex items-center gap-0.5 border-b border-border px-1.5 py-1.5">
        <TabButton
          active={panel === "files"}
          onClick={() => setPanel("files")}
          icon={Files}
          label="Files"
        />
        <TabButton
          active={panel === "git"}
          onClick={() => setPanel("git")}
          icon={GitBranch}
          label="Git"
        />
        <TabButton
          active={panel === "modules"}
          onClick={() => setPanel("modules")}
          icon={Layers}
          label="Modules"
        />
        <TabButton
          active={panel === "wiki"}
          onClick={() => setPanel("wiki")}
          icon={BookOpen}
          label="Wiki"
        />
        <TabButton
          active={panel === "recent"}
          onClick={() => setPanel("recent")}
          icon={Clock}
          label="Recent"
        />
        <button
          type="button"
          title="Hide explorer (Ctrl+B)"
          onClick={() => setOpen(false)}
          className="ml-auto flex size-6 items-center justify-center rounded text-kai-dim outline-none transition-colors hover:bg-panel hover:text-kai-text focus-visible:ring-2 focus-visible:ring-kai-orange/50"
        >
          <PanelRightClose size={15} />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        {panel === "files" && <FileTreePanel />}
        {panel === "git" && <GitChangesPanel />}
        {panel === "modules" && <ModuleStatusPanel />}
        {panel === "wiki" && <WikiOutlinePanel />}
        {panel === "recent" && <RecentFilesPanel />}
      </div>
    </aside>
  )
}

function TabButton({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean
  onClick: () => void
  icon: typeof Files
  label: string
}) {
  return (
    <button
      type="button"
      title={label}
      onClick={onClick}
      className={cn(
        "flex size-7 items-center justify-center rounded outline-none transition-colors",
        "focus-visible:ring-2 focus-visible:ring-kai-orange/50",
        active ? "bg-accent text-kai-orange" : "text-kai-dim hover:bg-panel hover:text-kai-text"
      )}
    >
      <Icon size={15} />
    </button>
  )
}

export type { ExplorerPanel }
