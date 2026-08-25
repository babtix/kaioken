import { create } from "zustand"
import { api } from "@/lib/api"
import { useToastStore } from "@/store/toast"
import { humanize } from "@/lib/errors"
import type { FileTreeResponse, FileTreeNode, GitStatusResponse } from "@/lib/types"

// The wiki is not among these: it has its own route on the left rather than a
// duplicate outline in the right-hand explorer.
export type ExplorerPanel = "files" | "git" | "modules" | "recent"

const RECENT_CAP = 20

type ExplorerState = {
  // Layout
  open: boolean
  panel: ExplorerPanel

  // Tree (file explorer + quick switcher source)
  tree: FileTreeResponse | null
  treeLoading: boolean
  treeError: string | null

  // Git status (source-control panel)
  git: GitStatusResponse | null
  gitLoading: boolean
  /** Paths with an in-flight stage/unstage/discard, so their rows can show it. */
  gitBusy: Set<string>
  gitCommitting: boolean

  // Interaction
  expanded: Set<string> // directory paths that are expanded
  selectedPath: string | null

  // Per-workspace persisted lists (localStorage-backed)
  pinned: string[]
  recents: string[]
  wsId: string | null // the workspace these pinned/recents belong to

  // Actions
  setOpen: (v: boolean) => void
  toggleOpen: () => void
  setPanel: (p: ExplorerPanel) => void
  toggleDir: (path: string) => void
  setExpanded: (path: string, open: boolean) => void
  expandAll: () => void
  collapseAll: () => void
  selectFile: (path: string | null) => void
  pinFile: (path: string) => void
  unpinFile: (path: string) => void
  addRecent: (path: string) => void

  loadTree: (wsId: string, refresh?: boolean) => Promise<void>
  loadGitStatus: (wsId: string) => Promise<void>
  stagePaths: (wsId: string, paths: string[]) => Promise<void>
  unstagePaths: (wsId: string, paths: string[]) => Promise<void>
  discardPaths: (wsId: string, paths: string[]) => Promise<void>
  commit: (wsId: string, message: string, amend?: boolean) => Promise<boolean>

  // Called when the active workspace changes; loads its pinned/recents.
  initForWorkspace: (wsId: string) => void
}

// localStorage keys — per-workspace so two repos do not share pins.
function pinnedKey(wsId: string) {
  return `kaioken.explorer.${wsId}.pinned`
}
function recentsKey(wsId: string) {
  return `kaioken.explorer.${wsId}.recents`
}

function readList(key: string): string[] {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return []
    const v = JSON.parse(raw)
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : []
  } catch {
    return []
  }
}

function writeList(key: string, list: string[]) {
  try {
    localStorage.setItem(key, JSON.stringify(list))
  } catch {
    // localStorage may be unavailable (private mode, full quota) — non-fatal.
  }
}

export const useExplorerStore = create<ExplorerState>((set) => ({
  open: true,
  panel: "files",
  tree: null,
  treeLoading: false,
  treeError: null,
  git: null,
  gitLoading: false,
  gitBusy: new Set(),
  gitCommitting: false,
  expanded: new Set(),
  selectedPath: null,
  pinned: [],
  recents: [],
  wsId: null,

  setOpen: (v) => set({ open: v }),
  toggleOpen: () => set((s) => ({ open: !s.open })),
  setPanel: (p) => set({ panel: p }),

  toggleDir: (path) =>
    set((s) => {
      const next = new Set(s.expanded)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return { expanded: next }
    }),

  setExpanded: (path, o) =>
    set((s) => {
      const next = new Set(s.expanded)
      if (o) next.add(path)
      else next.delete(path)
      return { expanded: next }
    }),

  expandAll: () =>
    set((s) => {
      const next = new Set(s.expanded)
      walkDirs(s.tree?.children ?? [], (d) => next.add(d.path))
      return { expanded: next }
    }),

  collapseAll: () => set({ expanded: new Set() }),

  selectFile: (path) => set({ selectedPath: path }),

  pinFile: (path) =>
    set((s) => {
      if (s.pinned.includes(path)) return {}
      const pinned = [path, ...s.pinned]
      return { pinned }
    }),

  unpinFile: (path) =>
    set((s) => ({ pinned: s.pinned.filter((p) => p !== path) })),

  addRecent: (path) =>
    set((s) => {
      const recents = [path, ...s.recents.filter((p) => p !== path)].slice(0, RECENT_CAP)
      return { recents }
    }),

  loadTree: async (wsId, refresh = false) => {
    set({ treeLoading: true, treeError: null })
    try {
      const tree = await api.tree(wsId, refresh)
      // Seed expanded with the top-level directories on first load so the
      // explorer opens to something useful instead of a wall of collapsed roots.
      set((s) => {
        if (s.tree || s.expanded.size > 0) return { tree, treeLoading: false }
        const expanded = new Set<string>()
        for (const node of tree.children) {
          if (node.type === "directory") expanded.add(node.path)
        }
        return { tree, treeLoading: false, expanded }
      })
    } catch (err) {
      const h = humanize(err)
      set({ treeError: h.title, treeLoading: false })
    }
  },

  loadGitStatus: async (wsId) => {
    set({ gitLoading: true })
    try {
      const git = await api.gitStatus(wsId)
      set({ git, gitLoading: false })
    } catch (err) {
      const h = humanize(err)
      useToastStore.getState().push("error", h.title, h.body, h.action)
      set({ gitLoading: false })
    }
  },

  stagePaths: (wsId, paths) => runGitOp(set, paths, () => api.gitStage(wsId, paths)),
  unstagePaths: (wsId, paths) => runGitOp(set, paths, () => api.gitUnstage(wsId, paths)),
  discardPaths: (wsId, paths) => runGitOp(set, paths, () => api.gitDiscard(wsId, paths)),

  commit: async (wsId, message, amend = false) => {
    set({ gitCommitting: true })
    try {
      const git = await api.gitCommit(wsId, message, amend)
      set({ git, gitCommitting: false })
      const short = git.commit?.short
      useToastStore
        .getState()
        .push("success", "Committed", short ? `${short} · ${message.split("\n")[0]}` : message)
      return true
    } catch (err) {
      // A rejecting hook, an unconfigured identity or an empty index all land
      // here; the daemon forwards git's own message as the detail, which is the
      // part worth reading, so it becomes the toast body under a plain title.
      const h = humanize(err)
      useToastStore.getState().push("error", "Commit failed", h.body || h.title)
      set({ gitCommitting: false })
      return false
    }
  },

  initForWorkspace: (wsId) => {
    const pinned = readList(pinnedKey(wsId))
    const recents = readList(recentsKey(wsId))
    set({
      wsId,
      pinned,
      recents,
      expanded: new Set(),
      selectedPath: null,
      tree: null,
      git: null,
      gitBusy: new Set(),
      gitCommitting: false,
    })
  },
}))

// runGitOp is the shared body of stage/unstage/discard. Each of those endpoints
// answers with the refreshed status, so the result replaces `git` outright
// rather than being patched in — no chance of the panel drifting from the repo.
// The touched paths are marked busy for the duration so their rows can show it.
async function runGitOp(
  set: (fn: (s: ExplorerState) => Partial<ExplorerState>) => void,
  paths: string[],
  call: () => Promise<GitStatusResponse>
) {
  if (paths.length === 0) return
  set((s) => ({ gitBusy: new Set([...s.gitBusy, ...paths]) }))
  try {
    const git = await call()
    set(() => ({ git }))
  } catch (err) {
    const h = humanize(err)
    useToastStore.getState().push("error", h.title, h.body, h.action)
  } finally {
    set((s) => {
      const next = new Set(s.gitBusy)
      for (const p of paths) next.delete(p)
      return { gitBusy: next }
    })
  }
}

// Persist pinned & recents whenever they change. The store tracks which
// workspace these lists belong to, so persistence is keyed correctly without a
// cross-store import.
useExplorerStore.subscribe((state, prev) => {
  const wsId = state.wsId
  if (!wsId) return
  if (state.pinned !== prev.pinned) writeList(pinnedKey(wsId), state.pinned)
  if (state.recents !== prev.recents) writeList(recentsKey(wsId), state.recents)
})

// walkDirs runs fn on every directory node in the tree (depth-first).
export function walkDirs(nodes: FileTreeNode[] | undefined, fn: (n: FileTreeNode) => void) {
  if (!nodes) return
  for (const n of nodes) {
    if (n.type === "directory") {
      fn(n)
      walkDirs(n.children, fn)
    }
  }
}

// flattenFiles returns every file node in the tree as a flat list — the quick
// switcher's source of truth. Order is depth-first, dirs-before-files, so the
// listing matches what the explorer shows.
export function flattenFiles(nodes: FileTreeNode[] | undefined): FileTreeNode[] {
  const out: FileTreeNode[] = []
  const walk = (list: FileTreeNode[] | undefined) => {
    if (!list) return
    for (const n of list) {
      if (n.type === "file") out.push(n)
      else walk(n.children)
    }
  }
  walk(nodes)
  return out
}
