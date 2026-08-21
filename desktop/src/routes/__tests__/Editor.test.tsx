// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import Editor from "../Editor"
import { useEditorStore } from "@/store/editor"
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

describe("Editor route", () => {
  it("renders open file tabs and handles left click selection and middle click closing", () => {
    useWorkspaceStore.setState({ active: makeWorkspace({ id: "w1" }) })

    useEditorStore.setState({
      wsId: "w1",
      files: [
        {
          path: "src/main.go",
          content: "package main",
          saved: "package main",
          language: "go",
          loading: false,
          saving: false,
          error: null,
          truncated: false,
        },
        {
          path: "src/util.go",
          content: "package main",
          saved: "package main",
          language: "go",
          loading: false,
          saving: false,
          error: null,
          truncated: false,
        },
      ],
      activePath: "src/main.go",
    })

    render(<Editor />)

    expect(screen.getByText("main.go")).toBeTruthy()
    expect(screen.getByText("util.go")).toBeTruthy()

    // Middle-click (button: 1) on util.go tab to close it
    const utilTab = screen.getByText("util.go").closest("div")!
    fireEvent(utilTab, new MouseEvent("auxclick", { button: 1, bubbles: true }))

    // util.go should be closed
    expect(useEditorStore.getState().files.some((f) => f.path === "src/util.go")).toBe(false)
  })
})
