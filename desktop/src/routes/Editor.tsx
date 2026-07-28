import { useEffect } from "react"
import { ChevronUp, Code2, RotateCcw, Save, SquareTerminal, X } from "lucide-react"
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
    <div className="flex h-full flex-col">
      {/* Tab bar */}
      {files.length > 0 && (
        <div className="flex shrink-0 items-center gap-0.5 overflow-x-auto border-b border-border bg-card px-1.5 py-1">
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
  return (
    <div
      onClick={onSelect}
      title={path}
      className={cn(
        "group flex h-6 min-w-0 max-w-[200px] shrink-0 cursor-default items-center gap-1.5",
        "rounded-md px-2 transition-colors",
        active ? "bg-panel text-kai-text" : "text-kai-dim hover:bg-panel/50 hover:text-kai-muted"
      )}
    >
      <span className="min-w-0 flex-1 truncate font-mono text-[10.5px]">{name}</span>
      {/* The dirty dot occupies the close button's slot until hover, so the tab
          width never jumps as you move across it. */}
      {dirty && (
        <span
          className="size-1.5 shrink-0 rounded-full bg-kai-orange group-hover:hidden"
          aria-label="unsaved changes"
        />
      )}
      <button
        type="button"
        aria-label={`Close ${name}`}
        onClick={(e) => {
          e.stopPropagation()
          onClose()
        }}
        className={cn(
          "shrink-0 rounded text-kai-dim outline-none transition-opacity hover:text-kai-rose",
          dirty ? "hidden group-hover:block" : "opacity-0 group-hover:opacity-100"
        )}
      >
        <X size={10} />
      </button>
    </div>
  )
}
