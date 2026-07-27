import { EditorView } from "@codemirror/view"
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language"
import { tags as t } from "@lezer/highlight"

// The editor uses the same kai-* palette as the rest of the app, spelled as
// literal hex rather than CSS variables: CodeMirror builds its stylesheet with
// its own class names at runtime, so Tailwind's token layer is not in scope.
const c = {
  bg: "#080808",
  gutterFg: "#585858",
  fg: "#d0d0d0",
  cursor: "#ff8700",
  selection: "#ff870026",
  activeLine: "#ffffff06",
  line: "#303030",
  panel: "#1c1c1c",
  orange: "#ff8700",
  amber: "#ffaf00",
  tan: "#d7af87",
  blue: "#87d7ff",
  green: "#00d787",
  sage: "#87af87",
  rose: "#ff5f5f",
  dim: "#585858",
}

export const kaiokenTheme = EditorView.theme(
  {
    "&": { color: c.fg, backgroundColor: c.bg, height: "100%" },
    ".cm-content": {
      caretColor: c.cursor,
      fontFamily: "'JetBrains Mono Variable', ui-monospace, monospace",
      fontSize: "12px",
      padding: "8px 0",
    },
    ".cm-cursor, .cm-dropCursor": { borderLeftColor: c.cursor, borderLeftWidth: "2px" },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
      backgroundColor: c.selection,
    },
    ".cm-activeLine": { backgroundColor: c.activeLine },
    ".cm-gutters": {
      backgroundColor: c.bg,
      color: c.gutterFg,
      border: "none",
      borderRight: `1px solid ${c.line}`,
      fontFamily: "'JetBrains Mono Variable', ui-monospace, monospace",
      fontSize: "11px",
    },
    ".cm-activeLineGutter": { backgroundColor: c.activeLine, color: c.amber },
    ".cm-foldPlaceholder": { backgroundColor: c.panel, border: "none", color: c.dim },
    ".cm-scroller": { overflow: "auto", lineHeight: "1.6" },
    ".cm-panels": { backgroundColor: c.panel, color: c.fg },
    ".cm-searchMatch": { backgroundColor: "#ffaf0033", outline: `1px solid ${c.amber}` },
    ".cm-searchMatch.cm-searchMatch-selected": { backgroundColor: "#ff870055" },
    ".cm-selectionMatch": { backgroundColor: "#ffffff12" },
    ".cm-matchingBracket, .cm-nonmatchingBracket": {
      backgroundColor: "#ffffff14",
      outline: `1px solid ${c.dim}`,
    },
    ".cm-tooltip": {
      backgroundColor: c.panel,
      border: `1px solid ${c.line}`,
      color: c.fg,
    },
  },
  { dark: true }
)

export const kaiokenHighlight = HighlightStyle.define([
  { tag: [t.keyword, t.moduleKeyword, t.controlKeyword], color: c.orange },
  { tag: [t.name, t.deleted, t.character, t.macroName], color: c.fg },
  { tag: [t.propertyName], color: c.blue },
  { tag: [t.function(t.variableName), t.labelName], color: c.amber },
  { tag: [t.color, t.constant(t.name), t.standard(t.name)], color: c.tan },
  { tag: [t.definition(t.name), t.separator], color: c.fg },
  { tag: [t.typeName, t.className, t.namespace], color: c.sage },
  { tag: [t.number, t.changed, t.annotation, t.self], color: c.tan },
  { tag: [t.operator, t.operatorKeyword], color: c.orange },
  { tag: [t.regexp, t.escape, t.string, t.special(t.string)], color: c.green },
  { tag: [t.meta, t.comment], color: c.dim, fontStyle: "italic" },
  { tag: t.strong, fontWeight: "bold" },
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: t.strikethrough, textDecoration: "line-through" },
  { tag: t.link, color: c.blue, textDecoration: "underline" },
  { tag: t.heading, fontWeight: "bold", color: c.orange },
  { tag: [t.atom, t.bool], color: c.rose },
  { tag: t.invalid, color: c.rose },
])

export const kaiokenEditorTheme = [kaiokenTheme, syntaxHighlighting(kaiokenHighlight)]
