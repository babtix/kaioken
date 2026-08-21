import { useEffect, useRef, useState } from "react"
import { openInBrowser } from "@/lib/openInBrowser"
import { ChevronRight, FileText, History, Info, PauseCircle, Play, Radar, Square, Trash2 } from "lucide-react"
import { useWorkspaceStore } from "@/store/workspace"
import { useResearchStore } from "@/store/research"
import { useToastStore } from "@/store/toast"
import EmptyState from "@/components/EmptyState"
import { JumpToBottom } from "@/components/common/JumpToBottom"
import { Button } from "@/components/ui"
import { LiveDot, SectionLabel } from "@/components/hud"
import { cn } from "@/lib/utils"
import { AnswerCard } from "@/components/answer/AnswerCard"
import { AskComposer } from "@/components/answer/AskComposer"
import { ResearchSteps } from "@/components/answer/ResearchSteps"
import {
  SearchProviderPicker,
  type SearchSettings,
} from "@/components/SearchProviderPicker"
import {
  FetcherModePicker,
  currentFetcherMode,
  type FetcherMode,
} from "@/components/FetcherModePicker"
import { api } from "@/lib/api"
import { formatDuration, formatRelativeTime, formatTokens } from "@/lib/format"
import { humanize } from "@/lib/errors"
import type { AnswerSource } from "@/components/answer/types"
import type { FetcherSettings as FetcherSettingsType, ResearchCost, ResearchGrounding, ResearchReport, ResumableRun } from "@/lib/types"

/**
 * Research is the Perplexity-style surface wired to the daemon's `research`
 * run. The engine behind it is a hybrid: a router picks the fast single-loop
 * path for narrow questions and the deep multi-agent path for questions that
 * decompose into parallel strands, and a thin fast run can be promoted to
 * deep mid-flight. The composer's Normal/Advanced toggle still picks the
 * budget regime — Normal scales the everyday report ×1-9, Advanced (×10)
 * switches to the deep dossier pipeline with a signed PDF export.
 */
export default function Research() {
  const ws = useWorkspaceStore((s) => s.active)
  const {
    question, busy, steps, answer, rounds, searched, fetched, durationMs, reportPath, deep, exporting, error, history,
    path, escalated, cost, grounding, paused,
    start, cancel, reattach, loadHistory, loadPaused, continueRun, discardPaused, openSaved, deleteSaved, exportPdf,
  } = useResearchStore()
  const pushToast = useToastStore((s) => s.push)
  const [power, setPower] = useState(3)
  const [search, setSearch] = useState<SearchSettings | null>(null)
  const [fetcher, setFetcher] = useState<FetcherSettingsType | null>(null)
  // Anchor for the jump-to-bottom button: the route scrolls inside the
  // shell's <main>, which it locates from this element.
  const rootRef = useRef<HTMLDivElement>(null)

  // The provider switch edits the same daemon-side value as Settings, so a
  // choice made here holds everywhere (CLI included).
  useEffect(() => {
    api
      .settings()
      .then((s) => {
        setSearch(s.search ?? null)
        setFetcher(s.fetcher ?? null)
      })
      .catch(() => {
        setSearch(null)
        setFetcher(null)
      })
  }, [])

  // Saved reports are workspace-scoped; reload whenever the repo changes.
  // Reattach runs on the same tick: if the daemon still has a research run
  // going — whatever page it was started from, and whatever happened to
  // this screen meanwhile — its live trail belongs on this screen.
  useEffect(() => {
    if (ws) {
      void loadHistory(ws.id)
      void reattach(ws.id)
    }
    void loadPaused()
  }, [ws?.id, loadHistory, reattach, loadPaused])

  const setSearchProvider = async (v: string) => {
    try {
      const res = await api.putSettings({ search_provider: v })
      setSearch((s) => (s ? { ...s, provider: res.search_provider ?? v } : s))
    } catch (err) {
      const h = humanize(err)
      pushToast("error", h.title, h.body, h.action)
    }
  }

  const setFetcherMode = async (v: FetcherMode) => {
    try {
      const res = await api.putSettings({ fetcher_mode: v })
      if (res?.fetcher) setFetcher(res.fetcher as FetcherSettingsType)
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
    <div ref={rootRef} className="mx-auto max-w-3xl px-5 py-6">
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

      {(search || fetcher) && (
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
          {search && (
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] text-kai-dim">Engines</span>
              <SearchProviderPicker
                value={search.provider}
                providers={search.providers}
                onChange={setSearchProvider}
                disabled={busy}
              />
            </div>
          )}
          {fetcher && (
            <div className="flex items-center gap-2">
              <span
                className="font-mono text-[10px] text-kai-dim"
                title={fetcher.detail}
              >
                Reader
              </span>
              <FetcherModePicker
                value={currentFetcherMode(fetcher)}
                onChange={setFetcherMode}
                disabled={busy}
              />
            </div>
          )}
        </div>
      )}

      {busy && (
        <div className="animate-charge mt-4 space-y-3">
          <div className="flex items-center gap-2">
            <SectionLabel>Researching — {question}</SectionLabel>
          </div>
          <ResearchSteps steps={steps} searched={searched} rounds={rounds} defaultOpen />
          <div className="flex items-center gap-2">
            <Button variant="danger" size="sm" onClick={() => void cancel()}>
              <Square size={11} />
              Stop
            </Button>
            <span className="font-mono text-[10px] text-kai-dim">
              Stopping saves the run — continue it anytime below, even much later.
            </span>
          </div>
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
            exportLabel={deep ? "Export dossier" : "Export PDF"}
            exporting={exporting}
            onExport={() => void exportPdf()}
            onRewrite={() => void start(ws.id, answer.question, power)}
          />
          <div className="flex items-center gap-1.5">
            <ResearchMeta path={path} escalated={escalated} cost={cost} grounding={grounding} />
            <RunStats
              durationMs={durationMs}
              path={path}
              escalated={escalated}
              rounds={rounds}
              searched={searched}
              fetched={fetched}
              sources={answer.sources.length}
              cost={cost}
              grounding={grounding}
              incomplete={answer.incomplete}
            />
          </div>
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

      {!busy && paused.length > 0 && (
        <PausedResearch
          runs={paused}
          onContinue={(run) => void continueRun(ws.id, run)}
          onDiscard={(id) => void discardPaused(id)}
        />
      )}

      {/* A rendered dossier runs to dozens of screens; this is the trip
          back down, shown only while the reader is away from the end. */}
      <JumpToBottom anchor={rootRef} className="bottom-12" />
    </div>
  )
}

const EXAMPLES = [
  "Is solar cheaper than nuclear in Europe?",
  "What changed in Go 1.24 garbage collection?",
  "How do Tauri v2 and Electron compare on memory?",
]

/**
 * ResearchMeta is the hybrid engine's audit strip: which path ran, whether
 * it was promoted mid-run, how much of the draft the citation pass could
 * ground, and the line-itemised price. Cost honesty is the point of the
 * meter — one price, computed the same way, whichever path ran.
 */
function ResearchMeta({
  path,
  escalated,
  cost,
  grounding,
}: {
  path: string | null
  escalated: boolean
  cost: ResearchCost | null
  grounding: ResearchGrounding | null
}) {
  const hasCost = !!cost && ((cost.usd ?? 0) > 0 || (cost.searches ?? 0) > 0)
  const hasGrounding = !!grounding && (grounding.checked ?? 0) > 0
  if (!path && !hasCost && !hasGrounding) return null

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 font-mono text-[10px] text-kai-dim">
      {path && (
        <span
          className={
            path === "deep"
              ? "rounded-[var(--radius)] border border-kai-orange/40 bg-kai-orange/10 px-1.5 py-0.5 text-kai-orange"
              : "rounded-[var(--radius)] border border-border px-1.5 py-0.5"
          }
          title={
            path === "deep"
              ? "Deep path — supervisor with parallel research workers"
              : "Fast path — a single search-and-reason loop"
          }
        >
          {path === "deep" ? "DEEP PATH" : "FAST PATH"}
        </span>
      )}
      {escalated && (
        <span className="text-kai-amber" title="The fast path gathered too little, so the run was promoted to the deep path without restarting.">
          promoted from the fast path mid-run
        </span>
      )}
      {hasGrounding && (
        <span title="Share of checked claims the citation pass could ground in the raw sources.">
          {Math.round((grounding!.rate ?? 0) * 100)}% grounded
          {(grounding!.ungrounded ?? 0) > 0 ? ` · ${grounding!.ungrounded} flagged` : ""}
        </span>
      )}
      {hasCost && <span>{formatCost(cost!)}</span>}
    </div>
  )
}

/**
 * RunStats is the finished run's full receipt behind one small icon: hover
 * (or focus) and the whole bill opens — time, rounds, work done, tokens and
 * price. The meta strip keeps the headline numbers; this keeps everything,
 * without taking a line of the answer surface for itself.
 */
function RunStats({
  durationMs,
  path,
  escalated,
  rounds,
  searched,
  fetched,
  sources,
  cost,
  grounding,
  incomplete,
}: {
  durationMs: number | null
  path: string | null
  escalated: boolean
  rounds: number
  searched: number
  fetched: number | null
  sources: number
  cost: ResearchCost | null
  grounding: ResearchGrounding | null
  incomplete?: boolean
}) {
  const rows: [string, string][] = []
  if (durationMs != null) rows.push(["time", formatDuration(durationMs)])
  if (path) rows.push(["path", path === "deep" ? "deep path" : "fast path" + (escalated ? " · promoted mid-run" : "")])
  else if (escalated) rows.push(["path", "promoted to deep mid-run"])
  const work = [
    rounds ? `${rounds} round${rounds === 1 ? "" : "s"}` : null,
    searched ? `${searched} queries` : null,
    fetched ? `${fetched} pages read` : null,
    sources ? `${sources} cited` : null,
  ].filter(Boolean).join(" · ")
  if (work) rows.push(["work", work])
  if (cost) {
    const toks = (cost.input_tokens ?? 0) + (cost.output_tokens ?? 0) + (cost.reasoning_tokens ?? 0)
    if (toks > 0) {
      const split = [
        `${formatTokens(cost.input_tokens ?? 0)} in`,
        `${formatTokens(cost.output_tokens ?? 0)} out`,
        (cost.reasoning_tokens ?? 0) > 0 ? `${formatTokens(cost.reasoning_tokens ?? 0)} reasoning` : null,
      ].filter(Boolean).join(" · ")
      rows.push(["tokens", `${formatTokens(toks)} (${split})`])
    }
    if ((cost.usd ?? 0) > 0) rows.push(["cost", `${cost.exact ? "" : "≈"}$${cost.usd!.toFixed(4)}`])
  }
  if (grounding && (grounding.checked ?? 0) > 0) {
    rows.push([
      "grounded",
      `${Math.round((grounding.rate ?? 0) * 100)}% of ${grounding.checked} claim${grounding.checked === 1 ? "" : "s"}` +
        ((grounding.ungrounded ?? 0) > 0 ? ` · ${grounding.ungrounded} flagged` : ""),
    ])
  }
  if (incomplete) rows.push(["warning", "some subquestions stayed thinly evidenced"])
  if (rows.length === 0) return null

  return (
    <span className="group relative inline-flex">
      <button
        type="button"
        aria-label="Run details"
        title="Run details"
        className="rounded-[var(--radius)] p-1 text-kai-dim outline-none transition-colors
                   hover:text-kai-orange focus-visible:ring-2 focus-visible:ring-kai-orange/50"
      >
        <Info size={12} />
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute right-0 bottom-full z-50 mb-1.5 hidden w-72
                   rounded-[var(--radius)] border border-border bg-card p-2.5 shadow-lg
                   group-focus-within:block group-hover:block"
      >
        <span className="block font-mono text-[9px] font-bold tracking-[0.14em] text-kai-dim uppercase">
          Run details
        </span>
        <dl className="mt-1.5 space-y-1">
          {rows.map(([k, v]) => (
            <div key={k} className="flex items-baseline justify-between gap-3">
              <dt className="shrink-0 font-mono text-[10px] text-kai-dim">{k}</dt>
              <dd className="text-right font-mono text-[10px] text-kai-text">{v}</dd>
            </div>
          ))}
        </dl>
      </span>
    </span>
  )
}

/** formatCost renders the line-itemised meter as one compact line. */
function formatCost(c: ResearchCost): string {
  const parts: string[] = []
  if ((c.usd ?? 0) > 0) parts.push(`${c.exact ? "" : "≈"}$${c.usd!.toFixed(4)}`)
  if ((c.searches ?? 0) > 0) parts.push(`${c.searches} searches`)
  if ((c.fetches ?? 0) > 0) parts.push(`${c.fetches} pages`)
  const toks = (c.input_tokens ?? 0) + (c.output_tokens ?? 0) + (c.reasoning_tokens ?? 0)
  if (toks > 0) parts.push(`${formatTokens(toks)} tokens`)
  return parts.join(" · ")
}

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
                  r.path ? `${r.path} path` : null,
                  r.escalated ? "promoted" : null,
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

/**
 * PausedResearch is the stop-and-continue shelf: every run stopped before
 * its report is checkpointed on disk by the engine, and stays there until
 * it is continued or discarded — a run stopped today resumes next month.
 */
function PausedResearch({
  runs,
  onContinue,
  onDiscard,
}: {
  runs: ResumableRun[]
  onContinue: (run: ResumableRun) => void
  onDiscard: (id: string) => void
}) {
  return (
    <div className="mt-8">
      <div className="flex items-center gap-1.5">
        <PauseCircle size={11} className="text-kai-dim" />
        <SectionLabel>Paused research</SectionLabel>
      </div>
      <p className="mt-1 font-mono text-[10px] text-kai-dim">
        Stopped runs are saved exactly where they stopped. Continue one
        whenever you like — the checkpoint does not expire.
      </p>
      <ul className="mt-2 space-y-1">
        {runs.map((r) => (
          <li
            key={r.id}
            className="group flex items-center gap-2 rounded-[var(--radius)] border border-border
                       bg-card transition-colors hover:border-kai-orange/40 hover:bg-accent"
          >
            <button
              type="button"
              onClick={() => onContinue(r)}
              title="Continue this run from where it stopped"
              className="min-w-0 flex-1 px-2.5 py-1.5 text-left outline-none
                         focus-visible:ring-2 focus-visible:ring-kai-orange/50"
            >
              <span className="flex items-center gap-1.5">
                <Play size={10} className="shrink-0 text-kai-orange opacity-0 transition-opacity group-hover:opacity-100" />
                <span className="truncate font-sans text-[12px] text-kai-text group-hover:text-kai-white">
                  {r.question}
                </span>
              </span>
              <span className="block truncate font-mono text-[10px] text-kai-dim">
                {[
                  `stopped ${formatRelativeTime(r.started_at)}`,
                  `was ${phaseLabel(r.phase)}`,
                  r.path ? `${r.path} path` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </button>
            <Button size="sm" onClick={() => onContinue(r)} className="shrink-0">
              <Play size={10} />
              Continue
            </Button>
            <button
              type="button"
              onClick={() => onDiscard(r.id)}
              aria-label={`Discard saved research: ${r.question}`}
              title="Discard this saved run for good"
              className="mr-1.5 shrink-0 rounded-[var(--radius)] p-1.5 text-kai-dim outline-none
                         transition-colors hover:text-kai-rose focus-visible:ring-2
                         focus-visible:ring-kai-orange/50"
            >
              <Trash2 size={12} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** phaseLabel puts the engine's checkpoint phase into plain language. */
function phaseLabel(phase: string): string {
  switch (phase) {
    case "scope":
      return "scoping the research"
    case "plan":
      return "planning"
    case "research":
      return "researching"
    case "write":
      return "writing the report"
    case "cite":
      return "grounding citations"
    default:
      return phase
  }
}

function ResearchIntro({ onPick }: { onPick: (q: string) => void }) {
  const [open, setOpen] = useState(true)

  return (
    <div className="animate-charge mt-8">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="group flex w-full items-center gap-2 text-left outline-none transition-colors"
      >
        <ChevronRight
          size={12}
          className={cn(
            "shrink-0 text-kai-dim transition-transform duration-200 group-hover:text-kai-orange",
            open && "rotate-90 text-kai-orange"
          )}
        />
        <SectionLabel className="flex-1 cursor-pointer group-hover:text-kai-text">
          How it works
        </SectionLabel>
        <span className="font-mono text-[10px] text-kai-dim transition-colors group-hover:text-kai-text">
          {open ? "Hide" : "Show"}
        </span>
      </button>

      {open && (
        <div className="mt-2 space-y-4">
          <p className="font-mono text-[11px] leading-relaxed text-kai-dim">
            A router reads the question first. Narrow lookups take the{" "}
            <strong className="text-kai-text">fast path</strong> — one lean
            search-and-reason loop. Multi-part questions take the{" "}
            <strong className="text-kai-orange">deep path</strong> — a supervisor
            delegating parallel research workers — and a fast run that gathers too
            little is promoted to deep mid-flight instead of restarting. Either
            way the draft is checked against the raw sources before it ships, and
            every claim cites a page that was actually fetched.{" "}
            <strong className="text-kai-text">Normal</strong> scales the budget
            from ×1 to ×9; <strong className="text-kai-orange">Advanced</strong>{" "}
            switches to the dossier pipeline: up to 480 pages read over 8 rounds,
            written a chapter at a time into a massive, exhaustively detailed
            dossier with its own findings register and source log, exported as a
            signed PDF.
          </p>
          <div className="flex flex-wrap gap-1.5">
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
      )}
    </div>
  )
}
