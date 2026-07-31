import * as React from "react"
import { Plus } from "lucide-react"
import { cn } from "@/lib/utils"

export interface AccordionEntry {
  id: string
  title: React.ReactNode
  /** right-aligned in the header row — a count, a key, a badge */
  meta?: React.ReactNode
  glyph?: React.ReactNode
  body: React.ReactNode
}

/**
 * The phone site's answer to dense reference content.
 *
 * Twelve surfaces, thirty-odd commands and six engineering notes are all
 * scannable as headers and unreadable as a wall — so they open one at a time.
 * Single-open on purpose: with a bottom tab bar eating 56px, two expanded
 * panels means the second one is already off-screen when it opens.
 */
export default function Accordion({
  items,
  defaultOpen,
  className,
}: {
  items: AccordionEntry[]
  /** id of the entry that starts open */
  defaultOpen?: string
  className?: string
}) {
  const [open, setOpen] = React.useState<string | null>(defaultOpen ?? null)

  return (
    <div
      className={cn(
        "divide-y divide-border overflow-hidden rounded-md border border-border",
        className
      )}
    >
      {items.map((item) => {
        const isOpen = open === item.id
        return (
          <div key={item.id} className={isOpen ? "bg-kai-panel/40" : "bg-card"}>
            <button
              type="button"
              onClick={() => setOpen(isOpen ? null : item.id)}
              aria-expanded={isOpen}
              aria-controls={`acc-${item.id}`}
              className="m-press flex min-h-[52px] w-full items-center gap-3 px-4 py-3 text-left"
            >
              {item.glyph ? <span className="shrink-0">{item.glyph}</span> : null}
              <span
                className={cn(
                  "min-w-0 flex-1 font-mono text-[13.5px] leading-snug font-bold",
                  isOpen ? "text-kai-orange" : "text-foreground"
                )}
              >
                {item.title}
              </span>
              {item.meta ? <span className="shrink-0">{item.meta}</span> : null}
              <Plus
                className={cn(
                  "size-4 shrink-0 text-kai-dim transition-transform duration-200",
                  isOpen && "rotate-45 text-kai-orange"
                )}
                aria-hidden
              />
            </button>

            {isOpen ? (
              <div id={`acc-${item.id}`} className="m-expand px-4 pb-4">
                {item.body}
              </div>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

/** The bullet list that fills most accordion bodies. */
export function Points({ items, tone = "text-kai-orange" }: { items: string[]; tone?: string }) {
  return (
    <ul className="space-y-2">
      {items.map((p) => (
        <li key={p} className="flex gap-2.5">
          <span className={cn("mt-px shrink-0 font-mono text-[11px]", tone)} aria-hidden>
            ▸
          </span>
          <span className="font-sans text-[12.5px] leading-[1.6] text-muted-foreground">{p}</span>
        </li>
      ))}
    </ul>
  )
}
