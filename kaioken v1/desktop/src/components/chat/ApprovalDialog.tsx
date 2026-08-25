import { useEffect, useRef, useState } from "react"
import { FilePlus2, FilePen, Terminal } from "lucide-react"
import DiffView from "./DiffView"
import { Badge, Button, Kbd, Modal } from "@/components/ui"
import type { Approval } from "@/lib/types"

const ACTION_META = {
  write: { icon: FilePlus2, label: "Write file", tone: "amber" as const },
  edit: { icon: FilePen, label: "Edit file", tone: "amber" as const },
  run: { icon: Terminal, label: "Run command", tone: "rose" as const },
}

/** Blocking approval modal. The agent goroutine is parked on this decision,
 *  so the dialog is deliberately loud, keyboard-driven (Y/N/A), and shows
 *  the real diff rather than a text blob. */
export default function ApprovalDialog({
  approval,
  onResolve,
}: {
  approval: Approval | null
  onResolve: (decision: "approve" | "deny" | "approve_all") => void
}) {
  const denyRef = useRef<HTMLButtonElement>(null)
  const [remaining, setRemaining] = useState<number | null>(null)

  // Countdown to the daemon's 5-minute auto-deny, so a forgotten dialog is
  // visibly on a clock rather than silently expiring.
  useEffect(() => {
    if (!approval) return
    const expiry = new Date(approval.expires_at).getTime()
    const tick = () => setRemaining(Math.max(0, Math.round((expiry - Date.now()) / 1000)))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [approval])

  // Focus lands on Deny, never Approve: a stray Enter must not authorise a
  // repo write.
  useEffect(() => {
    if (approval) denyRef.current?.focus()
  }, [approval])

  useEffect(() => {
    if (!approval) return
    function onKeyDown(e: KeyboardEvent) {
      const k = e.key.toLowerCase()
      if (k === "y") {
        e.preventDefault()
        onResolve("approve")
      } else if (k === "n") {
        e.preventDefault()
        onResolve("deny")
      } else if (k === "a" && approval!.action !== "run") {
        e.preventDefault()
        onResolve("approve_all")
      }
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [approval, onResolve])

  if (!approval) return null

  const meta = ACTION_META[approval.action] ?? ACTION_META.edit
  const Icon = meta.icon
  const diff = approval.diff
  const mmss =
    remaining === null
      ? null
      : `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}`

  return (
    <Modal
      open
      // Dismissing via scrim or Escape is a denial — never an implicit
      // approval.
      onClose={() => onResolve("deny")}
      labelledBy="approval-title"
      className="max-w-3xl"
    >
      <header className="flex items-center gap-2.5 border-b border-border px-4 py-3">
        <Icon size={16} className="shrink-0 text-kai-amber" />
        <div className="min-w-0">
          <h2 id="approval-title" className="font-mono text-sm font-bold text-kai-text">
            {meta.label}
          </h2>
          <p className="truncate font-mono text-[11px] text-kai-dim">{approval.target}</p>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {diff && !diff.is_new_file && (
            <span className="font-mono text-[11px]">
              <span className="text-kai-green">+{diff.added}</span>{" "}
              <span className="text-kai-rose">−{diff.removed}</span>
            </span>
          )}
          {diff?.is_new_file && <Badge tone="green">new file</Badge>}
          {mmss && (
            <Badge tone={remaining !== null && remaining < 60 ? "rose" : "neutral"}>
              {mmss}
            </Badge>
          )}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-auto p-4">
        {approval.action === "run" ? (
          <div>
            <p className="mb-2 font-mono text-[11px] text-kai-dim">
              The agent wants to execute a shell command in your repository.
            </p>
            <pre className="overflow-auto rounded border border-kai-rose/30 bg-kai-code p-3 font-mono text-xs text-kai-amber">
              {approval.command || approval.target}
            </pre>
          </div>
        ) : (
          <DiffView diff={diff} preview={approval.preview} className="max-h-[45vh]" />
        )}
      </div>

      <footer className="flex items-center gap-2 border-t border-border px-4 py-3">
        <Button variant="primary" onClick={() => onResolve("approve")}>
          Approve <Kbd className="ml-0.5">Y</Kbd>
        </Button>
        <Button ref={denyRef} variant="danger" onClick={() => onResolve("deny")}>
          Deny <Kbd className="ml-0.5">N</Kbd>
        </Button>
        {approval.action !== "run" && (
          <Button variant="subtle" onClick={() => onResolve("approve_all")}>
            Approve all this run <Kbd className="ml-0.5">A</Kbd>
          </Button>
        )}
        <p className="ml-auto font-mono text-[10px] text-kai-dim">
          Denying leaves the file byte-identical
        </p>
      </footer>
    </Modal>
  )
}
