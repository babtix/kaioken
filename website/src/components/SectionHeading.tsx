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
      <div
        className={cn(
          "flex items-center gap-2 font-mono text-[11px] tracking-[0.25em] uppercase",
          align === "center" && "justify-center"
        )}
      >
        <span className="text-kai-orange" aria-hidden>
          ▎
        </span>
        {index ? <span className="text-kai-amber">{index}</span> : null}
        <span className="text-muted-foreground">{eyebrow}</span>
      </div>
      <h2 className="mt-3 text-balance font-mono text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
        {title}
      </h2>
      {description ? (
        <p
          className={cn(
            "mt-4 font-sans text-[15px] leading-relaxed text-muted-foreground",
            align === "center" && "mx-auto"
          )}
        >
          {description}
        </p>
      ) : null}
    </div>
  )
}
