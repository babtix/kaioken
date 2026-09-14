import * as React from "react"
import { Navigate, Route, Routes, useLocation } from "react-router-dom"
import PageBackground from "@/components/PageBackground"
import TopBar from "@/mobile/components/TopBar"
import TabBar from "@/mobile/components/TabBar"
import { ChromeProvider } from "@/mobile/lib/chrome"
import Home from "@/mobile/screens/Home"

/* Only Home is eager. Every other screen is a tap away, and a phone should not
   download the 71-document manifest or react-markdown to read the landing page. */
const DesktopScreen = React.lazy(() => import("@/mobile/screens/DesktopScreen"))
const DocsIndex = React.lazy(() => import("@/mobile/screens/DocsIndex"))
const DocScreen = React.lazy(() => import("@/mobile/screens/DocScreen"))
const Output = React.lazy(() => import("@/mobile/screens/Output"))
const OutputDoc = React.lazy(() => import("@/mobile/screens/OutputDoc"))
const Showcase = React.lazy(() => import("@/mobile/screens/Showcase"))
const Next = React.lazy(() => import("@/mobile/screens/Next"))
const More = React.lazy(() => import("@/mobile/screens/More"))

/** The same backdrop the desktop site paints, on the same two-tier rule: the
 *  shopfront screens get the full phosphor treatment — character grid, three
 *  drifting blooms, scanlines — and the reading surfaces get the quiet one. */
const FULL_BACKDROP = ["/", "/desktop"]

function RouteBackdrop() {
  const { pathname } = useLocation()
  return <PageBackground variant={FULL_BACKDROP.includes(pathname) ? "full" : "simple"} />
}

/** A route change lands at the top — a phone has no scroll position worth
 *  keeping between two different screens. */
function ScrollToTop() {
  const { pathname } = useLocation()
  React.useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior })
  }, [pathname])
  return null
}

function ScreenFallback() {
  return (
    <p className="px-4 pt-10 font-mono text-[12.5px] text-kai-dim">
      <span className="animate-caret text-kai-orange">▎</span> loading…
    </p>
  )
}

/**
 * The phone site.
 *
 * A fixed bar top and bottom with one scrolling column between them — the shape
 * of an app, not of a page. Routes mirror the desktop site exactly, so every
 * link that has ever been shared still lands somewhere real.
 */
export default function MobileApp() {
  return (
    <ChromeProvider>
      {/* overflow-x-hidden as a backstop: if any element ever renders wider
          than the viewport, it clips here instead of expanding the document
          and pushing content behind the fixed top/tab bars */}
      <div className="min-h-screen overflow-x-hidden text-foreground">
        <ScrollToTop />
        <RouteBackdrop />
        <TopBar />

        <main className="m-top-inset m-bottom-inset">
          <React.Suspense fallback={<ScreenFallback />}>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/desktop" element={<DesktopScreen />} />
              <Route path="/docs" element={<DocsIndex />} />
              <Route path="/docs/:slug" element={<DocScreen />} />
              <Route path="/preview" element={<Output />} />
              <Route path="/preview/:section/:doc" element={<OutputDoc />} />
              <Route path="/showcase" element={<Showcase />} />
              <Route path="/next" element={<Next />} />
              <Route path="/more" element={<More />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </React.Suspense>
        </main>

        <TabBar />
      </div>
    </ChromeProvider>
  )
}
