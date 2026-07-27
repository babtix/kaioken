import { describe, expect, it } from "vitest"
import { slugId, sortPosts, type Post } from "../store"

const post = (id: string, created: string): Post => ({
  id,
  title: id,
  summary: "",
  body: "",
  tags: [],
  published: true,
  created,
  updated: created,
})

describe("slugId", () => {
  it("makes a URL-safe slug from a title", () => {
    expect(slugId("Kaioken v0.2 — Desktop Preview!")).toBe("kaioken-v0-2-desktop-preview")
  })

  it("collapses runs and trims separators", () => {
    expect(slugId("  hello   world  ")).toBe("hello-world")
  })

  it("falls back when a title has no usable characters", () => {
    expect(slugId("!!!")).toMatch(/^post-/)
    expect(slugId("")).toMatch(/^post-/)
  })

  it("caps length so ids stay readable", () => {
    expect(slugId("a".repeat(200)).length).toBeLessThanOrEqual(60)
  })
})

describe("sortPosts", () => {
  it("orders newest first", () => {
    const sorted = sortPosts([
      post("old", "2026-01-01T00:00:00Z"),
      post("new", "2026-07-01T00:00:00Z"),
      post("mid", "2026-03-01T00:00:00Z"),
    ])
    expect(sorted.map((p) => p.id)).toEqual(["new", "mid", "old"])
  })

  it("does not mutate its input", () => {
    const input = [post("a", "2026-01-01T00:00:00Z"), post("b", "2026-02-01T00:00:00Z")]
    sortPosts(input)
    expect(input.map((p) => p.id)).toEqual(["a", "b"])
  })
})
