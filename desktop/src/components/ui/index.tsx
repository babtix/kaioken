import * as React from "react"
import { Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

// Small shared primitives. Kept in one file deliberately: they are a handful
// of lines each and the app is better served by one import than by eight
// files that each export a single styled div.

// ── Button ────────────────────────────────────────────────────────────────

type ButtonVariant = "primary" | "ghost" | "danger" | "subtle"
type ButtonSize = "sm" | "md"

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "border border-kai-orange/40 bg-accent text-kai-orange hover:border-kai-orange/70 hover:bg-accent/70",
  subtle:
    "border border-border bg-card text-kai-muted hover:border-kai-line hover:text-kai-text",
  ghost: "text-kai-dim hover:bg-panel hover:text-kai-text",
  danger:
    "border border-kai-rose/40 bg-kai-rose/10 text-kai-rose hover:bg-kai-rose/20",
}

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: "h-7 gap-1.5 px-2.5 text-[11px]",
  md: "h-9 gap-2 px-3.5 text-xs",
}

export const Button = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: ButtonVariant
    size?: ButtonSize
    loading?: boolean
  }
>(function Button(
  { variant = "subtle", size = "md", loading = false, className, children, disabled, ...props },
  ref
) {
  return (
    <button
      ref={ref}
      {...props}
      disabled={disabled || loading}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-md font-mono font-medium",
        "transition-colors duration-150 outline-none",
        "focus-visible:ring-2 focus-visible:ring-kai-orange/60",
        "disabled:pointer-events-none disabled:opacity-40",
        BUTTON_SIZES[size],
        BUTTON_VARIANTS[variant],
        className
      )}
    >
      {loading && <Loader2 size={size === "sm" ? 11 : 13} className="animate-spin" />}
      {children}
    </button>
  )
})

// ── Badge ─────────────────────────────────────────────────────────────────

type BadgeTone = "neutral" | "orange" | "amber" | "green" | "rose" | "blue" | "sage"

const BADGE_TONES: Record<BadgeTone, string> = {
  neutral: "border-border bg-panel text-kai-muted",
  orange: "border-kai-orange/30 bg-kai-orange/10 text-kai-orange",
  amber: "border-kai-amber/30 bg-kai-amber/10 text-kai-amber",
  green: "border-kai-green/30 bg-kai-green/10 text-kai-green",
  rose: "border-kai-rose/30 bg-kai-rose/10 text-kai-rose",
  blue: "border-kai-blue/30 bg-kai-blue/10 text-kai-blue",
  sage: "border-kai-sage/30 bg-kai-sage/10 text-kai-sage",
}

export function Badge({
  tone = "neutral",
  className,
  children,
}: {
  tone?: BadgeTone
  className?: string
  children: React.ReactNode
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded border px-1.5 py-px font-mono text-[10px] leading-4",
        BADGE_TONES[tone],
        className
      )}
    >
      {children}
    </span>
  )
}

// ── Kbd ───────────────────────────────────────────────────────────────────

export function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        "inline-flex h-[18px] min-w-[18px] items-center justify-center rounded border border-border",
        "bg-panel px-1 font-mono text-[10px] text-kai-amber shadow-[0_1px_0_#00000060]",
        className
      )}
    >
      {children}
    </kbd>
  )
}

// ── Spinner / Skeleton ────────────────────────────────────────────────────

export function Spinner({ size = 14, className }: { size?: number; className?: string }) {
  return <Loader2 size={size} className={cn("animate-spin text-kai-orange", className)} />
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton rounded", className)} />
}

// ── Card ──────────────────────────────────────────────────────────────────

export function Card({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      className={cn(
        "rounded-lg border border-border bg-card shadow-[0_1px_3px_rgba(0,0,0,0.25)]",
        "transition-colors duration-150",
        className
      )}
    >
      {children}
    </div>
  )
}

/** Small uppercase section label — the app's recurring heading treatment. */
export function SectionLabel({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <h2
      className={cn(
        "font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-kai-dim",
        className
      )}
    >
      {children}
    </h2>
  )
}

// ── Segmented control ─────────────────────────────────────────────────────

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string; count?: number }[]
  className?: string
}) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-0.5 rounded-md border border-border bg-card p-0.5",
        className
      )}
    >
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded px-2.5 py-1 font-mono text-[11px] transition-colors outline-none",
            "focus-visible:ring-2 focus-visible:ring-kai-orange/60",
            value === o.value
              ? "bg-accent text-kai-orange"
              : "text-kai-dim hover:text-kai-text"
          )}
        >
          {o.label}
          {o.count !== undefined && (
            <span className="ml-1.5 text-kai-dim">{o.count}</span>
          )}
        </button>
      ))}
    </div>
  )
}

// ── Progress bar ──────────────────────────────────────────────────────────

/** Determinate when total > 0, indeterminate sweep otherwise — the wiki
 *  pipeline does not know its section count until the outline exists. */
export function ProgressBar({
  done,
  total,
  className,
}: {
  done: number
  total: number
  className?: string
}) {
  const determinate = total > 0
  const pct = determinate ? Math.min(100, Math.round((done / total) * 100)) : 0
  return (
    <div className={cn("h-1 overflow-hidden rounded-full bg-panel", className)}>
      {determinate ? (
        <div
          className="h-full rounded-full bg-kai-orange transition-[width] duration-300 ease-out"
          style={{ width: `${pct}%` }}
        />
      ) : (
        <div className="animate-indeterminate h-full w-1/4 rounded-full bg-kai-orange/70" />
      )}
    </div>
  )
}

// ── Modal ─────────────────────────────────────────────────────────────────

/** Centred dialog with a scrim, Escape-to-close, and a focus trap. */
export function Modal({
  open,
  onClose,
  labelledBy,
  className,
  children,
}: {
  open: boolean
  onClose: () => void
  labelledBy?: string
  className?: string
  children: React.ReactNode
}) {
  const ref = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (!open) return
    const previouslyFocused = document.activeElement as HTMLElement | null

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault()
        onClose()
        return
      }
      if (e.key !== "Tab" || !ref.current) return
      const focusables = ref.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
      if (focusables.length === 0) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("keydown", onKeyDown)
      previouslyFocused?.focus?.()
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="animate-fade fixed inset-0 z-50 flex items-center justify-center p-6">
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-md"
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className={cn(
          "animate-pop relative flex max-h-full w-full max-w-lg flex-col overflow-hidden",
          "rounded-lg border border-border bg-card shadow-2xl",
          className
        )}
      >
        {children}
      </div>
    </div>
  )
}
