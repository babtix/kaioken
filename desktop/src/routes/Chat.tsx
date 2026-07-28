import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import {
  Clock,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Send,
  Square,
  Terminal,
  Trash2,
  Zap,
} from "lucide-react"
import { useWorkspaceStore } from "@/store/workspace"
import { useChatStore } from "@/store/chat"
import { useRunsStore } from "@/store/runs"
import { useToastStore } from "@/store/toast"
import Markdown from "@/components/common/Markdown"
import ApprovalDialog from "@/components/chat/ApprovalDialog"
import Autocomplete, { detectTrigger, type Suggestion } from "@/components/chat/Autocomplete"
import { ToolCallCard, ToolResultCard } from "@/components/chat/ToolCallCard"
import EmptyState from "@/components/EmptyState"
import { Badge, Button, Kbd, SectionLabel, Skeleton } from "@/components/ui"
import { api } from "@/lib/api"
import { humanize } from "@/lib/errors"
import { cn } from "@/lib/utils"
import { formatRelativeTime } from "@/lib/format"
import { filterCommands, resolveCommand, type SlashAction } from "@/lib/slash"
import type { ChatMessage, RepoFile } from "@/lib/types"

export default function Chat() {
  const ws = useWorkspaceStore((s) => s.active)
  const {
    sessions, activeSessionId, messages, streamBuffer, isStreaming, approval, error,
    loadSessions, newSession, openSession, deleteSession, send, cancel, resolveApproval, activeRunId,
  } = useChatStore()

  const startRun = useRunsStore((s) => s.start)
  const pushToast = useToastStore((s) => s.push)
  const navigate = useNavigate()

  const [input, setInput] = useState("")
  const [autoApprove, setAutoApprove] = useState(false)
  const [allowRun, setAllowRun] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const stickToBottom = useRef(true)

  useEffect(() => {
    if (ws) loadSessions(ws.id)
  }, [ws?.id, loadSessions])

  // Auto-scroll respects intent: stick to the bottom only while the user is
  // already near it, so reading back through a transcript is not yanked.
  const onScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60
  }, [])

  useLayoutEffect(() => {
    if (!stickToBottom.current) return
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages?.length ?? 0, streamBuffer])

  if (!ws) {
    return (
      <EmptyState
        icon={MessageSquare}
        title="No workspace open"
        hint="Open a repository to start a conversation with the agent."
      />
    )
  }

  /** Execute a slash command instead of sending it as a message — typing
   *  "/wiki x3" starts a run, exactly as it does in the TUI. */
  async function runSlash(action: SlashAction): Promise<void> {
    switch (action.kind) {
      case "run":
        await startRun(ws!.id, action.runKind, action.params)
        navigate("/activity")
        break
      case "session":
        if (action.op === "new") {
          await newSession(ws!.id)
        } else if (activeSessionId) {
          try {
            const res = await api.compactSession(ws!.id, activeSessionId)
            pushToast(
              "success",
              "Conversation compacted",
              `${res.before_messages} messages → ${res.after_messages}`
            )
            await openSession(ws!.id, activeSessionId)
          } catch (err) {
            const h = humanize(err)
            pushToast("error", h.title, h.body, h.action)
          }
        }
        break
      case "undo":
        try {
          const res = await api.undo(ws!.id)
          pushToast("success", res.deleted ? "Deleted file" : "Restored file", res.path)
        } catch (err) {
          const h = humanize(err)
          pushToast("error", h.title, h.body, h.action)
        }
        break
      case "toggle":
        if (action.which === "yolo") setAutoApprove((v) => !v)
        else setAllowRun((v) => !v)
        break
      case "navigate":
        navigate(action.to)
        break
      case "help":
        // The shortcut sheet is owned by AppShell's global "?" handler.
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "?" }))
        break
    }
  }

  async function handleSend() {
    const text = input.trim()
    if (!text || isStreaming) return

    // A line that names a real command runs it rather than talking to the
    // model. An unknown "/foo" falls through and is sent as prose.
    const slash = resolveCommand(text)
    if (slash) {
      setInput("")
      await runSlash(slash.cmd.action(slash.arg))
      return
    }

    setInput("")
    stickToBottom.current = true
    if (!activeSessionId) await newSession(ws!.id)
    await send(ws!.id, text, { auto_approve: autoApprove, allow_run: allowRun || ws!.allow_run })
  }

  const visible = (messages || []).filter((m) => m && m.role !== "system")

  return (
    <div className="flex h-full">
      <SessionSidebar
        sessions={sessions || []}
        activeId={activeSessionId}
        busy={isStreaming}
        onNew={() => newSession(ws.id)}
        onOpen={(sid) => openSession(ws.id, sid)}
        onDelete={(sid) => deleteSession(ws.id, sid)}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <div
          ref={scrollRef}
          onScroll={onScroll}
          className="min-h-0 flex-1 overflow-auto scroll-smooth"
        >
          <div className="mx-auto max-w-3xl px-5 py-5">
            {visible.length === 0 && !streamBuffer && (
              <ChatIntro model={ws.model} onPick={(t) => setInput(t)} />
            )}

            {visible.map((msg, i) => (
              <MessageRow key={i} msg={msg} />
            ))}

            {streamBuffer && <StreamingMessage text={streamBuffer} />}

            {isStreaming && !streamBuffer && (
              <div className="my-3 space-y-2">
                <Skeleton className="h-3 w-2/3" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            )}

            {error && (
              <p className="my-2 rounded border border-kai-rose/30 bg-kai-rose/10 px-3 py-2 font-mono text-xs text-kai-rose">
                {error}
              </p>
            )}
          </div>
        </div>

        <Composer
          workspaceId={ws.id}
          value={input}
          onChange={setInput}
          onSend={handleSend}
          onCancel={() => activeRunId && cancel(activeRunId)}
          isStreaming={isStreaming}
          autoApprove={autoApprove}
          setAutoApprove={setAutoApprove}
          allowRun={allowRun}
          setAllowRun={setAllowRun}
        />
      </div>

      <ApprovalDialog approval={approval} onResolve={resolveApproval} />
    </div>
  )
}

// ── Session sidebar ────────────────────────────────────────────────────────

const SIDEBAR_COLLAPSED_KEY = "kaioken.chat.sidebar.collapsed"

function SessionSidebar({
  sessions,
  activeId,
  busy,
  onNew,
  onOpen,
  onDelete,
}: {
  sessions: { id: string; title: string; turns: number; updated: string }[]
  activeId: string | null
  /** True while a reply is streaming — deleting the live session would orphan the run. */
  busy: boolean
  onNew: () => void
  onOpen: (sid: string) => void
  onDelete: (sid: string) => void
}) {
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1"
  )
  // Deleting is a two-click affair: the first click arms this id, the second
  // commits. Cheaper than a modal for something this local, still not fatal
  // to fat-finger.
  const [confirming, setConfirming] = useState<string | null>(null)

  useEffect(() => {
    if (!confirming) return
    const id = setTimeout(() => setConfirming(null), 2500)
    return () => clearTimeout(id)
  }, [confirming])

  const toggleCollapsed = () => {
    setCollapsed((v) => {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, v ? "0" : "1")
      return !v
    })
  }

  if (collapsed) {
    return (
      <aside className="flex w-10 shrink-0 flex-col items-center gap-1 border-r border-border bg-card py-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={toggleCollapsed}
          className="px-1.5"
          title="Expand sessions"
        >
          <PanelLeftOpen size={13} />
        </Button>
        <Button variant="ghost" size="sm" onClick={onNew} className="px-1.5" title="New session">
          <Plus size={13} />
        </Button>
        {sessions.length > 0 && (
          <span
            className="mt-auto pb-1 font-mono text-[9px] text-kai-dim"
            title={`${sessions.length} session${sessions.length === 1 ? "" : "s"}`}
          >
            {sessions.length}
          </span>
        )}
      </aside>
    )
  }

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-border bg-card">
      <div className="flex items-center gap-1.5 border-b border-border py-2 pr-1.5 pl-3">
        <SectionLabel>Sessions</SectionLabel>
        {sessions.length > 0 && (
          <span className="rounded bg-panel px-1 font-mono text-[9px] leading-4 text-kai-dim">
            {sessions.length}
          </span>
        )}
        <div className="ml-auto flex items-center">
          <Button variant="ghost" size="sm" onClick={onNew} className="px-1.5" title="New session">
            <Plus size={13} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleCollapsed}
            className="px-1.5"
            title="Collapse sidebar"
          >
            <PanelLeftClose size={13} />
          </Button>
        </div>
      </div>

      <div
        className="min-h-0 flex-1 overflow-auto px-1.5 py-1.5"
        onMouseLeave={() => setConfirming(null)}
      >
        {sessions.map((s) => {
          const active = s.id === activeId
          // The live session cannot be deleted — its run would stream into a void.
          const locked = busy && active
          const armed = confirming === s.id
          return (
            <div key={s.id} className="group relative">
              <button
                onClick={() => onOpen(s.id)}
                className={cn(
                  "relative mb-0.5 block w-full rounded-md py-2 pr-8 pl-3 text-left transition-colors outline-none",
                  "focus-visible:ring-2 focus-visible:ring-kai-orange/50",
                  active ? "bg-accent" : "hover:bg-panel/60"
                )}
              >
                {active && (
                  <span
                    className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-kai-orange"
                    aria-hidden
                  />
                )}
                <p
                  className={cn(
                    "truncate font-mono text-[11px] leading-5",
                    active ? "font-medium text-kai-orange" : "text-kai-text"
                  )}
                >
                  {s.title || "Untitled session"}
                </p>
                <p className="mt-0.5 flex items-center gap-1 font-mono text-[9px] text-kai-dim">
                  <Clock size={8} className="shrink-0" aria-hidden />
                  {formatRelativeTime(s.updated)}
                  <span aria-hidden>·</span>
                  {s.turns} turn{s.turns === 1 ? "" : "s"}
                </p>
              </button>
              <button
                onClick={() => (armed ? onDelete(s.id) : setConfirming(s.id))}
                disabled={locked}
                title={
                  locked
                    ? "Streaming — stop the reply before deleting"
                    : armed
                      ? "Click again to delete"
                      : "Delete session"
                }
                aria-label={
                  armed ? `Confirm delete ${s.title || "session"}` : `Delete ${s.title || "session"}`
                }
                className={cn(
                  "absolute top-1/2 right-1.5 flex size-5 -translate-y-1/2 items-center justify-center rounded",
                  "outline-none transition-all focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-kai-orange/50",
                  "disabled:pointer-events-none disabled:opacity-0",
                  armed
                    ? "bg-kai-rose/15 text-kai-rose opacity-100"
                    : "text-kai-dim opacity-0 group-hover:opacity-100 hover:bg-panel hover:text-kai-rose"
                )}
              >
                <Trash2 size={11} />
              </button>
            </div>
          )
        })}

        {sessions.length === 0 && (
          <div className="flex flex-col items-center gap-2.5 px-3 py-10 text-center">
            <span className="flex size-8 items-center justify-center rounded-full border border-border bg-panel">
              <MessageSquare size={13} className="text-kai-dim" />
            </span>
            <p className="font-mono text-[10px] leading-relaxed text-kai-dim">
              Conversations with the agent live here.
            </p>
            <Button variant="subtle" size="sm" onClick={onNew}>
              <Plus size={11} />
              New session
            </Button>
          </div>
        )}
      </div>
    </aside>
  )
}

// ── Transcript ─────────────────────────────────────────────────────────────

const SUGGESTIONS = [
  "Explain how the wiki pipeline decides what to regenerate",
  "Where is the approval flow implemented?",
  "Add a -json flag to the status command",
]

function ChatIntro({ model, onPick }: { model: string; onPick: (t: string) => void }) {
  return (
    <div className="animate-slide-up py-10">
      <h1 className="font-mono text-lg font-bold text-kai-text">
        Ask about this repository
      </h1>
      <p className="mt-1 font-mono text-xs text-kai-dim">
        The agent can read, search and edit files — every write goes through an
        approval you control.
      </p>
      {model && (
        <div className="mt-3">
          <Badge tone="orange">{model}</Badge>
        </div>
      )}
      <div className="mt-6 space-y-1.5">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            onClick={() => onPick(s)}
            className={cn(
              "block w-full rounded-md border border-border bg-card px-3 py-2 text-left",
              "font-mono text-[11px] text-kai-muted transition-colors outline-none",
              "hover:border-kai-orange/40 hover:text-kai-text",
              "focus-visible:ring-2 focus-visible:ring-kai-orange/50"
            )}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  )
}

/** Committed messages are memoised so a streaming reply never re-renders (or
 *  re-parses the markdown of) the transcript above it. */
const MessageRow = memo(function MessageRow({ msg }: { msg: ChatMessage }) {
  if (msg.role === "user") {
    return (
      <div className="animate-slide-up mb-4 flex justify-end">
        <div className="max-w-[85%] rounded-lg rounded-br-sm border border-kai-blue/25 bg-kai-blue/[0.07] px-3 py-2">
          <p className="whitespace-pre-wrap font-mono text-[13px] leading-relaxed text-kai-blue">
            {msg.content}
          </p>
        </div>
      </div>
    )
  }

  if (msg.role === "assistant" && msg.tool_calls?.length) {
    return (
      <div className="mb-2">
        {msg.tool_calls.map((tc, i) => (
          <ToolCallCard key={tc.id || i} name={tc.function.name} args={tc.function.arguments} />
        ))}
      </div>
    )
  }

  if (msg.role === "tool") return <ToolResultCard content={msg.content} />

  if (msg.role === "assistant" && msg.content.trim()) {
    return (
      <div className="animate-slide-up mb-4">
        <Markdown variant="chat" className="text-kai-text">
          {msg.content}
        </Markdown>
      </div>
    )
  }

  return null
})

/** The live tail renders as pre-wrapped text, not markdown: half-written
 *  markdown renders badly (an unclosed fence swallows the rest), and
 *  re-parsing on every token is the app's biggest perf trap. */
function StreamingMessage({ text }: { text: string }) {
  return (
    <div className="mb-4">
      <p className="whitespace-pre-wrap font-mono text-[13px] leading-relaxed text-kai-text">
        {text}
        <span className="animate-caret ml-0.5 inline-block h-3.5 w-[7px] translate-y-0.5 bg-kai-orange" />
      </p>
    </div>
  )
}

// ── Composer ───────────────────────────────────────────────────────────────

type ComposerProps = {
  workspaceId: string
  value: string
  onChange: (v: string) => void
  onSend: () => void
  onCancel: () => void
  isStreaming: boolean
  autoApprove: boolean
  setAutoApprove: (v: boolean) => void
  allowRun: boolean
  setAllowRun: (v: boolean) => void
}

const Composer = memo(function Composer({
  workspaceId,
  value,
  onChange,
  onSend,
  onCancel,
  isStreaming,
  autoApprove,
  setAutoApprove,
  allowRun,
  setAllowRun,
}: ComposerProps) {
  const rows = Math.min(8, Math.max(1, value.split("\n").length))
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const [caret, setCaret] = useState(0)
  const [files, setFiles] = useState<RepoFile[]>([])
  const [selected, setSelected] = useState(0)
  // Remembers the trigger text the menu was dismissed at, so Escape keeps it
  // closed until the query actually changes again (same rule as the TUI).
  const [dismissed, setDismissed] = useState<string | null>(null)

  const trigger = detectTrigger(value, caret)
  const triggerId = trigger ? `${trigger.kind}:${trigger.start}:${trigger.query}` : ""
  const active = trigger && dismissed !== triggerId ? trigger : null

  // Fetch matching paths for an "@" query. Debounced so a fast typist does
  // not fire a request per keystroke.
  useEffect(() => {
    if (active?.kind !== "at") {
      setFiles([])
      return
    }
    let cancelled = false
    const id = setTimeout(() => {
      api
        .files(workspaceId, active.query, 12)
        .then((r) => !cancelled && setFiles(r.files))
        .catch(() => !cancelled && setFiles([]))
    }, 120)
    return () => {
      cancelled = true
      clearTimeout(id)
    }
  }, [active?.kind, active?.query, workspaceId])

  const items: Suggestion[] = !active
    ? []
    : active.kind === "slash"
      ? filterCommands(active.query).map((cmd) => ({ type: "command" as const, cmd }))
      : files.map((file) => ({ type: "file" as const, file }))

  // Keep the highlight in range as the list shrinks under a longer query.
  useEffect(() => {
    setSelected((s) => (s >= items.length ? 0 : s))
  }, [items.length])

  /** Replace the trigger's span with the chosen completion. */
  function applySuggestion(item: Suggestion) {
    if (!active) return
    const before = value.slice(0, active.start)
    const after = value.slice(caret)

    let insert: string
    if (item.type === "command") {
      // Leave a trailing space when the command takes arguments so the user
      // can type them immediately; otherwise the line is complete as-is.
      insert = `/${item.cmd.name}${item.cmd.args ? " " : ""}`
    } else {
      insert = `@${item.file.path} `
    }

    const next = before + insert + after
    const nextCaret = before.length + insert.length
    onChange(next)
    setDismissed(null)
    requestAnimationFrame(() => {
      const el = textareaRef.current
      if (!el) return
      el.focus()
      el.setSelectionRange(nextCaret, nextCaret)
      setCaret(nextCaret)
    })
  }

  function syncCaret(e: React.SyntheticEvent<HTMLTextAreaElement>) {
    setCaret(e.currentTarget.selectionStart ?? 0)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // The menu owns the arrow keys, Tab and Enter while it is open.
    if (active && items.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault()
        setSelected((s) => (s + 1) % items.length)
        return
      }
      if (e.key === "ArrowUp") {
        e.preventDefault()
        setSelected((s) => (s - 1 + items.length) % items.length)
        return
      }
      if (e.key === "Tab" || (e.key === "Enter" && !e.altKey && !e.ctrlKey && !e.shiftKey)) {
        e.preventDefault()
        applySuggestion(items[selected])
        return
      }
      if (e.key === "Escape") {
        e.preventDefault()
        setDismissed(triggerId)
        return
      }
    }

    // Alt/Ctrl+Enter inserts a newline — same binding as the TUI. Plain
    // Enter sends.
    if (e.key === "Enter" && !e.shiftKey && !e.altKey && !e.ctrlKey) {
      e.preventDefault()
      onSend()
      return
    }
    if (e.key === "Escape" && isStreaming) {
      e.preventDefault()
      onCancel()
    }
  }

  return (
    <div className="shrink-0 border-t border-border bg-card/50 px-4 py-3">
      <div className="relative mx-auto max-w-3xl">
        {active && (
          <Autocomplete
            items={items}
            selected={selected}
            onSelect={applySuggestion}
            onHover={setSelected}
            kind={active.kind}
          />
        )}

        <div
          className={cn(
            "flex items-end gap-2 rounded-lg border border-border bg-card px-2.5 py-2",
            "transition-colors focus-within:border-kai-orange/50"
          )}
        >
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => {
              onChange(e.target.value)
              setCaret(e.target.selectionStart ?? 0)
            }}
            onKeyDown={handleKeyDown}
            onKeyUp={syncCaret}
            onClick={syncCaret}
            onSelect={syncCaret}
            rows={rows}
            placeholder="Ask anything…  /  for commands,  @  for files"
            className={cn(
              "flex-1 resize-none bg-transparent py-1 font-mono text-[13px] leading-relaxed",
              "text-kai-text placeholder:text-kai-dim focus:outline-none"
            )}
          />
          {isStreaming ? (
            <Button variant="danger" size="sm" onClick={onCancel} title="Cancel (Esc)">
              <Square size={12} />
              Stop
            </Button>
          ) : (
            <Button
              variant="primary"
              size="sm"
              onClick={onSend}
              disabled={!value.trim()}
              title="Send (Enter)"
            >
              <Send size={12} />
              Send
            </Button>
          )}
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-3">
          <Toggle
            checked={autoApprove}
            onChange={setAutoApprove}
            icon={Zap}
            label="auto-approve"
            title="Skip the approval dialog for this turn"
          />
          <Toggle
            checked={allowRun}
            onChange={setAllowRun}
            icon={Terminal}
            label="allow shell"
            title="Offer the run_command tool to the model"
            danger
          />
          <p className="ml-auto font-mono text-[10px] text-kai-dim">
            <Kbd>/</Kbd> commands · <Kbd>@</Kbd> files · <Kbd>Alt</Kbd>+<Kbd>Enter</Kbd>{" "}
            newline
          </p>
        </div>
      </div>
    </div>
  )
})

function Toggle({
  checked,
  onChange,
  icon: Icon,
  label,
  title,
  danger,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  icon: typeof Zap
  label: string
  title: string
  danger?: boolean
}) {
  return (
    <button
      onClick={() => onChange(!checked)}
      title={title}
      className={cn(
        "flex items-center gap-1.5 rounded border px-2 py-0.5 font-mono text-[10px]",
        "transition-colors outline-none focus-visible:ring-2 focus-visible:ring-kai-orange/50",
        checked
          ? danger
            ? "border-kai-rose/40 bg-kai-rose/10 text-kai-rose"
            : "border-kai-amber/40 bg-kai-amber/10 text-kai-amber"
          : "border-border text-kai-dim hover:text-kai-muted"
      )}
    >
      <Icon size={10} />
      {label}
    </button>
  )
}
