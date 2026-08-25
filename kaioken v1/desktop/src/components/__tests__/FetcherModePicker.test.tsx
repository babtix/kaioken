// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import {
  FetcherModePicker,
  currentFetcherMode,
} from "../FetcherModePicker"

afterEach(cleanup)

describe("FetcherModePicker", () => {
  it("renders all 4 mode options", () => {
    render(<FetcherModePicker value="auto" onChange={vi.fn()} />)
    expect(screen.getByRole("radio", { name: "Auto" })).toBeTruthy()
    expect(screen.getByRole("radio", { name: "Local only" })).toBeTruthy()
    expect(screen.getByRole("radio", { name: "API only" })).toBeTruthy()
    expect(screen.getByRole("radio", { name: "HTTP only" })).toBeTruthy()
  })

  it("marks the correct mode as checked", () => {
    const { rerender } = render(<FetcherModePicker value="headless" onChange={vi.fn()} />)
    expect(screen.getByRole("radio", { name: "Local only" }).getAttribute("aria-checked")).toBe("true")
    expect(screen.getByRole("radio", { name: "Auto" }).getAttribute("aria-checked")).toBe("false")

    rerender(<FetcherModePicker value="firecrawl" onChange={vi.fn()} />)
    expect(screen.getByRole("radio", { name: "API only" }).getAttribute("aria-checked")).toBe("true")

    rerender(<FetcherModePicker value="http" onChange={vi.fn()} />)
    expect(screen.getByRole("radio", { name: "HTTP only" }).getAttribute("aria-checked")).toBe("true")
  })

  it("calls onChange when a radio button is clicked", () => {
    const onChange = vi.fn()
    render(<FetcherModePicker value="auto" onChange={onChange} />)

    fireEvent.click(screen.getByRole("radio", { name: "Local only" }))
    expect(onChange).toHaveBeenCalledWith("headless")

    fireEvent.click(screen.getByRole("radio", { name: "API only" }))
    expect(onChange).toHaveBeenCalledWith("firecrawl")

    fireEvent.click(screen.getByRole("radio", { name: "HTTP only" }))
    expect(onChange).toHaveBeenCalledWith("http")
  })

  it("correctly computes currentFetcherMode from toggles", () => {
    expect(currentFetcherMode({ api: true, local: true })).toBe("auto")
    expect(currentFetcherMode({ api: false, local: true })).toBe("headless")
    expect(currentFetcherMode({ api: true, local: false })).toBe("firecrawl")
    expect(currentFetcherMode({ api: false, local: false })).toBe("http")
    expect(currentFetcherMode(null)).toBe("auto")
  })
})
