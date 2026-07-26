import { create } from "zustand"
import { api } from "@/lib/api"
import { humanize } from "@/lib/errors"
import { useToastStore } from "@/store/toast"
import type { KaiEvent, RunRecord } from "@/lib/types"

type RunLog = { level: string; text: string }

type RunsState = {
  runs: RunRecord[]
  logs: Record<string, RunLog[]>
  error: string | null

  refresh: (wsId: string) => Promise<void>
  start: (wsId: string, kind: string, params?: Record<string, unknown>) => Promise<RunRecord | null>
  cancel: (runId: string) => Promise<void>
  revert: (runId: string) => Promise<number>
  handleEvent: (ev: KaiEvent) => void
}

export const useRunsStore = create<RunsState>((set) => ({
  runs: [],
  logs: {},
  error: null,

  refresh: async (wsId: string) => {
    try {
      const res = await api.listRuns(wsId)
      set({ runs: res.runs || [] })
    } catch {
      // non-fatal
    }
  },

  start: async (wsId: string, kind: string, params) => {
    set({ error: null })
    try {
      const run = await api.startRun(wsId, kind, params)
      set((s) => ({ runs: [run, ...s.runs] }))
      return run
    } catch (err) {
      const h = humanize(err)
      useToastStore.getState().push("error", h.title, h.body, h.action)
      set({ error: h.title })
      return null
    }
  },

  cancel: async (runId: string) => {
    try {
      await api.cancelRun(runId)
    } catch (err) {
      const h = humanize(err)
      useToastStore.getState().push("error", h.title, h.body, h.action)
      set({ error: h.title })
    }
  },

  revert: async (runId: string) => {
    try {
      const res = await api.revertRun(runId)
      useToastStore.getState().push("success", `Reverted ${res.deleted} file(s)`)
      // Drop the now-deleted artifacts from the run record.
      set((s) => ({
        runs: s.runs.map((r) => (r.id === runId ? { ...r, artifacts: [] } : r)),
      }))
      return res.deleted
    } catch (err) {
      const h = humanize(err)
      useToastStore.getState().push("error", h.title, h.body, h.action)
      return 0
    }
  },

  handleEvent: (ev: KaiEvent) => {
    switch (ev.type) {
      case "run.started": {
        const run = ev.run as RunRecord
        if (run) set((s) => ({ runs: [run, ...s.runs.filter((r) => r.id !== run.id)] }))
        break
      }
      case "run.progress": {
        const runId = ev.run_id as string
        set((s) => ({
          runs: s.runs.map((r) =>
            r.id === runId
              ? { ...r, progress: { phase: ev.phase as string, message: ev.message as string, done: ev.done as number, total: ev.total as number } }
              : r
          ),
        }))
        break
      }
      case "run.log": {
        const runId = ev.run_id as string
        const entry: RunLog = { level: ev.level as string, text: ev.text as string }
        set((s) => ({
          logs: { ...s.logs, [runId]: [...(s.logs[runId] || []), entry] },
        }))
        break
      }
      case "run.artifact": {
        const runId = ev.run_id as string
        set((s) => ({
          runs: s.runs.map((r) =>
            r.id === runId
              ? { ...r, artifacts: [...r.artifacts, { path: ev.path as string, lines: ev.lines as number, kind: ev.kind as string }] }
              : r
          ),
        }))
        break
      }
      case "run.finished": {
        const runId = ev.run_id as string
        set((s) => ({
          runs: s.runs.map((r) =>
            r.id === runId
              ? { ...r, state: ev.state as RunRecord["state"], duration_ms: ev.duration_ms as number, error: (ev.error as string) || null, summary: ev.summary as Record<string, unknown> | null }
              : r
          ),
        }))
        break
      }
    }
  },
}))
