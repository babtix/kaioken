import { create } from "zustand"
import { api } from "@/lib/api"
import { humanize } from "@/lib/errors"
import { useToastStore } from "@/store/toast"

// An open editor tab. `saved` is the last content known to be on disk, so
// dirtiness is a comparison rather than a flag that can drift out of sync with
// undo/redo.
export type OpenFile = {
  path: string
  content: string
  saved: string
  language: string
  loading: boolean
  saving: boolean
  error: string | null
  /** The daemon truncates files past 1 MiB; saving one would destroy the tail. */
  truncated: boolean
}

type EditorState = {
  files: OpenFile[]
  activePath: string | null
  wsId: string | null

  isDirty: (path: string) => boolean
  anyDirty: () => boolean

  open: (wsId: string, path: string) => Promise<void>
  close: (path: string) => void
  closeAll: () => void
  select: (path: string) => void
  setContent: (path: string, content: string) => void
  save: (path: string) => Promise<boolean>
  saveActive: () => Promise<boolean>
  revert: (path: string) => void
  initForWorkspace: (wsId: string) => void
}

export const useEditorStore = create<EditorState>((set, get) => ({
  files: [],
  activePath: null,
  wsId: null,

  isDirty: (path) => {
    const f = get().files.find((f) => f.path === path)
    return !!f && f.content !== f.saved
  },
  anyDirty: () => get().files.some((f) => f.content !== f.saved),

  open: async (wsId, path) => {
    // Already open: focus it rather than reloading and discarding edits.
    if (get().files.some((f) => f.path === path)) {
      set({ activePath: path })
      return
    }
    const placeholder: OpenFile = {
      path,
      content: "",
      saved: "",
      language: "",
      loading: true,
      saving: false,
      error: null,
      truncated: false,
    }
    set((s) => ({ files: [...s.files, placeholder], activePath: path, wsId }))
    try {
      const res = await api.readFile(wsId, path)
      set((s) => ({
        files: s.files.map((f) =>
          f.path === path
            ? {
                ...f,
                content: res.content,
                saved: res.content,
                language: res.language ?? "",
                truncated: !!res.truncated,
                loading: false,
              }
            : f
        ),
      }))
    } catch (err) {
      const h = humanize(err)
      set((s) => ({
        files: s.files.map((f) =>
          f.path === path ? { ...f, loading: false, error: h.title } : f
        ),
      }))
    }
  },

  close: (path) =>
    set((s) => {
      const at = s.files.findIndex((f) => f.path === path)
      const files = s.files.filter((f) => f.path !== path)
      if (s.activePath !== path) return { files }
      // Focus the neighbour on the right, as an editor does, falling back left.
      const next = files[Math.min(at, files.length - 1)]
      return { files, activePath: next ? next.path : null }
    }),

  closeAll: () => set({ files: [], activePath: null }),

  select: (path) => set({ activePath: path }),

  setContent: (path, content) =>
    set((s) => ({
      files: s.files.map((f) => (f.path === path ? { ...f, content } : f)),
    })),

  save: async (path) => {
    const { wsId, files } = get()
    const file = files.find((f) => f.path === path)
    if (!wsId || !file || file.saving) return false
    if (file.content === file.saved) return true
    // A truncated buffer is only the first megabyte of the file; writing it
    // back would silently delete everything past that point.
    if (file.truncated) {
      useToastStore
        .getState()
        .push("error", "Not saved", "This file was too large to load in full, so it is read-only.")
      return false
    }
    set((s) => ({
      files: s.files.map((f) => (f.path === path ? { ...f, saving: true } : f)),
    }))
    try {
      await api.writeFile(wsId, path, file.content)
      set((s) => ({
        files: s.files.map((f) =>
          // Compare against the buffer that was sent, not the current one: the
          // user may have typed more while the request was in flight.
          f.path === path ? { ...f, saved: file.content, saving: false } : f
        ),
      }))
      return true
    } catch (err) {
      const h = humanize(err)
      useToastStore.getState().push("error", "Save failed", h.body || h.title)
      set((s) => ({
        files: s.files.map((f) => (f.path === path ? { ...f, saving: false } : f)),
      }))
      return false
    }
  },

  saveActive: async () => {
    const p = get().activePath
    return p ? get().save(p) : false
  },

  revert: (path) =>
    set((s) => ({
      files: s.files.map((f) => (f.path === path ? { ...f, content: f.saved } : f)),
    })),

  // Switching repositories closes everything: a path is only meaningful
  // relative to the workspace it came from.
  initForWorkspace: (wsId) => set({ wsId, files: [], activePath: null }),
}))
