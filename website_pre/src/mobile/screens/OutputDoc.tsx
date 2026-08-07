import * as React from "react"
import { Link, useParams } from "react-router-dom"
import { ArrowLeft, ArrowRight, FileCode2 } from "lucide-react"
import Markdown from "@/components/Markdown"
import { useScreenTitle } from "@/mobile/lib/chrome"
import { RUN_COST, WIKI_FLAT, docUrl, findDoc } from "@/data/wiki"

/** Kaioken's provenance footer is metadata, not prose — strip it from the body. */
const FOOTER = /\n*<!--\s*kaioken:files[\s\S]*?-->\s*$/

export default function OutputDoc() {
  const { section: sectionSlug, doc: docSlug } = useParams()
  // findDoc builds a new object each call; without memoising it the fetch
  // effect re-runs on every render and never settles.
  const hit = React.useMemo(() => findDoc(sectionSlug, docSlug), [sectionSlug, docSlug])

  const [body, setBody] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  useScreenTitle(hit?.doc.title ?? null)

  React.useEffect(() => {
    if (!hit) return
    let alive = true
    setBody(null)
    setError(null)

    fetch(docUrl(hit.section.dir, hit.doc.file))
      .then((r) => {
        if (!r.ok) throw new Error(`${r.status}`)
        return r.text()
      })
      .then((text) => {
        if (alive) setBody(text.replace(FOOTER, ""))
      })
      .catch((e) => {
        if (alive) setError(String(e.message ?? e))
      })

    return () => {
      alive = false
    }
  }, [hit])

  if (!hit) {
    return (
      <div className="px-4 pt-8">
        <p className="font-mono text-[13px] text-kai-rose">document not found</p>
        <Link to="/preview" className="mt-3 inline-block font-mono text-[13px] text-kai-orange">
          ← back to the output tree
        </Link>
      </div>
    )
  }

  const { section, doc } = hit
  const index = WIKI_FLAT.findIndex(
    (e) => e.section.slug === section.slug && e.doc.slug === doc.slug
  )
  const prev = index > 0 ? WIKI_FLAT[index - 1] : undefined
  const next = index >= 0 && index < WIKI_FLAT.length - 1 ? WIKI_FLAT[index + 1] : undefined

  return (
    <>
      <article className="px-4 pt-5 pb-4">
        <header className="border-b border-border pb-4">
          {/* The document opens with its own h1 — repeating the title here
              would say it twice before a line of prose. */}
          <p className="font-mono text-[10.5px] leading-relaxed text-kai-dim">
            <Link to="/preview">.kaioken/wiki</Link>
            <span aria-hidden> / </span>
            <span className="text-kai-orange">{section.title}</span>
            <span aria-hidden> / </span>
            <span className="break-all">{doc.file}</span>
          </p>
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10.5px] text-kai-dim">
            <span>
              <span className="text-kai-amber">{RUN_COST.level}</span> generated
            </span>
            <span>{doc.words.toLocaleString()} words</span>
            {doc.hasMermaid ? <span className="text-kai-blue">diagrams</span> : null}
            <a
              href={docUrl(section.dir, doc.file)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-kai-orange"
            >
              raw ↗
            </a>
          </p>
        </header>

        {doc.sources.length > 0 ? (
          <div className="mt-4 rounded-md border border-border bg-card p-3.5">
            <div className="flex items-center gap-2">
              <FileCode2 className="size-3.5 text-kai-orange" aria-hidden />
              <span className="font-mono text-[10px] tracking-[0.15em] text-kai-dim uppercase">
                written from
              </span>
            </div>
            <ul className="m-no-scrollbar mt-2.5 flex gap-1.5 overflow-x-auto">
              {doc.sources.map((src) => (
                <li
                  key={src}
                  className="shrink-0 rounded-sm bg-kai-panel px-2 py-1 font-mono text-[11px] whitespace-nowrap text-kai-tan"
                >
                  {src}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {/* Generated prose is full of long identifiers; let them break rather
            than push the whole column sideways. */}
        <div className="pt-2 [&_h1]:text-[22px] [&_h2]:text-[18px] [&_h3]:text-[15px] [&_li]:[overflow-wrap:anywhere] [&_p]:[overflow-wrap:anywhere]">
          {error ? (
            <p className="pt-6 font-mono text-[12.5px] text-kai-rose">
              could not load this document ({error})
            </p>
          ) : body === null ? (
            <p className="pt-6 font-mono text-[12.5px] text-kai-dim">
              <span className="animate-caret text-kai-orange">▎</span> loading…
            </p>
          ) : (
            <Markdown sectionDir={section.dir}>{body}</Markdown>
          )}
        </div>

        <nav className="mt-10 space-y-2.5 border-t border-border pt-6">
          {prev ? (
            <Link
              to={`/preview/${prev.section.slug}/${prev.doc.slug}`}
              className="m-press flex min-h-[60px] items-center gap-3 rounded-md border border-border bg-card px-4 py-3"
            >
              <ArrowLeft className="size-4 shrink-0 text-kai-dim" aria-hidden />
              <span className="min-w-0">
                <span className="block truncate font-mono text-[10px] tracking-[0.12em] text-kai-dim uppercase">
                  {prev.section.title}
                </span>
                <span className="mt-0.5 block font-mono text-[13px] font-bold text-foreground">
                  {prev.doc.title}
                </span>
              </span>
            </Link>
          ) : null}
          {next ? (
            <Link
              to={`/preview/${next.section.slug}/${next.doc.slug}`}
              className="m-press flex min-h-[60px] items-center gap-3 rounded-md border border-kai-orange/35 bg-kai-orange/[0.07] px-4 py-3"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate font-mono text-[10px] tracking-[0.12em] text-kai-dim uppercase">
                  {next.section.title}
                </span>
                <span className="mt-0.5 block font-mono text-[13px] font-bold text-kai-orange">
                  {next.doc.title}
                </span>
              </span>
              <ArrowRight className="size-4 shrink-0 text-kai-orange" aria-hidden />
            </Link>
          ) : null}
          <Link
            to="/preview"
            className="m-press flex min-h-[48px] items-center justify-center rounded-md border border-border px-4 font-mono text-[12.5px] text-muted-foreground"
          >
            back to the output tree
          </Link>
        </nav>
      </article>
    </>
  )
}
