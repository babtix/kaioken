// @vitest-environment jsdom
import { beforeAll, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach } from "vitest"
import WikiNavigator, { type NavSection } from "../wiki/WikiNavigator"

// jsdom implements neither scrollIntoView nor requestAnimationFrame (without
// pretendToBeVisual); the navigator uses both for reveal/scroll behaviour.
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn()
  if (!("requestAnimationFrame" in globalThis) || !globalThis.requestAnimationFrame) {
    globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) =>
      setTimeout(() => cb(0), 0)) as unknown as typeof requestAnimationFrame
  }
})

afterEach(cleanup)

const SECTIONS: NavSection[] = [
  {
    name: "Architecture",
    docs: [
      { title: "Architecture", rel: "Architecture/Architecture.md", reading_minutes: 4 },
      { title: "Data Flow", rel: "Architecture/Data Flow.md", reading_minutes: 2 },
    ],
  },
  {
    name: "Storage",
    docs: [{ title: "Notes", rel: "Storage/Notes.md", reading_minutes: 1 }],
  },
]

function setup(overrides: Partial<Parameters<typeof WikiNavigator>[0]> = {}) {
  const onOpen = vi.fn()
  const onQueryChange = vi.fn()
  const utils = render(
    <WikiNavigator
      sections={SECTIONS}
      activePath={null}
      onOpen={onOpen}
      query=""
      onQueryChange={onQueryChange}
      hits={null}
      {...overrides}
    />
  )
  return { onOpen, onQueryChange, ...utils }
}

describe("WikiNavigator", () => {
  it("renders every section and document", () => {
    setup()
    // "Architecture" is both a section header and its lead document.
    expect(screen.getAllByText("Architecture").length).toBe(2)
    expect(screen.getByText("Storage")).toBeTruthy()
    expect(screen.getByText("Data Flow")).toBeTruthy()
    expect(screen.getByText("Notes")).toBeTruthy()
  })

  it("filters titles as the query narrows", () => {
    setup({ query: "data" })
    // "Data Flow" survives (its section header stays for context)…
    expect(screen.getByText("Architecture")).toBeTruthy()
    // …Storage has no match and disappears entirely.
    expect(screen.queryByText("Storage")).toBeNull()
    expect(screen.queryByText("Notes")).toBeNull()
  })

  it("shows an empty message when nothing matches", () => {
    setup({ query: "zzz-no-such-doc" })
    expect(screen.getByText(/No documents match/)).toBeTruthy()
  })

  it("opens a document with arrow keys + Enter", () => {
    const { onOpen } = setup()
    const tree = screen.getByRole("tree")
    // Row 0 is the Architecture section header; two downs reach "Data Flow".
    fireEvent.keyDown(tree, { key: "ArrowDown" })
    fireEvent.keyDown(tree, { key: "ArrowDown" })
    fireEvent.keyDown(tree, { key: "Enter" })
    expect(onOpen).toHaveBeenCalledWith("Architecture/Data Flow.md")
  })

  it("Enter on a section header toggles it collapsed", () => {
    setup()
    const tree = screen.getByRole("tree")
    expect(screen.getByText("Data Flow")).toBeTruthy()
    fireEvent.keyDown(tree, { key: "Enter" }) // cursor starts on the header
    expect(screen.queryByText("Data Flow")).toBeNull()
    fireEvent.keyDown(tree, { key: "Enter" })
    expect(screen.getByText("Data Flow")).toBeTruthy()
  })

  it("ArrowLeft collapses an expanded section", () => {
    setup()
    const tree = screen.getByRole("tree")
    fireEvent.keyDown(tree, { key: "ArrowLeft" })
    expect(screen.queryByText("Data Flow")).toBeNull()
  })

  it("clicking a section header hides its documents", () => {
    setup()
    fireEvent.click(screen.getByText("Storage"))
    expect(screen.queryByText("Notes")).toBeNull()
  })

  it("Escape clears an active filter", () => {
    const { onQueryChange } = setup({ query: "data" })
    fireEvent.keyDown(screen.getByRole("tree"), { key: "Escape" })
    expect(onQueryChange).toHaveBeenCalledWith("")
  })

  it("marks the active document with aria-current", () => {
    setup({ activePath: "Storage/Notes.md" })
    const active = screen.getByText("Notes").closest("button")
    expect(active?.getAttribute("aria-current")).toBe("page")
  })

  it("reveal expands the section that owns the newly active document", () => {
    const { rerender, onOpen, onQueryChange } = setup()
    // Collapse Storage by hand…
    fireEvent.click(screen.getByText("Storage"))
    expect(screen.queryByText("Notes")).toBeNull()
    // …then a navigation makes its document active: the section reopens.
    rerender(
      <WikiNavigator
        sections={SECTIONS}
        activePath="Storage/Notes.md"
        onOpen={onOpen}
        query=""
        onQueryChange={onQueryChange}
        hits={null}
      />
    )
    expect(screen.getByText("Notes")).toBeTruthy()
  })

  it("lists full-text hits below the tree and opens them", () => {
    const { onOpen } = setup({
      hits: [{ path: "Storage/Notes.md", title: "Notes", line: 12, snippet: "sqlite lives here" }],
    })
    expect(screen.getByText("In page text")).toBeTruthy()
    fireEvent.click(screen.getByText("sqlite lives here"))
    expect(onOpen).toHaveBeenCalledWith("Storage/Notes.md")
  })
})
