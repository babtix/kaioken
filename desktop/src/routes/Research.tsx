import { useEffect, useState } from "react"
import { openInBrowser } from "@/lib/openInBrowser"
import { FileText, History, Radar, Square, Trash2 } from "lucide-react"
import { useWorkspaceStore } from "@/store/workspace"
import { useResearchStore } from "@/store/research"
import { useToastStore } from "@/store/toast"
import EmptyState from "@/components/EmptyState"
import { Button } from "@/components/ui"
import { LiveDot, SectionLabel } from "@/components/hud"
import { AnswerCard } from "@/components/answer/AnswerCard"
import { AskComposer } from "@/components/answer/AskComposer"
import { ResearchSteps } from "@/components/answer/ResearchSteps"
import {
  SearchProviderPicker,
  type SearchSettings,
} from "@/components/SearchProviderPicker"
import { api } from "@/lib/api"
import { formatRelativeTime } from "@/lib/format"
import { humanize } from "@/lib/errors"
import type { AnswerSource } from "@/components/answer/types"
import type { ResearchReport } from "@/lib/types"

/**
 * Research is the Perplexity-style surface wired to the daemon's `research`
 * run: decompose → search → read → reason → gap-check → report, with the ×N
 * power dial scaling what the engine actually spends.
 */
export default function Research() {
  const ws = useWorkspaceStore((s) => s.active)
  const {
    question, busy, steps, answer, rounds, searched, reportPath, error, history,
    start, cancel, loadHistory, openSaved, deleteSaved,
  } = useResearchStore()
  const pushToast = useToastStore((s) => s.push)
  const [power, setPower] = useState(3)
  const [search, setSearch] = useState<SearchSettings | null>(null)

  // The provider switch edits the same daemon-side value as Settings, so a
  // choice made here holds everywhere (CLI included).
  useEffect(() => {
    api
      .settings()
      .then((s) => setSearch(s.search ?? null))
      .catch(() => setSearch(null))
  }, [])

  // Saved reports are workspace-scoped; reload whenever the repo changes.
  useEffect(() => {
    if (ws) void loadHistory(ws.id)
  }, [ws?.id, loadHistory])

  const setSearchProvider = async (v: string) => {
    try {
      const res = await api.putSettings({ search_provider: v })
      setSearch((s) => (s ? { ...s, provider: res.search_provider ?? v } : s))
    } catch (err) {
      const h = humanize(err)
      pushToast("error", h.title, h.body, h.action)
    }
  }

  if (!ws) {
    return (
      <EmptyState
        icon={Radar}
        title="No workspace open"
        hint="Open a repository first — research runs and reports are workspace-scoped."
      />
    )
  }

  const submit = (q: string, p: number, web: boolean) => {
    if (!web) {
      pushToast("info", "Research always searches the web", "Repository questions live in Chat.")
      return
    }
    setPower(p)
    void start(ws.id, q, p)
  }

  const openSource = (s: AnswerSource) => openInBrowser(s.url)

  return (
    <div className="mx-auto max-w-3xl px-5 py-6">
      <header className="mb-5 flex items-center gap-3">
        <div className="flex-1">
          <h1 className="font-mono text-lg font-bold tracking-tight text-kai-white">Research</h1>
          <p className="mt-0.5 font-mono text-[11px] text-kai-dim">
            Searches the web, reads pages, and writes a cited report.
          </p>
        </div>
        {busy && <LiveDot label="researching" />}
      </header>

      <AskComposer onSubmit={submit} busy={busy} autoFocus />

      {search && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="font-mono text-[10px] text-kai-dim">Engines</span>
          <SearchProviderPicker
            value={search.provider}
            providers={search.providers}
            onChange={setSearchProvider}
            disabled={busy}
          />
        </div>
      )}

      {busy && (
        <div className="animate-charge mt-4 space-y-3">
          <div className="flex items-center gap-2">
            <SectionLabel>Researching — {question}</SectionLabel>
          </div>
          <ResearchSteps steps={steps} searched={searched} rounds={rounds} defaultOpen />
          <Button variant="danger" size="sm" onClick={() => void cancel()}>
            <Square size={11} />
            Stop
          </Button>
        </div>
      )}

      {error && !busy && (
        <p className="mt-4 rounded-[var(--radius)] border border-kai-rose/30 bg-kai-rose/10 px-3 py-2 font-mono text-xs text-kai-rose">
          {error}
        </p>
      )}

      {answer && !busy && (
        <div className="mt-5 space-y-2">
          <AnswerCard
            answer={answer}
            searched={searched}
            rounds={rounds}
            onOpenSource={openSource}
            onCopy={() => void navigator.clipboard.writeText(answer.body).catch(() => {})}
            onExport={() =>
              pushToast(
                "success",
                "Report saved in the repository",
                reportPath ?? ".kaioken/research/"
              )
            }
            onRewrite={() => void start(ws.id, answer.question, power)}
          />
          {reportPath && (
            <p className="flex items-center gap-1.5 font-mono text-[10px] text-kai-dim">
              <FileText size={10} />
              {reportPath}
            </p>
          )}
        </div>
      )}

      {!busy && !answer && !error && <ResearchIntro onPick={(q) => submit(q, power, true)} />}

      {!busy && history.length > 0 && (
        <ResearchHistory
          reports={history}
          activeQuestion={answer?.question}
          onOpen={(slug) => void openSaved(ws.id, slug)}
          onDelete={(slug) => void deleteSaved(ws.id, slug)}
        />
      )}
    </div>
  )
}

const EXAMPLES = [
  "Is solar cheaper than nuclear in Europe?",
  "What changed in Go 1.24 garbage collection?",
  "How do Tauri v2 and Electron compare on memory?",
]

/**
 * ResearchHistory is what makes a deep search reusable: every finished run
 * is persisted by the daemon, so past reports outlive the session and one
 * click reopens the full answer surface — chips, sources, counters.
 */
function ResearchHistory({
  reports,
  activeQuestion,
  onOpen,
  onDelete,
}: {
  reports: ResearchReport[]
  activeQuestion?: string
  onOpen: (slug: string) => void
  onDelete: (slug: string) => void
}) {
  return (
    <div className="mt-8">
      <div className="flex items-center gap-1.5">
        <History size={11} className="text-kai-dim" />
        <SectionLabel>Past research</SectionLabel>
      </div>
      <ul className="mt-2 space-y-1">
        {reports.map((r) => (
          <li
            key={r.slug}
            className="group flex items-center gap-2 rounded-[var(--radius)] border border-border
                       bg-card transition-colors hover:border-kai-orange/40 hover:bg-accent"
          >
            <button
              type="button"
              onClick={() => onOpen(r.slug)}
              className="min-w-0 flex-1 px-2.5 py-1.5 text-left outline-none
                         focus-visible:ring-2 focus-visible:ring-kai-orange/50"
            >
              <span
                className={
                  "block truncate font-sans text-[12px] " +
                  (r.question === activeQuestion ? "text-kai-orange" : "text-kai-text")
                }
              >
                {r.question}
              </span>
              <span className="block truncate font-mono text-[10px] text-kai-dim">
                {[
                  formatRelativeTime(r.created_at),
                  `${r.sources.length} sources`,
                  r.rounds ? `${r.rounds} round${r.rounds === 1 ? "" : "s"}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </button>
            <button
              type="button"
              onClick={() => onDelete(r.slug)}
              aria-label={`Delete saved research: ${r.question}`}
              title="Delete this saved report"
              className="mr-1.5 rounded-[var(--radius)] p-1.5 text-kai-dim opacity-0 outline-none
                         transition-opacity hover:text-kai-rose focus-visible:opacity-100
                         focus-visible:ring-2 focus-visible:ring-kai-orange/50 group-hover:opacity-100"
            >
              <Trash2 size={12} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

function ResearchIntro({ onPick }: { onPick: (q: string) => void }) {
  return (
    <div className="animate-charge mt-8">
      <SectionLabel>How it works</SectionLabel>
      <p className="mt-2 font-mono text-[11px] leading-relaxed text-kai-dim">
        The question is split into subquestions, each searched and read across the web,
        then gaps are detected and searched again. Every claim in the report cites a page
        that was actually fetched. The ×N dial is the cost control — it scales queries,
        pages and rounds.
      </p>
      <div className="mt-4 flex flex-wrap gap-1.5">
        {EXAMPLES.map((q) => (
          <button
            key={q}
            onClick={() => onPick(q)}
            className="rounded-[var(--radius)] border border-border bg-card px-2.5 py-1.5 text-left
                       font-sans text-[12px] text-kai-text transition-colors outline-none
                       hover:border-kai-orange/40 hover:bg-accent hover:text-kai-white
                       focus-visible:ring-2 focus-visible:ring-kai-orange/50"
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  )
}
