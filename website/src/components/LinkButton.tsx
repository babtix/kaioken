import * as React from "react"
import { Link } from "react-router-dom"
import type { VariantProps } from "class-variance-authority"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type Variants = VariantProps<typeof buttonVariants>

interface LinkButtonProps extends Variants {
  /** internal route — renders a react-router Link */
  to?: string
  /** external URL — renders an anchor that opens in a new tab */
  href?: string
  className?: string
  children: React.ReactNode
}

/**
 * A link styled as a button. Base UI's Button expects a real <button>, so
 * putting an anchor in its `render` prop strips native button semantics and
 * warns. Applying buttonVariants to the anchor directly is the supported
 * shadcn pattern and keeps the correct element in the accessibility tree.
 */
export default function LinkButton({
  to,
  href,
  variant,
  size,
  className,
  children,
}: LinkButtonProps) {
  const classes = cn(buttonVariants({ variant, size }), "rounded-sm font-mono", className)

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
