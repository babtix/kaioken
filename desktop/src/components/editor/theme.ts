import type { Extension } from "@codemirror/state"
import { EditorView } from "@codemirror/view"
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language"
import { tags as t } from "@lezer/highlight"

// Colors are the app's --kai-* custom properties (src/index.css), not literal
// hex: CodeMirror's theme() still just emits a real <style> element, and a
// browser resolves var() through the cascade like any other CSS rule. That
// means the editor already matches light/dark the instant .light is toggled
// on <html> by store/theme.ts — no editor-specific sync logic needed for the
// colors themselves.
const v = (name: string) => `var(--kai-${name})`

/**
 * The chrome half of the theme: backgrounds, cursor, gutters, panels.
 *
 * `dark` only controls a CodeMirror-internal flag (native scrollbar/selection
 * rendering, the few defaults this theme doesn't override) — it does not
 * select different colors, since every color here is already a CSS variable.
 * It still needs to be updated when the app's theme flips, which is why
 * CodeEditor keeps this behind a Compartment rather than a static extension.
 */
export function editorChrome(dark: boolean): Extension {
  return EditorView.theme(
    {
      "&": { color: v("text"), backgroundColor: v("black"), height: "100%" },
      ".cm-content": {
        caretColor: v("orange"),
        fontFamily: "'JetBrains Mono Variable', ui-monospace, monospace",
        fontSize: "12px",
        padding: "8px 0",
      },
      ".cm-cursor, .cm-dropCursor": { borderLeftColor: v("orange"), borderLeftWidth: "2px" },
      "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
        backgroundColor: v("editor-selection"),
      },
      ".cm-activeLine": { backgroundColor: v("hover-row") },
      ".cm-gutters": {
        backgroundColor: v("black"),
        color: v("dim"),
        border: "none",
        borderRight: `1px solid ${v("line")}`,
        fontFamily: "'JetBrains Mono Variable', ui-monospace, monospace",
        fontSize: "11px",
      },
      ".cm-activeLineGutter": { backgroundColor: v("hover-row"), color: v("amber") },
      ".cm-foldPlaceholder": { backgroundColor: v("panel"), border: "none", color: v("dim") },
      ".cm-scroller": { overflow: "auto", lineHeight: "1.6" },
      ".cm-panels": { backgroundColor: v("panel"), color: v("text") },
      ".cm-searchMatch": {
        backgroundColor: v("editor-search-match"),
        outline: `1px solid ${v("amber")}`,
      },
      ".cm-searchMatch.cm-searchMatch-selected": { backgroundColor: v("editor-search-match-selected") },
      ".cm-selectionMatch": { backgroundColor: v("editor-selection-match") },
      ".cm-matchingBracket, .cm-nonmatchingBracket": {
        backgroundColor: v("editor-bracket-match"),
        outline: `1px solid ${v("dim")}`,
      },
      ".cm-tooltip": {
        backgroundColor: v("panel"),
        border: `1px solid ${v("line")}`,
        color: v("text"),
      },
    },
    { dark }
  )
}

// Syntax colors, same reasoning: var() means one definition covers both
// themes, so this needs no light/dark variant and is applied statically.
export const kaiokenHighlight = HighlightStyle.define([
  { tag: [t.keyword, t.moduleKeyword, t.controlKeyword], color: v("orange") },
  { tag: [t.name, t.deleted, t.character, t.macroName], color: v("text") },
  { tag: [t.propertyName], color: v("blue") },
  { tag: [t.function(t.variableName), t.labelName], color: v("amber") },
  { tag: [t.color, t.constant(t.name), t.standard(t.name)], color: v("tan") },
  { tag: [t.definition(t.name), t.separator], color: v("text") },
  { tag: [t.typeName, t.className, t.namespace], color: v("sage") },
  { tag: [t.number, t.changed, t.annotation, t.self], color: v("tan") },
  { tag: [t.operator, t.operatorKeyword], color: v("orange") },
  { tag: [t.regexp, t.escape, t.string, t.special(t.string)], color: v("green") },
  { tag: [t.meta, t.comment], color: v("dim"), fontStyle: "italic" },
  { tag: t.strong, fontWeight: "bold" },
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: t.strikethrough, textDecoration: "line-through" },
  { tag: t.link, color: v("blue"), textDecoration: "underline" },
  { tag: t.heading, fontWeight: "bold", color: v("orange") },
  { tag: [t.atom, t.bool], color: v("rose") },
  { tag: t.invalid, color: v("rose") },
])

export const kaiokenSyntax = syntaxHighlighting(kaiokenHighlight)
