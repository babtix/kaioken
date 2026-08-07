import type * as React from "react"

/**
 * Scrolls to a same-page anchor without letting the browser perform a real
 * fragment navigation.
 *
 * A plain <a href="#id"> click changes the history entry, which App's
 * ScrollToTop observes through useLocation — and the two scrolls race, so the
 * click occasionally lands at the top of the page instead of the section.
 * Scrolling ourselves and rewriting the hash in place removes the race while
 * keeping the anchor a real link for middle-click, copy-link and keyboards.
 *
 * scrollIntoView honours scroll-margin-top, so sections still clear the fixed
 * header and the sticky section nav.
 */
export function scrollToAnchor(e: React.MouseEvent<HTMLAnchorElement>, id: string) {
  // let the browser handle modified clicks — those mean "open elsewhere"
  if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) {
    return
  }
  const el = document.getElementById(id)
  if (!el) return

  e.preventDefault()
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches
  el.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" })
  window.history.replaceState(null, "", `#${id}`)
}
