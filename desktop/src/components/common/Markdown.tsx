import { useMemo } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import rehypeSlug from "rehype-slug"
import { invoke } from "@tauri-apps/api/core"
import CodeBlock from "./CodeBlock"
import Mermaid from "./Mermaid"
import { cn } from "@/lib/utils"

/** Resolve a relative wiki link against the current document's path. */
function resolveWikiLink(href: string, fromPath?: string): string | null {
  if (!fromPath) return null
  const base = fromPath.split("/").slice(0, -1)
  const parts = href.replace(/\\/g, "/").split("/")
  const out = [...base]
  for (const part of parts) {
    if (part === "." || part === "") continue
    if (part === "..") out.pop()
    else out.push(part)
  }
  return out.join("/")
}

export default function Markdown({
  children,
  variant = "doc",
  docPath,
  onNavigate,
  className,
}: {
  children: string
  /** "doc" is long-form wiki prose (Geist); "chat" is denser and monospace. */
  variant?: "doc" | "chat"
  /** Current document path, so relative links can be resolved. */
  docPath?: string
  /** Called when an in-app wiki link is followed. */
  onNavigate?: (relPath: string) => void
  className?: string
}) {
  // react-markdown re-parses on every render; memoising on the source keeps
  // a streaming transcript from re-parsing committed messages.
  const components = useMemo(
    () => ({
      code({ className: cls, children: kids, ...props }: any) {
        const text = String(kids).replace(/\n$/, "")
        const match = /language-(\w+)/.exec(cls || "")
        // Inline code has no language class and no newlines — let the
        // stylesheet handle it.
        if (!match && !text.includes("\n")) {
          return (
            <code className={cls} {...props}>
              {kids}
            </code>
          )
        }
        const lang = match?.[1]
        if (lang === "mermaid") return <Mermaid chart={text} />
        return <CodeBlock code={text} lang={lang} />
      },
      // react-markdown wraps fenced code in <pre>; CodeBlock brings its own.
      pre({ children: kids }: any) {
        return <>{kids}</>
      },
      a({ href, children: kids, ...props }: any) {
        const target = String(href ?? "")

        // External links open in the real browser, never in the WebView.
        if (/^https?:\/\//i.test(target)) {
          return (
            <a
              href={target}
              onClick={(e) => {
                e.preventDefault()
                invoke("open_external", { url: target }).catch(() => {})
              }}
              {...props}
            >
              {kids}
            </a>
          )
        }

        // Same-document anchors scroll in place.
        if (target.startsWith("#")) {
          return (
            <a href={target} {...props}>
              {kids}
            </a>
          )
        }

        // Relative links to other chapters navigate in-app.
        if (onNavigate && /\.md$/i.test(target)) {
          const rel = resolveWikiLink(decodeURIComponent(target), docPath)
          if (rel) {
            return (
              <a
                href={target}
                onClick={(e) => {
                  e.preventDefault()
                  onNavigate(rel)
                }}
                {...props}
              >
                {kids}
              </a>
            )
          }
        }

        // Anything else (file://, custom schemes) is model output we do not
        // trust — render it as inert text.
        return (
          <span className="text-kai-dim underline decoration-dotted" title={target}>
            {kids}
          </span>
        )
      },
    }),
    [docPath, onNavigate]
  )

  // The parse itself is the expensive part: on a 2000-line chapter,
  // <ReactMarkdown> re-parsing on every render is what makes scroll-spy
  // (which re-renders the article per heading intersection) feel like
  // scrolling through mud. Memoising the element means one parse per
  // document, not one per scroll tick.
  const article = useMemo(
    () => (
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSlug]} components={components}>
        {children}
      </ReactMarkdown>
    ),
    [children, components]
  )

  return <div className={cn("md-body", variant === "chat" && "md-chat", className)}>{article}</div>
}
