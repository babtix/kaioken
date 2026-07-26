import { useEffect, useState } from "react"
import { ChevronDown, ChevronRight, FileText, Search } from "lucide-react"
import { useWorkspaceStore } from "@/store/workspace"
import { api } from "@/lib/api"
import { cn } from "@/lib/utils"

type DocMeta = { title: string; rel: string; lines: number; words: number; reading_minutes: number; is_section_doc: boolean }
type Section = { name: string; docs: DocMeta[] }

export default function Wiki() {
  const ws = useWorkspaceStore((s) => s.active)
  const [sections, setSections] = useState<Section[]>([])
  const [activeDoc, setActiveDoc] = useState<any>(null)
  const [searchQ, setSearchQ] = useState("")
  const [searchHits, setSearchHits] = useState<any[]>([])
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!ws) return
    api.wikiTree(ws.id).then((res) => {
      setSections(res.sections || [])
      setExpanded(new Set((res.sections || []).map((s: Section) => s.name)))
    }).catch(() => {})
  }, [ws?.id])

  async function openDoc(rel: string) {
    if (!ws) return
    setLoading(true)
    try {
      const doc = await api.wikiDoc(ws.id, rel)
      setActiveDoc(doc)
    } catch { setActiveDoc(null) }
    setLoading(false)
  }

  async function doSearch() {
    if (!ws || !searchQ.trim()) { setSearchHits([]); return }
    const res = await api.wikiSearch(ws.id, searchQ)
    setSearchHits(res.hits || [])
  }

  if (!ws) return <div className="flex h-full items-center justify-center font-mono text-sm text-kai-dim">Open a workspace first</div>

  if (sections.length === 0 && !activeDoc) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <p className="font-mono text-sm text-kai-dim">No wiki generated yet</p>
        <p className="font-mono text-xs text-kai-dim">Run a wiki from the Activity screen</p>
      </div>
    )
  }

  return (
    <div className="flex h-full">
      {/* Sidebar tree */}
      <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-card">
        {/* Search */}
        <div className="flex items-center gap-1 border-b border-border px-2 py-1.5">
          <Search size={12} className="text-kai-dim" />
          <input
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && doSearch()}
            placeholder="Search wiki…"
            className="flex-1 bg-transparent font-mono text-[11px] text-kai-text placeholder:text-kai-dim focus:outline-none"
          />
        </div>

        <div className="min-h-0 flex-1 overflow-auto py-1">
          {searchHits.length > 0 ? (
            searchHits.map((h, i) => (
              <button key={i} onClick={() => openDoc(h.path)} className="block w-full px-3 py-1.5 text-left font-mono text-[10px] text-kai-muted hover:text-kai-text">
                <span className="text-kai-blue">{h.title}</span> :{h.line} — {h.snippet}
              </button>
            ))
          ) : (
            sections.map((sec) => (
              <div key={sec.name}>
                <button
                  onClick={() => setExpanded((s) => { const n = new Set(s); n.has(sec.name) ? n.delete(sec.name) : n.add(sec.name); return n })}
                  className="flex w-full items-center gap-1 px-2 py-1 font-mono text-[11px] font-bold text-kai-text hover:bg-panel"
                >
                  {expanded.has(sec.name) ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                  {sec.name}
                </button>
                {expanded.has(sec.name) && sec.docs.map((doc) => (
                  <button
                    key={doc.rel}
                    onClick={() => openDoc(doc.rel)}
                    className={cn(
                      "block w-full truncate py-0.5 pl-7 pr-2 text-left font-mono text-[10px] transition-colors",
                      activeDoc?.path === doc.rel ? "text-kai-orange" : "text-kai-muted hover:text-kai-text"
                    )}
                  >
                    {doc.title}
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      </aside>

      {/* Document reader */}
      <main className="min-w-0 flex-1 overflow-auto p-6">
        {loading && <p className="font-mono text-xs text-kai-dim">Loading…</p>}
        {activeDoc && !loading && (
          <article>
            <h1 className="mb-1 font-mono text-lg font-bold text-kai-text">{activeDoc.title}</h1>
            <p className="mb-4 font-mono text-[10px] text-kai-dim">
              {activeDoc.lines} lines · {activeDoc.words} words · ~{activeDoc.reading_minutes} min
              {activeDoc.provenance?.length > 0 && ` · from ${activeDoc.provenance.length} files`}
            </p>
            <div className="prose prose-invert prose-sm max-w-none font-mono">
              <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-kai-text">{activeDoc.markdown}</pre>
            </div>
          </article>
        )}
        {!activeDoc && !loading && (
          <div className="flex h-full items-center justify-center">
            <p className="flex items-center gap-2 font-mono text-xs text-kai-dim"><FileText size={14} /> Select a document</p>
          </div>
        )}
      </main>
    </div>
  )
}
