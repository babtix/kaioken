import { useCallback, useEffect, useState } from "react"
import { Cpu, Info, RefreshCw, TriangleAlert, Wallet } from "lucide-react"
import { api } from "@/lib/api"
import { useWorkspaceStore } from "@/store/workspace"
import EmptyState from "@/components/EmptyState"
import { Badge, Button, Card, SectionLabel, Segmented, Spinner } from "@/components/ui"
import { formatTokens } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { UsageBucket, UsageResponse } from "@/lib/types"

// The dashboard's job is to answer "where is the money going", so the
// breakdowns lead and the grand total is a single line. A page that opens on
// one big number tells you that you spent something without telling you what
// to do about it.

type Window = "7" | "30" | "90" | "all"

const WINDOWS: { value: Window; label: string }[] = [
  { value: "7", label: "7d" },
  { value: "30", label: "30d" },
  { value: "90", label: "90d" },
  { value: "all", label: "All time" },
]

/** Money at a precision that stays meaningful for the very small numbers
 *  per-call spend produces — "$0.00" is not an answer. */
function usd(v: number): string {
  if (v === 0) return "$0"
  if (v < 0.01) return `$${v.toFixed(4)}`
  if (v < 1) return `$${v.toFixed(3)}`
  return `$${v.toFixed(2)}`
}

export default function Cost() {
  const workspace = useWorkspaceStore((s) => s.active)
  const [days, setDays] = useState<Window>("30")
  const [scoped, setScoped] = useState(false)
  const [data, setData] = useState<UsageResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await api.usageLedger(days, scoped && workspace ? workspace.id : undefined)
      setData(res)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [days, scoped, workspace])

  useEffect(() => {
    void load()
  }, [load])

  const refreshPrices = async () => {
    setRefreshing(true)
    try {
      await api.refreshPricing()
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setRefreshing(false)
    }
  }

  const s = data?.summary
  const hasData = !!s && s.calls > 0

  return (
    <div className="flex h-full flex-col overflow-y-auto p-6">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-mono text-sm font-bold tracking-tight">Cost</h1>
          <p className="mt-0.5 font-mono text-[11px] text-kai-dim">
            What Kaioken has spent, by what spent it.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Segmented value={days} onChange={setDays} options={WINDOWS} />
          {workspace && (
            <Segmented
              value={scoped ? "this" : "all"}
              onChange={(v) => setScoped(v === "this")}
              options={[
                { value: "all", label: "All repos" },
                { value: "this", label: workspace.name ?? "This repo" },
              ]}
            />
          )}
          <Button variant="ghost" size="sm" onClick={() => void load()} title="Reload">
            <RefreshCw size={13} className={cn(loading && "animate-spin")} />
          </Button>
        </div>
      </header>

      {error && (
        <Card className="mb-4 flex items-start gap-2 border-rose-500/40 p-3">
          <TriangleAlert size={14} className="mt-0.5 shrink-0 text-rose-400" />
          <p className="font-mono text-[11px] text-kai-text">{error}</p>
        </Card>
      )}

      {loading && !data && (
        <div className="flex flex-1 items-center justify-center">
          <Spinner size={20} />
        </div>
      )}

      {!loading && !hasData && (
        <EmptyState
          icon={Wallet}
          title="Nothing recorded yet"
          hint="The ledger fills as you run wiki, generate, chat, research or review. Local models are recorded too, at zero cost."
        />
      )}

      {hasData && s && (
        <div className="flex flex-col gap-5">
          <Totals data={data} onRefreshPrices={refreshPrices} refreshing={refreshing} />

          <div className="grid gap-4 lg:grid-cols-2">
            <Breakdown title="By operation" buckets={s.by_operation} />
            <Breakdown title="By model" buckets={s.by_model} limit={8} />
            <Breakdown title="By provider" buckets={s.by_provider} />
            <Breakdown title="By workspace" buckets={s.by_workspace} limit={8} />
          </div>

          <DailyChart buckets={s.by_day} />
        </div>
      )}
    </div>
  )
}

function Totals({
  data,
  onRefreshPrices,
  refreshing,
}: {
  data: UsageResponse
  onRefreshPrices: () => void
  refreshing: boolean
}) {
  const s = data.summary
  const tokens = s.prompt_tokens + s.completion_tokens
  // The estimated share is the honesty gauge: most providers never report a
  // price, so a total with no caveat would be quietly made up.
  const knownPct = s.cost_usd > 0 ? Math.round((s.known_cost_usd / s.cost_usd) * 100) : 100

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-baseline gap-x-8 gap-y-3">
        <Stat label="Total" value={usd(s.cost_usd)} accent />
        <Stat label="Calls" value={s.calls.toLocaleString()} />
        <Stat label="Tokens" value={formatTokens(tokens)} />
        <Stat
          label="Prompt / completion"
          value={`${formatTokens(s.prompt_tokens)} / ${formatTokens(s.completion_tokens)}`}
        />
        {s.local_calls > 0 && (
          <Stat
            label="Local calls"
            value={s.local_calls.toLocaleString()}
            hint="ran on your own hardware, at no cost"
          />
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-3">
        <Info size={12} className="shrink-0 text-kai-dim" />
        <p className="font-mono text-[10px] text-kai-dim">
          {knownPct}% of this figure was reported by a provider; the rest is estimated from the
          model price catalog.
        </p>
        {data.pricing_stale && (
          <>
            <Badge tone="amber">catalog stale</Badge>
            <Button variant="ghost" size="sm" onClick={onRefreshPrices} disabled={refreshing}>
              {refreshing ? <Spinner size={12} /> : "Refresh prices"}
            </Button>
          </>
        )}
      </div>
    </Card>
  )
}

function Stat({
  label,
  value,
  hint,
  accent,
}: {
  label: string
  value: string
  hint?: string
  accent?: boolean
}) {
  return (
    <div>
      <div
        className={cn(
          "font-mono text-lg font-bold tabular-nums",
          accent ? "text-kai-orange" : "text-kai-text"
        )}
      >
        {value}
      </div>
      <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-kai-dim">{label}</div>
      {hint && <div className="mt-0.5 font-mono text-[10px] text-kai-dim">{hint}</div>}
    </div>
  )
}

function Breakdown({
  title,
  buckets,
  limit,
}: {
  title: string
  buckets: UsageBucket[]
  limit?: number
}) {
  const rows = limit ? buckets.slice(0, limit) : buckets
  if (rows.length === 0) return null

  // Bars are scaled to the largest row rather than the grand total: with one
  // dominant model every other bar would otherwise be invisible.
  const max = Math.max(...rows.map((b) => b.cost_usd), 0)
  const byTokens = max === 0

  return (
    <Card className="p-4">
      <SectionLabel className="mb-3">{title}</SectionLabel>
      <div className="flex flex-col gap-2">
        {rows.map((b) => {
          const tokens = b.prompt_tokens + b.completion_tokens
          const width = byTokens
            ? tokens / Math.max(...rows.map((r) => r.prompt_tokens + r.completion_tokens), 1)
            : b.cost_usd / max
          return (
            <div key={b.key}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="truncate font-mono text-[11px] text-kai-text" title={b.key}>
                  {b.key}
                </span>
                <span className="shrink-0 font-mono text-[11px] tabular-nums text-kai-dim">
                  {usd(b.cost_usd)}
                  {b.estimated_share > 0.5 && (
                    <span className="ml-1 text-kai-dim/70" title="mostly estimated">
                      ~
                    </span>
                  )}
                </span>
              </div>
              <div className="mt-1 h-1 overflow-hidden rounded-full bg-panel">
                <div
                  className="h-full rounded-full bg-kai-orange/70"
                  style={{ width: `${Math.max(2, width * 100)}%` }}
                />
              </div>
              <div className="mt-0.5 font-mono text-[10px] text-kai-dim">
                {formatTokens(tokens)} tokens · {b.calls.toLocaleString()} calls
              </div>
            </div>
          )
        })}
      </div>
      {limit && buckets.length > limit && (
        <p className="mt-3 font-mono text-[10px] text-kai-dim">
          and {buckets.length - limit} more
        </p>
      )}
    </Card>
  )
}

function DailyChart({ buckets }: { buckets: UsageBucket[] }) {
  if (buckets.length === 0) return null
  const max = Math.max(...buckets.map((b) => b.cost_usd), 0)
  // With no priced rows the shape still matters, so fall back to token volume
  // rather than rendering a flat, uninformative baseline.
  const useTokens = max === 0
  const scale = useTokens
    ? Math.max(...buckets.map((b) => b.prompt_tokens + b.completion_tokens), 1)
    : max

  return (
    <Card className="p-4">
      <SectionLabel className="mb-3">
        Daily {useTokens ? "tokens" : "spend"}
      </SectionLabel>
      <div className="flex h-28 items-end gap-1">
        {buckets.map((b) => {
          const v = useTokens ? b.prompt_tokens + b.completion_tokens : b.cost_usd
          const pct = (v / scale) * 100
          return (
            <div
              key={b.key}
              className="group relative flex-1 rounded-t bg-kai-orange/60 transition-colors hover:bg-kai-orange"
              style={{ height: `${Math.max(2, pct)}%` }}
              title={`${b.key} — ${usd(b.cost_usd)}, ${formatTokens(
                b.prompt_tokens + b.completion_tokens
              )} tokens, ${b.calls} calls`}
            />
          )
        })}
      </div>
      <div className="mt-2 flex justify-between font-mono text-[10px] text-kai-dim">
        <span>{buckets[0]?.key}</span>
        <span>{buckets[buckets.length - 1]?.key}</span>
      </div>
    </Card>
  )
}

/** Exported for Settings, which shows the same "is anything local running"
 *  signal without duplicating the probe logic. */
export function LocalBadge({ running }: { running: number }) {
  if (running === 0) return null
  return (
    <Badge tone="green">
      <Cpu size={10} className="mr-1 inline" />
      {running} local
    </Badge>
  )
}
