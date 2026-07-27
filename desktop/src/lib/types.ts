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
