import * as React from "react"
import { Link } from "react-router-dom"
import { AlertTriangle, ArrowLeft, ArrowRight, Info, Lightbulb } from "lucide-react"
import { DOC_ORDER } from "@/data/docs-nav"
import { cn } from "@/lib/utils"

/* Small typographic primitives so each doc page stays readable as JSX. */

export function H2({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2
      id={id}
      className="scroll-mt-24 pt-10 font-mono text-xl font-bold text-foreground first:pt-0"
    >
      <span className="mr-2 text-kai-orange" aria-hidden>
        ##
      </span>
      {children}
    </h2>
  )
}

export function H3({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="pt-6 font-mono text-[15px] font-bold text-kai-amber">{children}</h3>
  )
}

export function P({ children }: { children: React.ReactNode }) {
  return (
    <p className="pt-4 font-sans text-[15px] leading-[1.75] text-muted-foreground">{children}</p>
  )
}

export function UL({ children }: { children: React.ReactNode }) {
  return <ul className="space-y-2 pt-4">{children}</ul>
}

export function LI({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2.5 font-sans text-[15px] leading-[1.7] text-muted-foreground">
      <span className="mt-[7px] size-1 shrink-0 rounded-full bg-kai-orange" aria-hidden />
      <span className="min-w-0">{children}</span>
    </li>
  )
}

/** Numbered steps, rendered with a terminal gutter instead of list markers. */
export function Steps({ items }: { items: React.ReactNode[] }) {
  return (
    <ol className="space-y-3 pt-4">
      {items.map((item, i) => (
        <li key={i} className="flex gap-3">
          <span className="mt-px shrink-0 font-mono text-[12px] font-bold text-kai-orange">
            {String(i + 1).padStart(2, "0")}
          </span>
          <span className="min-w-0 font-sans text-[15px] leading-[1.7] text-muted-foreground">
            {item}
          </span>
        </li>
      ))}
    </ol>
  )
}

export function C({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded-sm bg-kai-panel px-1.5 py-0.5 font-mono text-[13px] text-kai-amber">
      {children}
    </code>
  )
}

const CALLOUT = {
  note: { icon: Info, ring: "border-kai-blue/35 bg-kai-blue/[0.06]", text: "text-kai-blue" },
  tip: { icon: Lightbulb, ring: "border-kai-green/35 bg-kai-green/[0.06]", text: "text-kai-green" },
  warn: {
    icon: AlertTriangle,
    ring: "border-kai-amber/40 bg-kai-amber/[0.06]",
    text: "text-kai-amber",
  },
}

export function Callout({
  kind = "note",
  title,
  children,
}: {
  kind?: keyof typeof CALLOUT
  title: string
  children: React.ReactNode
}) {
  const style = CALLOUT[kind]
  const Glyph = style.icon
  return (
    <div className={cn("mt-6 rounded-sm border p-4", style.ring)}>
      <div className="flex items-center gap-2">
        <Glyph className={cn("size-3.5", style.text)} />
        <span className={cn("font-mono text-[12.5px] font-bold", style.text)}>{title}</span>
      </div>
      <div className="mt-2 font-sans text-[14px] leading-[1.7] text-muted-foreground">
        {children}
      </div>
    </div>
  )
}

/** Wraps a doc page: title block, body, and prev/next derived from DOC_ORDER. */
export function DocPage({
  title,
  lead,
  children,
}: {
  title: string
  lead: string
  children: React.ReactNode
}) {
  const index = DOC_ORDER.findIndex((d) => d.label === title)
  const prev = index > 0 ? DOC_ORDER[index - 1] : undefined
  const next = index >= 0 && index < DOC_ORDER.length - 1 ? DOC_ORDER[index + 1] : undefined

  return (
    <article className="min-w-0 pb-16">
      <header className="border-b border-border pb-6">
        <p className="font-mono text-[11px] tracking-[0.25em] text-kai-dim uppercase">
          <span className="text-kai-orange">▎</span> docs
        </p>
        <h1 className="mt-3 font-mono text-3xl font-bold tracking-tight text-foreground">
          {title}
        </h1>
        <p className="mt-3 max-w-2xl font-sans text-[15px] leading-relaxed text-muted-foreground">
          {lead}
        </p>
      </header>

      <div className="pt-2">{children}</div>

      {(prev || next) && (
        <nav className="mt-14 grid gap-3 border-t border-border pt-6 sm:grid-cols-2">
          {prev ? (
            <Link
              to={prev.to}
              className="group rounded-sm border border-border bg-card p-4 transition-colors hover:border-kai-orange/45"
            >
              <span className="flex items-center gap-1.5 font-mono text-[11px] text-kai-dim">
                <ArrowLeft className="size-3" />
                previous
              </span>
              <span className="mt-1 block font-mono text-[14px] font-bold text-foreground transition-colors group-hover:text-kai-orange">
                {prev.label}
              </span>
            </Link>
          ) : (
            <span />
          )}
          {next ? (
            <Link
              to={next.to}
              className="group rounded-sm border border-border bg-card p-4 text-right transition-colors hover:border-kai-orange/45 sm:col-start-2"
            >
              <span className="flex items-center justify-end gap-1.5 font-mono text-[11px] text-kai-dim">
                next
                <ArrowRight className="size-3" />
              </span>
              <span className="mt-1 block font-mono text-[14px] font-bold text-foreground transition-colors group-hover:text-kai-orange">
                {next.label}
              </span>
            </Link>
          ) : null}
        </nav>
      )}
    </article>
  )
}
