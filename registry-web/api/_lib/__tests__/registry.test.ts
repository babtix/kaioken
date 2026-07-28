import { describe, expect, it } from "vitest"
import { normalizeRepo, hasDescriptionFrontmatter } from "../../validate.js"
import { validRepo } from "../github.js"
import { enrichIndex } from "../registry.js"
import type { Fetcher } from "../github.js"
import type { IndexEntry } from "../types.js"

// A fetcher that answers GitHub's latest-release endpoint from a map and
// fails everything else — no network in tests, ever.
function fakeFetcher(releases: Record<string, unknown>): Fetcher {
  return async (url: string) => {
    const m = url.match(/\/repos\/([^/]+\/[^/]+)\/releases\/latest$/)
    if (m && releases[m[1]]) {
      return new Response(JSON.stringify(releases[m[1]]), { status: 200 })
    }
    return new Response("not found", { status: 404 })
  }
}

const entries: IndexEntry[] = [
  { id: "alice.demo", repo: "alice/kaioken-demo", name: "Demo", description: "d", author: "Alice" },
  { id: "bob.notes", repo: "bob/kaioken-notes", name: "Notes", description: "n", author: "Bob" },
]

describe("enrichIndex", () => {
  it("merges release data and sums asset downloads", async () => {
    const f = fakeFetcher({
      "alice/kaioken-demo": {
        tag_name: "v1.2.0",
        published_at: "2026-07-01T00:00:00Z",
        assets: [{ download_count: 3 }, { download_count: 4 }],
      },
    })
    const out = await enrichIndex(entries, f)
    expect(out[0].version).toBe("1.2.0")
    expect(out[0].released_at).toBe("2026-07-01T00:00:00Z")
    expect(out[0].downloads).toBe(7)
    // bob has no release: entry passes through untouched.
    expect(out[1].version).toBeUndefined()
    expect(out[1].id).toBe("bob.notes")
  })

  it("degrades to the raw entry when GitHub is down", async () => {
    const down: Fetcher = async () => {
      throw new Error("offline")
    }
    const out = await enrichIndex(entries, down)
    expect(out).toHaveLength(2)
    expect(out[0]).toEqual(entries[0])
  })

  it("never builds URLs from malformed repos", async () => {
    let called = 0
    const counting: Fetcher = async () => {
      called++
      return new Response("{}", { status: 200 })
    }
    const evil: IndexEntry = { id: "x.y", repo: "evil/../../internal", name: "X", description: "d", author: "x" }
    await enrichIndex([evil], counting)
    expect(called).toBe(0)
  })
})

describe("validRepo", () => {
  it("accepts GitHub's own charset only", () => {
    expect(validRepo("alice/kaioken-demo")).toBe(true)
    expect(validRepo("A-1_2.b/x.y_z-1")).toBe(true)
    for (const bad of ["alice", "a/b/c", "../x", "a/..", "a/b?x=1", "a/b#f", "a b/c", ""]) {
      expect(validRepo(bad), bad).toBe(false)
    }
  })
})

describe("normalizeRepo", () => {
  it("accepts every way people paste a repo", () => {
    for (const raw of [
      "alice/kaioken-demo",
      "  alice/kaioken-demo  ",
      "github.com/alice/kaioken-demo",
      "https://github.com/alice/kaioken-demo",
      "https://www.github.com/alice/kaioken-demo/",
      "https://github.com/alice/kaioken-demo.git",
      "alice/kaioken-demo@1.2.0",
    ]) {
      expect(normalizeRepo(raw), raw).toBe("alice/kaioken-demo")
    }
  })
})

describe("hasDescriptionFrontmatter", () => {
  it("detects the frontmatter description agents match on", () => {
    expect(hasDescriptionFrontmatter("---\nname: x\ndescription: Does things.\n---\n\n# X\n")).toBe(true)
    expect(hasDescriptionFrontmatter("---\nname: x\n---\n\n# X\n")).toBe(false)
    expect(hasDescriptionFrontmatter("# no frontmatter at all\n")).toBe(false)
    expect(hasDescriptionFrontmatter("---\ndescription:\n---\n")).toBe(false)
  })
})
