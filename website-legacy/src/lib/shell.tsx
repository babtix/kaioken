import * as React from "react"

/**
 * A deliberately small shell tokenizer. It only needs to recognise the four
 * things that show up in this project's snippets — comments, the binary name,
 * flags, and quoted strings — which is enough to read like a terminal without
 * pulling in a highlighter.
 *
 * Shared by the desktop CodeBlock and the phone site's Code, so a snippet is
 * coloured the same way on both.
 */
const TOKEN =
  /(#.*$)|("[^"]*"|'[^']*')|(\$env:[A-Za-z_][\w]*|\$[A-Za-z_][\w]*)|(\B-{1,2}[A-Za-z][\w-]*)|(\bkaioken\b|\bgo\b|\bnpm\b|\bcd\b|\bgit\b)/

export function ShellLine({ line }: { line: string }) {
  const out: React.ReactNode[] = []
  let rest = line
  let key = 0

  while (rest.length > 0) {
    const m = TOKEN.exec(rest)
    if (!m || m.index === undefined) {
      out.push(<span key={key++}>{rest}</span>)
      break
    }
    if (m.index > 0) out.push(<span key={key++}>{rest.slice(0, m.index)}</span>)

    const [text] = m
    let cls = ""
    if (m[1]) cls = "text-kai-dim italic"
    else if (m[2]) cls = "text-kai-green"
    else if (m[3]) cls = "text-kai-blue"
    else if (m[4]) cls = "text-kai-amber"
    else if (m[5]) cls = "text-kai-orange font-semibold"

    out.push(
      <span key={key++} className={cls}>
        {text}
      </span>
    )
    rest = rest.slice(m.index + text.length)
  }
  return <>{out}</>
}
