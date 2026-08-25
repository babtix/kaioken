import { describe, expect, it } from "vitest"
import { NEW_TAB, prettyHost, resolveOmnibox, topSites } from "@/store/browser"

describe("resolveOmnibox", () => {
  it("keeps an explicit scheme untouched", () => {
    expect(resolveOmnibox("https://example.com/a?b=1")).toBe("https://example.com/a?b=1")
    expect(resolveOmnibox("http://example.com")).toBe("http://example.com")
  })

  it("treats a bare host.tld as a URL and defaults it to https", () => {
    expect(resolveOmnibox("example.com")).toBe("https://example.com")
    expect(resolveOmnibox("docs.rs/serde/latest")).toBe("https://docs.rs/serde/latest")
  })

  it("sends localhost and IP literals to http, keeping the port", () => {
    expect(resolveOmnibox("localhost:1420")).toBe("http://localhost:1420")
    expect(resolveOmnibox("127.0.0.1:8080/health")).toBe("http://127.0.0.1:8080/health")
    expect(resolveOmnibox("localhost")).toBe("http://localhost")
  })

  it("searches anything containing a space", () => {
    expect(resolveOmnibox("rust async traits")).toContain("duckduckgo.com/?q=")
    expect(resolveOmnibox("rust async traits")).toContain("rust%20async%20traits")
  })

  it("searches a single word rather than guessing it is a host", () => {
    // "react" is not react.com — a bare word is overwhelmingly a search.
    expect(resolveOmnibox("react")).toContain("duckduckgo.com/?q=react")
  })

  it("searches something dotted that has no plausible TLD", () => {
    expect(resolveOmnibox("v1.2")).toContain("duckduckgo.com/?q=")
  })

  it("honours the selected engine", () => {
    expect(resolveOmnibox("hello", "google")).toBe("https://www.google.com/search?q=hello")
    expect(resolveOmnibox("hello", "bing")).toBe("https://www.bing.com/search?q=hello")
  })

  it("maps blank input to the new-tab page", () => {
    expect(resolveOmnibox("")).toBe(NEW_TAB)
    expect(resolveOmnibox("   ")).toBe(NEW_TAB)
  })

  it("trims surrounding whitespace before deciding", () => {
    expect(resolveOmnibox("  example.com  ")).toBe("https://example.com")
  })

  it("escapes a query so it cannot break out of the URL", () => {
    const out = resolveOmnibox("a&b=c d")
    expect(out).toContain("a%26b%3Dc%20d")
    expect(out.split("?q=")[1]).not.toContain("&")
  })
})

describe("prettyHost", () => {
  it("strips www. and keeps the host only", () => {
    expect(prettyHost("https://www.example.com/deep/path?q=1")).toBe("example.com")
    expect(prettyHost("http://localhost:1420/x")).toBe("localhost:1420")
  })

  it("labels the new-tab page and passes through anything unparseable", () => {
    expect(prettyHost(NEW_TAB)).toBe("New tab")
    expect(prettyHost("not a url")).toBe("not a url")
  })
})

describe("topSites", () => {
  it("ranks by visit count, breaking ties on recency", () => {
    const ranked = topSites([
      { url: "a", title: "a", count: 1, last: 300 },
      { url: "b", title: "b", count: 9, last: 100 },
      { url: "c", title: "c", count: 1, last: 900 },
    ])
    expect(ranked.map((v) => v.url)).toEqual(["b", "c", "a"])
  })

  it("respects the limit", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({
      url: `u${i}`,
      title: `u${i}`,
      count: i,
      last: i,
    }))
    expect(topSites(many, 3)).toHaveLength(3)
  })
})
