import { useEffect, useRef, useState } from "react"
import { Plus, Send, Square, ChevronDown, ChevronRight } from "lucide-react"
import { useWorkspaceStore } from "@/store/workspace"
import { useChatStore } from "@/store/chat"
import { cn } from "@/lib/utils"
import type { ChatMessage } from "@/lib/types"

export default function Chat() {
  const ws = useWorkspaceStore((s) => s.active)
  const {
    sessions, activeSessionId, messages, streamBuffer, isStreaming, approval, error,
    loadSessions, newSession, openSession, send, resolveApproval,
  } = useChatStore()
  const [input, setInput] = useState("")
  const [autoApprove, setAutoApprove] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (ws) loadSessions(ws.id)
  }, [ws?.id, loadSessions])

  // Auto-scroll on new messages.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages.length, streamBuffer])

  if (!ws) {
    return <div className="flex h-full items-center justify-center font-mono text-sm text-kai-dim">Open a workspace first</div>
  }

  async function handleSend() {
    const text = input.trim()
    if (!text || isStreaming) return
    setInput("")
    if (!activeSessionId) await newSession(ws!.id)
    await send(ws!.id, text, { auto_approve: autoApprove, allow_run: ws!.allow_run })
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.altKey && !e.ctrlKey) {
      e.preventDefault()
      handleSend()
    }
    if (e.key === "Enter" && (e.altKey || e.ctrlKey)) {
      setInput((s) => s + "\n")
    }
  }

  return (
    <div className="flex h-full">
      {/* Session sidebar (T034) */}
      <aside className="flex w-52 shrink-0 flex-col border-r border-border bg-card">
        <div className="flex items-center gap-2 border-b border-border px-3 py-2">
          <span className="font-mono text-[10px] font-bold text-kai-dim">SESSIONS</span>
          <button
            onClick={() => newSession(ws.id)}
            className="ml-auto rounded p-1 text-kai-dim transition-colors hover:text-kai-orange"
            title="New session"
          >
            <Plus size={14} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          {sessions.map((s) => (
            <button
              key={s.id}
              onClick={() => openSession(ws.id, s.id)}
              className={cn(
                "w-full truncate px-3 py-2 text-left font-mono text-[11px] transition-colors",
                s.id === activeSessionId ? "bg-accent text-kai-orange" : "text-kai-muted hover:text-kai-text"
              )}
            >
              {s.title || "(new)"}
            </button>
          ))}
          {sessions.length === 0 && (
            <p className="px-3 py-4 font-mono text-[10px] text-kai-dim">No sessions yet</p>
          )}
        </div>
      </aside>

      {/* Main chat area */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Transcript (T030) */}
        <div className="min-h-0 flex-1 overflow-auto px-4 py-3">
          {messages.filter((m) => m.role !== "system").map((msg, i) => (
            <MessageBubble key={i} msg={msg} />
          ))}

          {/* Streaming buffer */}
          {streamBuffer && (
            <div className="mb-3 font-mono text-sm text-kai-text">
              <span className="whitespace-pre-wrap">{streamBuffer}</span>
              <span className="animate-caret ml-0.5 inline-block h-4 w-1.5 bg-kai-orange" />
            </div>
          )}

          {error && (
            <p className="mb-2 font-mono text-xs text-kai-rose">{error}</p>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Approval dialog (T032) */}
        {approval && (
          <div className="border-t border-kai-amber/30 bg-accent px-4 py-3">
            <p className="font-mono text-xs text-kai-amber">
              {approval.action === "run" ? "Run command" : approval.action === "write" ? "Write file" : "Edit file"}:
              {" "}<span className="text-kai-text">{approval.target}</span>
            </p>
            {approval.preview && (
              <pre className="mt-2 max-h-32 overflow-auto rounded bg-card p-2 font-mono text-[10px] text-kai-muted">
                {approval.preview}
              </pre>
            )}
            <div className="mt-2 flex gap-2">
              <button onClick={() => resolveApproval("approve")} className="rounded bg-kai-green/20 px-3 py-1 font-mono text-xs text-kai-green hover:bg-kai-green/30">
                Approve (Y)
              </button>
              <button onClick={() => resolveApproval("deny")} className="rounded bg-kai-rose/20 px-3 py-1 font-mono text-xs text-kai-rose hover:bg-kai-rose/30">
                Deny (N)
              </button>
              {approval.action !== "run" && (
                <button onClick={() => resolveApproval("approve_all")} className="rounded bg-kai-amber/20 px-3 py-1 font-mono text-xs text-kai-amber hover:bg-kai-amber/30">
                  Approve All (A)
                </button>
              )}
            </div>
          </div>
        )}

        {/* Composer (T033) */}
        <div className="border-t border-border p-3">
          <div className="flex items-end gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={activeSessionId ? "Message… (Enter to send)" : "Start a new conversation…"}
              rows={Math.min(6, Math.max(1, input.split("\n").length))}
              className="min-h-[36px] flex-1 resize-none rounded-md border border-border bg-card px-3 py-2 font-mono text-sm text-kai-text placeholder:text-kai-dim focus:border-kai-orange/50 focus:outline-none"
            />
            {isStreaming ? (
              <button className="rounded-md bg-kai-rose/20 p-2 text-kai-rose" title="Cancel (Esc)">
                <Square size={16} />
              </button>
            ) : (
              <button
                onClick={handleSend}
                disabled={!input.trim()}
                className="rounded-md bg-accent p-2 text-kai-orange transition-colors hover:bg-accent/80 disabled:opacity-30"
                title="Send"
              >
                <Send size={16} />
              </button>
            )}
          </div>
          <label className="mt-1.5 flex items-center gap-2 font-mono text-[10px] text-kai-dim">
            <input
              type="checkbox"
              checked={autoApprove}
              onChange={(e) => setAutoApprove(e.target.checked)}
              className="accent-kai-orange"
            />
            auto-approve this turn
          </label>
        </div>
      </div>
    </div>
  )
}

// --- Message rendering (T030 + T031) ---

function MessageBubble({ msg }: { msg: ChatMessage }) {
  if (msg.role === "user") {
    return (
      <div className="mb-3 flex justify-end">
        <div className="max-w-[80%] rounded-md bg-accent px-3 py-2 font-mono text-sm text-kai-blue">
          <span className="whitespace-pre-wrap">{msg.content}</span>
        </div>
      </div>
    )
  }

  if (msg.role === "assistant" && msg.tool_calls && msg.tool_calls.length > 0) {
    return (
      <div className="mb-2 space-y-1">
        {msg.tool_calls.map((tc) => (
          <ToolCallCard key={tc.id} name={tc.function.name} args={tc.function.arguments} />
        ))}
      </div>
    )
  }

  if (msg.role === "tool") {
    return <ToolResultCard name={msg.name || "tool"} content={msg.content} />
  }

  if (msg.role === "assistant" && msg.content) {
    return (
      <div className="mb-3 font-mono text-sm text-kai-text">
        <span className="whitespace-pre-wrap">{msg.content}</span>
      </div>
    )
  }

  return null
}

// T031: Tool-call cards
const TOOL_GLYPHS: Record<string, string> = {
  read_file: "📖",
  write_file: "✏️",
  edit_file: "✏️",
  list_files: "📂",
  search: "🔍",
  run_command: "⚡",
  read_knowledge: "🧠",
}

function ToolCallCard({ name, args }: { name: string; args: string }) {
  const [open, setOpen] = useState(false)
  const glyph = TOOL_GLYPHS[name] || "🔧"
  let summary = ""
  try {
    const parsed = JSON.parse(args)
    summary = parsed.path || parsed.command || parsed.query || ""
  } catch {
    summary = args.slice(0, 80)
  }

  return (
    <div className="rounded border border-border bg-card">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 px-2 py-1.5 font-mono text-[11px] text-kai-tan"
      >
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <span>{glyph}</span>
        <span className="font-bold">{name}</span>
        <span className="truncate text-kai-dim">{summary}</span>
      </button>
      {open && (
        <pre className="border-t border-border px-3 py-2 font-mono text-[10px] text-kai-muted">
          {args}
        </pre>
      )}
    </div>
  )
}

function ToolResultCard({ content }: { name: string; content: string }) {
  const [open, setOpen] = useState(false)
  const isErr = content.startsWith("error:") || content.startsWith("user declined")
  const preview = content.split("\n")[0].slice(0, 100)

  return (
    <div className="mb-2 rounded border border-border bg-card">
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "flex w-full items-center gap-2 px-2 py-1 font-mono text-[10px]",
          isErr ? "text-kai-rose" : "text-kai-sage"
        )}
      >
        {open ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
        <span className="truncate">{preview}</span>
      </button>
      {open && (
        <pre className="max-h-40 overflow-auto border-t border-border px-3 py-2 font-mono text-[10px] text-kai-muted">
          {content}
        </pre>
      )}
    </div>
  )
}
