import * as React from "react"
import { cn } from "@/lib/utils"

interface TerminalWindowProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string
  /** shown right-aligned in the title bar, e.g. a branch or model id */
  meta?: React.ReactNode
  /** CRT line texture over the body */
  scanlines?: boolean
  bodyClassName?: string
  children: React.ReactNode
}

/**
 * The chrome every code / output sample on the site sits in. Square corners and
 * a flat title bar — a terminal is not a rounded card.
 */
export default function TerminalWindow({
  title = "kaioken",
  meta,
  scanlines = false,
  className,
  bodyClassName,
  children,
  ...props
}: TerminalWindowProps) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-sm border border-white/[0.07] glass-deep",
        "shadow-[0_24px_60px_-24px_#000,inset_0_1px_0_rgba(255,255,255,0.05)]",
        className
      )}
      {...props}
    >
      <div className="flex items-center gap-2 border-b border-white/[0.06] bg-kai-panel/80 px-3 py-2">
        {/* the only place raw red/green appear at full strength */}
        <span className="size-2.5 rounded-[1px] bg-kai-red/70" />
        <span className="size-2.5 rounded-[1px] bg-kai-amber/70" />
        <span className="size-2.5 rounded-[1px] bg-kai-green/70" />
        <span className="ml-2 truncate font-mono text-[11px] text-muted-foreground">
          {title}
        </span>
        {meta ? (
          <span className="ml-auto shrink-0 truncate font-mono text-[11px] text-kai-dim">
            {meta}
          </span>
        ) : null}
      </div>
      <div className={cn("relative", scanlines && "crt-scanlines")}>
        <div className={cn("overflow-x-auto p-4 font-mono text-[13px] leading-relaxed", bodyClassName)}>
          {children}
        </div>
      </div>
    </div>
  )
}
