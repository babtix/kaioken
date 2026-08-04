import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@tauri-apps/plugin-opener", () => ({ openPath: vi.fn(async () => {}) }))
vi.mock("@/lib/api", () => ({
  api: {
    listRuns: vi.fn(),
    startRun: vi.fn(),
    cancelRun: vi.fn(),
    researchList: vi.fn(async () => ({ reports: [] })),
  },
}))

import { api } from "@/lib/api"
import { useRunsStore } from "@/store/runs"
import { useResearchStore } from "@/store/research"
import type { KaiEvent, RunRecord } from "@/lib/types"

const WS = "ws-1"
const RUN = "run-1"

// Minimal RunRecord / event builders — only the fields the stores read.
const runRecord = (over: Record<string, unknown> = {}): RunRecord => ({
  id: RUN,
  workspace_id: WS,
  kind: "research",
  params: { question: "is solar cheaper than nuclear?" },
  state: "running",
  started: "2026-08-04T00:00:00Z",
  ended: null,
  duration_ms: null,
  progress: { phase: "research", message: "planning", done: 0, total: 0 },
  artifacts: [],
  error: null,
  summary: null,
  ...over,
} as RunRecord)

const ev = (e: Record<string, unknown>): KaiEvent =>
  ({ run_id: RUN, ...e }) as unknown as KaiEvent

beforeEach(() => {
  useRunsStore.setState({ runs: [], logs: {}, trails: {}, error: null })
  useResearchStore.setState({
    question: "", wsId: null, runId: null, busy: false, steps: [], answer: null,
    rounds: 0, searched: 0, reportPath: null, slug: null, deep: false, path: null,
    escalated: false, cost: null, grounding: null, exporting: false, error: null, history: [],
  })
  vi.mocked(api.listRuns).mockReset()
})

describe("runs store research trail", () => {
  it("folds stages and log lines into the same steps the Research screen builds", () => {
    const fold = useRunsStore.getState().handleEvent
    fold(ev({ type: "run.started", run: runRecord() }))
    fold(ev({ type: "run.progress", message: "planning" }))
    fold(ev({ type: "run.log", level: "info", text: "6 subquestions" }))
    fold(ev({ type: "run.log", level: "info", text: "What does solar cost?" }))
    fold(ev({ type: "run.progress", message: "searching (3 queries)" }))

    const trail = useRunsStore.getState().trails[RUN]
    expect(trail).toHaveLength(2)
    expect(trail[0]).toMatchObject({
      label: "Planning the research",
      state: "done",
      details: ["6 subquestions", "What does solar cost?"],
    })
    expect(trail[1]).toMatchObject({ label: "Searching the web", state: "running" })
  })

  it("ignores runs that are not research", () => {
    const fold = useRunsStore.getState().handleEvent
    fold(ev({ type: "run.started", run: runRecord({ id: "w1", kind: "wiki" }) }))
    fold(ev({ type: "run.progress", run_id: "w1", message: "planning" }))
    expect(useRunsStore.getState().trails["w1"]).toBeUndefined()
  })

  it("marks every step done when the run finishes", () => {
    const fold = useRunsStore.getState().handleEvent
    fold(ev({ type: "run.started", run: runRecord() }))
    fold(ev({ type: "run.progress", message: "planning" }))
    fold(ev({ type: "run.finished", state: "done", summary: {} }))
    const trail = useRunsStore.getState().trails[RUN]
    expect(trail.every((s) => s.state === "done")).toBe(true)
  })
})

describe("research store reattach", () => {
  it("adopts the daemon's active research run, trail included", async () => {
    const steps = [
      { label: "Planning the research", state: "done", details: ["6 subquestions"] },
      { label: "Searching the web", state: "running" },
    ] as const
    useRunsStore.setState({
      runs: [runRecord()],
      trails: { [RUN]: steps.map((s) => ({ ...s })) } as never,
    })
    vi.mocked(api.listRuns).mockResolvedValue({ runs: [runRecord()] })

    await useResearchStore.getState().reattach(WS)

    const s = useResearchStore.getState()
    expect(s.busy).toBe(true)
    expect(s.runId).toBe(RUN)
    expect(s.question).toBe("is solar cheaper than nuclear?")
    expect(s.steps).toEqual(steps.map((x) => ({ ...x })))
  })

  it("seeds one step from the current progress when no trail was recorded", async () => {
    vi.mocked(api.listRuns).mockResolvedValue({
      runs: [runRecord({ progress: { phase: "research", message: "reading evidence for 20 subquestion(s)", done: 0, total: 0 } })],
    })

    await useResearchStore.getState().reattach(WS)

    const s = useResearchStore.getState()
    expect(s.busy).toBe(true)
    expect(s.steps).toEqual([
      { label: "Reading evidence for 20 subquestion(s)", state: "running" },
    ])
  })

  it("stays idle when the daemon has no active research run", async () => {
    vi.mocked(api.listRuns).mockResolvedValue({ runs: [runRecord({ state: "done" })] })
    await useResearchStore.getState().reattach(WS)
    expect(useResearchStore.getState().busy).toBe(false)
  })
})

describe("research store live fold", () => {
  it("keeps every detail line on the running step", () => {
    useResearchStore.setState({
      wsId: WS, runId: RUN, busy: true,
      steps: [{ label: "Starting", state: "running" }],
    })
    const fold = useResearchStore.getState().handleEvent
    fold(ev({ type: "run.progress", message: "planning" }))
    fold(ev({ type: "run.log", level: "info", text: "20 subquestions" }))
    fold(ev({ type: "run.log", level: "info", text: "What does solar cost?" }))

    const steps = useResearchStore.getState().steps
    expect(steps).toHaveLength(2)
    expect(steps[1]).toMatchObject({
      label: "Planning the research",
      detail: "What does solar cost?",
      details: ["20 subquestions", "What does solar cost?"],
    })
  })
})
