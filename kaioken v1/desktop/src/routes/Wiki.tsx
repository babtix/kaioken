import { useCallback, useEffect, useRef, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { BookOpen, Clock, FileText, Hash } from "lucide-react"
import { useWorkspaceStore } from "@/store/workspace"
import { api } from "@/lib/api"
import Markdown from "@/components/common/Markdown"
import EmptyState from "@/components/EmptyState"
import LocalGraph from "@/components/graph/LocalGraph"
import WikiNavigator from "@/components/wiki/WikiNavigator"
import { Badge, Skeleton } from "@/components/ui"
import { cn } from "@/lib/utils"

type DocMeta = {
  title: string
  rel: string
  lines: number
  words: number
  reading_minutes: number
  is_section_doc: boolean
}
type Section = { name: string; docs: DocMeta[] }
type TocEntry = { level: number; text: string; slug: string }
type Doc = {
  path: string
  title: string
  markdown: string
  lines: number
  words: number
  reading_minutes: number
  provenance: string[]
  toc: TocEntry[]
}
type Hit = { path: string; title: string; line: number; snippet: string; score: number }

export default function Wiki() {
  const ws = useWorkspaceStore((s) => s.active)
  const [sections, setSections] = useState<Section[]>([])
  const [doc, setDoc] = useState<Doc | null>(null)
  const [loading, setLoading] = useState(false)
  const [query, setQuery] = useState("")
  const [hits, setHits] = useState<Hit[] | null>(null)
  const [activeSlug, setActiveSlug] = useState<string | null>(null)
  const readerRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const [searchParams] = useSearchParams()
  const docParam = searchParams.get("doc")

  useEffect(() => {
    if (!ws) return
    api
      .wikiTree(ws.id)
      .then((res) => setSections(res.sections || []))
      .catch(() => setSections([]))
  }, [ws?.id])

  const openDoc = useCallback(
    async (rel: string) => {
      if (!ws) return
      setLoading(true)
      try {
        const d = await api.wikiDoc(ws.id, rel)
        // Older daemons marshal empty Go slices as null; normalize so the
        // reader can index into these without guards.
        setDoc({ ...d, toc: d.toc ?? [], provenance: d.provenance ?? [] })
        setActiveSlug(null)
        readerRef.current?.scrollTo({ top: 0 })
      } catch {
        setDoc(null)
      } finally {
        setLoading(false)
      }
    },
    [ws?.id]
  )

  // Deep-link from the explorer's wiki outline: ?doc=<rel> opens that document
  // on arrival. Runs only when the param changes, so in-reader navigation that
  // does not touch the URL is not clobbered.
  useEffect(() => {
    if (!ws || !docParam) return
    void openDoc(docParam)
  }, [ws?.id, docParam, openDoc])

  // Debounced live search — no Enter required.
  useEffect(() => {
    if (!ws) return
    const q = query.trim()
    if (!q) {
      setHits(null)
      return
    }
    const id = setTimeout(() => {
      api
        .wikiSearch(ws.id, q)
        .then((r) => setHits(r.hits || []))
        .catch(() => setHits([]))
    }, 180)
    return () => clearTimeout(id)
  }, [query, ws?.id])

  // Ctrl/Cmd+F focuses wiki search rather than the WebView's find bar.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
        e.preventDefault()
        searchRef.current?.focus()
        searchRef.current?.select()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  // Scroll-spy: highlight the TOC entry for the heading nearest the top.
  useEffect(() => {
    const root = readerRef.current
    if (!root || !doc) return
    const headings = Array.from(root.querySelectorAll<HTMLElement>("h2[id], h3[id], h4[id]"))
    if (headings.length === 0) return
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (visible[0]) setActiveSlug(visible[0].target.id)
      },
      { root, rootMargin: "0px 0px -70% 0px", threshold: 0 }
    )
    headings.forEach((h) => observer.observe(h))
    return () => observer.disconnect()
  }, [doc])

  if (!ws) {
    return <EmptyState icon={BookOpen} title="No workspace open" hint="Open a repository to read its wiki." />
  }

  if (sections.length === 0) {
    return (
      <EmptyState
        icon={BookOpen}
        title="No wiki generated yet"
        hint="A wiki turns this repository into linked chapters with diagrams. Start one from the Activity screen."
      />
    )
  }

  return (
    <div className="flex h-full">
      <WikiNavigator
        sections={sections}
        activePath={doc?.path ?? null}
        onOpen={openDoc}
        query={query}
        onQueryChange={setQuery}
        hits={hits}
        searchRef={searchRef}
      />

      {/* Reader */}
      <main ref={readerRef} className="min-w-0 flex-1 overflow-auto">
        {loading ? (
          <div className="mx-auto max-w-3xl space-y-3 p-8">
            <Skeleton className="h-6 w-1/2" />
            <Skeleton className="h-3 w-1/3" />
            <div className="space-y-2 pt-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className={cn("h-3", i % 3 === 2 ? "w-2/3" : "w-full")} />
              ))}
            </div>
          </div>
        ) : doc ? (
          <div className="mx-auto flex max-w-5xl gap-8 px-8 py-8">
            <article className="min-w-0 flex-1">
              <h1 className="font-mono text-2xl font-bold tracking-tight text-kai-white">
                {doc.title}
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Badge tone="neutral">
                  <Clock size={9} /> {doc.reading_minutes || 1} min read
                </Badge>
                <Badge tone="neutral">{doc.lines} lines</Badge>
                <Badge tone="neutral">{doc.words.toLocaleString()} words</Badge>
              </div>

              <div className="mt-6">
                <Markdown docPath={doc.path} onNavigate={openDoc}>
                  {doc.markdown}
                </Markdown>
              </div>

              {doc.provenance.length > 0 && (
                <footer className="mt-10 border-t border-border pt-4">
                  <p className="font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-kai-dim">
                    Generated from
                  </p>
                  <ul className="mt-2 flex flex-wrap gap-1.5">
                    {doc.provenance.map((p) => (
                      <li
                        key={p}
                        className="rounded border border-border bg-panel px-1.5 py-0.5 font-mono text-[10px] text-kai-sage"
                      >
                        {p}
                      </li>
                    ))}
                  </ul>
                </footer>
              )}
            </article>

            <aside className="sticky top-8 hidden h-fit max-h-[calc(100vh-8rem)] w-60 shrink-0 overflow-y-auto xl:block">
              <LocalGraph docPath={doc.path} onNavigate={openDoc} />
              {doc.toc.length > 2 && (
                <nav>
                  <p className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-kai-dim">
                    On this page
                  </p>
                  <ul className="space-y-0.5 border-l border-border">
                    {doc.toc.map((t, i) => (
                      <li key={`${t.slug}-${i}`}>
                        <a
                          href={`#${t.slug}`}
                          onClick={(e) => {
                            e.preventDefault()
                            readerRef.current
                              ?.querySelector(`#${CSS.escape(t.slug)}`)
                              ?.scrollIntoView({ behavior: "smooth", block: "start" })
                            setActiveSlug(t.slug)
                          }}
                          className={cn(
                            "-ml-px block border-l py-0.5 font-mono text-[10px] transition-colors",
                            t.level === 2 ? "pl-2.5" : t.level === 3 ? "pl-5" : "pl-7",
                            activeSlug === t.slug
                              ? "border-kai-orange text-kai-orange"
                              : "border-transparent text-kai-dim hover:text-kai-text"
                          )}
                        >
                          {t.text}
                        </a>
                      </li>
                    ))}
                  </ul>
                </nav>
              )}
            </aside>
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-8">
            <FileText size={26} className="text-kai-dim" />
            <p className="font-mono text-sm text-kai-text">Select a document</p>
            <p className="max-w-xs text-center font-mono text-[11px] leading-relaxed text-kai-dim">
              Pick a chapter from the tree, or press{" "}
              <Hash size={9} className="inline" /> search to jump straight to a phrase.
            </p>
          </div>
        )}
      </main>
    </div>
  )
}
