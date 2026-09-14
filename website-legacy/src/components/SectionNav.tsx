import * as React from "react"
import { scrollToAnchor } from "@/lib/scroll"
import { cn } from "@/lib/utils"

export interface SectionNavItem {
  id: string
  label: string
}

/**
 * A sticky rail of section links with scroll-spy, for pages long enough that
 * you lose track of where you are. It parks under the fixed site header and
 * scrolls sideways on phones rather than wrapping to two rows.
 *
 * Anchors are real <a href="#id"> so middle-click and copy-link still work;
 * the smooth scroll comes from html{scroll-behavior} in index.css.
 */
export default function SectionNav({
  items,
  className,
}: {
  items: SectionNavItem[]
  className?: string
}) {
  const [active, setActive] = React.useState(items[0]?.id ?? "")

  React.useEffect(() => {
    const targets = items
      .map((i) => document.getElementById(i.id))
      .filter((el): el is HTMLElement => el !== null)
    if (!targets.length) return

    const obs = new IntersectionObserver(
      (entries) => {
        // The heading nearest the top of the band wins, so passing a short
        // section does not leave the previous one lit.
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (visible[0]) setActive(visible[0].target.id)
      },
      // a band just below the header — the section under it is "current"
      { rootMargin: "-20% 0px -70% 0px", threshold: 0 }
    )
    targets.forEach((t) => obs.observe(t))
    return () => obs.disconnect()
  }, [items])

  return (
    <div
      className={cn(
        "sticky top-14 z-30 border-y border-border bg-background/80 backdrop-blur-md",
        className
      )}
    >
      <nav
        aria-label="Sections"
        className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 py-1.5 sm:px-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {items.map((item, i) => {
          const isActive = item.id === active
          return (
            <a
              key={item.id}
              href={`#${item.id}`}
              onClick={(e) => scrollToAnchor(e, item.id)}
              aria-current={isActive ? "true" : undefined}
              className={cn(
                "shrink-0 rounded-sm px-2.5 py-1 font-mono text-[11px] whitespace-nowrap transition-colors",
                "focus-visible:ring-1 focus-visible:ring-kai-orange/60 focus-visible:outline-none",
                isActive
                  ? "bg-accent text-kai-amber"
                  : "text-kai-dim hover:bg-kai-panel hover:text-kai-text"
              )}
            >
              <span className={cn("mr-1.5", isActive ? "text-kai-orange" : "text-kai-line")}>
                {String(i + 1).padStart(2, "0")}
              </span>
              {item.label}
            </a>
          )
        })}
      </nav>
    </div>
  )
}
