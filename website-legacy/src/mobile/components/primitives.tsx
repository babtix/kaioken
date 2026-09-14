import * as React from "react"
import { Link } from "react-router-dom"
import { ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"

/* ─────────────────────────────────────────────────────────────────────────────
   The phone site's building blocks.

   One gutter (16px), one section rhythm, one card. Everything on the phone is a
   single column, so the primitives here are about vertical rhythm and touch
   targets rather than grids — nothing below is narrower than 44px in the
   direction a thumb has to hit it.
   ───────────────────────────────────────────────────────────────────────────── */

export const GUTTER = "px-4"

/** A page-level band. Sections are separated by a rule, terminal style. */
export function Section({
  id,
  children,
  className,
  first = false,
}: {
  id?: string
  children: React.ReactNode
  className?: string
  /** the first section under a hero already has an edge above it */
  first?: boolean
}) {
  return (
    <section
      id={id}
      className={cn(
        "m-scroll-offset py-9",
        GUTTER,
        !first && "border-t border-border",
        className
      )}
    >
      {children}
    </section>
  )
}

/** `▎ 03 · features` — the gutter mark the TUI prints before a heading. */
export function Eyebrow({
  index,
  children,
  tone = "orange",
}: {
  index?: string
  children: React.ReactNode
  tone?: "orange" | "dim"
}) {
  return (
    <p className="flex items-center gap-2 font-mono text-[10.5px] tracking-[0.28em] uppercase">
      <span className={tone === "orange" ? "text-kai-orange" : "text-kai-dim"} aria-hidden>
        ▎
      </span>
      {index ? <span className="text-kai-amber">{index}</span> : null}
      <span className="text-kai-dim">{children}</span>
    </p>
  )
}

/** Eyebrow + title + lead, the opening of nearly every section. */
export function SectionHead({
  index,
  eyebrow,
  title,
  lead,
  className,
}: {
  index?: string
  eyebrow: string
  title: React.ReactNode
  lead?: React.ReactNode
  className?: string
}) {
  return (
    <header className={className}>
      <Eyebrow index={index}>{eyebrow}</Eyebrow>
      <h2 className="mt-3 font-mono text-[21px] leading-[1.25] font-bold tracking-tight text-balance text-foreground">
        {title}
      </h2>
      {lead ? <Lead className="mt-3">{lead}</Lead> : null}
    </header>
  )
}

export function Lead({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <p className={cn("font-sans text-[14.5px] leading-[1.65] text-muted-foreground", className)}>
      {children}
    </p>
  )
}

export function Card({
  children,
  className,
  ...rest
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rounded-md border border-border bg-card/70 p-4 backdrop-blur-[2px]", className)}
      {...rest}
    >
      {children}
    </div>
  )
}

/** Small monospace label pill — tones, keys, tags. */
export function Tag({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <span
      className={cn(
        "inline-block rounded-sm border border-border px-1.5 py-px font-mono text-[10px] whitespace-nowrap text-kai-dim",
        className
      )}
    >
      {children}
    </span>
  )
}

/** A number and what it counts. Used in 2- and 4-up strips. */
export function StatGrid({
  items,
  columns = 2,
  className,
}: {
  items: { value: string; label: string }[]
  columns?: 2 | 3
  className?: string
}) {
  return (
    <dl
      className={cn(
        "grid gap-px overflow-hidden rounded-md border border-border bg-border",
        columns === 3 ? "grid-cols-3" : "grid-cols-2",
        className
      )}
    >
      {items.map((s) => (
        <div key={s.label} className="bg-card px-3 py-3.5 text-center">
          <dd className="font-mono text-[22px] leading-none font-bold text-kai-orange">
            {s.value}
          </dd>
          <dt className="mt-1.5 font-mono text-[10px] tracking-[0.14em] text-kai-dim uppercase">
            {s.label}
          </dt>
        </div>
      ))}
    </dl>
  )
}

/* ── rows ─────────────────────────────────────────────────────────────────── */

interface RowProps {
  /** internal route */
  to?: string
  /** external URL */
  href?: string
  onClick?: () => void
  glyph?: React.ReactNode
  title: React.ReactNode
  subtitle?: React.ReactNode
  meta?: React.ReactNode
  /** hide the trailing chevron — for rows that are not navigation */
  plain?: boolean
  className?: string
}

/**
 * The workhorse of the phone site: a 56px-tall tappable row. Renders as a
 * router Link, an anchor or a button depending on where it goes, so the
 * accessibility tree always matches the behaviour.
 */
export function ListRow({
  to,
  href,
  onClick,
  glyph,
  title,
  subtitle,
  meta,
  plain,
  className,
}: RowProps) {
  const body = (
    <>
      {glyph ? <span className="mt-0.5 shrink-0">{glyph}</span> : null}
      <span className="min-w-0 flex-1">
        <span className="block font-mono text-[13.5px] leading-snug font-bold text-foreground">
          {title}
        </span>
        {subtitle ? (
          <span className="mt-1 block font-sans text-[12.5px] leading-[1.5] text-muted-foreground">
            {subtitle}
          </span>
        ) : null}
      </span>
      {meta ? <span className="shrink-0 self-center">{meta}</span> : null}
      {!plain ? (
        <ChevronRight className="mt-0.5 size-4 shrink-0 self-center text-kai-dim" aria-hidden />
      ) : null}
    </>
  )

  const classes = cn(
    "m-press flex min-h-[56px] w-full items-start gap-3 bg-card px-4 py-3.5 text-left",
    className
  )

  if (to) {
    return (
      <Link to={to} className={classes}>
        {body}
      </Link>
    )
  }
  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={classes}>
        {body}
      </a>
    )
  }
  return (
    <button type="button" onClick={onClick} className={classes}>
      {body}
    </button>
  )
}

/** Groups rows into one bordered block with hairlines between them. */
export function RowGroup({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "divide-y divide-border overflow-hidden rounded-md border border-border",
        className
      )}
    >
      {children}
    </div>
  )
}

/* ── rails ────────────────────────────────────────────────────────────────── */

/**
 * A full-bleed horizontal rail of snapping cards. Breaks out of the page
 * gutter so the next card peeks in from the edge — the cue that says "swipe".
 */
export function Rail({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("m-rail -mx-4 scroll-px-4 px-4", className)}>
      {children}
      {/* trailing spacer so the last card can snap clear of the edge */}
      <span className="w-px shrink-0" aria-hidden />
    </div>
  )
}

/** A callout: one accent rule, one line of type. */
export function Note({
  tone = "amber",
  glyph = "!",
  children,
}: {
  tone?: "amber" | "blue" | "green" | "orange"
  glyph?: string
  children: React.ReactNode
}) {
  const ring = {
    amber: "border-kai-amber/30 bg-kai-amber/[0.06] text-kai-amber",
    blue: "border-kai-blue/30 bg-kai-blue/[0.06] text-kai-blue",
    green: "border-kai-green/30 bg-kai-green/[0.06] text-kai-green",
    orange: "border-kai-orange/30 bg-kai-orange/[0.06] text-kai-orange",
  }[tone]

  return (
    <div className={cn("flex gap-2.5 rounded-md border p-3.5", ring)}>
      <span className="shrink-0 font-mono text-[12px] font-bold" aria-hidden>
        {glyph}
      </span>
      <p className="font-sans text-[12.5px] leading-[1.6] text-muted-foreground">{children}</p>
    </div>
  )
}

/** A full-width primary action. Phone buttons are 48px and stack. */
export function Action({
  to,
  href,
  children,
  variant = "primary",
  className,
}: {
  to?: string
  href?: string
  children: React.ReactNode
  variant?: "primary" | "outline"
  className?: string
}) {
  const classes = cn(
    "m-press flex h-12 w-full items-center justify-center gap-2 rounded-md font-mono text-[13.5px] font-bold",
    variant === "primary"
      ? "bg-kai-orange text-[#180c00]"
      : "border border-border bg-card text-foreground",
    className
  )

  if (to) {
    return (
      <Link to={to} className={classes}>
        {children}
      </Link>
    )
  }
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={classes}>
      {children}
    </a>
  )
}
