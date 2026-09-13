import { cn } from "@/lib/utils"

export default function PageBackground({
  className,
}: {
  className?: string
  variant?: "full" | "simple"
}) {
  return (
    <div
      aria-hidden
      className={cn("pointer-events-none fixed inset-0 -z-10 overflow-hidden", className)}
    >
      <div className="tech-grid-bg absolute inset-0" />
    </div>
  )
}
