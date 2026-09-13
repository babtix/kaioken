import manifest from "./wiki-manifest.json"

export interface WikiDoc {
  slug: string
  file: string
  title: string
  words: number
  hasMermaid: boolean
  sources: string[]
}

export interface WikiSection {
  slug: string
  dir: string
  title: string
  docs: WikiDoc[]
}

export const WIKI_SECTIONS = manifest.sections as WikiSection[]
export const WIKI_README = manifest.readme as { file: string; title: string; words: number } | null
export const WIKI_STATS = manifest.stats as {
  sections: number
  documents: number
  words: number
}

/**
 * What this run actually cost, and what the same repo would cost at ×10.
 * The shipped output is a default ×3 run.
 */
export const RUN_COST = {
  level: "×3",
  levelNote: "default depth",
  tokens: "~1.3M",
  tokensLong: "≈ 1,300,000 tokens",
  deepLevel: "×10",
  deepTokens: "~2.3M",
  deepTokensLong: "≈ 2,300,000 tokens",
}

/** Public URL of a document's raw markdown. */
export function docUrl(sectionDir: string, file: string) {
  return `/kaioken/wiki/${encodeURIComponent(sectionDir)}/${encodeURIComponent(file)}`
}

export function findSection(slug?: string) {
  return WIKI_SECTIONS.find((s) => s.slug === slug)
}

export function findDoc(sectionSlug?: string, docSlug?: string) {
  const section = findSection(sectionSlug)
  if (!section) return undefined
  const doc = section.docs.find((d) => d.slug === docSlug)
  return doc ? { section, doc } : undefined
}

/** Flat reading order, for prev/next inside the preview. */
export const WIKI_FLAT = WIKI_SECTIONS.flatMap((s) =>
  s.docs.map((d) => ({ section: s, doc: d }))
)
