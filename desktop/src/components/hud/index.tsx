import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

/**
 * HUD primitives — the gaming half of the visual language.
 *
 * The restraint here is deliberate. A heads-up display works because it is
 * mostly empty: the glow means something precisely because most of the screen
 * is not glowing. Each of these components marks state (live, armed, costly)
 * rather than decorating a surface, and none of them animate unless something
 * is genuinely happening.
 */

/** HudPanel is a framed surface: border, inner highlight, corner brackets. */
export function HudPanel({
  children,
  className,
  corners = true,
  live = false,
  scanlines = false,
}: {
  children: ReactNode
  className?: string
  /** Corner brackets. Off for panels nested inside another framed panel —
   *  brackets inside brackets read as noise. */
  corners?: boolean
  /** Rim glow, for a panel whose contents are currently active. */
  live?: boolean
  scanlines?: boolean
}) {
  return (
    <div
      className={cn(
        "hud-panel rounded-[var(--radius)]",
        corners && "hud-corners",
        live && "hud-rim",
        scanlines && "hud-scanlines",
        className
      )}
    >
      {children}
    </div>
  )
}

/**
 * PowerMeter renders the Kaioken ×N multiplier as a segmented gauge.
 *
 * This is the one place the Dragon Ball conceit earns its keep: N is not a
 * theme, it is what the engine actually spends — more subquestions, more
 * queries, more pages, more rounds. Showing it as a power level that fills up
 * and turns red at the top is an honest cost signal wearing a game's clothes.
 */
export function PowerMeter({
  value,
  max = 10,
  hotFrom = 7,
  className,
  showLabel = true,
}: {
  value: number
  max?: number
  /** Segments at or above this index render in the danger colour. */
  hotFrom?: number
  className?: string
  showLabel?: boolean
}) {
  const clamped = Math.max(1, Math.min(value, max))
  return (
    <div className={cn("flex items-center gap-2", className)}>
      {showLabel && (
        <span className="font-mono text-[11px] font-bold tabular-nums text-kai-orange">
          ×{clamped}
        </span>
      )}
      <div
        className="flex h-2 flex-1 gap-px overflow-hidden rounded-[2px] bg-kai-line/40"
        role="meter"
        aria-valuenow={clamped}
        aria-valuemin={1}
        aria-valuemax={max}
        aria-label={`Power level ${clamped} of ${max}`}
      >
        {Array.from({ length: max }, (_, i) => (
          <span
            key={i}
            className="power-seg"
            data-on={i < clamped}
            data-hot={i + 1 >= hotFrom}
          />
        ))}
      </div>
    </div>
  )
}

/**
 * LiveDot marks a process actually in flight. The pulse is the signal, so it
 * is never rendered for an idle or finished state.
 */
export function LiveDot({ label, className }: { label?: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <span className="relative flex size-1.5">
        <span className="animate-energy absolute inline-flex size-full rounded-full bg-kai-green" />
        <span className="relative inline-flex size-1.5 rounded-full bg-kai-green" />
      </span>
      {label && <span className="font-mono text-[10px] text-kai-sage">{label}</span>}
    </span>
  )
}

/**
 * GlowButton is the primary action. The aura sweep runs only while `busy`,
 * because a button that shimmers at rest is asking for attention it has not
 * earned.
 */
export function GlowButton({
  children,
  onClick,
  busy = false,
  disabled = false,
  className,
  type = "button",
}: {
  children: ReactNode
  onClick?: () => void
  busy?: boolean
  disabled?: boolean
  className?: string
  type?: "button" | "submit"
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || busy}
      className={cn(
        // No overflow-hidden here: it clips descendants to the padding box,
        // which is exactly where the corner brackets live. The sweep gets its
        // own clipping wrapper below instead.
        "hud-corners relative rounded-[var(--radius)] border px-4 py-2",
        "font-mono text-xs font-semibold tracking-wide uppercase",
        "transition-all duration-150 outline-none",
        "focus-visible:ring-2 focus-visible:ring-kai-orange/60",
        disabled
          ? "cursor-not-allowed border-border bg-muted text-kai-dim"
          : "border-kai-orange/40 bg-kai-orange/10 text-kai-orange hover:bg-kai-orange hover:text-[var(--primary-foreground)] hud-glow",
        className
      )}
    >
      {busy && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 overflow-hidden rounded-[var(--radius)]"
        >
          <span
            className="animate-aura absolute inset-y-0 -left-1/3 w-1/3
                       bg-gradient-to-r from-transparent via-kai-amber/25 to-transparent"
          />
        </span>
      )}
      <span className="relative">{children}</span>
    </button>
  )
}

/** SectionLabel is the small uppercase rule used to head a HUD block. */
export function SectionLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <span className="font-mono text-[10px] font-semibold tracking-[0.14em] text-kai-dim uppercase">
        {children}
      </span>
      <span className="h-px flex-1 bg-border" />
    </div>
  )
}
