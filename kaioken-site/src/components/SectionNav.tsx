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
  const navRef = React.useRef<HTMLElement>(null)

  React.useEffect(() => {
    const handleScroll = () => {
      // If near the bottom of the page, activate the last section item
      const isAtBottom =
        window.innerHeight + window.scrollY >=
        document.documentElement.scrollHeight - 60

      if (isAtBottom && items.length > 0) {
        setActive(items[items.length - 1].id)
        return
      }

      // Header is 56px, SectionNav is ~42px (total 98px).
      // We look at the section header entering around 130px from top.
      const activationPoint = 130
      let currentActive = items[0]?.id ?? ""

      for (let i = 0; i < items.length; i++) {
        const el = document.getElementById(items[i].id)
        if (!el) continue
        const rect = el.getBoundingClientRect()
        if (rect.top <= activationPoint) {
          currentActive = items[i].id
        } else {
          break
        }
      }

      setActive(currentActive)
    }

    let ticking = false
    const onScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          handleScroll()
          ticking = false
        })
        ticking = true
      }
    }

    window.addEventListener("scroll", onScroll, { passive: true })
    handleScroll() // initial position check

    return () => {
      window.removeEventListener("scroll", onScroll)
    }
  }, [items])

  // Keep active tab visible in horizontal scroll if narrow
  React.useEffect(() => {
    if (!navRef.current) return
    const activeEl = navRef.current.querySelector<HTMLElement>('[aria-current="true"]')
    if (activeEl) {
      const nav = navRef.current
      const navRect = nav.getBoundingClientRect()
      const elRect = activeEl.getBoundingClientRect()
      if (elRect.left < navRect.left || elRect.right > navRect.right) {
        activeEl.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" })
      }
    }
  }, [active])

  return (
    <div
      className={cn(
        "sticky top-[56px] z-40 border-y border-border/80 bg-background/90 backdrop-blur-md shadow-sm transition-shadow",
        className
      )}
    >
      <nav
        ref={navRef}
        aria-label="Sections"
        className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 py-1.5 sm:px-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {items.map((item, i) => {
          const isActive = item.id === active
          return (
            <a
              key={item.id}
              href={`#${item.id}`}
              onClick={(e) => {
                setActive(item.id)
                scrollToAnchor(e, item.id)
              }}
              aria-current={isActive ? "true" : undefined}
              className={cn(
                "shrink-0 rounded-sm px-2.5 py-1 font-mono text-[11px] whitespace-nowrap transition-all duration-150",
                "focus-visible:ring-1 focus-visible:ring-kai-orange/60 focus-visible:outline-none",
                isActive
                  ? "border border-kai-orange/35 bg-kai-orange/15 font-semibold text-kai-amber"
                  : "border border-transparent text-kai-dim hover:bg-kai-panel hover:text-kai-text"
              )}
            >
              <span
                className={cn(
                  "mr-1.5 transition-colors",
                  isActive ? "font-bold text-kai-orange" : "text-kai-line"
                )}
              >
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
