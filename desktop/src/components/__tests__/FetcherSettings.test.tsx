// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import FetcherSettings from "../FetcherSettings"
import type { FetcherSettings as FetcherSettingsType } from "@/lib/types"
import { api } from "@/lib/api"

afterEach(cleanup)

function makeFetcher(overrides: Partial<FetcherSettingsType> = {}): FetcherSettingsType {
  return {
    mode: "auto",
    modes: ["auto", "firecrawl", "headless", "http"],
    api: true,
    local: true,
    detail: "pages read through Firecrawl, falling back to HTTP and a local browser",
    ok: true,
    browser: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    firecrawl_key: true,
    firecrawl_key_source: "config",
    firecrawl_hint: "fc-***1234",
    firecrawl_env: "FIRECRAWL_API_KEY",
    firecrawl_signup: "https://firecrawl.dev",
    ...overrides,
  }
}

describe("FetcherSettings", () => {
  it("renders the 4 mode selector options and the two switch rows", () => {
    render(<FetcherSettings fetcher={makeFetcher()} onChange={vi.fn()} />)

    expect(screen.getByRole("radio", { name: "Auto" })).toBeTruthy()
    expect(screen.getByRole("radio", { name: "Local only" })).toBeTruthy()
    expect(screen.getByRole("radio", { name: "API only" })).toBeTruthy()
    expect(screen.getByRole("radio", { name: "HTTP only" })).toBeTruthy()

    expect(screen.getByRole("switch", { name: "API — Firecrawl" })).toBeTruthy()
    expect(screen.getByRole("switch", { name: "Local — Headless browser" })).toBeTruthy()
  })

  it("marks Auto active when both API and Local are enabled", () => {
    render(<FetcherSettings fetcher={makeFetcher({ api: true, local: true })} onChange={vi.fn()} />)
    expect(screen.getByRole("radio", { name: "Auto" }).getAttribute("aria-checked")).toBe("true")
    expect(screen.getByRole("radio", { name: "Local only" }).getAttribute("aria-checked")).toBe("false")
    expect(screen.getByRole("radio", { name: "API only" }).getAttribute("aria-checked")).toBe("false")
    expect(screen.getByRole("radio", { name: "HTTP only" }).getAttribute("aria-checked")).toBe("false")
  })

  it("marks Local only active when Local is on and API is off", () => {
    render(<FetcherSettings fetcher={makeFetcher({ api: false, local: true })} onChange={vi.fn()} />)
    expect(screen.getByRole("radio", { name: "Auto" }).getAttribute("aria-checked")).toBe("false")
    expect(screen.getByRole("radio", { name: "Local only" }).getAttribute("aria-checked")).toBe("true")
    expect(screen.getByRole("radio", { name: "API only" }).getAttribute("aria-checked")).toBe("false")
    expect(screen.getByRole("radio", { name: "HTTP only" }).getAttribute("aria-checked")).toBe("false")
  })

  it("marks API only active when API is on and Local is off", () => {
    render(<FetcherSettings fetcher={makeFetcher({ api: true, local: false })} onChange={vi.fn()} />)
    expect(screen.getByRole("radio", { name: "Auto" }).getAttribute("aria-checked")).toBe("false")
    expect(screen.getByRole("radio", { name: "Local only" }).getAttribute("aria-checked")).toBe("false")
    expect(screen.getByRole("radio", { name: "API only" }).getAttribute("aria-checked")).toBe("true")
    expect(screen.getByRole("radio", { name: "HTTP only" }).getAttribute("aria-checked")).toBe("false")
  })

  it("marks HTTP only active when both are off", () => {
    render(<FetcherSettings fetcher={makeFetcher({ api: false, local: false })} onChange={vi.fn()} />)
    expect(screen.getByRole("radio", { name: "Auto" }).getAttribute("aria-checked")).toBe("false")
    expect(screen.getByRole("radio", { name: "Local only" }).getAttribute("aria-checked")).toBe("false")
    expect(screen.getByRole("radio", { name: "API only" }).getAttribute("aria-checked")).toBe("false")
    expect(screen.getByRole("radio", { name: "HTTP only" }).getAttribute("aria-checked")).toBe("true")
  })

  it("clicking a mode selector button calls putSettings with fetcher_mode", async () => {
    const updated = makeFetcher({ api: false, local: true, mode: "headless" })
    const putSpy = vi.spyOn(api, "putSettings").mockResolvedValueOnce({ fetcher: updated })
    const onChange = vi.fn()

    render(<FetcherSettings fetcher={makeFetcher({ api: true, local: true })} onChange={onChange} />)

    fireEvent.click(screen.getByRole("radio", { name: "Local only" }))

    await waitFor(() => {
      expect(putSpy).toHaveBeenCalledWith({ fetcher_mode: "headless" })
      expect(onChange).toHaveBeenCalledWith(updated)
    })
  })

  it("clicking a switch row calls putSettings with fetcher_api or fetcher_local", async () => {
    const updated = makeFetcher({ api: false, local: true, mode: "headless" })
    const putSpy = vi.spyOn(api, "putSettings").mockResolvedValueOnce({ fetcher: updated })
    const onChange = vi.fn()

    render(<FetcherSettings fetcher={makeFetcher({ api: true, local: true })} onChange={onChange} />)

    fireEvent.click(screen.getByRole("switch", { name: "API — Firecrawl" }))

    await waitFor(() => {
      expect(putSpy).toHaveBeenCalledWith({ fetcher_api: false })
      expect(onChange).toHaveBeenCalledWith(updated)
    })
  })
})
