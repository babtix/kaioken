import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Check, Circle, Diamond, Triangle } from "lucide-react"
import { api } from "@/lib/api"
import { useWorkspaceStore } from "@/store/workspace"
import { Spinner } from "@/components/ui"
import type { ModuleStatus } from "@/lib/types"

// ModuleStatusPanel mirrors `kaioken status` in the explorer: per-module
// freshness with the same glyphs the CLI prints, so the GUI and terminal read
// the same. Clicking a row jumps to the Cards route.
export default function ModuleStatusPanel() {
  const ws = useWorkspaceStore((s) => s.active)
  const [modules, setModules] = useState<ModuleStatus[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()

  useEffect(() => {
    if (!ws) return
    setLoading(true)
    setError(null)
    api
      .status(ws.id)
      .then((r) => setModules(r.modules ?? []))
      .catch((e) => setError(String(e?.message ?? e)))
      .finally(() => setLoading(false))
  }, [ws?.id])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-1.5 border-b border-border px-2 py-1.5">
        <span className="font-mono text-[10px] text-kai-dim">modules</span>
        {modules && (
          <span className="font-mono text-[10px] text-kai-dim">·{modules.length}</span>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {loading && !modules ? (
          <div className="flex items-center gap-2 px-3 py-4 font-mono text-[10px] text-kai-dim">
            <Spinner size={12} /> loading status…
          </div>
        ) : error ? (
          <div className="px-3 py-4 font-mono text-[10px] text-kai-rose">{error}</div>
        ) : !modules || modules.length === 0 ? (
          <div className="px-3 py-4 font-mono text-[10px] text-kai-dim">
            no modules planned. run a plan from the Cards route.
          </div>
        ) : (
          <ul className="py-1">
            {modules.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => navigate("/cards")}
                  className="flex w-full items-center gap-1.5 px-2 py-1 text-left outline-none transition-colors hover:bg-panel/60 focus-visible:ring-2 focus-visible:ring-kai-orange/50"
                >
                  <StateGlyph state={m.state} />
                  <span className="truncate font-mono text-[11px] text-kai-muted">{m.title}</span>
                  <span className="ml-auto shrink-0 pl-2 font-mono text-[9px] text-kai-dim">
                    {m.files}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function StateGlyph({ state }: { state: ModuleStatus["state"] }) {
  switch (state) {
    case "fresh":
      return <Check size={13} className="shrink-0 text-kai-green" />
    case "changed":
      return <Triangle size={13} className="shrink-0 text-kai-amber" />
    case "missing":
      return <Circle size={13} className="shrink-0 text-kai-dim" />
    case "empty":
      return <Diamond size={13} className="shrink-0 text-kai-dim" />
    default:
      return <Circle size={13} className="shrink-0 text-kai-dim" />
  }
}
