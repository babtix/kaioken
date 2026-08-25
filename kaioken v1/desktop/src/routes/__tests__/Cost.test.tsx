// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import Cost from "../Cost"
import { api } from "@/lib/api"
import type { UsageResponse } from "@/lib/types"

afterEach(cleanup)

const mockUsageResponse: UsageResponse = {
  days: 30,
  pricing_stale: false,
  summary: {
    calls: 12,
    prompt_tokens: 1500,
    completion_tokens: 500,
    cost_usd: 0.12,
    known_cost_usd: 0.12,
    local_calls: 0,
    by_model: [
      {
        key: "claude-3-7-sonnet",
        calls: 12,
        prompt_tokens: 1500,
        completion_tokens: 500,
        cost_usd: 0.12,
        estimated_share: 0,
      },
    ],
    by_provider: [
      {
        key: "anthropic",
        calls: 12,
        prompt_tokens: 1500,
        completion_tokens: 500,
        cost_usd: 0.12,
        estimated_share: 0,
      },
    ],
    by_day: [
      {
        key: "2026-08-22",
        calls: 12,
        prompt_tokens: 1500,
        completion_tokens: 500,
        cost_usd: 0.12,
        estimated_share: 0,
      },
    ],
    by_operation: [
      {
        key: "chat",
        calls: 12,
        prompt_tokens: 1500,
        completion_tokens: 500,
        cost_usd: 0.12,
        estimated_share: 0,
      },
    ],
    by_workspace: [
      {
        key: "/test",
        calls: 12,
        prompt_tokens: 1500,
        completion_tokens: 500,
        cost_usd: 0.12,
        estimated_share: 0,
      },
    ],
  },
}

describe("Cost Route", () => {
  it("renders 7d, 30d, 90d and All time options and fetches accordingly", async () => {
    const usageSpy = vi.spyOn(api, "usageLedger").mockResolvedValue(mockUsageResponse)

    render(<Cost />)

    // Initial load defaults to 30d
    await waitFor(() => {
      expect(usageSpy).toHaveBeenCalledWith("30", undefined)
    })

    // Check window options exist
    expect(screen.getByRole("button", { name: "7d" })).toBeDefined()
    expect(screen.getByRole("button", { name: "30d" })).toBeDefined()
    expect(screen.getByRole("button", { name: "90d" })).toBeDefined()
    expect(screen.getByRole("button", { name: "All time" })).toBeDefined()

    // Switch to All time
    fireEvent.click(screen.getByRole("button", { name: "All time" }))

    await waitFor(() => {
      expect(usageSpy).toHaveBeenCalledWith("all", undefined)
    })

    // Switch to 7d
    fireEvent.click(screen.getByRole("button", { name: "7d" }))

    await waitFor(() => {
      expect(usageSpy).toHaveBeenCalledWith("7", undefined)
    })

    // Switch to 90d
    fireEvent.click(screen.getByRole("button", { name: "90d" }))

    await waitFor(() => {
      expect(usageSpy).toHaveBeenCalledWith("90", undefined)
    })
  })
})
