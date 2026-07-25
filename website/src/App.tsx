import * as React from "react"
import { Navigate, Route, Routes, useLocation } from "react-router-dom"
import SiteHeader from "@/components/SiteHeader"
import SiteFooter from "@/components/SiteFooter"
import Home from "@/pages/Home"
import Next from "@/pages/Next"
import Showcase from "@/pages/Showcase"
import DocsLayout from "@/pages/docs/DocsLayout"
import DocsIndex from "@/pages/docs/DocsIndex"
import Install from "@/pages/docs/Install"
import Tui from "@/pages/docs/Tui"
import CommandsDoc from "@/pages/docs/CommandsDoc"
import Wiki from "@/pages/docs/Wiki"
import Cards from "@/pages/docs/Cards"
import Skills from "@/pages/docs/Skills"
import Update from "@/pages/docs/Update"
import Config from "@/pages/docs/Config"
import OutputDoc from "@/pages/docs/OutputDoc"

// The preview pulls in react-markdown and the 71-document manifest, and mermaid
// on top of that — none of which the landing page should pay for.
const PreviewLayout = React.lazy(() => import("@/pages/preview/PreviewLayout"))
const PreviewIndex = React.lazy(() => import("@/pages/preview/PreviewIndex"))
const PreviewDoc = React.lazy(() => import("@/pages/preview/PreviewDoc"))

/** Route changes should land at the top, except when targeting an anchor. */
function ScrollToTop() {
  const { pathname, hash } = useLocation()
  React.useEffect(() => {
    if (hash) return
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior })
  }, [pathname, hash])
  return null
}

function RouteFallback() {
  return (
    <div className="mx-auto max-w-6xl px-4 pt-32 sm:px-6">
      <p className="font-mono text-[13px] text-kai-dim">
        <span className="text-kai-orange">▎</span> loading…
      </p>
    </div>
  )
}

export default function App() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <ScrollToTop />
      <SiteHeader />
      <main className="flex-1">
        <React.Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/showcase" element={<Showcase />} />
            <Route path="/next" element={<Next />} />
            <Route path="/docs" element={<DocsLayout />}>
              <Route index element={<DocsIndex />} />
              <Route path="install" element={<Install />} />
              <Route path="tui" element={<Tui />} />
              <Route path="commands" element={<CommandsDoc />} />
              <Route path="wiki" element={<Wiki />} />
              <Route path="cards" element={<Cards />} />
              <Route path="skills" element={<Skills />} />
              <Route path="update" element={<Update />} />
              <Route path="config" element={<Config />} />
              <Route path="output" element={<OutputDoc />} />
            </Route>
            <Route path="/preview" element={<PreviewLayout />}>
              <Route index element={<PreviewIndex />} />
              <Route path=":section/:doc" element={<PreviewDoc />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </React.Suspense>
      </main>
      <SiteFooter />
    </div>
  )
}
