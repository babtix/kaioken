import * as React from "react"
import { useLayout } from "@/lib/viewport"

/**
 * Two sites, one project.
 *
 * Phones get src/mobile — built for the phone rather than reflowed onto it.
 * Everything from 768px up gets the original desktop site. Both halves are
 * lazy so a phone never downloads the desktop compositions (nor the WebGL
 * shader behind its hero), and a laptop never downloads the phone ones.
 */
const DesktopApp = React.lazy(() => import("@/DesktopApp"))
const MobileApp = React.lazy(() => import("@/mobile/MobileApp"))

/** The whole page is still loading, so this is all the chrome there is. */
function Boot() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <p className="font-mono text-[13px] text-kai-dim">
        <span className="animate-caret text-kai-orange">▎</span> kaioken
      </p>
    </div>
  )
}

export default function App() {
  const layout = useLayout()
  return (
    <React.Suspense fallback={<Boot />}>
      {layout === "mobile" ? <MobileApp /> : <DesktopApp />}
    </React.Suspense>
  )
}
