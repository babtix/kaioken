import * as React from "react"
import { Link, useLocation } from "react-router-dom"
import { ChevronLeft, Terminal } from "lucide-react"
import GithubMark from "@/components/GithubMark"
import { GITHUB_URL } from "@/data/content"
import { parentPath, useChromeTitle } from "@/mobile/lib/chrome"
import { cn } from "@/lib/utils"

/**
 * The fixed top bar: brand on a top-level screen, back arrow and document title
 * on a detail one. Transparent until the page moves, so the hero reads full
 * height and the bar only asserts itself once there is content behind it.
 */
export default function TopBar() {
  const { pathname } = useLocation()
  const title = useChromeTitle()
  const back = parentPath(pathname)
  const [scrolled, setScrolled] = React.useState(false)

  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4)
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  const detail = Boolean(back)

  return (
    <header
      className={cn(
        "m-safe-top fixed inset-x-0 top-0 z-40 border-b transition-colors duration-200",
        scrolled || detail ? "m-bar-blur border-border" : "border-transparent"
      )}
    >
      <div className="flex h-[3.25rem] items-center gap-1 pr-1 pl-1">
        {detail ? (
          <>
            {/* Up to the parent list, not history-back: a document reached from
                a shared link has no history to go back into, and the OS gesture
                already covers "the previous thing I looked at". */}
            <Link
              to={back!}
              aria-label={`Back to ${back!.slice(1)}`}
              className="m-press flex size-11 shrink-0 items-center justify-center rounded-md text-kai-orange"
            >
              <ChevronLeft className="size-5" />
            </Link>
            <span className="min-w-0 flex-1 truncate font-mono text-[13px] font-bold text-foreground">
              {title ?? "kaioken"}
            </span>
          </>
        ) : (
          <Link
            to="/"
            className="m-press flex min-h-11 items-center gap-2 rounded-md px-2.5"
            aria-label="kaioken home"
          >
            <Terminal className="size-4 text-kai-orange" aria-hidden />
            <span className="font-mono text-[15px] font-bold tracking-tight text-foreground">
              kaioken
            </span>
            <span className="animate-caret font-mono text-[13px] text-kai-orange" aria-hidden>
              ▎
            </span>
          </Link>
        )}

        <a
          href={GITHUB_URL}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Source on GitHub"
          className="m-press ml-auto flex size-11 shrink-0 items-center justify-center rounded-md text-muted-foreground"
        >
          <GithubMark className="size-[18px]" />
        </a>
      </div>
    </header>
  )
}
