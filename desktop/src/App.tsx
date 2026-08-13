import { lazy, useEffect } from "react"
import { Route, Routes } from "react-router-dom"
import AppShell from "@/components/layout/AppShell"
import Welcome from "@/routes/Welcome"
import { connectEvents } from "@/lib/events"
import { useWorkspaceStore } from "@/store/workspace"
import { useChatStore } from "@/store/chat"
import { useRunsStore } from "@/store/runs"
import { useResearchStore } from "@/store/research"
import { useConnStore } from "@/store/conn"
import type { KaiEvent } from "@/lib/types"

import Chat from "@/routes/Chat"
import Activity from "@/routes/Activity"
import Wiki from "@/routes/Wiki"

// Route-level code splitting: Editor drags in CodeMirror plus its language
// packs, Browser/Cards/Settings/Graph each carry weight a user who only
// opens Chat or the Wiki never pays for. AppShell provides the Suspense
// boundary around its <Outlet/>.
const Editor = lazy(() => import("@/routes/Editor"))
const Browser = lazy(() => import("@/routes/Browser"))
const Graph = lazy(() => import("@/routes/Graph"))
const Cards = lazy(() => import("@/routes/Cards"))
const Extensions = lazy(() => import("@/routes/Extensions"))
const Settings = lazy(() => import("@/routes/Settings"))
const Research = lazy(() => import("@/routes/Research"))
const Prism = lazy(() => import("@/routes/Prism"))
const Cost = lazy(() => import("@/routes/Cost"))

export default function App() {
  const handleEvent = useWorkspaceStore((s) => s.handleEvent)
  const restoreActive = useWorkspaceStore((s) => s.restoreActive)

  // Re-adopt whichever workspace the daemon still has open, so a reload (or
  // a WebView crash) does not dump you back on the picker.
  useEffect(() => {
    restoreActive()
  }, [restoreActive])

  // Single SSE connection for the whole app, dispatching into stores by
  // event type. One subscription, not one per component.
  useEffect(() => {
    const dispatch = (ev: KaiEvent) => {
      handleEvent(ev)
      useChatStore.getState().handleEvent(ev)
      useRunsStore.getState().handleEvent(ev)
      useResearchStore.getState().handleEvent(ev)
    }
    const disconnect = connectEvents(dispatch, useConnStore.getState().setStatus)
    return disconnect
  }, [handleEvent])

  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Welcome />} />
        <Route path="chat" element={<Chat />} />
        <Route path="research" element={<Research />} />
        <Route path="editor" element={<Editor />} />
        <Route path="browser" element={<Browser />} />
        <Route path="wiki" element={<Wiki />} />
        <Route path="graph" element={<Graph />} />
        <Route path="activity" element={<Activity />} />
        <Route path="cards" element={<Cards />} />
        <Route path="prism" element={<Prism />} />
        <Route path="extensions" element={<Extensions />} />
        <Route path="cost" element={<Cost />} />
        <Route path="settings" element={<Settings />} />
      </Route>
    </Routes>
  )
}
