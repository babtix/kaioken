import { useEffect } from "react"
import {
  ChevronUp,
  Code2,
  File,
  FileCode,
  FileJson,
  FileText,
  RotateCcw,
  Save,
  SquareTerminal,
  X,
} from "lucide-react"
import { useEditorStore } from "@/store/editor"
import { useWorkspaceStore } from "@/store/workspace"
import { useTerminalStore } from "@/store/terminal"
import CodeEditor from "@/components/editor/CodeEditor"
import { languageLabel } from "@/components/editor/language"
import EmptyState from "@/components/EmptyState"
import TerminalPanel from "@/components/terminal/TerminalPanel"
import { Badge, Spinner } from "@/components/ui"
import { cn } from "@/lib/utils"

// Editor is the VS Code-shaped surface: a tab bar of open files, the buffer,
// an optional terminal panel, and a status line. Files arrive by being
// clicked in the explorer, which routes here — the tab bar is a record of
// that, not its own file picker.
export default function Editor() {
  const ws = useWorkspaceStore((s) => s.active)
  const files = useEditorStore((s) => s.files)
  const activePath = useEditorStore((s) => s.activePath)
  const select = useEditorStore((s) => s.select)
  const close = useEditorStore((s) => s.close)
  const setContent = useEditorStore((s) => s.setContent)
  const save = useEditorStore((s) => s.save)
  const saveActive = useEditorStore((s) => s.saveActive)
  const revert = useEditorStore((s) => s.revert)
  const initForWorkspace = useEditorStore((s) => s.initForWorkspace)
  const editorWsId = useEditorStore((s) => s.wsId)
  const panelOpen = useTerminalStore((s) => s.panelOpen)
  const togglePanel = useTerminalStore((s) => s.togglePanel)

  // A path only means anything within the workspace it came from.
  useEffect(() => {
    if (ws && editorWsId !== ws.id) initForWorkspace(ws.id)
  }, [ws?.id, editorWsId, initForWorkspace])

  // Ctrl+S from anywhere on this screen, including when focus is outside the
  // CodeMirror instance (the tab bar, the status line). Ctrl+` toggles the
  // terminal panel, as it does in VS Code — xterm forwards the combo instead
  // of swallowing it (see attachCustomKeyEventHandler in lib/term.ts).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault()
        void saveActive()
      }
      // No workspace, no cwd for the shell — the panel only exists with a repo.
      if (e.ctrlKey && e.code === "Backquote" && ws) {
        e.preventDefault()
        togglePanel()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [saveActive, togglePanel, ws])

  const file = files.find((f) => f.path === activePath) ?? null

  if (!ws) {
    return (
      <EmptyState icon={Code2} title="No workspace open" hint="Open a repository to edit its files." />
    )
  }

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Tab bar */}
      {files.length > 0 && (
        <div className="flex shrink-0 items-end gap-1 overflow-x-auto border-b border-border/80 bg-muted/40 px-2 pt-1.5">
          {files.map((f) => (
            <FileTab
              key={f.path}
              path={f.path}
              active={f.path === activePath}
              dirty={f.content !== f.saved}
              onSelect={() => select(f.path)}
              onClose={() => close(f.path)}
            />
          ))}
        </div>
      )}

      <div className="min-h-0 flex-1">
        {files.length === 0 ? (
          // Not an early return: the terminal panel below must stay usable
          // even when no file is open, exactly as VS Code behaves.
          <EmptyState
            icon={Code2}
            title="No files open"
            hint="Click a file in the explorer on the right, or press Ctrl+P to jump to one."
          />
        ) : file?.loading ? (
          <div className="flex items-center gap-2 px-4 py-6 font-mono text-[11px] text-kai-dim">
            <Spinner size={13} /> opening {file.path}…
          </div>
        ) : file?.error ? (
          <div className="px-4 py-6 font-mono text-[11px] text-kai-rose">{file.error}</div>
        ) : file ? (
          <CodeEditor
            path={file.path}
            value={file.content}
            readOnly={file.truncated}
            onChange={(next) => setContent(file.path, next)}
            onSave={() => void save(file.path)}
          />
        ) : null}
      </div>

      {panelOpen ? (
        <TerminalPanel />
      ) : (
        // Collapsed rail where the panel lives: closing the terminal must
        // leave an obvious way to bring it back, right where it was.
        <button
          type="button"
          onClick={togglePanel}
          title="Open terminal (Ctrl+`)"
          className="flex shrink-0 items-center gap-1.5 border-t border-border bg-card px-2.5 py-1 font-mono text-[10px] uppercase tracking-wide text-kai-dim outline-none transition-colors hover:text-kai-orange focus-visible:ring-2 focus-visible:ring-kai-orange/50"
        >
          <SquareTerminal size={11} />
          Terminal
          <ChevronUp size={10} className="ml-auto" />
        </button>
      )}

      {file && (
        <>
          {/* Status line */}
          <div className="flex shrink-0 items-center gap-2 border-t border-border bg-card px-2.5 py-1">
            <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-kai-dim" title={file.path}>
              {file.path}
            </span>
            {file.truncated && <Badge tone="amber">read-only · too large</Badge>}
            {file.content !== file.saved && !file.truncated && (
              <>
                <button
                  type="button"
                  onClick={() => revert(file.path)}
                  title="Discard unsaved changes"
                  className="flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[10px] text-kai-dim outline-none transition-colors hover:bg-panel hover:text-kai-text focus-visible:ring-2 focus-visible:ring-kai-orange/50"
                >
                  <RotateCcw size={10} />
                  Revert
                </button>
                <button
                  type="button"
                  onClick={() => void save(file.path)}
                  disabled={file.saving}
                  title="Save (Ctrl+S)"
                  className="flex items-center gap-1 rounded border border-kai-orange/40 bg-accent px-1.5 py-0.5 font-mono text-[10px] text-kai-orange outline-none transition-colors hover:border-kai-orange/70 focus-visible:ring-2 focus-visible:ring-kai-orange/50 disabled:opacity-40"
                >
                  {file.saving ? <Spinner size={9} /> : <Save size={10} />}
                  Save
                </button>
              </>
            )}
            <span className="shrink-0 font-mono text-[10px] text-kai-dim">
              {languageLabel(file.path)}
            </span>
          </div>
        </>
      )}
    </div>
  )
}

function FileTab({
  path,
  active,
  dirty,
  onSelect,
  onClose,
}: {
  path: string
  active: boolean
  dirty: boolean
  onSelect: () => void
  onClose: () => void
}) {
  const name = path.split("/").pop() ?? path
  const Icon = fileIconFor(path)

  const handleAuxClick = (e: React.MouseEvent) => {
    // Middle click (button 1) closes the tab like VS Code or Chrome.
    if (e.button === 1) {
      e.preventDefault()
      e.stopPropagation()
      onClose()
    }
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    // Prevent default middle-click scroll anchor when clicking the tab.
    if (e.button === 1) {
      e.preventDefault()
    }
  }

  return (
    <div
      onClick={onSelect}
      onAuxClick={handleAuxClick}
      onMouseDown={handleMouseDown}
      title={path}
      className={cn(
        "group relative flex h-7 min-w-0 max-w-[210px] shrink-0 cursor-pointer items-center gap-1.5",
        "rounded-t-[var(--radius)] px-2.5 transition-all outline-none select-none",
        active
          ? "border-x border-t border-border/80 border-b-transparent bg-background text-kai-text shadow-xs"
          : "border border-transparent bg-card/40 text-kai-dim hover:border-border/60 hover:bg-card hover:text-kai-text"
      )}
    >
      {/* Top accent border for active tab */}
      {active && (
        <span
          className="absolute -top-px left-0 right-0 h-[2px] rounded-t-sm bg-kai-orange"
          aria-hidden="true"
        />
      )}

      {/* File type icon */}
      <Icon
        size={12}
        className={cn(
          "shrink-0 transition-colors",
          active ? "text-kai-orange" : "text-kai-dim group-hover:text-kai-text"
        )}
      />

      <span
        className={cn(
          "min-w-0 flex-1 truncate font-mono text-[11px]",
          active ? "font-medium text-kai-text" : "text-kai-dim group-hover:text-kai-text"
        )}
      >
        {name}
      </span>

      {/* Dirty indicator */}
      {dirty && (
        <span
          className="size-1.5 shrink-0 rounded-full bg-kai-orange ring-2 ring-kai-orange/20 group-hover:hidden"
          aria-label="unsaved changes"
          title="Unsaved changes"
        />
      )}

      {/* Close button */}
      <button
        type="button"
        aria-label={`Close ${name}`}
        onClick={(e) => {
          e.stopPropagation()
          onClose()
        }}
        className={cn(
          "flex size-4 shrink-0 items-center justify-center rounded text-kai-dim transition-all",
          "hover:bg-accent hover:text-kai-rose outline-none",
          dirty ? "hidden group-hover:flex" : "opacity-0 group-hover:opacity-100"
        )}
      >
        <X size={11} />
      </button>
    </div>
  )
}

function fileIconFor(path: string) {
  const ext = path.split(".").pop()?.toLowerCase() ?? ""
  switch (ext) {
    case "go":
    case "rs":
    case "ts":
    case "tsx":
    case "js":
    case "jsx":
    case "py":
    case "html":
    case "css":
    case "scss":
    case "sql":
    case "sh":
      return FileCode
    case "md":
    case "markdown":
    case "txt":
      return FileText
    case "json":
    case "jsonc":
    case "yaml":
    case "yml":
    case "toml":
      return FileJson
    default:
      return File
  }
}
