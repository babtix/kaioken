import { useState } from "react"
import {
  Brain,
  ChevronDown,
  ChevronRight,
  FilePen,
  FilePlus2,
  FolderTree,
  Search,
  Terminal,
  Wrench,
  type LucideIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"

// Mirrors the TUI's tool vocabulary — icons instead of emoji so the glyphs
// inherit colour and align on the monospace grid.
const TOOL_ICONS: Record<string, LucideIcon> = {
  read_file: FolderTree,
  write_file: FilePlus2,
  edit_file: FilePen,
  list_files: FolderTree,
  search: Search,
  run_command: Terminal,
  read_knowledge: Brain,
}

/** One-line summary of a tool call: the path/command/query argument. */
function summarise(args: string): string {
  try {
    const parsed = JSON.parse(args)
    const v = parsed.path ?? parsed.command ?? parsed.query ?? ""
    return typeof v === "string" ? v : ""
  } catch {
    return args.replace(/\s+/g, " ").slice(0, 80)
  }
}

export function ToolCallCard({ name, args }: { name: string; args: string }) {
  const [open, setOpen] = useState(false)
  const Icon = TOOL_ICONS[name] ?? Wrench
  const summary = summarise(args)

  let pretty = args
  try {
    pretty = JSON.stringify(JSON.parse(args), null, 2)
  } catch {
    /* leave raw */
  }

  return (
    <div className="my-1 overflow-hidden rounded-md border border-border bg-card">
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "flex w-full items-center gap-2 px-2.5 py-1.5 text-left font-mono text-[11px]",
          "transition-colors hover:bg-panel/60 focus-visible:ring-2 focus-visible:ring-kai-orange/50 outline-none"
        )}
      >
        {open ? (
          <ChevronDown size={11} className="shrink-0 text-kai-dim" />
        ) : (
          <ChevronRight size={11} className="shrink-0 text-kai-dim" />
        )}
        <Icon size={12} className="shrink-0 text-kai-tan" />
        <span className="shrink-0 font-semibold text-kai-tan">{name}</span>
        {summary && <span className="truncate text-kai-dim">{summary}</span>}
      </button>
      {open && (
        <pre className="max-h-56 overflow-auto border-t border-border bg-kai-code px-3 py-2 font-mono text-[10px] leading-relaxed text-kai-muted">
          {pretty}
        </pre>
      )}
    </div>
  )
}

export function ToolResultCard({ content }: { content: string }) {
  const [open, setOpen] = useState(false)
  const isError = content.startsWith("error:") || content.startsWith("user declined")
  const lines = content.split("\n")
  const firstLine = lines[0].slice(0, 110)

  return (
    <div className="mb-1.5 overflow-hidden rounded-md border border-border bg-card">
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "flex w-full items-center gap-2 px-2.5 py-1 text-left font-mono text-[10px]",
          "transition-colors hover:bg-panel/60 focus-visible:ring-2 focus-visible:ring-kai-orange/50 outline-none",
          isError ? "text-kai-rose" : "text-kai-sage"
        )}
      >
        {open ? (
          <ChevronDown size={10} className="shrink-0 opacity-60" />
        ) : (
          <ChevronRight size={10} className="shrink-0 opacity-60" />
        )}
        <span className="truncate">{firstLine || "(empty result)"}</span>
        {lines.length > 1 && (
          <span className="ml-auto shrink-0 text-kai-dim">{lines.length} lines</span>
        )}
      </button>
      {open && (
        <pre className="max-h-56 overflow-auto border-t border-border bg-kai-code px-3 py-2 font-mono text-[10px] leading-relaxed text-kai-muted">
          {content}
        </pre>
      )}
    </div>
  )
}
