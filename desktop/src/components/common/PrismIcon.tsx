import React from "react"
import type { LucideProps } from "lucide-react"

export const PrismIcon = React.forwardRef<SVGSVGElement, LucideProps>(
  ({ size = 16, className, ...props }, ref) => {
    return (
      <svg
        ref={ref}
        width={size}
        height={size}
        viewBox="0 0 512 512"
        fill="currentColor"
        xmlns="http://www.w3.org/2000/svg"
        className={className}
        {...props}
      >
        <path d="M256,16,16,352,256,496,496,352Zm-20,96.82V437.35L73.73,340Z" />
      </svg>
    )
  }
)

PrismIcon.displayName = "PrismIcon"

export default PrismIcon
