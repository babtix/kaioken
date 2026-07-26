import { create } from "zustand"
import { api } from "@/lib/api"
import { humanize } from "@/lib/errors"
import { useToastStore } from "@/store/toast"
import type { KaiEvent, RecentEntry, ScanResult, Workspace } from "@/lib/types"

type WorkspaceState = {
  // The currently active workspace (null = welcome screen).
  active: Workspace | null
  // All open workspaces.
  list: Workspace[]
  // Persisted recents from the daemon.
  recents: RecentEntry[]
  // Scan result for the active workspace.
  scan: ScanResult | null
  // Loading/error state.
  loading: boolean
  error: string | null

  // Actions
  refresh: () => Promise<void>
  open: (path: string) => Promise<Workspace>
  close: (id: string, forget?: boolean) => Promise<void>
  setActive: (id: string | null) => void
  initWorkspace: (id: string, model?: string) => Promise<void>
  refreshScan: (refresh?: boolean) => Promise<void>

  // Event dispatch (called by the App-level SSE dispatcher).
  handleEvent: (ev: KaiEvent) => void
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  active: null,
  list: [],
  recents: [],
  scan: null,
  loading: false,
  error: null,

  refresh: async () => {
    set({ loading: true, error: null })
    try {
      const res = await api.listWorkspaces()
      const active = get().active
      const updatedActive = active
        ? res.workspaces.find((w) => w.id === active.id) ?? null
        : null
      set({ list: res.workspaces, recents: res.recents, active: updatedActive, loading: false })
    } catch (err) {
      const h = humanize(err)
      useToastStore.getState().push("error", h.title, h.body, h.action)
      set({ error: h.title, loading: false })
    }
  },

  open: async (path: string) => {
    set({ loading: true, error: null })
    try {
      const ws = await api.openWorkspace(path)
      const list = [...get().list.filter((w) => w.id !== ws.id), ws]
      set({ active: ws, list, loading: false })
      return ws
    } catch (err) {
      const h = humanize(err)
      useToastStore.getState().push("error", h.title, h.body, h.action)
      set({ error: h.title, loading: false })
      throw err
    }
  },

  close: async (id: string, forget = false) => {
    await api.deleteWorkspace(id, forget)
    const list = get().list.filter((w) => w.id !== id)
    const active = get().active?.id === id ? null : get().active
    set({ list, active, scan: active ? get().scan : null })
    // Refresh recents after a forget.
    if (forget) await get().refresh()
  },

  setActive: (id: string | null) => {
    if (id === null) {
      set({ active: null, scan: null })
      return
    }
    const ws = get().list.find((w) => w.id === id)
    if (ws) set({ active: ws, scan: null })
  },

  initWorkspace: async (id: string, model?: string) => {
    const ws = await api.initWorkspace(id, model)
    const list = get().list.map((w) => (w.id === id ? ws : w))
    const active = get().active?.id === id ? ws : get().active
    set({ list, active })
  },

  refreshScan: async (refresh = false) => {
    const ws = get().active
    if (!ws) return
    try {
      const scan = await api.scan(ws.id, refresh)
      set({ scan })
    } catch {
      // Non-fatal: the scan panel will show an error state.
    }
  },

  handleEvent: (ev: KaiEvent) => {
    switch (ev.type) {
      case "workspace.opened": {
        // Another client (or the daemon itself) opened a workspace.
        get().refresh()
        break
      }
      case "workspace.closed": {
        const id = ev.workspace_id as string
        const list = get().list.filter((w) => w.id !== id)
        const active = get().active?.id === id ? null : get().active
        set({ list, active })
        break
      }
      case "workspace.changed": {
        // Config or git state changed — refetch the workspace.
        const id = ev.workspace_id as string
        api.getWorkspace(id).then((ws) => {
          const list = get().list.map((w) => (w.id === id ? ws : w))
          const active = get().active?.id === id ? ws : get().active
          set({ list, active })
        }).catch(() => {})
        break
      }
    }
  },
}))
