// Hand-written mirrors of docs/02-api-contract.md. Grow this file per
// feature as new endpoints are wired up — never speculatively.

export type Health = {
  status: string
  version: string
  contract: number
  go_version: string
  os: string
  arch: string
  pid: number
  uptime_ms: number
  workspaces_open: number
  runs_active: number
}

// §2.1 error envelope.
export type ErrorEnvelope = {
  error: {
    code: string
    message: string
    detail?: string
  }
}

export type ConnStatus = "connecting" | "open" | "reconnecting"

// A loose shape for now — grows into the full discriminated union over
// §2.3's event catalogue when the App-level dispatcher (T017) and the
// stores that consume specific event types land.
export type KaiEvent = {
  type: string
  seq?: number
  ts?: string
  workspace_id?: string
  run_id?: string
  session_id?: string
  [key: string]: unknown
}

// §2.4 Workspace object.
export type GitInfo = {
  is_repo: boolean
  head: string
  short: string
  branch: string
  dirty_count: number
  hook_installed: boolean
}

export type Knowledge = {
  has_modules: boolean
  module_count: number
  has_cards: boolean
  has_wiki: boolean
  wiki_sections: number
  wiki_docs: number
  wiki_base: string
  wiki_model: string
  wiki_multiplier: number
  wiki_failed: string[]
  has_skills: boolean
  skill_count: number
  has_brief: boolean
}

export type Workspace = {
  id: string
  path: string
  name: string
  last_opened: string
  has_config: boolean
  config_path: string
  git: GitInfo
  knowledge: Knowledge
  model: string
  provider: string
  allow_run: boolean
}

export type RecentEntry = {
  path: string
  missing?: boolean
}

export type WorkspaceList = {
  workspaces: Workspace[]
  recents: RecentEntry[]
}

// §2.4 scan response.
export type ScanResult = {
  root: string
  files: number
  bytes: number
  stats: string
  languages: { lang: string; files: number; bytes: number }[]
  tree: string
  scanned_at: string
  cached: boolean
}

// §2.4 file completion for the composer's @ mentions.
export type RepoFile = {
  path: string
  name: string
  lines: number
}

// §2.4 status response.
export type ModuleStatus = {
  id: string
  title: string
  state: "fresh" | "changed" | "missing" | "empty"
  files: number
  generated_at?: string
}

// §2.5 config.
export type WorkspaceConfig = {
  version: number
  model: string
  provider: string
  base_url: string
  concurrency: number
  effective_concurrency: number
  concurrency_clamped: boolean
  max_module_tokens: number
  max_tokens: number
  scope: { include: string[]; exclude: string[] }
  notes: string[]
  allow_run: boolean
}

// §2.6 Chat types.
export type SessionMeta = {
  id: string
  title: string
  model: string
  turns: number
  updated: string
}

export type Skill = {
  name: string
  description: string
  sources: string[]
  generated_at: string
  path: string
  stale: boolean
  origin: "generated" | "learned" | "human" | string
  use_count: number
}

export type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool"
  content: string
  tool_calls?: { id: string; type: string; function: { name: string; arguments: string } }[]
  tool_call_id?: string
  name?: string
}

export type SessionFull = {
  id: string
  title: string
  model: string
  provider: string
  created: string
  updated: string
  messages: ChatMessage[]
  usage?: { calls: number; prompt_tokens: number; completion_tokens: number }
}

export type Approval = {
  approval_id: string
  run_id: string
  workspace_id: string
  action: "write" | "edit" | "run"
  target: string
  preview: string
  diff: {
    path: string
    kind: string
    is_new_file: boolean
    added: number
    removed: number
    hunks: { old_start: number; old_lines: number; new_start: number; new_lines: number; lines: { op: string; text: string }[] }[]
  } | null
  command: string | null
  expires_at: string
}

export type Usage = {
  calls: number
  prompt_tokens: number
  completion_tokens: number
  model: string
}

// §2.7 Runs.
export type RunRecord = {
  id: string
  workspace_id: string
  kind: string
  params: Record<string, unknown>
  state: "queued" | "running" | "done" | "failed" | "cancelled" | "interrupted"
  started: string
  ended: string | null
  duration_ms: number | null
  progress: { phase: string; message: string; done: number; total: number }
  artifacts: { path: string; lines: number; kind: string }[]
  error: string | null
  summary: Record<string, unknown> | null
}

/**
 * A saved deep-search report — the structured twin the daemon persists next
 * to the rendered markdown in .kaioken/research. Listings arrive with
 * `markdown` omitted; researchGet returns the full body.
 */
export type ResearchReport = {
  slug: string
  question: string
  markdown?: string
  sources: { n: number; url: string; title: string }[]
  rounds: number
  searched: number
  fetched: number
  incomplete: boolean
  warnings?: string[]
  /** Present only on a deep (x10) run; stripped from listings, which carry counters only. */
  deep?: unknown
  provenance?: { model?: string; search_provider?: string; multiplier?: number }
  report_path?: string
  created_at: string
  /** Hybrid-engine metadata: which execution path produced the report. */
  path?: "fast" | "deep" | string
  /** Run directory id under ~/.kaioken/runs, for the trace. */
  run_id?: string
  /** True when the run was promoted from the fast path mid-run. */
  escalated?: boolean
  escalated_from?: string
  /** Line-itemised meter for the whole run, both paths and any promotion. */
  cost?: ResearchCost
  /** The citation grounding pass's verdict, when the pass ran. */
  grounding?: ResearchGrounding
}

/**
 * An interrupted research run — stopped before its report, checkpointed to
 * disk by the engine, and continuable whenever the user returns. The
 * checkpoint does not age: a run stopped today resumes next month.
 */
export type ResumableRun = {
  id: string
  question: string
  /** Where the pipeline stopped: scope | plan | research | write | cite. */
  phase: string
  /** fast | deep — the route chosen so far; empty before routing. */
  path?: string
  mode?: string
  started_at: string
}

/** The Perplexity-style line-itemised cost a research run reports. */
export type ResearchCost = {
  input_tokens?: number
  output_tokens?: number
  reasoning_tokens?: number
  searches?: number
  fetches?: number
  usd?: number
  /** True when the dollar figure came from the provider, not an estimate. */
  exact?: boolean
}

/** What the separate citation pass concluded about the draft. */
export type ResearchGrounding = {
  checked?: number
  /** Share of checked claims grounded in the raw sources, 0..1. */
  rate?: number
  ungrounded?: number
}

/** What the daemon reports after rendering a saved report to PDF. */
export type ResearchExport = {
  /** Absolute path on disk, for opening the file. */
  path: string
  /** Repo-relative path, for showing the user where it landed. */
  rel: string
  pages: number
  bytes: number
  deep: boolean
}

export type Estimate = {
  kind: string
  multiplier: number
  calls: number
  prompt_tokens: number
  output_tokens: number
  total_tokens: number
  heavy: boolean
  passes: string
  text: string
}

// §2.4 file tree (explorer sidebar).
export type FileTreeNode = {
  name: string
  path: string // repo-relative, slash-separated; "" at the root
  type: "directory" | "file"
  children?: FileTreeNode[]
  lines?: number
  size?: number
  ext?: string
}

export type FileTreeResponse = {
  root: string
  name: string
  children: FileTreeNode[]
  total: number
}

// §2.4 git status (explorer sidebar's source-control panel).
export type GitChange = {
  path: string
  kind: "added" | "modified" | "deleted" | "renamed" | "untracked"
  staged: boolean
  unstaged: boolean
  added: number
  removed: number
}

export type GitStatusResponse = {
  is_repo: boolean
  branch: string
  head: string
  short: string
  /** Tracking branch, or "" when the local branch has no upstream. */
  upstream: string
  ahead: number
  behind: number
  dirty_count: number
  staged_count: number
  changes: GitChange[]
  /** Only present on the response to a commit. */
  commit?: { sha: string; short: string }
}

export type GitDiffResponse = {
  path: string
  staged: boolean
  /** Raw unified diff; untracked files are synthesised against /dev/null. */
  diff: string
  truncated: boolean
}

// §2.8 wiki tree (explorer sidebar's wiki outline).
export type WikiDoc = {
  title: string
  rel: string
  lines: number
  words: number
  reading_minutes: number
  modified?: string
  is_section_doc: boolean
}

export type WikiTreeSection = {
  name: string
  docs: WikiDoc[]
}

export type WikiTree = {
  root: string
  has_readme: boolean
  sections: WikiTreeSection[]
  changelog: boolean
}

// --- Extensions (contract v4) ---

export type ExtSkill = { name: string; description: string }

export type ExtensionInfo = {
  id: string
  version: string
  type: "declarative" | "mcp" | "wasm" | ""
  repo: string
  tag: string
  local: boolean
  enabled: boolean
  trusted: boolean
  needs_trust: boolean
  description?: string
  author?: string
  permissions?: string[]
  /** mcp only: the exact command line trusting would allow to run. */
  command?: string
  /** wasm only: the sandboxed module path inside the package. */
  wasm_entry?: string
  skills: ExtSkill[]
  installed_at: string
  error?: string
}

export type ExtInstallReport = {
  extension: ExtensionInfo
  needs_trust: boolean
  warnings: string[]
}

export type ExtTool = {
  name: string
  full_name: string
  description: string
  kind: string
}

export type ExtUpdateResult = {
  id: string
  from: string
  to?: string
  updated: boolean
  local: boolean
  error?: string
}

export type ExtRegistryEntry = {
  id: string
  repo: string
  name: string
  description: string
  author: string
  /** Capability tier, normalized by the daemon: declarative | mcp | wasm. */
  type: "declarative" | "mcp" | "wasm" | string
  tags?: string[]
  homepage?: string
  /** wasm only: what trusting the extension would grant. */
  permissions?: string[]
}

// --- Local inference servers ---

export type LocalProviderStatus = {
  name: string
  label: string
  base_url: string
  docs?: string
  /** Whether the endpoint answered a probe just now. */
  running: boolean
  models?: string[]
  /** Why a probe failed, phrased for a user rather than a stack trace. */
  error?: string
  latency_ms?: number
}

export type LocalProvidersResponse = {
  providers: LocalProviderStatus[]
  running: number
}

export type EmbedSettings = {
  model: string
  provider: string
  base_url: string
  /** False means search runs on BM25 alone — a supported state, not a broken one. */
  enabled: boolean
}

// --- Cost dashboard ---

export type UsageBucket = {
  key: string
  calls: number
  prompt_tokens: number
  completion_tokens: number
  cost_usd: number
  /** Fraction of this bucket's cost that came from the price table rather
   *  than from a provider. Surfaced so a reader knows how much to trust it. */
  estimated_share: number
}

export type UsageSummary = {
  from: string
  to: string
  calls: number
  prompt_tokens: number
  completion_tokens: number
  cost_usd: number
  /** The portion providers actually reported. The rest is estimated. */
  known_cost_usd: number
  local_calls: number
  by_day: UsageBucket[]
  by_model: UsageBucket[]
  by_provider: UsageBucket[]
  by_operation: UsageBucket[]
  by_workspace: UsageBucket[]
}

export type UsageResponse = {
  days: number
  summary: UsageSummary
  /** True when the price catalog is missing or old enough that estimates drift. */
  pricing_stale: boolean
}

// --- Knowledge search ---

export type SearchHit = {
  path: string
  kind: "wiki" | "card" | "skill"
  section: string
  title: string
  /** Nearest enclosing heading — the passage's caption. */
  heading: string
  line: number
  snippet: string
  score: number
  /** The two component ranks, exposed so a surprising result is explainable. */
  lexical: number
  semantic?: number
}

export type WikiSearchResponse = {
  query: string
  hits: SearchHit[]
  /** True when the index carries embeddings, i.e. ranking is hybrid. */
  semantic: boolean
  sections: string[]
}
