import { openPath } from "@tauri-apps/plugin-opener"
import { create } from "zustand"
import { api } from "@/lib/api"
import { humanize } from "@/lib/errors"
import { friendlyStage } from "@/lib/stages"
import { useToastStore } from "@/store/toast"
import { useRunsStore } from "@/store/runs"
import type { Answer, AnswerSource, ResearchStep } from "@/components/answer/types"
import type { KaiEvent, ResearchCost, ResearchGrounding, ResearchReport, ResumableRun } from "@/lib/types"

/**
 * Drives the Research screen against the daemon's `research` run kind.
 *
 * The daemon streams run.progress (stage changes), run.log (details) and a
 * run.finished whose summary carries the entire report — markdown, sources,
 * counters. This store folds that stream into the Answer shape the answer
 * components already render, so the wire format and the showcase format are
 * the same thing.
 */

type ResearchSummary = {
  question?: string
  markdown?: string
  sources?: { n: number; url: string; title: string }[]
  rounds?: number
  searched?: number
  fetched?: number
  incomplete?: boolean
  deep?: boolean
  report_path?: string
  slug?: string
  // Hybrid-engine metadata, carried by the daemon's finishSummary.
  path?: string
  run_id?: string
  escalated?: boolean
  escalated_from?: string
  cost?: ResearchCost
  grounding?: ResearchGrounding
}

type ResearchState = {
  question: string
  wsId: string | null
  runId: string | null
  busy: boolean
  steps: ResearchStep[]
  answer: Answer | null
  rounds: number
  searched: number
  /** Pages the finished run actually read; null until the engine reports. */
  fetched: number | null
  /** Wall-clock duration of the finished run; null until run.finished lands. */
  durationMs: number | null
  reportPath: string | null
  /** Slug of the report on screen, which is what Export acts on. */
  slug: string | null
  /** True when the report on screen came from a deep (x10) run. */
  deep: boolean
  /** Execution path that produced the report on screen: "fast" or "deep". */
  path: string | null
  /** True when the report on screen was promoted from the fast path mid-run. */
  escalated: boolean
  /** Line-itemised cost of the run on screen, when the engine reported one. */
  cost: ResearchCost | null
  /** The grounding pass's verdict for the report on screen, when it ran. */
  grounding: ResearchGrounding | null
  /** True while a PDF is being rendered, so Export cannot be double-fired. */
  exporting: boolean
  error: string | null
  /** Saved reports for the active workspace, newest first. */
  history: ResearchReport[]
  /** Interrupted runs on disk — stopped, checkpointed, continuable. */
  paused: ResumableRun[]

  start: (wsId: string, question: string, multiplier: number, resume?: string) => Promise<void>
  cancel: () => Promise<void>
  reattach: (wsId: string) => Promise<void>
  handleEvent: (ev: KaiEvent) => void
  loadHistory: (wsId: string) => Promise<void>
  loadPaused: () => Promise<void>
  continueRun: (wsId: string, run: ResumableRun) => Promise<void>
  discardPaused: (runId: string) => Promise<void>
  openSaved: (wsId: string, slug: string) => Promise<void>
  deleteSaved: (wsId: string, slug: string) => Promise<void>
  exportPdf: () => Promise<void>
}

export const useResearchStore = create<ResearchState>((set, get) => ({
  question: "",
  wsId: null,
  runId: null,
  busy: false,
  steps: [],
  answer: null,
  rounds: 0,
  searched: 0,
  fetched: null,
  durationMs: null,
  reportPath: null,
  slug: null,
  deep: false,
  path: null,
  escalated: false,
  cost: null,
  grounding: null,
  exporting: false,
  error: null,
  history: [],
  paused: [],

  start: async (wsId, question, multiplier, resume) => {
    if (get().busy) return
    set({
      question,
      wsId,
      busy: true,
      steps: [{ label: "Starting", state: "running" }],
      answer: null,
      rounds: 0,
      searched: 0,
      fetched: null,
      durationMs: null,
      reportPath: null,
      slug: null,
      deep: false,
      path: null,
      escalated: false,
      cost: null,
      grounding: null,
      error: null,
    })
    try {
      // A resume id continues an interrupted run from its checkpoint; the
      // engine restores the original depth dial itself, so the multiplier
      // carried here is only the fallback for runs checkpointed before it
      // was recorded.
      const run = await api.startRun(wsId, "research", {
        question,
        multiplier,
        ...(resume ? { resume } : {}),
      })
      set({ runId: run.id })
    } catch (err) {
      const h = humanize(err)
      useToastStore.getState().push("error", h.title, h.body, h.action)
      set({ busy: false, error: h.body || h.title, steps: [] })
    }
  },

  cancel: async () => {
    const id = get().runId
    if (!id) return
    try {
      await api.cancelRun(id)
      // busy flips on run.finished, keeping the timeline coherent.
    } catch (err) {
      const h = humanize(err)
      useToastStore.getState().push("error", h.title, h.body, h.action)
    }
  },

  // A research run outlives this screen: the daemon owns it, so a page
  // change, a reload, a WebView restart — or a run started from another
  // surface entirely — leaves it running with nobody watching. Reattach
  // adopts the workspace's active research run, so the live trail is
  // waiting when the user comes back instead of an empty intro.
  reattach: async (wsId) => {
    if (get().busy) return
    // Snapshot the adoption guards: if either changes while the request is
    // in flight, the user started a fresh run meanwhile, and the adoption
    // must not overwrite it.
    const busyBefore = get().busy
    const runIdBefore = get().runId
    try {
      const res = await api.listRuns(wsId, true)
      const run = (res.runs ?? []).find(
        (r) => r.kind === "research" && (r.state === "running" || r.state === "queued")
      )
      if (!run) return
      if (get().busy !== busyBefore || get().runId !== runIdBefore) return
      // The runs store folds the same event stream into the same trail the
      // Research screen uses — adopt it whole when it exists, so the trail
      // rebuilt here is identical to Activity's. Only when nothing was
      // recorded (fresh reload) does the current progress message seed a
      // single step.
      const trail = useRunsStore.getState().trails[run.id]
      const steps: ResearchStep[] =
        trail && trail.length > 0
          ? trail
          : [{ label: friendlyStage(run.progress?.message ?? "") || "Starting", state: "running" }]
      set({
        wsId,
        runId: run.id,
        question: String(run.params?.question ?? ""),
        busy: true,
        steps,
        answer: null,
        rounds: 0,
        searched: 0,
        fetched: null,
        durationMs: null,
        reportPath: null,
        slug: null,
        deep: false,
        path: null,
        escalated: false,
        cost: null,
        grounding: null,
        error: null,
      })
      // Events that arrived before the adoption are gone, but the stream
      // picks straight back up: every later progress, log and finish event
      // carries the adopted run id.
    } catch {
      // non-fatal: the screen simply stays as it is
    }
  },

  // Every finished run was persisted by the daemon, so the history list is
  // just a read — it survives app restarts, and a load failure only costs
  // the panel, never the run itself.
  loadHistory: async (wsId) => {
    try {
      const res = await api.researchList(wsId)
      set({ history: res.reports })
    } catch {
      set({ history: [] })
    }
  },

  // Interrupted runs are global (research never reads the repository), and
  // the daemon reads them straight off disk — so this list is true after
  // any restart, however long the run has been stopped.
  loadPaused: async () => {
    try {
      const res = await api.researchRuns()
      set({ paused: res.runs ?? [] })
    } catch {
      set({ paused: [] })
    }
  },

  // Continue is a start with a checkpoint: same screen, same store, the
  // engine picking the loop back up where it stopped.
  continueRun: async (wsId, run) => {
    await get().start(wsId, run.question, 3, run.id)
  },

  discardPaused: async (runId) => {
    try {
      await api.researchRunDelete(runId)
      set((s) => ({ paused: s.paused.filter((r) => r.id !== runId) }))
    } catch (err) {
      const h = humanize(err)
      useToastStore.getState().push("error", h.title, h.body, h.action)
    }
  },

  // openSaved rehydrates a past deep search into the same Answer shape a
  // live run produces — minus the step trail, which is not persisted.
  openSaved: async (wsId, slug) => {
    if (get().busy) return
    try {
      const saved = await api.researchGet(wsId, slug)
      set({
        question: saved.question,
        wsId,
        busy: false,
        steps: [],
        rounds: saved.rounds,
        searched: saved.searched,
        fetched: null,
        // A reopened report predates this session; the daemon does not
        // persist the wall clock, so the time stays unknown.
        durationMs: null,
        reportPath: saved.report_path ?? null,
        slug: saved.slug,
        deep: saved.deep != null,
        path: saved.path ?? null,
        escalated: saved.escalated === true,
        cost: saved.cost ?? null,
        grounding: saved.grounding ?? null,
        error: null,
        answer: {
          question: saved.question,
          body: saved.markdown ?? "",
          sources: saved.sources.map((s): AnswerSource => ({ n: s.n, url: s.url, title: s.title })),
          steps: [],
          followUps: [],
          incomplete: saved.incomplete,
        },
      })
    } catch (err) {
      const h = humanize(err)
      useToastStore.getState().push("error", h.title, h.body, h.action)
    }
  },

  deleteSaved: async (wsId, slug) => {
    try {
      await api.researchDelete(wsId, slug)
      set((s) => ({ history: s.history.filter((r) => r.slug !== slug) }))
    } catch (err) {
      const h = humanize(err)
      useToastStore.getState().push("error", h.title, h.body, h.action)
    }
  },

  // Export renders the report on screen to a signed PDF and opens it.
  //
  // The daemon does the rendering and writes the file beside the report's
  // markdown twin, so the app never handles PDF bytes: it asks for the export,
  // gets a path back, and opens it with the system viewer. That keeps the
  // signature in the same code that produced the research, and it means the
  // exported file is somewhere the user can find again rather than in a
  // downloads folder.
  exportPdf: async () => {
    const { wsId, slug, exporting } = get()
    const toast = useToastStore.getState()
    if (exporting) return
    if (!wsId || !slug) {
      toast.push("error", "Nothing to export", "Run a search or open a saved report first.")
      return
    }
    set({ exporting: true })
    try {
      const res = await api.researchExport(wsId, slug)
      const size = `${Math.max(1, Math.round(res.bytes / 1024))} KB`
      // Opening it is the point of pressing Export. If no viewer is registered
      // for PDFs the toast still says where the file is, so the export is not
      // lost with it.
      const opened = await openPath(res.path).then(
        () => true,
        () => false
      )
      toast.push(
        "success",
        `Exported ${res.pages} page${res.pages === 1 ? "" : "s"} to PDF`,
        `${res.rel} · ${size}`,
        opened ? undefined : "Open it from the repository folder"
      )
    } catch (err) {
      const h = humanize(err)
      toast.push("error", h.title, h.body, h.action)
    } finally {
      set({ exporting: false })
    }
  },

  handleEvent: (ev) => {
    const { runId } = get()
    if (!runId || ev.run_id !== runId) return

    switch (ev.type) {
      case "run.progress": {
        const label = friendlyStage(String(ev.message ?? ""))
        if (!label) return
        set((s) => {
          // A repeated stage (same label) just stays running; a new one
          // closes the previous step, mirroring Perplexity's step trail.
          const steps = s.steps.map((st): ResearchStep => ({ ...st, state: "done" }))
          const last = steps[steps.length - 1]
          if (last && last.label === label) {
            last.state = "running"
            return { steps }
          }
          return { steps: [...steps, { label, state: "running" }] }
        })
        break
      }
      case "run.log": {
        // Detail lines attach to the step currently running. Every line is
        // kept — the trail expands them on demand — while `detail` stays
        // the newest one, which is what shows inline when collapsed.
        const text = String(ev.text ?? "")
        if (!text || ev.level === "error") return
        set((s) => {
          const steps = [...s.steps]
          const last = steps[steps.length - 1]
          if (last) {
            steps[steps.length - 1] = {
              ...last,
              detail: text,
              details: [...(last.details ?? []), text],
            }
          }
          return { steps }
        })
        break
      }
      case "run.finished": {
        const state = ev.state as string
        if (state === "done") {
          const sum = (ev.summary ?? {}) as ResearchSummary
          const sources: AnswerSource[] = (sum.sources ?? []).map((s) => ({
            n: s.n,
            url: s.url,
            title: s.title,
          }))
          set((s) => ({
            busy: false,
            rounds: sum.rounds ?? 0,
            searched: sum.searched ?? 0,
            fetched: sum.fetched ?? sum.cost?.fetches ?? null,
            durationMs: typeof ev.duration_ms === "number" ? ev.duration_ms : null,
            reportPath: sum.report_path ?? null,
            slug: sum.slug ?? null,
            deep: sum.deep === true,
            path: sum.path ?? null,
            escalated: sum.escalated === true,
            cost: sum.cost ?? null,
            grounding: sum.grounding ?? null,
            steps: s.steps.map((st): ResearchStep => ({ ...st, state: "done" })),
            answer: {
              question: sum.question || s.question,
              body: sum.markdown ?? "",
              sources,
              steps: s.steps.map((st): ResearchStep => ({ ...st, state: "done" })),
              followUps: [],
              incomplete: sum.incomplete,
            },
          }))
          // The daemon persisted this run before announcing it — refresh the
          // saved list so the new report appears in the history immediately.
          // The paused list moves too: a resumed run has left it.
          const wsId = get().wsId
          if (wsId) void get().loadHistory(wsId)
          void get().loadPaused()
        } else {
          const msg =
            state === "cancelled" ? "Research cancelled" : String(ev.error ?? "Research failed")
          set((s) => ({
            busy: false,
            error: state === "cancelled" ? null : msg,
            steps: s.steps.map((st): ResearchStep =>
              st.state === "running" ? { ...st, state: "pending" } : st
            ),
          }))
          // A stopped run is checkpointed, not lost: it belongs on the
          // paused list now, waiting to be continued.
          void get().loadPaused()
        }
        break
      }
    }
  },
}))
