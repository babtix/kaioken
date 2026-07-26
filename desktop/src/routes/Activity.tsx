import { useEffect, useState } from "react"
import {
  Ban,
  BookOpen,
  Brain,
  ChevronDown,
  ChevronRight,
  FileStack,
  Play,
  RefreshCw,
  RotateCcw,
  RotateCw,
  ScanLine,
  Sparkles,
  TriangleAlert,
  Zap,
} from "lucide-react"
import { useWorkspaceStore } from "@/store/workspace"
import { useRunsStore } from "@/store/runs"
import { api } from "@/lib/api"
import EmptyState from "@/components/EmptyState"
import { Badge, Button, Card, ProgressBar, SectionLabel, Spinner } from "@/components/ui"
import { cn } from "@/lib/utils"
import { formatDuration, formatTokens } from "@/lib/format"
import type { Estimate, RunRecord, SessionMeta, Skill } from "@/lib/types"

// Captions lifted from the README's multiplier table so the dial explains
// what each level actually buys.
const MULTIPLIER_CAPTIONS: Record<number, string> = {
  1: "Plan → one document per section. Fastest.",
  2: "Adds an architecture brief shared by every chapter.",
  3: "Adds per-section plans and subsection documents. Recommended.",
  4: "Deeper subsections with more cross-referencing.",
  5: "Wider coverage — smaller modules get their own chapters.",
  6: "More passes per chapter; denser prose.",
  7: "Adds extended examples and edge-case coverage.",
  8: "Near-exhaustive: most files get named somewhere.",
  9: "Maximum depth before the correction pass.",
  10: "Adds a final correction pass over every document.",
}

const STATE_TONES: Record<string, "green" | "amber" | "rose" | "neutral" | "blue"> = {
  running: "blue",
  queued: "amber",
  done: "green",
  failed: "rose",
  cancelled: "amber",
  interrupted: "amber",
}

const KIND_LABELS: Record<string, string> = {
  scan: "Scan",
  plan: "Plan",
  generate: "Generate",
  wiki: "Wiki",
  wiki_retry: "Wiki retry",
  update: "Update",
  skills: "Skills",
  chat: "Chat",
}

const SECONDARY_RUNS = [
  { kind: "update", label: "Update", icon: RotateCw, hint: "Refresh only what changed since the last wiki" },
  { kind: "generate", label: "Cards", icon: FileStack, hint: "Knowledge cards per module" },
  { kind: "skills", label: "Skills", icon: Sparkles, hint: "Task-oriented agent skills" },
  { kind: "scan", label: "Scan", icon: ScanLine, hint: "Re-inventory the repository" },
] as const

export default function Activity() {
  const ws = useWorkspaceStore((s) => s.active)
  const { runs, logs, error, refresh, start, cancel, revert } = useRunsStore()
  const [multiplier, setMultiplier] = useState(3)
  const [force, setForce] = useState(false)
  const [estimate, setEstimate] = useState<Estimate | null>(null)
  const [starting, setStarting] = useState<string | null>(null)

  useEffect(() => {
    if (ws) refresh(ws.id)
  }, [ws?.id, refresh])

  useEffect(() => {
    if (!ws) return
    let cancelled = false
    api
      .estimate(ws.id, "wiki", multiplier)
      .then((e) => !cancelled && setEstimate(e))
      .catch(() => !cancelled && setEstimate(null))
    return () => {
      cancelled = true
    }
  }, [ws?.id, multiplier])

  if (!ws) {
    return <EmptyState icon={Zap} title="No workspace open" hint="Open a repository to run the pipeline." />
  }

  async function run(kind: string, params?: Record<string, unknown>) {
    setStarting(kind)
    try {
      await start(ws!.id, kind, params)
    } finally {
      setStarting(null)
    }
  }

  const active = runs.filter((r) => r.state === "running" || r.state === "queued")
  const past = runs.filter((r) => r.state !== "running" && r.state !== "queued")

  return (
    <div className="mx-auto max-w-4xl p-6">
      {/* Wiki launcher */}
      <Card className="p-4">
        <div className="flex items-center gap-2">
          <BookOpen size={14} className="text-kai-orange" />
          <SectionLabel>Generate a wiki</SectionLabel>
        </div>

        <div className="mt-4 flex items-center gap-4">
          <div className="flex-1">
            <div className="flex items-baseline justify-between">
              <label htmlFor="mult" className="font-mono text-[11px] text-kai-muted">
                Depth
              </label>
              <span className="font-mono text-sm font-bold text-kai-orange">×{multiplier}</span>
            </div>
            <input
              id="mult"
              type="range"
              min={1}
              max={10}
              value={multiplier}
              onChange={(e) => setMultiplier(Number(e.target.value))}
              className="mt-1.5 w-full accent-kai-orange"
            />
            <p className="mt-1 h-8 font-mono text-[10px] leading-relaxed text-kai-dim">
              {MULTIPLIER_CAPTIONS[multiplier]}
            </p>
          </div>

          <div className="flex flex-col items-stretch gap-2">
            <Button
              variant="primary"
              onClick={() => run("wiki", { multiplier, force })}
              loading={starting === "wiki"}
            >
              <Play size={12} />
              Start wiki
            </Button>
            <label className="flex cursor-pointer items-center gap-1.5 font-mono text-[10px] text-kai-dim">
              <input
                type="checkbox"
                checked={force}
                onChange={(e) => setForce(e.target.checked)}
                className="accent-kai-orange"
              />
              force re-plan
            </label>
          </div>
        </div>

        {estimate && (
          <div
            className={cn(
              "mt-3 flex items-start gap-2 rounded-md border px-3 py-2",
              estimate.heavy
                ? "border-kai-amber/40 bg-kai-amber/[0.07]"
                : "border-border bg-panel/40"
            )}
          >
            {estimate.heavy && (
              <TriangleAlert size={12} className="mt-0.5 shrink-0 text-kai-amber" />
            )}
            <div className="min-w-0">
              <p
                className={cn(
                  "font-mono text-[11px]",
                  estimate.heavy ? "text-kai-amber" : "text-kai-muted"
                )}
              >
                {estimate.calls} calls · ~{formatTokens(estimate.total_tokens)} tokens
                {estimate.heavy && " · heavy run"}
              </p>
              {estimate.passes && (
                <p className="mt-0.5 font-mono text-[10px] text-kai-dim">{estimate.passes}</p>
              )}
            </div>
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-3">
          {SECONDARY_RUNS.map(({ kind, label, icon: Icon, hint }) => (
            <Button
              key={kind}
              size="sm"
              onClick={() => run(kind)}
              loading={starting === kind}
              title={hint}
            >
              <Icon size={11} />
              {label}
            </Button>
          ))}
        </div>

        {error && (
          <p className="mt-3 rounded border border-kai-rose/30 bg-kai-rose/10 px-3 py-2 font-mono text-[11px] text-kai-rose">
            {error}
          </p>
        )}
      </Card>

      {/* Memory & Learning */}
      <Card className="mt-6 p-4">
        <div className="flex items-center gap-2">
          <Brain size={14} className="text-kai-orange" />
          <SectionLabel>Memory &amp; Learning</SectionLabel>
        </div>
        <p className="mt-2 font-mono text-[11px] leading-relaxed text-kai-dim">
          Kaioken remembers what happened in sessions. After a chat run it writes a digest,
          reinforces skills the agent consulted, and distills new lessons into skills when the
          session actually taught something. Use the TUI for explicit /recall and /learn commands.
        </p>
        <MemoryStats wsId={ws.id} />
      </Card>

      {/* Active runs */}
      {active.length > 0 && (
        <section className="mt-6">
          <div className="flex items-center gap-2">
            <Spinner size={12} />
            <SectionLabel>In progress</SectionLabel>
          </div>
          <div className="mt-2 space-y-2">
            {active.map((r) => (
              <RunRow key={r.id} run={r} logs={logs[r.id] || []} onCancel={() => cancel(r.id)} onRevert={() => revert(r.id)} defaultOpen />
            ))}
          </div>
        </section>
      )}

      {/* History */}
      <section className="mt-6">
        <div className="flex items-center gap-2">
          <SectionLabel>History</SectionLabel>
          <button
            onClick={() => refresh(ws.id)}
            className="ml-auto rounded p-1 text-kai-dim transition-colors hover:text-kai-text"
            title="Refresh"
          >
            <RefreshCw size={11} />
          </button>
        </div>

        <div className="mt-2 space-y-2">
          {past.map((r) => (
            <RunRow key={r.id} run={r} logs={logs[r.id] || []} onCancel={() => cancel(r.id)} onRevert={() => revert(r.id)} />
          ))}
          {past.length === 0 && active.length === 0 && (
            <p className="rounded-md border border-dashed border-border px-4 py-6 text-center font-mono text-[11px] text-kai-dim">
              No runs yet. Start one above — progress streams here live.
            </p>
          )}
        </div>
      </section>
    </div>
  )
}

// ── Run row ────────────────────────────────────────────────────────────────

function MemoryStats({ wsId }: { wsId: string }) {
  const [sessions, setSessions] = useState<SessionMeta[]>([])
  const [skills, setSkills] = useState<Skill[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([api.listSessions(wsId), api.skills(wsId)])
      .then(([sRes, skRes]) => {
        if (cancelled) return
        setSessions(sRes.sessions)
        setSkills(skRes.skills)
      })
      .catch(() => {
        // Leave stats empty on failure; this is best-effort metadata.
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [wsId])

  const learned = skills.filter((s) => s.origin === "learned").length
  const reinforced = skills.filter((s) => s.use_count > 0).length

  return (
    <div className="mt-3 grid grid-cols-3 gap-3">
      <StatBox label="Sessions recorded" value={loading ? "—" : sessions.length} />
      <StatBox label="Learned skills" value={loading ? "—" : learned} />
      <StatBox label="Reinforced skills" value={loading ? "—" : reinforced} />
    </div>
  )
}

function StatBox({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded border border-border bg-panel/40 px-3 py-2">
      <p className="font-mono text-[10px] text-kai-dim">{label}</p>
      <p className="font-mono text-lg font-semibold text-kai-text">{value}</p>
    </div>
  )
}

// ── Run row ────────────────────────────────────────────────────────────────

function RunRow({
  run,
  logs,
  onCancel,
  onRevert,
  defaultOpen = false,
}: {
  run: RunRecord
  logs: { level: string; text: string }[]
  onCancel: () => void
  onRevert: () => void
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  const [confirming, setConfirming] = useState(false)
  const isActive = run.state === "running" || run.state === "queued"
  const elapsed = useElapsed(isActive ? run.started : null)
  const hasArtifacts = (run.artifacts?.length ?? 0) > 0

  return (
    <Card className={cn("overflow-hidden", isActive && "border-kai-orange/30")}>
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          onClick={() => setOpen(!open)}
          className="shrink-0 text-kai-dim transition-colors hover:text-kai-text"
          aria-label={open ? "Collapse" : "Expand"}
        >
          {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </button>

        <span className="shrink-0 font-mono text-xs font-semibold text-kai-text">
          {KIND_LABELS[run.kind] || run.kind}
        </span>
        {typeof run.params?.multiplier === "number" && (
          <Badge tone="neutral">×{String(run.params.multiplier)}</Badge>
        )}
        <Badge tone={STATE_TONES[run.state] ?? "neutral"}>{run.state}</Badge>

        {isActive && run.progress?.message && (
          <span className="min-w-0 truncate font-mono text-[10px] text-kai-dim">
            {run.progress.message}
          </span>
        )}

        <span className="ml-auto shrink-0 font-mono text-[10px] tabular-nums text-kai-dim">
          {run.duration_ms != null
            ? formatDuration(run.duration_ms)
            : elapsed != null
              ? formatDuration(elapsed)
              : null}
        </span>

        {(run.artifacts?.length ?? 0) > 0 && (
          <span className="shrink-0 font-mono text-[10px] text-kai-sage">
            {run.artifacts.length} files
          </span>
        )}

        {isActive && (
          <button
            onClick={onCancel}
            className="shrink-0 rounded p-1 text-kai-rose transition-colors hover:bg-kai-rose/10"
            title="Cancel run"
          >
            <Ban size={12} />
          </button>
        )}

        {/* Revert: only for finished runs that wrote files */}
        {!isActive && hasArtifacts && (
          confirming ? (
            <span className="flex shrink-0 items-center gap-1">
              <button
                onClick={() => { onRevert(); setConfirming(false) }}
                className="rounded bg-kai-rose/20 px-1.5 py-0.5 font-mono text-[9px] text-kai-rose hover:bg-kai-rose/30"
              >
                delete {run.artifacts.length}?
              </button>
              <button
                onClick={() => setConfirming(false)}
                className="rounded px-1 py-0.5 font-mono text-[9px] text-kai-dim hover:text-kai-text"
              >
                no
              </button>
            </span>
          ) : (
            <button
              onClick={() => setConfirming(true)}
              className="shrink-0 rounded p-1 text-kai-dim transition-colors hover:bg-kai-amber/10 hover:text-kai-amber"
              title="Revert: delete the files this run wrote"
            >
              <RotateCcw size={12} />
            </button>
          )
        )}
      </div>

      {isActive && (
        <ProgressBar
          done={run.progress?.done ?? 0}
          total={run.progress?.total ?? 0}
          className="mx-3 mb-2"
        />
      )}

      {open && (
        <div className="border-t border-border bg-kai-code px-3 py-2">
          {run.error && (
            <p className="mb-2 font-mono text-[10px] text-kai-rose">{run.error}</p>
          )}

          {run.summary && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {Object.entries(run.summary).map(([k, v]) => (
                <Badge key={k} tone="neutral">
                  {k.replace(/_/g, " ")}: {Array.isArray(v) ? v.length : String(v)}
                </Badge>
              ))}
            </div>
          )}

          {(run.artifacts?.length ?? 0) > 0 && (
            <details className="mb-2" open={run.artifacts.length <= 8}>
              <summary className="cursor-pointer font-mono text-[10px] font-bold uppercase tracking-wider text-kai-dim">
                Artifacts ({run.artifacts.length})
              </summary>
              <ul className="mt-1 max-h-40 overflow-auto">
                {run.artifacts.map((a, i) => (
                  <li key={i} className="font-mono text-[10px] text-kai-sage">
                    {a.path} <span className="text-kai-dim">({a.lines} lines)</span>
                  </li>
                ))}
              </ul>
            </details>
          )}

          {logs.length > 0 ? (
            <pre className="max-h-48 overflow-auto font-mono text-[10px] leading-relaxed">
              {logs.map((l, i) => (
                <span
                  key={i}
                  className={
                    l.level === "error"
                      ? "text-kai-rose"
                      : l.level === "warn"
                        ? "text-kai-amber"
                        : "text-kai-muted"
                  }
                >
                  {l.text}
                  {"\n"}
                </span>
              ))}
            </pre>
          ) : (
            <p className="font-mono text-[10px] text-kai-dim">No log output.</p>
          )}
        </div>
      )}
    </Card>
  )
}

/** Ticking elapsed time for a run that has not reported a duration yet. */
function useElapsed(startedAt: string | null): number | null {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!startedAt) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [startedAt])
  if (!startedAt) return null
  return Math.max(0, now - new Date(startedAt).getTime())
}
