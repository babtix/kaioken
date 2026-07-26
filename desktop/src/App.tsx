import { useEffect } from "react"
import { Route, Routes } from "react-router-dom"
import AppShell from "@/components/layout/AppShell"
import Welcome from "@/routes/Welcome"
import { connectEvents } from "@/lib/events"
import { useWorkspaceStore } from "@/store/workspace"
import { useChatStore } from "@/store/chat"
import { useRunsStore } from "@/store/runs"
import { useConnStore } from "@/store/conn"
import type { KaiEvent } from "@/lib/types"

import Chat from "@/routes/Chat"
import Activity from "@/routes/Activity"
import Wiki from "@/routes/Wiki"
import Cards from "@/routes/Cards"
import Settings from "@/routes/Settings"

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
    }
    const disconnect = connectEvents(dispatch, useConnStore.getState().setStatus)
    return disconnect
  }, [handleEvent])

  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Welcome />} />
        <Route path="chat" element={<Chat />} />
        <Route path="wiki" element={<Wiki />} />
        <Route path="activity" element={<Activity />} />
        <Route path="cards" element={<Cards />} />
        <Route path="settings" element={<Settings />} />
      </Route>
    </Routes>
  )
}
