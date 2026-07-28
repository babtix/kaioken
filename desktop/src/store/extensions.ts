import { create } from "zustand"
import { api } from "@/lib/api"
import { humanize } from "@/lib/errors"
import { useToastStore } from "@/store/toast"
import type { ExtRegistryEntry, ExtTool, ExtUpdateResult, ExtensionInfo } from "@/lib/types"

// Extensions are per-user (not per-workspace): one install serves every
// repository, so this store carries no workspace id anywhere.

type ExtensionsState = {
  extensions: ExtensionInfo[]
  registry: ExtRegistryEntry[]
  registryError: string | null
  loading: boolean
  /** id (or source string) of the extension an action is running against. */
  busy: string | null

  refresh: () => Promise<void>
  loadRegistry: (q?: string) => Promise<void>
  install: (source: string) => Promise<boolean>
  installDev: (path: string) => Promise<boolean>
  remove: (id: string) => Promise<void>
  setEnabled: (id: string, enabled: boolean) => Promise<void>
  trust: (id: string) => Promise<ExtTool[] | null>
  untrust: (id: string) => Promise<void>
  updateAll: () => Promise<ExtUpdateResult[]>
}

function toastError(err: unknown) {
  const h = humanize(err)
  useToastStore.getState().push("error", h.title, h.body, h.action)
}

export const useExtensionsStore = create<ExtensionsState>((set, get) => ({
  extensions: [],
  registry: [],
  registryError: null,
  loading: false,
  busy: null,

  refresh: async () => {
    set({ loading: true })
    try {
      const res = await api.listExtensions()
      set({ extensions: res.extensions || [] })
    } catch (err) {
      toastError(err)
    } finally {
      set({ loading: false })
    }
  },

  loadRegistry: async (q = "") => {
    set({ registryError: null })
    try {
      const res = await api.extensionRegistry(q)
      set({ registry: res.entries || [] })
    } catch (err) {
      // Registry being down must not toast on every keystroke — the browse
      // panel shows the fallback ("direct install still works") inline.
      const h = humanize(err)
      set({ registry: [], registryError: h.title })
    }
  },

  install: async (source: string) => {
    set({ busy: source })
    try {
      const rep = await api.installExtension(source)
      const toast = useToastStore.getState()
      if (rep.needs_trust) {
        toast.push("info", `Installed ${rep.extension.id} ${rep.extension.version}`, "It stays inert until you trust it below.")
      } else {
        toast.push("success", `Installed ${rep.extension.id} ${rep.extension.version}`)
      }
      for (const w of rep.warnings) toast.push("info", rep.extension.id, w)
      await get().refresh()
      return true
    } catch (err) {
      toastError(err)
      return false
    } finally {
      set({ busy: null })
    }
  },

  installDev: async (path: string) => {
    set({ busy: path })
    try {
      const rep = await api.devExtension(path)
      useToastStore
        .getState()
        .push("success", `Dev-installed ${rep.extension.id}`, "Re-run after editing the source to refresh.")
      await get().refresh()
      return true
    } catch (err) {
      toastError(err)
      return false
    } finally {
      set({ busy: null })
    }
  },

  remove: async (id: string) => {
    set({ busy: id })
    try {
      await api.removeExtension(id)
      useToastStore.getState().push("success", `Removed ${id}`)
      await get().refresh()
    } catch (err) {
      toastError(err)
    } finally {
      set({ busy: null })
    }
  },

  setEnabled: async (id: string, enabled: boolean) => {
    try {
      await api.enableExtension(id, enabled)
      await get().refresh()
    } catch (err) {
      toastError(err)
    }
  },

  trust: async (id: string) => {
    set({ busy: id })
    try {
      const res = await api.trustExtension(id)
      useToastStore
        .getState()
        .push(
          "success",
          `Trusted ${id}`,
          `${res.tools.length} tool(s) now available to the agent — each call still needs approval.`
        )
      await get().refresh()
      return res.tools
    } catch (err) {
      toastError(err)
      return null
    } finally {
      set({ busy: null })
    }
  },

  untrust: async (id: string) => {
    set({ busy: id })
    try {
      await api.untrustExtension(id)
      useToastStore.getState().push("success", `Untrusted ${id}`, "Its code will not run again until you re-trust it.")
      await get().refresh()
    } catch (err) {
      toastError(err)
    } finally {
      set({ busy: null })
    }
  },

  updateAll: async () => {
    set({ busy: "@update" })
    try {
      const res = await api.updateExtensions()
      const updated = res.results.filter((r) => r.updated)
      const failed = res.results.filter((r) => r.error)
      const toast = useToastStore.getState()
      if (updated.length > 0) {
        toast.push("success", `Updated ${updated.length} extension(s)`, updated.map((r) => `${r.id} ${r.from} → ${r.to}`).join("\n"))
      } else if (failed.length === 0) {
        toast.push("info", "Everything is current")
      }
      for (const r of failed) toast.push("error", `Update failed: ${r.id}`, r.error ?? "")
      await get().refresh()
      return res.results
    } catch (err) {
      toastError(err)
      return []
    } finally {
      set({ busy: null })
    }
  },
}))
