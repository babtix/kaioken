import * as React from "react"
import { Link, NavLink, useLocation } from "react-router-dom"
import { Menu, X } from "lucide-react"
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
        "fixed inset-x-0 top-0 z-50 border-b transition-colors duration-300",
        scrolled || open
          ? "border-border bg-background/85 backdrop-blur-md"
          : "border-transparent bg-transparent"
      )}
    >
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4 sm:px-6">
        <Link to="/" className="group flex items-center gap-2" aria-label="kaioken home">
          <img src="/logo.svg" alt="kaioken logo" className="size-5 rounded transition-transform group-hover:scale-105" />
          <span className="font-mono text-sm font-bold tracking-tight text-foreground">
            kaioken
          </span>
          <span className="hidden font-mono text-[11px] text-kai-dim sm:inline" aria-hidden>
            ▎
          </span>
        </Link>

        <nav className="ml-2 hidden items-center gap-1 sm:flex">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  "rounded-sm px-2.5 py-1 font-mono text-[13px] transition-colors",
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
              className="rounded-sm px-2.5 py-1 font-mono text-[13px] text-muted-foreground transition-colors hover:text-foreground"
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
          <LinkButton href={GITHUB_URL} variant="outline" size="sm">
                <GithubMark />
                <span className="hidden sm:inline">GitHub</span>
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
        <nav className="border-t border-border bg-background px-4 py-2 sm:hidden">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  "block rounded-sm px-2 py-2 font-mono text-sm transition-colors",
                  isActive ? "text-kai-amber" : "text-muted-foreground hover:text-foreground"
                )
              }
            >
              /{item.label}
            </NavLink>
          ))}
          {EXTERNAL_NAV.map((item) => (
            <a
              key={item.href}
              href={item.href}
              target="_blank"
              rel="noopener noreferrer"
              className="block rounded-sm px-2 py-2 font-mono text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              /{item.label}
              <span className="ml-1 text-[10px] text-kai-dim" aria-hidden>
                ↗
              </span>
            </a>
          ))}
        </nav>
      ) : null}
    </header>
  )
}
