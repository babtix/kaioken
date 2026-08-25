import { useLayoutEffect, useRef } from "react"
import { FileCode2, Terminal } from "lucide-react"
import { Kbd } from "@/components/ui"
import { cn } from "@/lib/utils"
import type { SlashCommand } from "@/lib/slash"
import type { RepoFile } from "@/lib/types"

export type Suggestion =
  | { type: "command"; cmd: SlashCommand }
  | { type: "file"; file: RepoFile }

/** The completion popover that sits above the composer. Purely presentational:
 *  the composer owns the query, the selection index and the key handling, so
 *  there is exactly one place that decides what Enter means. */
export default function Autocomplete({
  items,
  selected,
  onSelect,
  onHover,
  kind,
}: {
  items: Suggestion[]
  selected: number
  onSelect: (item: Suggestion) => void
  onHover: (index: number) => void
  kind: "slash" | "at"
}) {
  const listRef = useRef<HTMLDivElement>(null)

  // Keep the highlighted row in view when arrowing past the fold.
  useLayoutEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${selected}"]`)
    el?.scrollIntoView({ block: "nearest" })
  }, [selected])

  if (items.length === 0) return null

  return (
    <div
      className={cn(
        "animate-pop absolute bottom-full left-0 right-0 z-30 mb-1.5 overflow-hidden",
        "rounded-lg border border-border bg-card shadow-2xl"
      )}
      role="listbox"
    >
      <div ref={listRef} className="max-h-64 overflow-auto py-1">
        {items.map((item, i) => (
          <button
            key={item.type === "command" ? item.cmd.name : item.file.path}
            data-index={i}
            role="option"
            aria-selected={i === selected}
            // onMouseDown, not onClick: the composer's textarea must not lose
            // focus before the insertion happens.
            onMouseDown={(e) => {
              e.preventDefault()
              onSelect(item)
            }}
            onMouseEnter={() => onHover(i)}
            className={cn(
              "flex w-full items-baseline gap-2 px-3 py-1.5 text-left transition-colors",
              i === selected ? "bg-accent" : "hover:bg-panel/60"
            )}
          >
            {item.type === "command" ? (
              <>
                <Terminal
                  size={11}
                  className={cn(
                    "shrink-0 translate-y-0.5",
                    i === selected ? "text-kai-orange" : "text-kai-dim"
                  )}
                />
                <span
                  className={cn(
                    "shrink-0 font-mono text-[11px] font-semibold",
                    i === selected ? "text-kai-orange" : "text-kai-blue"
                  )}
                >
                  /{item.cmd.name}
                </span>
                {item.cmd.args && (
                  <span className="shrink-0 font-mono text-[10px] text-kai-dim">
                    {item.cmd.args}
                  </span>
                )}
                <span className="ml-auto truncate pl-3 font-mono text-[10px] text-kai-muted">
                  {item.cmd.summary}
                </span>
              </>
            ) : (
              <>
                <FileCode2
                  size={11}
                  className={cn(
                    "shrink-0 translate-y-0.5",
                    i === selected ? "text-kai-orange" : "text-kai-dim"
                  )}
                />
                <span
                  className={cn(
                    "shrink-0 font-mono text-[11px]",
                    i === selected ? "text-kai-orange" : "text-kai-text"
                  )}
                >
                  {item.file.name}
                </span>
                <span className="min-w-0 truncate font-mono text-[10px] text-kai-dim">
                  {item.file.path}
                </span>
                <span className="ml-auto shrink-0 pl-3 font-mono text-[10px] text-kai-dim">
                  {item.file.lines}L
                </span>
              </>
            )}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2 border-t border-border bg-panel/40 px-3 py-1 font-mono text-[9px] text-kai-dim">
        <span>
          <Kbd>↑</Kbd>
          <Kbd className="ml-0.5">↓</Kbd> navigate
        </span>
        <span>
          <Kbd>Tab</Kbd> complete
        </span>
        <span>
          <Kbd>Enter</Kbd> {kind === "slash" ? "run" : "insert"}
        </span>
        <span className="ml-auto">
          <Kbd>Esc</Kbd> dismiss
        </span>
      </div>
    </div>
  )
}

/** Detect an active completion trigger at the caret.
 *
 *  "/" only counts at the very start of the composer and only while the
 *  command NAME is being typed — once there is a space the user is writing
 *  arguments and the menu gets out of the way (same rule as the TUI palette).
 *  "@" counts anywhere, and its query runs to the caret. */
export function detectTrigger(
  value: string,
  caret: number
): { kind: "slash" | "at"; query: string; start: number } | null {
  const upToCaret = value.slice(0, caret)

  if (value.startsWith("/") && !/\s/.test(upToCaret)) {
    return { kind: "slash", query: upToCaret.slice(1), start: 0 }
  }

  const at = upToCaret.lastIndexOf("@")
  if (at !== -1) {
    const before = at === 0 ? "" : upToCaret[at - 1]
    const query = upToCaret.slice(at + 1)
    // Must start a word (so an email address does not open the menu) and
    // must not have run past a space yet.
    if ((before === "" || /\s/.test(before)) && !/\s/.test(query)) {
      return { kind: "at", query, start: at }
    }
  }

  return null
}

/** Also used by the composer's Escape handling, so a dismissed menu stays
 *  dismissed until the trigger text actually changes. */
export function triggerKey(t: { kind: string; query: string; start: number } | null): string {
  return t ? `${t.kind}:${t.start}:${t.query}` : ""
}
