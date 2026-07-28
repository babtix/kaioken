// Wire types shared by the serverless functions and the front-end. The
// registry index shape is a superset of what the Kaioken CLI decodes
// (cli/internal/ext RegistryEntry), so /api/index also works as an
// `ext_registry` target.

/** One listing exactly as it appears in community-extensions.json. */
export type IndexEntry = {
  id: string
  repo: string // owner/name
  name: string
  description: string
  author: string
  type?: "declarative" | "mcp" | "wasm" | string
  tags?: string[]
  permissions?: string[]
  homepage?: string
  /** Moderation state: "malicious" (kill switch) or "deprecated". */
  flags?: string[]
}

/** An index entry after GitHub release enrichment (best effort). */
export type EnrichedEntry = IndexEntry & {
  version?: string
  released_at?: string
  downloads?: number
}

/** One GitHub release, normalized. */
export type ReleaseInfo = {
  tag: string
  name: string
  published_at: string
  notes: string
  downloads: number
}

/** The manifest fields the registry cares about (extension.yaml). */
export type ManifestData = {
  id?: string
  name?: string
  version?: string
  description?: string
  author?: string
  repo?: string
  type?: string
  mcp?: { command?: string; args?: string[]; env?: Record<string, string> } | null
  wasm?: { entry?: string } | null
  permissions?: string[]
  minKaiokenVersion?: string
}

/** GET /api/ext/[id] response. */
export type ExtDetail = {
  entry: EnrichedEntry
  manifest: ManifestData | null
  /** Validation problems in the released manifest, if any. */
  manifest_problems: string[]
  readme: string | null
  releases: ReleaseInfo[]
}

/** POST /api/validate response — the submit wizard's raw material. */
export type ValidationReport = {
  ok: boolean
  repo: string
  errors: string[]
  warnings: string[]
  /** Ready-to-paste index entry; present only when ok. */
  entry?: IndexEntry
}
