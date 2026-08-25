import { useEffect, useRef } from "react"
import { Compartment, EditorState, type Extension } from "@codemirror/state"
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection, rectangularSelection, crosshairCursor, highlightSpecialChars } from "@codemirror/view"
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands"
import { bracketMatching, foldGutter, foldKeymap, indentOnInput, indentUnit } from "@codemirror/language"
import { highlightSelectionMatches, searchKeymap } from "@codemirror/search"
import { editorChrome, kaiokenSyntax } from "./theme"
import { languageFor } from "./language"
import { useThemeStore } from "@/store/theme"

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
  // Recreated each time the editor itself is rebuilt (see below); lets the
  // theme-sync effect reconfigure just the chrome extension in place.
  const themeCompartment = useRef<Compartment | null>(null)
  // Held in refs so the extensions built once at mount always call the latest
  // handlers without the editor being torn down on every parent render.
  const onChangeRef = useRef(onChange)
  const onSaveRef = useRef(onSave)
  onChangeRef.current = onChange
  onSaveRef.current = onSave
  const theme = useThemeStore((s) => s.theme)

  useEffect(() => {
    if (!host.current) return

    const compartment = new Compartment()
    themeCompartment.current = compartment

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
      // Read the live store value rather than the closed-over `theme` prop:
      // this effect intentionally excludes theme from its deps (a theme
      // flip must not rebuild the editor), so `theme` here could otherwise
      // be stale by the time path/readOnly next change.
      compartment.of(editorChrome(useThemeStore.getState().theme === "dark")),
      kaiokenSyntax,
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
      themeCompartment.current = null
    }
    // Rebuilt per document: the language mode and undo history belong to the
    // file, not to the component instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, readOnly])

  // Flips CodeMirror's internal dark/light flag when the app theme changes.
  // The colors themselves already track the app's theme automatically (they
  // are CSS variables — see theme.ts), so this only updates the handful of
  // native/uncustomized bits CodeMirror gates on that flag (e.g. the
  // scrollbar's color-scheme). Going through the compartment reconfigures
  // in place instead of rebuilding the editor, which would otherwise discard
  // undo history and the cursor position on every theme toggle.
  useEffect(() => {
    const v = view.current
    const compartment = themeCompartment.current
    if (!v || !compartment) return
    v.dispatch({ effects: compartment.reconfigure(editorChrome(theme === "dark")) })
  }, [theme])

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
