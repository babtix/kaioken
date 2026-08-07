import * as React from "react"
import { Link, useParams } from "react-router-dom"
import { ArrowLeft, ArrowRight, FileCode2 } from "lucide-react"
import Markdown from "@/components/Markdown"
import { RUN_COST, WIKI_FLAT, docUrl, findDoc } from "@/data/wiki"

/** Kaioken's provenance footer is metadata, not prose — strip it from the body. */
const FOOTER = /\n*<!--\s*kaioken:files[\s\S]*?-->\s*$/

export default function PreviewDoc() {
  const { section: sectionSlug, doc: docSlug } = useParams()
  // findDoc builds a new object each call; without memoising it the fetch
  // effect re-runs on every render and never settles.
  const hit = React.useMemo(() => findDoc(sectionSlug, docSlug), [sectionSlug, docSlug])

  const [body, setBody] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)

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
      <article className="min-w-0 pb-20">
        <p className="font-mono text-[13px] text-kai-rose">document not found</p>
        <Link to="/preview" className="mt-3 inline-block font-mono text-[13px] text-kai-orange">
          ← back to the output tree
        </Link>
      </article>
    )
  }

  const { section, doc } = hit
  const index = WIKI_FLAT.findIndex(
    (e) => e.section.slug === section.slug && e.doc.slug === doc.slug
  )
  const prev = index > 0 ? WIKI_FLAT[index - 1] : undefined
  const next = index >= 0 && index < WIKI_FLAT.length - 1 ? WIKI_FLAT[index + 1] : undefined

  return (
    <article className="min-w-0 pb-20">
      <header className="border-b border-border pb-5">
        <p className="flex flex-wrap items-center gap-1.5 font-mono text-[11px] text-kai-dim">
          <Link to="/preview" className="transition-colors hover:text-kai-orange">
            .kaioken/wiki
          </Link>
          <span aria-hidden>/</span>
          <span className="text-kai-orange">{section.title}</span>
          <span aria-hidden>/</span>
          <span className="text-muted-foreground">{doc.file}</span>
        </p>
        <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px] text-kai-dim">
          <span>
            <span className="text-kai-amber">{RUN_COST.level}</span> generated
          </span>
          <span>{doc.words.toLocaleString()} words</span>
          {doc.hasMermaid ? <span className="text-kai-blue">contains diagrams</span> : null}
          <a
            href={docUrl(section.dir, doc.file)}
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:text-kai-orange"
          >
            view raw markdown ↗
          </a>
        </p>
      </header>

      {/* the provenance footer, surfaced as real metadata */}
      {doc.sources.length > 0 ? (
        <div className="mt-5 rounded-sm border border-border bg-card p-4">
          <div className="flex items-center gap-2">
            <FileCode2 className="size-3.5 text-kai-orange" />
            <span className="font-mono text-[11px] tracking-wider text-kai-dim uppercase">
              written from
            </span>
          </div>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {doc.sources.map((src) => (
              <li
                key={src}
                className="rounded-sm bg-kai-panel px-2 py-0.5 font-mono text-[11.5px] text-kai-tan"
              >
                {src}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="pt-6">
        {error ? (
          <p className="font-mono text-[13px] text-kai-rose">
            could not load this document ({error})
          </p>
        ) : body === null ? (
          <p className="font-mono text-[13px] text-kai-dim">loading…</p>
        ) : (
          <Markdown sectionDir={section.dir}>{body}</Markdown>
        )}
      </div>

      <nav className="mt-14 grid gap-3 border-t border-border pt-6 sm:grid-cols-2">
        {prev ? (
          <Link
            to={`/preview/${prev.section.slug}/${prev.doc.slug}`}
            className="group rounded-sm border border-border bg-card p-4 transition-colors hover:border-kai-orange/45"
          >
            <span className="flex items-center gap-1.5 font-mono text-[11px] text-kai-dim">
              <ArrowLeft className="size-3" />
              {prev.section.title}
            </span>
            <span className="mt-1 block font-mono text-[13.5px] font-bold text-foreground transition-colors group-hover:text-kai-orange">
              {prev.doc.title}
            </span>
          </Link>
        ) : (
          <span />
        )}
        {next ? (
          <Link
            to={`/preview/${next.section.slug}/${next.doc.slug}`}
            className="group rounded-sm border border-border bg-card p-4 text-right transition-colors hover:border-kai-orange/45 sm:col-start-2"
          >
            <span className="flex items-center justify-end gap-1.5 font-mono text-[11px] text-kai-dim">
              {next.section.title}
              <ArrowRight className="size-3" />
            </span>
            <span className="mt-1 block font-mono text-[13.5px] font-bold text-foreground transition-colors group-hover:text-kai-orange">
              {next.doc.title}
            </span>
          </Link>
        ) : null}
      </nav>
    </article>
  )
}
