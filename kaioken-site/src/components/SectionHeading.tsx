import * as React from "react"
import { cn } from "@/lib/utils"

export interface SectionHeadingProps {
  /** two-digit index rendered like a terminal gutter */
  index?: string
  eyebrow: string
  title: React.ReactNode
  description?: React.ReactNode
  align?: "left" | "center"
  className?: string
}

export default function SectionHeading({
  index,
  eyebrow,
  title,
  description,
  align = "left",
  className,
}: SectionHeadingProps) {
  return (
    <div className={cn("max-w-3xl", align === "center" && "mx-auto text-center", className)}>
      {/* Home page technical eyebrow */}
      <div
        className={cn(
          "flex items-center gap-2 font-mono text-[11px] tracking-[0.14em] uppercase",
          align === "center" && "justify-center"
        )}
      >
        <span className="font-bold text-[var(--accent)]">
          {index ? (index.startsWith('§') ? index : `§${index}`) : '▎'}
        </span>
        <span className="text-[var(--fg-mute)]">{eyebrow}</span>
      </div>

      <h2
        className={cn(
          "mt-2 text-balance font-sans font-semibold tracking-[-0.03em] text-[var(--fg)]",
          "text-xl sm:text-2xl lg:text-3xl"
        )}
      >
        {title}
      </h2>
      {description ? (
        <p
          className={cn(
            "mt-1.5 font-sans text-[13.5px] leading-relaxed text-[var(--fg-2)] sm:text-sm",
            align === "center" && "mx-auto"
          )}
        >
          {description}
        </p>
      ) : null}
    </div>
  )
}

export function StickySectionHeader({
  containerClassName,
  ...props
}: SectionHeadingProps & { containerClassName?: string }) {
  return (
    <div
      className={cn(
        "sticky top-[95px] z-30 border-b border-border/70 bg-background/95 py-3.5 backdrop-blur-md shadow-sm transition-all",
        containerClassName
      )}
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHeading {...props} />
      </div>
    </div>
  )
}
