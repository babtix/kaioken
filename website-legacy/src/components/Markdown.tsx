import * as React from "react"
import ReactMarkdown, { type Components } from "react-markdown"
import remarkGfm from "remark-gfm"
import rehypeSlug from "rehype-slug"
import { Link } from "react-router-dom"
import Mermaid from "./Mermaid"

/** Matches the slug rule in scripts/gen-wiki-manifest.mjs. */
const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/\.md$/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")

/**
 * Kaioken rewrites cross-chapter mentions into relative .md links. Turn those
 * into routes inside the preview instead of dead file links.
 */
function resolveHref(href: string, sectionDir: string): { to?: string; external?: string } {
  if (/^https?:/i.test(href)) return { external: href }
  if (href.startsWith("#")) return { external: href }

  const clean = href.replace(/^\.\//, "")
  if (!clean.endsWith(".md")) return { external: href }

  const parts = clean.split("/")
  if (parts.length === 1) {
    // sibling document inside the same section
    return { to: `/preview/${slug(sectionDir)}/${slug(parts[0])}` }
  }
  const [dir, file] = parts.slice(-2)
  return { to: `/preview/${slug(dir)}/${slug(file)}` }
}

export default function Markdown({
  children,
  sectionDir = "",
}: {
  children: string
  /** the document's own section, used to resolve sibling links */
  sectionDir?: string
}) {
  const components: Components = React.useMemo(
    () => ({
      h1: ({ children }) => (
        <h1 className="mt-0 font-mono text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          {children}
        </h1>
      ),
      h2: ({ children, ...props }) => (
        <h2
          {...props}
          className="scroll-mt-24 border-b border-border pt-10 pb-2 font-mono text-xl font-bold text-kai-orange"
        >
          {children}
        </h2>
      ),
      h3: ({ children, ...props }) => (
        <h3 {...props} className="scroll-mt-24 pt-7 font-mono text-[16px] font-bold text-kai-amber">
          {children}
        </h3>
      ),
      h4: ({ children, ...props }) => (
        <h4 {...props} className="scroll-mt-24 pt-5 font-mono text-[14px] font-bold text-foreground">
          {children}
        </h4>
      ),
      p: ({ children }) => (
        <p className="pt-4 font-sans text-[15px] leading-[1.75] text-muted-foreground">{children}</p>
      ),
      ul: ({ children }) => <ul className="mt-4 space-y-2 pl-1">{children}</ul>,
      ol: ({ children }) => (
        <ol className="mt-4 list-decimal space-y-2 pl-5 marker:font-mono marker:text-kai-orange">
          {children}
        </ol>
      ),
      li: ({ children }) => (
        <li className="font-sans text-[15px] leading-[1.7] text-muted-foreground">{children}</li>
      ),
      strong: ({ children }) => (
        <strong className="font-semibold text-foreground">{children}</strong>
      ),
      em: ({ children }) => <em className="text-kai-tan italic">{children}</em>,
      hr: () => <hr className="my-10 border-border" />,
      blockquote: ({ children }) => (
        <blockquote className="mt-5 border-l-2 border-kai-orange/50 bg-kai-panel/40 py-1 pl-4">
          {children}
        </blockquote>
      ),
      a: ({ href, children }) => {
        if (!href) return <span>{children}</span>
        const r = resolveHref(href, sectionDir)
        if (r.to) {
          return (
            <Link
              to={r.to}
              className="text-kai-orange underline decoration-kai-orange/40 underline-offset-2 transition-colors hover:text-kai-amber"
            >
              {children}
            </Link>
          )
        }
        const isAnchor = r.external?.startsWith("#")
        return (
          <a
            href={r.external}
            {...(isAnchor ? {} : { target: "_blank", rel: "noopener noreferrer" })}
            className="text-kai-orange underline decoration-kai-orange/40 underline-offset-2 transition-colors hover:text-kai-amber"
          >
            {children}
          </a>
        )
      },
      table: ({ children }) => (
        <div className="mt-5 overflow-x-auto rounded-sm border border-border">
          <table className="w-full border-collapse text-left">{children}</table>
        </div>
      ),
      thead: ({ children }) => <thead className="bg-kai-panel">{children}</thead>,
      th: ({ children }) => (
        <th className="border-b border-border px-4 py-2.5 font-mono text-[11px] tracking-wider text-kai-amber uppercase">
          {children}
        </th>
      ),
      td: ({ children }) => (
        <td className="border-b border-border px-4 py-2.5 align-top font-sans text-[13.5px] text-muted-foreground last:border-r-0">
          {children}
        </td>
      ),
      pre: ({ children }) => <>{children}</>,
      code: ({ className, children, ...props }) => {
        const text = String(children ?? "")
        const lang = /language-(\w+)/.exec(className ?? "")?.[1]

        // Inline code has no language class and no trailing newline.
        if (!lang && !text.includes("\n")) {
          return (
            <code
              className="rounded-sm bg-kai-panel px-1.5 py-0.5 font-mono text-[13px] text-kai-amber"
              {...props}
            >
              {children}
            </code>
          )
        }

        if (lang === "mermaid") return <Mermaid chart={text.trimEnd()} />

        return (
          <div className="mt-5 overflow-hidden rounded-sm border border-border bg-card">
            <div className="flex items-center gap-2 border-b border-border bg-kai-panel px-3 py-1.5">
              <span className="size-2 rounded-[1px] bg-kai-orange/60" />
              <span className="font-mono text-[10.5px] tracking-wider text-kai-dim uppercase">
                {lang ?? "text"}
              </span>
            </div>
            <pre className="overflow-x-auto p-4">
              <code className="font-mono text-[12.5px] leading-relaxed text-foreground">
                {text.replace(/\n$/, "")}
              </code>
            </pre>
          </div>
        )
      },
    }),
    [sectionDir]
  )

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeSlug]}
      components={components}
    >
      {children}
    </ReactMarkdown>
  )
}
