import * as React from "react"
import { Link, NavLink, useLocation } from "react-router-dom"
import { ArrowRight, Menu, X } from "lucide-react"
import GithubMark from "@/components/GithubMark"
import LinkButton from "@/components/LinkButton"
import { GITHUB_URL, NEWS_URL } from "@/data/content"
import { cn } from "@/lib/utils"

const NAV = [
  { to: "/", label: "home", end: true },
  { to: "/desktop", label: "desktop" },
  { to: "/docs", label: "docs" },
  { to: "/preview", label: "output" },
  { to: "/showcase", label: "showcase" },
  { to: "/next", label: "next" },
]

// External destinations rendered alongside NAV — plain anchors, not NavLinks.
const EXTERNAL_NAV = [{ href: NEWS_URL, label: "news" }]

export default function SiteHeader() {
  const [open, setOpen] = React.useState(false)
  const [scrolled, setScrolled] = React.useState(false)
  const { pathname } = useLocation()

  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  // Close the mobile menu whenever navigation actually happens.
  React.useEffect(() => setOpen(false), [pathname])

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 border-b transition-all duration-300",
        scrolled || open
          ? "border-white/10 bg-gradient-to-b from-[rgba(8,8,8,0.85)] to-[rgba(8,8,8,0.75)] backdrop-blur-2xl backdrop-saturate-200 shadow-[0_1px_0_0_rgba(255,255,255,0.06),0_4px_24px_-4px_rgba(0,0,0,0.6)]"
          : "border-transparent bg-transparent"
      )}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
        <Link to="/" className="group flex items-center gap-2.5" aria-label="kaioken home">
          <img
            src="/logo.svg"
            alt="kaioken logo"
            className="size-5 rounded transition-transform duration-200 group-hover:scale-110"
          />
          <span className="font-mono text-sm font-bold tracking-tight text-foreground">
            kaioken
          </span>
          <span className="hidden font-mono text-[11px] text-kai-dim sm:inline" aria-hidden>
            ▎
          </span>
        </Link>

        <nav className="ml-2 hidden items-center gap-0.5 sm:flex">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  "relative rounded-sm px-2.5 py-1.5 font-mono text-[13px] transition-colors",
                  isActive
                    ? "text-kai-amber"
                    : "text-muted-foreground hover:text-foreground"
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span className={cn("mr-0.5", isActive ? "text-kai-orange" : "text-transparent")}>
                    /
                  </span>
                  {item.label}
                  {/* Active underline indicator */}
                  {isActive && (
                    <span
                      className="absolute inset-x-2 bottom-0 h-px bg-kai-orange/60 animate-rise"
                      aria-hidden
                    />
                  )}
                </>
              )}
            </NavLink>
          ))}
          {EXTERNAL_NAV.map((item) => (
            <a
              key={item.href}
              href={item.href}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-sm px-2.5 py-1.5 font-mono text-[13px] text-muted-foreground transition-colors hover:text-foreground"
            >
              <span className="mr-0.5 text-transparent">/</span>
              {item.label}
              <span className="ml-1 text-[10px] text-kai-dim" aria-hidden>
                ↗
              </span>
            </a>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {/* GitHub star badge */}
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="hidden items-center gap-1.5 rounded-sm border border-border bg-card px-2.5 py-1.5 font-mono text-[12px] text-muted-foreground transition-all duration-200 hover:border-kai-orange/40 hover:text-kai-orange sm:flex"
            aria-label="Star on GitHub"
          >
            <GithubMark className="size-3.5" />
            <span className="text-kai-amber">★</span>
            <span>GitHub</span>
          </a>

          {/* Primary CTA */}
          <LinkButton to="/docs/install" size="sm" className="btn-glow hidden sm:flex">
            Get started
            <ArrowRight className="size-3.5" data-icon="inline-end" />
          </LinkButton>

          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            className="rounded-sm p-1.5 text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:hidden"
          >
            {open ? <X className="size-4" /> : <Menu className="size-4" />}
          </button>
        </div>
      </div>

      {open ? (
        <nav className="border-t border-border bg-background/95 backdrop-blur-md px-4 py-3 sm:hidden">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2 rounded-sm px-2 py-2.5 font-mono text-sm transition-colors",
                  isActive ? "text-kai-amber" : "text-muted-foreground hover:text-foreground"
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span className={isActive ? "text-kai-orange" : "text-kai-dim"}>/</span>
                  {item.label}
                </>
              )}
            </NavLink>
          ))}
          {EXTERNAL_NAV.map((item) => (
            <a
              key={item.href}
              href={item.href}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-sm px-2 py-2.5 font-mono text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <span className="text-kai-dim">/</span>
              {item.label}
              <span className="ml-1 text-[10px] text-kai-dim" aria-hidden>
                ↗
              </span>
            </a>
          ))}
          <div className="mt-3 border-t border-border pt-3">
            <LinkButton to="/docs/install" size="sm" className="btn-glow w-full justify-center">
              Get started
              <ArrowRight className="size-3.5" data-icon="inline-end" />
            </LinkButton>
          </div>
        </nav>
      ) : null}
    </header>
  )
}
