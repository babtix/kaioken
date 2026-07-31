import { useState } from "react"
import { ExternalLink } from "lucide-react"
import { cn } from "@/lib/utils"
import { hostOf, type AnswerSource } from "./types"

/**
 * Inline citation chip — the signature Perplexity move: a claim carries its
 * receipt in the line of prose, not in a footnote the reader must go find.
 *
 * A chip that resolves to nothing is worse than no chip, because it reads as
 * verified. When the number has no matching source the chip renders inert and
 * muted rather than pretending to be a link.
 */
export function SourceChip({
  n,
  source,
  onOpen,
}: {
  n: number
  source?: AnswerSource
  onOpen?: (s: AnswerSource) => void
}) {
  const [open, setOpen] = useState(false)

  if (!source) {
    return (
      <span
        className="cite-chip cursor-default border-kai-line bg-transparent text-kai-dim"
        title="no source recorded for this citation"
      >
        {n}
      </span>
    )
  }

  return (
    <span className="relative inline-block">
      <button
        type="button"
        className="cite-chip"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => onOpen?.(source)}
        aria-label={`Source ${n}: ${source.title || hostOf(source.url)}`}
      >
        {n}
      </button>

      {open && (
        <span
          role="tooltip"
          className="animate-pop absolute bottom-[calc(100%+6px)] left-1/2 z-50 w-64 -translate-x-1/2
                     rounded-[var(--radius)] border border-border bg-popover p-2.5 text-left shadow-lg"
        >
          <span className="flex items-center gap-1.5">
            <Favicon url={source.url} />
            <span className="truncate font-mono text-[10px] text-kai-dim">{hostOf(source.url)}</span>
          </span>
          <span className="mt-1 block font-sans text-[12px] leading-snug text-kai-text">
            {source.title || source.url}
          </span>
        </span>
      )}
    </span>
  )
}

/**
 * Favicon shows provenance at a glance. Remote images can fail or be blocked;
 * on error it collapses to a coloured dot derived from the domain so the row
 * keeps its rhythm instead of jumping when an icon 404s.
 */
export function Favicon({ url, size = 12 }: { url: string; size?: number }) {
  const [failed, setFailed] = useState(false)
  const host = hostOf(url)

  if (failed) {
    // Deterministic hue per domain: the same source keeps the same dot.
    let hash = 0
    for (let i = 0; i < host.length; i++) hash = (hash * 31 + host.charCodeAt(i)) % 360
    return (
      <span
        aria-hidden
        className="inline-block shrink-0 rounded-full"
        style={{ width: size, height: size, background: `hsl(${hash} 55% 45%)` }}
      />
    )
  }

  return (
    <img
      src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=32`}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      onError={() => setFailed(true)}
      className="shrink-0 rounded-[2px]"
    />
  )
}

/**
 * SourceRow is the compact provenance summary that sits with the answer's
 * action row: overlapping favicons plus a count, expanding to the full list.
 */
export function SourceRow({
  sources,
  onOpen,
  className,
}: {
  sources: AnswerSource[]
  onOpen?: (s: AnswerSource) => void
  className?: string
}) {
  if (sources.length === 0) return null
  const shown = sources.slice(0, 5)

  return (
    <button
      type="button"
      onClick={() => onOpen?.(sources[0])}
      className={cn(
        "group flex items-center gap-2 rounded-[var(--radius)] border border-border bg-muted/40 px-2 py-1",
        "transition-colors hover:border-kai-orange/40 hover:bg-accent",
        "outline-none focus-visible:ring-2 focus-visible:ring-kai-orange/50",
        className
      )}
    >
      <span className="flex -space-x-1">
        {shown.map((s) => (
          <span
            key={s.n}
            className="flex size-4 items-center justify-center rounded-[2px] border border-border bg-card"
          >
            <Favicon url={s.url} size={10} />
          </span>
        ))}
      </span>
      <span className="font-mono text-[10px] text-kai-muted group-hover:text-kai-text">
        {sources.length} source{sources.length === 1 ? "" : "s"}
      </span>
    </button>
  )
}

/** SourceCard is the full-width entry used in the Sources tab. */
export function SourceCard({
  source,
  onOpen,
}: {
  source: AnswerSource
  onOpen?: (s: AnswerSource) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen?.(source)}
      // min-w-0 matters: as a grid item the button's automatic minimum size
      // is its content width, so one source with a long unbreakable title or
      // URL would stretch every card past the answer surface. Zeroing it lets
      // the card stay at track width and the inner truncate spans do the rest.
      className="hud-corners group flex w-full min-w-0 items-start gap-2.5 rounded-[var(--radius)] border border-border
                 bg-card p-2.5 text-left transition-colors hover:border-kai-orange/40 hover:bg-accent
                 outline-none focus-visible:ring-2 focus-visible:ring-kai-orange/50"
    >
      <span
        className="mt-px flex size-5 shrink-0 items-center justify-center rounded-[2px]
                   bg-kai-orange/15 font-mono text-[10px] font-bold text-kai-orange"
      >
        {source.n}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <Favicon url={source.url} size={11} />
          <span className="truncate font-mono text-[10px] text-kai-dim">{hostOf(source.url)}</span>
        </span>
        <span className="mt-0.5 block truncate font-sans text-[12.5px] text-kai-text group-hover:text-kai-white">
          {source.title || source.url}
        </span>
      </span>
      <ExternalLink
        size={12}
        className="mt-1 shrink-0 text-kai-dim opacity-0 transition-opacity group-hover:opacity-100"
      />
    </button>
  )
}
