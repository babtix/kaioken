import { describe, expect, it } from "vitest"
import type { EnrichedEntry } from "../../../api/_lib/types"
import { allTags, entryType, filterEntries, installCommand, sortEntries, visibleEntries } from "../filter"

const entries: EnrichedEntry[] = [
  {
    id: "alice.git-flow",
    repo: "alice/kaioken-git-flow",
    name: "Git Flow",
    description: "Branching skills",
    author: "Alice",
    tags: ["git", "workflow"],
    downloads: 5,
    released_at: "2026-01-01T00:00:00Z",
  },
  {
    id: "bob.wasm-tools",
    repo: "bob/kaioken-wasm-tools",
    name: "Wasm Tools",
    description: "Sandboxed helpers",
    author: "Bob",
    type: "wasm",
    tags: ["tools"],
    downloads: 20,
    released_at: "2026-03-01T00:00:00Z",
  },
  {
    id: "eve.bad",
    repo: "eve/kaioken-bad",
    name: "Bad",
    description: "Flagged",
    author: "Eve",
    flags: ["malicious"],
  },
  {
    id: "old.thing",
    repo: "old/kaioken-thing",
    name: "Old Thing",
    description: "Abandoned",
    author: "Old",
    flags: ["deprecated"],
  },
]

describe("visibleEntries — the kill switch reaches the web UI", () => {
  it("drops malicious entries and keeps deprecated ones", () => {
    const v = visibleEntries(entries)
    expect(v.map((e) => e.id)).not.toContain("eve.bad")
    expect(v.map((e) => e.id)).toContain("old.thing")
  })
})

describe("filterEntries", () => {
  const v = visibleEntries(entries)
  it("searches across id, name, description, author and tags", () => {
    expect(filterEntries(v, { q: "GIT" }).map((e) => e.id)).toEqual(["alice.git-flow"])
    expect(filterEntries(v, { q: "workflow" }).map((e) => e.id)).toEqual(["alice.git-flow"])
    expect(filterEntries(v, { q: "bob" }).map((e) => e.id)).toEqual(["bob.wasm-tools"])
    expect(filterEntries(v, { q: "zzz" })).toEqual([])
  })
  it("filters by type with declarative as the default tier", () => {
    expect(filterEntries(v, { type: "wasm" }).map((e) => e.id)).toEqual(["bob.wasm-tools"])
    expect(filterEntries(v, { type: "declarative" }).map((e) => e.id)).toEqual(["alice.git-flow", "old.thing"])
  })
  it("filters by tag and composes with search", () => {
    expect(filterEntries(v, { tag: "tools" }).map((e) => e.id)).toEqual(["bob.wasm-tools"])
    expect(filterEntries(v, { tag: "tools", q: "alice" })).toEqual([])
  })
})

describe("sortEntries", () => {
  const v = visibleEntries(entries)
  it("sorts by name, downloads and recency", () => {
    expect(sortEntries(v, "name")[0].name).toBe("Git Flow")
    expect(sortEntries(v, "downloads")[0].id).toBe("bob.wasm-tools")
    expect(sortEntries(v, "recent")[0].id).toBe("bob.wasm-tools")
  })
  it("does not mutate its input", () => {
    const before = v.map((e) => e.id)
    sortEntries(v, "downloads")
    expect(v.map((e) => e.id)).toEqual(before)
  })
})

describe("helpers", () => {
  it("entryType defaults to declarative", () => {
    expect(entryType(entries[0])).toBe("declarative")
    expect(entryType(entries[1])).toBe("wasm")
  })
  it("allTags collects and sorts", () => {
    expect(allTags(entries)).toEqual(["git", "tools", "workflow"])
  })
  it("installCommand matches the CLI syntax", () => {
    expect(installCommand(entries[0])).toBe("kaioken ext install alice/kaioken-git-flow")
  })
})
