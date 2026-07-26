import { useEffect, useState } from "react"
import { Ban, ChevronDown, ChevronRight, Play, RefreshCw } from "lucide-react"
import { useWorkspaceStore } from "@/store/workspace"
import { useRunsStore } from "@/store/runs"
import { api } from "@/lib/api"
import { cn } from "@/lib/utils"
import type { Estimate, RunRecord } from "@/lib/types"

const STATE_COLORS: Record<string, string> = {
  running: "text-kai-green",
  queued: "text-kai-amber",
  done: "text-kai-green",
  failed: "text-kai-rose",
  cancelled: "text-kai-amber",
}

const KIND_LABELS: Record<string, string> = {
  scan: "Scan",
  plan: "Plan",
  generate: "Generate",
  wiki: "Wiki",
  wiki_retry: "Wiki Retry",
  update: "Update",
  skills: "Skills",
}

export default function Activity() {
  const ws = useWorkspaceStore((s) => s.active)
  const { runs, logs, error, refresh, start, cancel } = useRunsStore()
  const [multiplier, setMultiplier] = useState(3)
  const [estimate, setEstimate] = useState<Estimate | null>(null)
  const [force, setForce] = useState(false)

  useEffect(() => {
    if (ws) refresh(ws.id)
  }, [ws?.id, refresh])

  // Fetch estimate when multiplier changes.
  useEffect(() => {
    if (!ws) return
    api.estimate(ws.id, "wiki", multiplier).then(setEstimate).catch(() => {})
  }, [ws?.id, multiplier])

  if (!ws) {
    return <div className="flex h-full items-center justify-center font-mono text-sm text-kai-dim">Open a workspace first</div>
  }

  async function startWiki() {
    await start(ws!.id, "wiki", { multiplier, force })
  }

  return (
    <div className="mx-auto max-w-3xl p-6">
      {/* Wiki run panel (T042) */}
      <section className="mb-6 rounded-md border border-border bg-card p-4">
        <h2 className="font-mono text-xs font-bold text-kai-dim">START A RUN</h2>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {/* Multiplier dial (T041) */}
          <label className="flex items-center gap-2 font-mono text-xs text-kai-muted">
            ×
            <select
              value={multiplier}
              onChange={(e) => setMultiplier(Number(e.target.value))}
              className="rounded border border-border bg-background px-2 py-1 font-mono text-xs text-kai-text"
            >
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-1.5 font-mono text-xs text-kai-muted">
            <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} className="accent-kai-orange" />
            force
          </label>

          <button
            onClick={startWiki}
            className="flex items-center gap-1.5 rounded bg-accent px-3 py-1.5 font-mono text-xs text-kai-orange transition-colors hover:bg-accent/80"
          >
            <Play size={12} />
            Wiki
          </button>

          <button onClick={() => start(ws.id, "update")} className="rounded px-3 py-1.5 font-mono text-xs text-kai-muted transition-colors hover:text-kai-text">
            Update
          </button>
          <button onClick={() => start(ws.id, "generate")} className="rounded px-3 py-1.5 font-mono text-xs text-kai-muted transition-colors hover:text-kai-text">
            Generate
          </button>
          <button onClick={() => start(ws.id, "skills")} className="rounded px-3 py-1.5 font-mono text-xs text-kai-muted transition-colors hover:text-kai-text">
            Skills
          </button>
          <button onClick={() => start(ws.id, "scan")} className="rounded px-3 py-1.5 font-mono text-xs text-kai-muted transition-colors hover:text-kai-text">
            Scan
          </button>
        </div>

        {/* Estimate card (T041) */}
        {estimate && (
          <div className={cn("mt-3 rounded border px-3 py-2 font-mono text-[10px]", estimate.heavy ? "border-kai-amber/40 text-kai-amber" : "border-border text-kai-dim")}>
            {estimate.text}
          </div>
        )}
        {error && <p className="mt-2 font-mono text-xs text-kai-rose">{error}</p>}
      </section>

      {/* Run list (T040) */}
      <section>
        <div className="flex items-center gap-2">
          <h2 className="font-mono text-xs font-bold text-kai-dim">RUNS</h2>
          <button onClick={() => refresh(ws.id)} className="ml-auto text-kai-dim hover:text-kai-text" title="Refresh">
            <RefreshCw size={12} />
          </button>
        </div>
        <div className="mt-2 space-y-2">
          {runs.map((run) => (
            <RunRow key={run.id} run={run} logs={logs[run.id] || []} onCancel={() => cancel(run.id)} />
          ))}
          {runs.length === 0 && (
            <p className="py-4 font-mono text-xs text-kai-dim">No runs yet</p>
          )}
        </div>
      </section>
    </div>
  )
}

function RunRow({ run, logs, onCancel }: { run: RunRecord; logs: { level: string; text: string }[]; onCancel: () => void }) {
  const [open, setOpen] = useState(false)
  const active = run.state === "running" || run.state === "queued"

  return (
    <div className="rounded border border-border bg-card">
      <div className="flex items-center gap-2 px-3 py-2">
        <button onClick={() => setOpen(!open)} className="text-kai-dim">
          {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </button>
        <span className="font-mono text-xs font-bold text-kai-text">{KIND_LABELS[run.kind] || run.kind}</span>
        <span className={cn("font-mono text-[10px]", STATE_COLORS[run.state] || "text-kai-dim")}>{run.state}</span>

        {/* Progress */}
        {active && run.progress.message && (
          <span className="truncate font-mono text-[10px] text-kai-dim">{run.progress.message}</span>
        )}

        {/* Duration */}
        {run.duration_ms != null && (
          <span className="ml-auto font-mono text-[10px] text-kai-dim">{(run.duration_ms / 1000).toFixed(1)}s</span>
        )}

        {/* Cancel */}
        {active && (
          <button onClick={onCancel} className="ml-2 text-kai-rose hover:text-kai-rose/80" title="Cancel">
            <Ban size={12} />
          </button>
        )}
      </div>

      {open && (
        <div className="border-t border-border px-3 py-2">
          {/* Artifacts */}
          {run.artifacts.length > 0 && (
            <div className="mb-2">
              <p className="font-mono text-[10px] font-bold text-kai-dim">ARTIFACTS</p>
              {run.artifacts.slice(0, 20).map((a, i) => (
                <p key={i} className="font-mono text-[10px] text-kai-sage">{a.path} ({a.lines} lines)</p>
              ))}
            </div>
          )}
          {/* Logs */}
          {logs.length > 0 && (
            <pre className="max-h-40 overflow-auto font-mono text-[10px] text-kai-muted">
              {logs.map((l, i) => (
                <span key={i} className={l.level === "error" ? "text-kai-rose" : ""}>{l.text}{"\n"}</span>
              ))}
            </pre>
          )}
          {/* Error */}
          {run.error && <p className="mt-1 font-mono text-[10px] text-kai-rose">{run.error}</p>}
          {/* Summary */}
          {run.summary && (
            <p className="mt-1 font-mono text-[10px] text-kai-dim">{JSON.stringify(run.summary)}</p>
          )}
        </div>
      )}
    </div>
  )
}
