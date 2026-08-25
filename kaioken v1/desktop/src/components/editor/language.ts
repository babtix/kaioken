import type { Extension } from "@codemirror/state"
import { javascript } from "@codemirror/lang-javascript"
import { json } from "@codemirror/lang-json"
import { markdown } from "@codemirror/lang-markdown"
import { go } from "@codemirror/lang-go"
import { rust } from "@codemirror/lang-rust"
import { python } from "@codemirror/lang-python"
import { html } from "@codemirror/lang-html"
import { css } from "@codemirror/lang-css"
import { yaml } from "@codemirror/lang-yaml"

// Language modes are resolved by extension rather than by the daemon's
// `language` field, because the extension is what the user sees in the tab and
// the two must never disagree. Anything unmatched gets no grammar — plain text
// with line numbers still beats a wrong grammar's mis-highlighting.
const BY_EXT: Record<string, () => Extension> = {
  ts: () => javascript({ typescript: true }),
  tsx: () => javascript({ typescript: true, jsx: true }),
  mts: () => javascript({ typescript: true }),
  cts: () => javascript({ typescript: true }),
  js: () => javascript(),
  jsx: () => javascript({ jsx: true }),
  mjs: () => javascript(),
  cjs: () => javascript(),
  json: () => json(),
  jsonc: () => json(),
  md: () => markdown(),
  markdown: () => markdown(),
  go: () => go(),
  rs: () => rust(),
  py: () => python(),
  pyi: () => python(),
  html: () => html(),
  htm: () => html(),
  css: () => css(),
  scss: () => css(),
  yaml: () => yaml(),
  yml: () => yaml(),
}

/** The CodeMirror language extension for a path, or none when unrecognised. */
export function languageFor(path: string): Extension[] {
  const ext = path.split(".").pop()?.toLowerCase() ?? ""
  const make = BY_EXT[ext]
  return make ? [make()] : []
}

/** Human-readable mode name for the status bar. */
export function languageLabel(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? ""
  const NAMES: Record<string, string> = {
    ts: "TypeScript",
    tsx: "TypeScript JSX",
    js: "JavaScript",
    jsx: "JavaScript JSX",
    mjs: "JavaScript",
    cjs: "JavaScript",
    json: "JSON",
    md: "Markdown",
    markdown: "Markdown",
    go: "Go",
    rs: "Rust",
    py: "Python",
    html: "HTML",
    htm: "HTML",
    css: "CSS",
    scss: "SCSS",
    yaml: "YAML",
    yml: "YAML",
    toml: "TOML",
    sh: "Shell",
    sql: "SQL",
  }
  return NAMES[ext] ?? (ext ? ext.toUpperCase() : "Plain Text")
}
