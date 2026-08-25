import { describe, expect, it } from "vitest"
import { REGISTRY_LINKS, REGISTRY_WEB_URL } from "../links"

// Guards the single source of truth every desktop surface renders registry
// links from: complete coverage of the site's pages, https-only, no
// duplicates, and doc slugs that actually exist on the website.

describe("REGISTRY_LINKS", () => {
  it("uses https for every destination", () => {
    expect(REGISTRY_WEB_URL.startsWith("https://")).toBe(true)
    for (const l of REGISTRY_LINKS) {
      expect(l.url.startsWith("https://"), l.label).toBe(true)
    }
  })

  it("has unique labels and urls", () => {
    expect(new Set(REGISTRY_LINKS.map((l) => l.label)).size).toBe(REGISTRY_LINKS.length)
    expect(new Set(REGISTRY_LINKS.map((l) => l.url)).size).toBe(REGISTRY_LINKS.length)
  })

  it("covers home, browse, submit, all four doc guides and both GitHub repos", () => {
    const urls = REGISTRY_LINKS.map((l) => l.url)
    expect(urls).toContain(`${REGISTRY_WEB_URL}/`)
    expect(urls).toContain(`${REGISTRY_WEB_URL}/browse`)
    expect(urls).toContain(`${REGISTRY_WEB_URL}/submit`)
    // Slugs must match registry-web/src/pages/Docs.tsx — a renamed guide
    // should fail here, not 404 silently from the desktop app.
    for (const slug of ["developer-guide", "packaging-publishing", "submitting", "user-guide"]) {
      expect(urls).toContain(`${REGISTRY_WEB_URL}/docs/${slug}`)
    }
    expect(urls).toContain("https://github.com/babtix/kaioken-extensions")
    expect(urls).toContain("https://github.com/babtix/kaioken-extension-template")
    expect(REGISTRY_LINKS.length).toBeGreaterThanOrEqual(9)
  })

  it("carries a non-empty description for tooltips and palette subtitles", () => {
    for (const l of REGISTRY_LINKS) {
      expect(l.description.trim().length, l.label).toBeGreaterThan(0)
    }
  })
})
