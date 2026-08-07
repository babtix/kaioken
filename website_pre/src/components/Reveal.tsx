import * as React from "react"
import { useInView } from "@/lib/motion"
import { cn } from "@/lib/utils"

/**
 * Settles its children into place the first time they scroll into view, then
 * stays put — content that re-animates every time you scroll past it is a
 * page that will not let you re-read it.
 *
 * The reduced-motion case is handled in CSS (.reveal collapses to the finished
 * state), so nothing here needs to branch on it.
 */
export default function Reveal({
  children,
  delay = 0,
  className,
  as: Tag = "div",
  ...rest
}: {
  children: React.ReactNode
  /** seconds to hold before settling — stagger siblings with it */
  delay?: number
  className?: string
  as?: "div" | "section"
} & React.HTMLAttributes<HTMLElement>) {
  const ref = React.useRef<HTMLDivElement>(null)
  const inView = useInView(ref, "-40px")
  const [shown, setShown] = React.useState(false)

  React.useEffect(() => {
    if (inView) setShown(true)
  }, [inView])

  return (
    <Tag
      ref={ref as React.Ref<HTMLDivElement>}
      className={cn("reveal", shown && "reveal-in", className)}
      style={delay ? { transitionDelay: `${delay}s` } : undefined}
      {...rest}
    >
      {children}
    </Tag>
  )
}
