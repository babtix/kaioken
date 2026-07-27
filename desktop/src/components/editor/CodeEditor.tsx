import { useEffect, useRef } from "react"
import { EditorState, type Extension } from "@codemirror/state"
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection, rectangularSelection, crosshairCursor, highlightSpecialChars } from "@codemirror/view"
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands"
import { bracketMatching, foldGutter, foldKeymap, indentOnInput, indentUnit } from "@codemirror/language"
import { highlightSelectionMatches, searchKeymap } from "@codemirror/search"
import { kaiokenEditorTheme } from "./theme"
import { languageFor } from "./language"

// CodeEditor wraps a CodeMirror 6 instance. React owns *which* document is
// shown; CodeMirror owns the text, cursor and undo history while it is shown.
//
// The two only synchronise in one direction during editing — view → store, via
// onChange. Pushing store state back into the view on every keystroke would
// reset the selection, so incoming `value` changes are applied only when they
// genuinely differ from what the view already holds (a revert, or a reload).
export default function CodeEditor({
  path,
  value,
  readOnly,
  onChange,
  onSave,
}: {
  /** Identifies the document; changing it rebuilds the editor state. */
  path: string
  value: string
  readOnly?: boolean
  onChange: (next: string) => void
  onSave: () => void
}) {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  // Held in refs so the extensions built once at mount always call the latest
  // handlers without the editor being torn down on every parent render.
  const onChangeRef = useRef(onChange)
  const onSaveRef = useRef(onSave)
  onChangeRef.current = onChange
  onSaveRef.current = onSave

  useEffect(() => {
    if (!host.current) return

    const extensions: Extension[] = [
      lineNumbers(),
      highlightActiveLineGutter(),
      highlightSpecialChars(),
      history(),
      foldGutter(),
      drawSelection(),
      indentOnInput(),
      bracketMatching(),
      highlightActiveLine(),
      highlightSelectionMatches(),
      rectangularSelection(),
      crosshairCursor(),
      indentUnit.of("  "),
      keymap.of([
        // Ctrl/Cmd+S saves. Registered ahead of the defaults so the browser's
        // own save dialog never sees the event.
        {
          key: "Mod-s",
          preventDefault: true,
          run: () => {
            onSaveRef.current()
            return true
          },
        },
        indentWithTab,
        ...defaultKeymap,
        ...historyKeymap,
        ...searchKeymap,
        ...foldKeymap,
      ]),
      kaiokenEditorTheme,
      ...languageFor(path),
      EditorView.lineWrapping,
      EditorState.readOnly.of(!!readOnly),
      EditorView.updateListener.of((u) => {
        if (u.docChanged) onChangeRef.current(u.state.doc.toString())
      }),
    ]

    const v = new EditorView({
      state: EditorState.create({ doc: value, extensions }),
      parent: host.current,
    })
    view.current = v
    return () => {
      v.destroy()
      view.current = null
    }
    // Rebuilt per document: the language mode and undo history belong to the
    // file, not to the component instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, readOnly])

  // Apply external changes (revert, reload) without disturbing an active edit.
  useEffect(() => {
    const v = view.current
    if (!v) return
    const current = v.state.doc.toString()
    if (current === value) return
    v.dispatch({ changes: { from: 0, to: current.length, insert: value } })
  }, [value])

  return <div ref={host} className="h-full min-h-0 w-full overflow-hidden" />
}
