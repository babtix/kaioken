import { describe, expect, it } from "vitest"
import { fuzzyMatch, fuzzyMatches } from "../fuzzy"

describe("fuzzyMatch", () => {
  it("matches a subsequence and reports where", () => {
    const m = fuzzyMatch("Architecture Overview", "arch")
    expect(m).not.toBeNull()
    expect(m!.indices).toEqual([0, 1, 2, 3])
  })

  it("matches characters scattered across the text", () => {
    const m = fuzzyMatch("Getting Started", "gsd")
    expect(m).not.toBeNull()
    // g(0) … S(8) … d(14)
    expect(m!.indices).toEqual([0, 8, 14])
  })

  it("returns null when the query is not a subsequence", () => {
    expect(fuzzyMatch("Getting Started", "zzz")).toBeNull()
    // Right letters, wrong order — subsequence matching is order-sensitive.
    expect(fuzzyMatch("abc", "cba")).toBeNull()
  })

  it("is case-insensitive in both directions", () => {
    expect(fuzzyMatch("Development Guide", "DEV")).not.toBeNull()
    expect(fuzzyMatch("DEVELOPMENT GUIDE", "dev")).not.toBeNull()
  })

  it("treats an empty query as a match of everything, with nothing highlighted", () => {
    const m = fuzzyMatch("anything", "")
    expect(m).toEqual({ score: 0, indices: [] })
  })

  it("ranks a word-boundary acronym above a mid-word hit", () => {
    const boundary = fuzzyMatch("Terminal User Interface", "tui")!
    const midWord = fuzzyMatch("intuitive", "tui")!
    expect(boundary.score).toBeGreaterThan(midWord.score)
  })

  it("ranks consecutive matches above scattered ones", () => {
    const run = fuzzyMatch("changelog", "chan")!
    const scattered = fuzzyMatch("cxhxaxnx", "chan")!
    expect(run.score).toBeGreaterThan(scattered.score)
  })

  it("tightens a match to the run rather than the first letters it sees", () => {
    // Greedy-forward matching would take the "s" in "docs" and the "e" in
    // "guide"; the word being searched for is the one in the basename.
    const m = fuzzyMatch("docs/guide/setup.md", "setup")!
    expect(m.indices).toEqual([11, 12, 13, 14, 15])
  })

  it("ranks a basename hit above one in a parent directory", () => {
    const inBase = fuzzyMatch("docs/guide/setup.md", "setup")!
    const inDir = fuzzyMatch("setup/guide/other.md", "setup")!
    expect(inBase.score).toBeGreaterThan(inDir.score)
  })

  it("prefers the shorter of two equally good matches", () => {
    const short = fuzzyMatch("api.ts", "api")!
    const long = fuzzyMatch("api-client-implementation.ts", "api")!
    expect(short.score).toBeGreaterThan(long.score)
  })
})

describe("fuzzyMatches", () => {
  it("is a boolean view of the same test", () => {
    expect(fuzzyMatches("Getting Started", "gs")).toBe(true)
    expect(fuzzyMatches("Getting Started", "xyz")).toBe(false)
  })
})
