// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import Research from "../Research"
import { api } from "@/lib/api"
import { useWorkspaceStore } from "@/store/workspace"

import type { Workspace } from "@/lib/types"

afterEach(cleanup)

function makeWorkspace(overrides: Partial<Workspace> = {}): Workspace {
  return {
    id: "w1",
    path: "/test",
    name: "test-workspace",
    last_opened: new Date().toISOString(),
    has_config: true,
    config_path: "/test/.kaioken.yaml",
    git: {
      is_repo: true,
      head: "main",
      short: "main",
      branch: "main",
      dirty_count: 0,
      hook_installed: false,
    },
    knowledge: {
      has_modules: false,
      module_count: 0,
      has_cards: false,
      has_wiki: false,
      wiki_sections: 0,
      wiki_docs: 0,
      wiki_base: "",
      wiki_model: "",
      wiki_multiplier: 1,
      wiki_failed: [],
      has_skills: false,
      skill_count: 0,
      has_brief: false,
    },
    model: "claude-3-7-sonnet",
    provider: "anthropic",
    allow_run: true,
    ...overrides,
  }
}

vi.mock("@/store/research", () => ({
  useResearchStore: () => ({
    question: null,
    busy: false,
    steps: [],
    answer: null,
    rounds: 0,
    searched: 0,
    fetched: null,
    durationMs: null,
    reportPath: null,
    deep: false,
    exporting: false,
    error: null,
    history: [],
    path: null,
    escalated: false,
    cost: null,
    grounding: null,
    paused: [],
    start: vi.fn(),
    cancel: vi.fn(),
    reattach: vi.fn(),
    loadHistory: vi.fn(),
    loadPaused: vi.fn(),
    continueRun: vi.fn(),
    discardPaused: vi.fn(),
    openSaved: vi.fn(),
    deleteSaved: vi.fn(),
    exportPdf: vi.fn(),
  }),
}))

describe("Research route", () => {
  it("renders both Engines and Reader selectors below composer", async () => {
    useWorkspaceStore.setState({
      active: makeWorkspace(),
    })

    vi.spyOn(api, "settings").mockResolvedValue({
      search: {
        provider: "both",
        providers: [
          { name: "tavily", key_env: "TAVILY_API_KEY", signup: "", has_key: true, key_source: "config" },
          { name: "firecrawl", key_env: "FIRECRAWL_API_KEY", signup: "", has_key: true, key_source: "config" },
        ],
      },
      fetcher: {
        mode: "auto",
        modes: ["auto", "firecrawl", "headless", "http"],
        api: true,
        local: true,
        detail: "pages read through Firecrawl, falling back to HTTP and a local browser",
        ok: true,
        browser: "chrome",
        firecrawl_key: true,
        firecrawl_env: "FIRECRAWL_API_KEY",
        firecrawl_signup: "https://firecrawl.dev",
      },
    })

    render(<Research />)

    await waitFor(() => {
      expect(screen.getByText("Engines")).toBeTruthy()
      expect(screen.getByText("Reader")).toBeTruthy()
      expect(screen.getByRole("radio", { name: "Auto" })).toBeTruthy()
      expect(screen.getByRole("radio", { name: "Local only" })).toBeTruthy()
    })
  })

  it("clicking a reader mode triggers api.putSettings with fetcher_mode", async () => {
    useWorkspaceStore.setState({
      active: makeWorkspace(),
    })

    vi.spyOn(api, "settings").mockResolvedValue({
      search: null,
      fetcher: {
        mode: "auto",
        modes: ["auto", "firecrawl", "headless", "http"],
        api: true,
        local: true,
        detail: "pages read through Firecrawl",
        ok: true,
        browser: "chrome",
        firecrawl_key: true,
        firecrawl_env: "FIRECRAWL_API_KEY",
        firecrawl_signup: "",
      },
    })

    const putSpy = vi.spyOn(api, "putSettings").mockResolvedValue({
      fetcher: {
        mode: "headless",
        modes: ["auto", "firecrawl", "headless", "http"],
        api: false,
        local: true,
        detail: "pages read over HTTP, rendering with browser",
        ok: true,
        browser: "chrome",
        firecrawl_key: true,
        firecrawl_env: "FIRECRAWL_API_KEY",
        firecrawl_signup: "",
      },
    })

    render(<Research />)

    await waitFor(() => {
      expect(screen.getByRole("radio", { name: "Local only" })).toBeTruthy()
    })

    fireEvent.click(screen.getByRole("radio", { name: "Local only" }))

    await waitFor(() => {
      expect(putSpy).toHaveBeenCalledWith({ fetcher_mode: "headless" })
    })
  })

  it("allows minimizing and expanding the How it works section", async () => {
    useWorkspaceStore.setState({
      active: makeWorkspace(),
    })

    vi.spyOn(api, "settings").mockResolvedValue({
      search: null,
      fetcher: null,
    })

    render(<Research />)

    await waitFor(() => {
      expect(screen.getByText("How it works")).toBeTruthy()
      expect(screen.getByText("Hide")).toBeTruthy()
    })

    // Click to minimize
    fireEvent.click(screen.getByRole("button", { name: /How it works/i }))

    expect(screen.getByText("Show")).toBeTruthy()
    expect(screen.queryByText(/A router reads the question first/)).toBeNull()

    // Click to expand again
    fireEvent.click(screen.getByRole("button", { name: /How it works/i }))

    expect(screen.getByText("Hide")).toBeTruthy()
    expect(screen.getByText(/A router reads the question first/)).toBeTruthy()
  })
})

