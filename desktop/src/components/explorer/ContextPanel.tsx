import { useEffect, useState } from "react"
import { Activity } from "lucide-react"
import { api } from "@/lib/api"
import { useWorkspaceStore } from "@/store/workspace"
import { useChatStore } from "@/store/chat"
import { Spinner } from "@/components/ui"
import { cn } from "@/lib/utils"
import type { ChatMessage } from "@/lib/types"

// ContextPanel shows session context statistics: messages, tokens, cost, and a
// context breakdown bar. Mirrors the OpenCode GUI's context panel.
export default function ContextPanel() {
  const ws = useWorkspaceStore((s) => s.active)
  const sessions = useChatStore((s) => s.sessions)
  const activeSessionId = useChatStore((s) => s.activeSessionId)
  const messages = useChatStore((s) => s.messages)
  const [usage, setUsage] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!ws) return
    setLoading(true)
    api
      .usage(ws.id)
      .then(setUsage)
      .catch(() => setUsage(null))
      .finally(() => setLoading(false))
  }, [ws?.id])

  const session = sessions.find((s) => s.id === activeSessionId)
  const userMsgs = messages.filter((m: ChatMessage) => m.role === "user").length
  const assistantMsgs = messages.filter((m: ChatMessage) => m.role === "assistant").length
  const toolCalls = messages.filter(
    (m: ChatMessage) => m.role === "assistant" && m.tool_calls?.length
  ).length

  const totalTokens = (usage?.prompt_tokens ?? 0) + (usage?.completion_tokens ?? 0)
  const contextLimit = 1048576 // 1M tokens (model-dependent)
  const usagePct = Math.round((totalTokens / contextLimit) * 100)

  const msgCount = Math.max(1, messages.length)
  const userPct = Math.round((userMsgs / msgCount) * 100)
  const assistantPct = Math.round((assistantMsgs / msgCount) * 100)
  const toolPct = Math.round((toolCalls / msgCount) * 100)
  const otherPct = 100 - userPct - assistantPct - toolPct

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-1.5 border-b border-border px-2 py-1.5">
        <Activity size={12} className="shrink-0 text-kai-amber" />
        <span className="font-mono text-[10px] text-kai-dim">context</span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center gap-2 px-3 py-4 font-mono text-[10px] text-kai-dim">
            <Spinner size={12} /> loading…
          </div>
        ) : (
          <div className="p-3">
            {/* Session info */}
            <div className="mb-4">
              <h3 className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-kai-dim">
                Session
              </h3>
              <div className="space-y-1.5">
                <InfoRow label="Messages" value={messages.length.toString()} />
                <InfoRow label="User Messages" value={userMsgs.toString()} />
                <InfoRow label="Assistant Messages" value={assistantMsgs.toString()} />
                {session?.updated && (
                  <InfoRow
                    label="Last Activity"
                    value={new Date(session.updated).toLocaleString()}
                  />
                )}
              </div>
            </div>

            {/* Model */}
            <div className="mb-4">
              <h3 className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-kai-dim">
                Model
              </h3>
              <div className="space-y-1.5">
                <InfoRow label="Model" value={session?.model ?? "—"} />
              </div>
            </div>

            {/* Tokens */}
            <div className="mb-4">
              <h3 className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-kai-dim">
                Tokens
              </h3>
              <div className="space-y-1.5">
                <InfoRow label="Context Limit" value={contextLimit.toLocaleString()} />
                <InfoRow label="Total Tokens" value={totalTokens.toLocaleString()} />
                <InfoRow label="Input Tokens" value={usage?.prompt_tokens?.toLocaleString() ?? "0"} />
                <InfoRow
                  label="Output Tokens"
                  value={usage?.completion_tokens?.toLocaleString() ?? "0"}
                />
                <InfoRow label="Usage" value={`${usagePct}%`} highlight={usagePct > 80} />
              </div>
            </div>

            {/* Cost */}
            <div className="mb-4">
              <h3 className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-kai-dim">
                Cost
              </h3>
              <div className="space-y-1.5">
                <InfoRow
                  label="Total Cost"
                  value={`$${((totalTokens * 0.000015)).toFixed(2)}`}
                />
              </div>
            </div>

            {/* Context Breakdown */}
            <div>
              <h3 className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-kai-dim">
                Context Breakdown
              </h3>
              <div className="h-2 overflow-hidden rounded-full bg-panel">
                <div className="flex h-full">
                  <div
                    className="bg-kai-green"
                    style={{ width: `${userPct}%` }}
                    title={`User ${userPct}%`}
                  />
                  <div
                    className="bg-kai-amber"
                    style={{ width: `${assistantPct}%` }}
                    title={`Assistant ${assistantPct}%`}
                  />
                  <div
                    className="bg-kai-blue"
                    style={{ width: `${toolPct}%` }}
                    title={`Tool Calls ${toolPct}%`}
                  />
                  <div
                    className="bg-kai-dim"
                    style={{ width: `${otherPct}%` }}
                    title={`Other ${otherPct}%`}
                  />
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-3 font-mono text-[9px] text-kai-dim">
                <LegendDot color="bg-kai-green" label={`User ${userPct}%`} />
                <LegendDot color="bg-kai-amber" label={`Assistant ${assistantPct}%`} />
                <LegendDot color="bg-kai-blue" label={`Tool Calls ${toolPct}%`} />
                <LegendDot color="bg-kai-dim" label={`Other ${otherPct}%`} />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function InfoRow({
  label,
  value,
  highlight,
}: {
  label: string
  value: string
  highlight?: boolean
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="font-mono text-[10px] text-kai-dim">{label}</span>
      <span
        className={cn(
          "font-mono text-[11px] text-kai-text",
          highlight && "text-kai-rose font-bold"
        )}
      >
        {value}
      </span>
    </div>
  )
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1">
      <div className={cn("size-2 rounded-full", color)} />
      <span>{label}</span>
    </div>
  )
}