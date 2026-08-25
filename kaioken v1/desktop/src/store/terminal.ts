import { create } from "zustand"
import { createTerm, disposeTerm, fitTerm, focusTerm, killTerm } from "@/lib/term"
import { humanize } from "@/lib/errors"
import { useToastStore } from "@/store/toast"
import { useWorkspaceStore } from "@/store/workspace"

// A terminal tab. The live xterm instance lives in lib/term's registry — this
// store carries only what the tab strip needs to render.
export type TermTab = {
  id: number
  title: string
}

type TerminalState = {
  terminals: TermTab[]
  activeId: number | null
  panelOpen: boolean
  panelHeight: number

  create: () => Promise<void>
  select: (id: number) => void
  close: (id: number) => void
  /** A shell that exited on its own (`exit`, crash): drop its tab. */
  handleExit: (id: number) => void
  togglePanel: () => void
  setPanelHeight: (h: number) => void
}

export const MIN_PANEL_HEIGHT = 120
export const MAX_PANEL_HEIGHT = 600

// Tab titles count up forever rather than reusing freed numbers, like an
// editor does — "powershell 3" always means the third terminal you opened.
let tabSeq = 0

export const useTerminalStore = create<TerminalState>((set, get) => ({
  terminals: [],
  activeId: null,
  panelOpen: false,
  panelHeight: 280,

  create: async () => {
    const cwd = useWorkspaceStore.getState().active?.path ?? ""
    try {
      const id = await createTerm(cwd)
      tabSeq += 1
      const title = tabSeq === 1 ? "powershell" : `powershell ${tabSeq}`
      set((s) => ({
        terminals: [...s.terminals, { id, title }],
        activeId: id,
        panelOpen: true,
      }))
    } catch (err) {
      const h = humanize(err)
      useToastStore.getState().push("error", "Terminal failed", h.body || h.title)
    }
  },

  select: (id) => {
    set({ activeId: id })
    fitTerm(id)
    focusTerm(id)
  },

  close: (id) => {
    void killTerm(id)
    set((s) => removeTab(s, id))
  },

  handleExit: (id) => {
    disposeTerm(id)
    set((s) => removeTab(s, id))
  },

  togglePanel: () => {
    const { panelOpen, terminals } = get()
    if (!panelOpen && terminals.length === 0) {
      // First Ctrl+`: opening an empty panel is useless, spawn a shell too.
      void get().create()
      return
    }
    set({ panelOpen: !panelOpen })
    if (!panelOpen) {
      const id = get().activeId
      if (id !== null) {
        // Let the panel lay out before measuring it.
        requestAnimationFrame(() => {
          fitTerm(id)
          focusTerm(id)
        })
      }
    }
  },

  setPanelHeight: (h) =>
    set({ panelHeight: Math.min(MAX_PANEL_HEIGHT, Math.max(MIN_PANEL_HEIGHT, h)) }),
}))

function removeTab(s: { terminals: TermTab[]; activeId: number | null }, id: number) {
  const at = s.terminals.findIndex((t) => t.id === id)
  const terminals = s.terminals.filter((t) => t.id !== id)
  // The panel without terminals is dead space; close it with the last tab.
  if (terminals.length === 0) return { terminals, activeId: null, panelOpen: false }
  if (s.activeId !== id) return { terminals }
  // Focus the neighbour on the right, as the editor tabs do, falling back left.
  const next = terminals[Math.min(at, terminals.length - 1)]
  return { terminals, activeId: next.id }
}
