// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi, beforeEach } from "vitest"
import { cleanup, render, screen, waitFor } from "@testing-library/react"

import Prism from "../Prism"
import type { PrismAnswer, PrismStatus } from "@/lib/types"

// The route's job beyond CRUD is to keep the three honesty flags visible. A UI
// that folds them into one green "found" badge is precisely the confusion the
// engine exists to prevent, so that is what these tests pin down.

const prismStatus = vi.fn()
const prismDocuments = vi.fn()
const prismQuery = vi.fn()

vi.mock("@/lib/api", () => ({
  api: {
    prismStatus: (...a: unknown[]) => prismStatus(...a),
    prismDocuments: (...a: unknown[]) => prismDocuments(...a),
    prismQuery: (...a: unknown[]) => prismQuery(...a),
    createPrismModule: vi.fn(),
    deletePrismModule: vi.fn(),
    importPrismDocument: vi.fn(),
    deletePrismDocument: vi.fn(),
  },
}))

vi.mock("@/store/workspace", () => ({
  useWorkspaceStore: (sel: (s: unknown) => unknown) => sel({ active: { id: "ws1" } }),
}))

function status(overrides: Partial<PrismStatus> = {}): PrismStatus {
  return {
    status: "embeddings: nomic-embed-text via Ollama (local)",
    embed: { source: "local", detail: "nomic-embed-text via Ollama (local)", model: "nomic-embed-text" },
    utility: "openai/gpt-4o-mini",
    mode: "static",
    options: { top_k: 5, variants: 1, grade: true },
    modules: [
      {
        slug: "notes",
        name: "Notes",
        document_count: 2,
        chunk_count: 40,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      },
    ],
    ...overrides,
  }
}

function answer(overrides: Partial<PrismAnswer> = {}): PrismAnswer {
  return {
    query: "q",
    module: "notes",
    source_found: true,
    graded: true,
    degraded: false,
    chunks: ["the retrieved parent section"],
    route: "simple",
    sub_questions: ["q"],
    elapsed_ms: 12,
    ...overrides,
  }
}

beforeEach(() => {
  prismStatus.mockResolvedValue(status())
  prismDocuments.mockResolvedValue({ documents: [] })
  prismQuery.mockReset()
})
afterEach(cleanup)

describe("Prism route", () => {
  it("names the module list and its counts", async () => {
    render(<Prism />)
    expect(await screen.findByText("Notes")).toBeTruthy()
    expect(screen.getByText(/2 docs · 40 chunks/)).toBeTruthy()
  })

  it("says plainly when the relevance gate cannot run", async () => {
    // Blank is a working configuration, not a half-finished one — but what is
    // lost has to be stated, or an ungraded answer looks like a good one.
    prismStatus.mockResolvedValue(status({ utility: "" }))
    render(<Prism />)
    expect(
      await screen.findByText(/no utility model — the relevance gate cannot run/),
    ).toBeTruthy()
  })

  it("says plainly when retrieval is lexical only", async () => {
    prismStatus.mockResolvedValue(
      status({ embed: { source: "none", detail: "no embedding model", model: "" } }),
    )
    render(<Prism />)
    expect(await screen.findByText(/no embedding model — lexical only/)).toBeTruthy()
  })

  it("renders all three flags on a clean answer", async () => {
    prismQuery.mockResolvedValue(answer())
    render(<Prism />)

    const input = await screen.findByPlaceholderText("Ask this module a question")
    const { fireEvent } = await import("@testing-library/react")
    fireEvent.change(input, { target: { value: "what is the retry policy" } })
    fireEvent.keyDown(input, { key: "Enter" })

    await waitFor(() => expect(screen.getByText("sourced")).toBeTruthy())
    expect(screen.getByText("graded")).toBeTruthy()
    // Degraded is absent, not shown as a false badge — a healthy pipeline
    // should not spend a slot saying so.
    expect(screen.queryByText("degraded")).toBeNull()
  })

  it("shows ungraded and degraded rather than folding them into 'found'", async () => {
    prismQuery.mockResolvedValue(answer({ graded: false, degraded: true }))
    render(<Prism />)

    const input = await screen.findByPlaceholderText("Ask this module a question")
    const { fireEvent } = await import("@testing-library/react")
    fireEvent.change(input, { target: { value: "q" } })
    fireEvent.keyDown(input, { key: "Enter" })

    await waitFor(() => expect(screen.getByText("ungraded")).toBeTruthy())
    expect(screen.getByText("degraded")).toBeTruthy()
    // Still sourced: the chunks exist. The point is that a reader can see
    // nothing checked them.
    expect(screen.getByText("sourced")).toBeTruthy()
  })

  it("reports an empty result as no source rather than as an error", async () => {
    prismQuery.mockResolvedValue(answer({ source_found: false, chunks: [] }))
    render(<Prism />)

    const input = await screen.findByPlaceholderText("Ask this module a question")
    const { fireEvent } = await import("@testing-library/react")
    fireEvent.change(input, { target: { value: "q" } })
    fireEvent.keyDown(input, { key: "Enter" })

    await waitFor(() => expect(screen.getByText("no source")).toBeTruthy())
    expect(screen.getByText(/No source in this module answers that/)).toBeTruthy()
  })

  it("traces each sub-question on the decomposed route", async () => {
    prismQuery.mockResolvedValue(
      answer({
        route: "complex",
        sub_questions: ["what is backoff", "what is jitter"],
        steps: [
          { iteration: 1, query: "what is backoff", chunk_count: 2, source_found: true, degraded: false },
          { iteration: 1, query: "what is jitter", chunk_count: 0, source_found: false, degraded: false },
        ],
        unresolved: ["what is jitter"],
      }),
    )
    render(<Prism />)

    const input = await screen.findByPlaceholderText("Ask this module a question")
    const { fireEvent } = await import("@testing-library/react")
    fireEvent.change(input, { target: { value: "compare backoff and jitter" } })
    fireEvent.keyDown(input, { key: "Enter" })

    await waitFor(() => expect(screen.getByText("what is backoff")).toBeTruthy())
    expect(screen.getByText("hit")).toBeTruthy()
    expect(screen.getByText("miss")).toBeTruthy()
    // A partial answer is only honest if the caller knows which part is missing.
    expect(screen.getByText(/Unresolved: what is jitter/)).toBeTruthy()
  })

  it("renders folder import button and opens modal with extension filtering", async () => {
    render(<Prism />)

    expect(await screen.findByText("Notes")).toBeTruthy()
    expect(screen.getByTitle("Select a directory and filter files by extension")).toBeTruthy()

    // Test folder input trigger
    const folderInput = document.querySelector('input[webkitdirectory=""]') as HTMLInputElement
    expect(folderInput).toBeTruthy()

    const { fireEvent } = await import("@testing-library/react")
    const mockFile1 = new File(["# Docs"], "guide.md", { type: "text/markdown" })
    Object.defineProperty(mockFile1, "webkitRelativePath", { value: "project/docs/guide.md" })
    const mockFile2 = new File(["print('hello')"], "main.py", { type: "text/plain" })
    Object.defineProperty(mockFile2, "webkitRelativePath", { value: "project/src/main.py" })
    const mockFile3 = new File(["img"], "banner.png", { type: "image/png" })
    Object.defineProperty(mockFile3, "webkitRelativePath", { value: "project/assets/banner.png" })

    fireEvent.change(folderInput, {
      target: { files: [mockFile1, mockFile2, mockFile3] },
    })

    // Modal should appear
    expect(await screen.findByText(/Import Folder to/)).toBeTruthy()
    expect(screen.getByText(/3 files discovered/)).toBeTruthy()
    expect(screen.getByText("Markdown (.md)")).toBeTruthy()
    expect(screen.getByText("Python (.py)")).toBeTruthy()
    expect(screen.getByText("project/docs/guide.md")).toBeTruthy()
    expect(screen.getByText("project/src/main.py")).toBeTruthy()
  })
})
