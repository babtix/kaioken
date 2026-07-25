import * as React from "react"

let loader: Promise<typeof import("mermaid").default> | null = null

/**
 * Mermaid is ~500KB, so it is imported only when a document actually contains a
 * diagram, and initialised once per session.
 */
function loadMermaid() {
  if (!loader) {
    loader = import("mermaid").then((m) => {
      const mermaid = m.default
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: "strict",
        theme: "base",
        fontFamily: '"JetBrains Mono Variable", ui-monospace, monospace',
        themeVariables: {
          darkMode: true,
          background: "#121212",
          primaryColor: "#1c1c1c",
          primaryTextColor: "#d0d0d0",
          primaryBorderColor: "#ff8700",
          secondaryColor: "#241708",
          tertiaryColor: "#1c1c1c",
          lineColor: "#808080",
          textColor: "#d0d0d0",
          mainBkg: "#1c1c1c",
          nodeBorder: "#ff8700",
          clusterBkg: "#0d0d0d",
          clusterBorder: "#303030",
          titleColor: "#ffaf00",
          edgeLabelBackground: "#121212",
          actorBkg: "#1c1c1c",
          actorBorder: "#ff8700",
          actorTextColor: "#d0d0d0",
          signalColor: "#d0d0d0",
          signalTextColor: "#d0d0d0",
          labelBoxBkgColor: "#1c1c1c",
          labelBoxBorderColor: "#ff8700",
          labelTextColor: "#ffaf00",
          loopTextColor: "#87d7ff",
          noteBkgColor: "#241708",
          noteBorderColor: "#ffaf00",
          noteTextColor: "#ffaf00",
        },
      })
      return mermaid
    })
  }
  return loader
}

let seq = 0

export default function Mermaid({ chart }: { chart: string }) {
  const [svg, setSvg] = React.useState<string | null>(null)
  const [failed, setFailed] = React.useState(false)

  React.useEffect(() => {
    let alive = true
    const id = `mmd-${(seq += 1)}`

    loadMermaid()
      .then((mermaid) => mermaid.render(id, chart))
      .then(({ svg }) => {
        if (alive) setSvg(svg)
      })
      .catch(() => {
        // Kaioken demotes invalid mermaid to a code block rather than shipping
        // an error box; the site does the same.
        if (alive) setFailed(true)
      })

    return () => {
      alive = false
      document.getElementById(id)?.remove()
    }
  }, [chart])

  if (failed) {
    return (
      <pre className="mt-5 overflow-x-auto rounded-sm border border-border bg-card p-4 font-mono text-[12.5px] text-muted-foreground">
        <code>{chart}</code>
      </pre>
    )
  }

  if (!svg) {
    return (
      <div className="mt-5 flex h-32 items-center justify-center rounded-sm border border-border bg-card font-mono text-[12px] text-kai-dim">
        rendering diagram…
      </div>
    )
  }

  return (
    <div
      className="mt-5 overflow-x-auto rounded-sm border border-border bg-card p-4 [&_svg]:mx-auto [&_svg]:h-auto [&_svg]:max-w-none"
      // mermaid output, rendered with securityLevel "strict" (HTML labels off)
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}
