import { cn } from "@/lib/utils"

interface SectionHeadingProps {
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
      {/* Eyebrow pill */}
      <div
        className={cn(
          "inline-flex items-center gap-2 rounded-full border border-border/70 bg-kai-panel/60 px-3 py-1",
          align === "center" && "mx-auto"
        )}
      >
        <span className="text-kai-orange text-[10px]" aria-hidden>
          ▎
        </span>
        {index ? (
          <span className="font-mono text-[11px] font-bold text-kai-amber">{index}</span>
        ) : null}
        <span className="font-mono text-[11px] tracking-[0.2em] text-muted-foreground uppercase">
          {eyebrow}
        </span>
      </div>

      <h2
        className={cn(
          "mt-4 text-balance font-mono font-bold tracking-tight text-foreground",
          "text-3xl sm:text-4xl"
        )}
      >
        {title}
      </h2>
      {description ? (
        <p
          className={cn(
            "mt-4 font-sans text-[15px] leading-relaxed text-muted-foreground sm:text-base",
            align === "center" && "mx-auto"
          )}
        >
          {description}
        </p>
      ) : null}
    </div>
  )
}
