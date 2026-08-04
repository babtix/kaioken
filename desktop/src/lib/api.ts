import { authHeaders, base } from "./daemon"
import type { Graph as WikiGraph } from "./graph/types"
import type { EmbedSettings, ErrorEnvelope, WikiSearchResponse, Estimate, ExtInstallReport, ExtRegistryEntry, ExtTool, ExtUpdateResult, ExtensionInfo, FileTreeResponse, GitDiffResponse, GitStatusResponse, Health, LocalProviderStatus, LocalProvidersResponse, ModuleStatus, RepoFile, ResearchExport, ResearchReport, ResumableRun, RunRecord, ScanResult, SessionFull, SessionMeta, Skill, Usage, UsageResponse, WikiTree, Workspace, WorkspaceConfig, WorkspaceList } from "./types"

// Parses the §2.1 error envelope; carries enough for a component to branch
// on err.code (e.g. "no_api_key") instead of printing a stack trace.
export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly detail?: string

  private constructor(status: number, code: string, message: string, detail?: string) {
    super(message)
    this.name = "ApiError"
    this.status = status
    this.code = code
    this.detail = detail
  }

  static async from(res: Response): Promise<ApiError> {
    let code = "bad_request"
    let message = `request failed with status ${res.status}`
    let detail: string | undefined
    try {
      const body = (await res.json()) as ErrorEnvelope
      if (body?.error) {
        code = body.error.code ?? code
        message = body.error.message ?? message
        detail = body.error.detail
      }
    } catch {
      // Non-JSON body (or an empty one) — keep the generic message.
    }
    return new ApiError(res.status, code, message, detail)
  }
}

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(base() + path, {
    method,
    headers: authHeaders(),
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!res.ok) throw await ApiError.from(res)
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T)
}

// One exported function per endpoint, named after it, fully typed. No
// generic request(path) escape hatch — that is how contracts rot.
export const api = {
  health: () => req<Health>("GET", "/health"),

  // Workspaces (T014)
  listWorkspaces: () => req<WorkspaceList>("GET", "/workspaces"),
  openWorkspace: (path: string) => req<Workspace>("POST", "/workspaces", { path }),
  getWorkspace: (id: string) => req<Workspace>("GET", `/workspaces/${id}`),
  deleteWorkspace: (id: string, forget = false) =>
    req<void>("DELETE", `/workspaces/${id}${forget ? "?forget=true" : ""}`),
  initWorkspace: (id: string, model?: string) =>
    req<Workspace>("POST", `/workspaces/${id}/init`, model ? { model } : {}),

  // Workspace sub-resources (T015–T016)
  scan: (id: string, refresh = false) =>
    req<ScanResult>("GET", `/workspaces/${id}/scan${refresh ? "?refresh=true" : ""}`),
  tree: (id: string, refresh = false) =>
    req<FileTreeResponse>("GET", `/workspaces/${id}/tree${refresh ? "?refresh=true" : ""}`),
  gitStatus: (id: string) => req<GitStatusResponse>("GET", `/workspaces/${id}/git/status`),
  // Every mutation answers with the refreshed status, so the panel never has
  // to chase a write with a read.
  gitStage: (id: string, paths: string[]) =>
    req<GitStatusResponse>("POST", `/workspaces/${id}/git/stage`, { paths }),
  gitUnstage: (id: string, paths: string[]) =>
    req<GitStatusResponse>("POST", `/workspaces/${id}/git/unstage`, { paths }),
  gitDiscard: (id: string, paths: string[]) =>
    req<GitStatusResponse>("POST", `/workspaces/${id}/git/discard`, { paths }),
  gitCommit: (id: string, message: string, amend = false) =>
    req<GitStatusResponse>("POST", `/workspaces/${id}/git/commit`, { message, amend }),
  gitDiff: (id: string, path: string, staged = false) =>
    req<GitDiffResponse>(
      "GET",
      `/workspaces/${id}/git/diff?path=${encodeURIComponent(path)}${staged ? "&staged=true" : ""}`
    ),
  files: (id: string, q = "", limit = 20) =>
    req<{ query: string; files: RepoFile[] }>(
      "GET",
      `/workspaces/${id}/files?q=${encodeURIComponent(q)}&limit=${limit}`
    ),
  status: (id: string) => req<{ modules: ModuleStatus[] }>("GET", `/workspaces/${id}/status`),
  readFile: (id: string, path: string) =>
    req<{
      path: string
      language: string
      content: string
      total_lines: number
      truncated: boolean
    }>("GET", `/workspaces/${id}/file?path=${encodeURIComponent(path)}`),
  writeFile: (id: string, path: string, content: string) =>
    req<{ path: string; bytes: number; modified: string }>(
      "PUT",
      `/workspaces/${id}/file?path=${encodeURIComponent(path)}`,
      { content }
    ),
  git: (id: string) => req<Workspace["git"]>("GET", `/workspaces/${id}/git`),
  hook: (id: string, action: "install" | "remove") =>
    req<{ installed: boolean; path?: string }>("POST", `/workspaces/${id}/hook`, { action }),
  getConfig: (id: string) => req<WorkspaceConfig>("GET", `/workspaces/${id}/config`),
  putConfig: (id: string, cfg: Partial<WorkspaceConfig>) =>
    req<WorkspaceConfig>("PUT", `/workspaces/${id}/config`, cfg),

  // Chat (T025–T028)
  listSessions: (wsId: string) => req<{ sessions: SessionMeta[] }>("GET", `/workspaces/${wsId}/sessions`),
  createSession: (wsId: string, model?: string) =>
    req<SessionMeta>("POST", `/workspaces/${wsId}/sessions`, model ? { model } : {}),
  getSession: (wsId: string, sid: string) => req<SessionFull>("GET", `/workspaces/${wsId}/sessions/${sid}`),
  deleteSession: (wsId: string, sid: string) => req<void>("DELETE", `/workspaces/${wsId}/sessions/${sid}`),
  sendMessage: (wsId: string, sid: string, content: string, opts?: { auto_approve?: boolean; allow_run?: boolean; max_steps?: number }) =>
    req<{ run_id: string; session_id: string }>("POST", `/workspaces/${wsId}/sessions/${sid}/messages`, { content, ...opts }),
  resolveApproval: (approvalId: string, decision: "approve" | "deny" | "approve_all") =>
    req<void>("POST", `/approvals/${approvalId}`, { decision }),
  undo: (wsId: string) => req<{ path: string; restored: boolean; deleted: boolean; depth: number }>("POST", `/workspaces/${wsId}/undo`),
  usage: (wsId: string) => req<Usage>("GET", `/workspaces/${wsId}/usage`),
  compactSession: (wsId: string, sid: string) =>
    req<{ before_messages: number; after_messages: number; saved_tokens_estimate: number }>(
      "POST",
      `/workspaces/${wsId}/sessions/${sid}/compact`
    ),

  // Runs (T035–T038)
  startRun: (wsId: string, kind: string, params?: Record<string, unknown>) =>
    req<RunRecord>("POST", `/workspaces/${wsId}/runs`, { kind, params: params ?? {} }),
  listRuns: (wsId: string, active = false) =>
    req<{ runs: RunRecord[] }>("GET", `/workspaces/${wsId}/runs${active ? "?active=true" : ""}`),
  getRun: (runId: string) => req<RunRecord>("GET", `/runs/${runId}`),
  cancelRun: (runId: string) => req<void>("POST", `/runs/${runId}/cancel`),
  revertRun: (runId: string) => req<{ deleted: number; total: number }>("POST", `/runs/${runId}/revert`),
  estimate: (wsId: string, kind = "wiki", multiplier = 3) =>
    req<Estimate>("GET", `/workspaces/${wsId}/estimate?kind=${kind}&multiplier=${multiplier}`),

  // Research history — saved deep-search reports
  researchList: (wsId: string) => req<{ reports: ResearchReport[] }>("GET", `/workspaces/${wsId}/research`),
  researchGet: (wsId: string, slug: string) =>
    req<ResearchReport>("GET", `/workspaces/${wsId}/research/${encodeURIComponent(slug)}`),
  researchDelete: (wsId: string, slug: string) =>
    req<void>("DELETE", `/workspaces/${wsId}/research/${encodeURIComponent(slug)}`),
  // Renders a saved report to a signed PDF beside its markdown twin. The daemon
  // does the rendering, not the app: it already has the workspace on disk, and
  // the signature has to come from the same code that produced the research.
  researchExport: (wsId: string, slug: string) =>
    req<ResearchExport>("POST", `/workspaces/${wsId}/research/${encodeURIComponent(slug)}/export`),

  // Interrupted runs — the stop-and-continue contract. Stopping a research
  // run checkpoints it to disk; this lists what can be continued, and
  // discards what should not be. Continuing is startRun with a `resume`
  // param carrying one of these ids.
  researchRuns: () => req<{ runs: ResumableRun[] }>("GET", "/research/runs"),
  researchRunDelete: (runId: string) =>
    req<void>("DELETE", `/research/runs/${encodeURIComponent(runId)}`),

  // Wiki/docs (T044–T052)
  wikiTree: (wsId: string) => req<WikiTree>("GET", `/workspaces/${wsId}/wiki/tree`),
  wikiDoc: (wsId: string, path: string) => req<any>("GET", `/workspaces/${wsId}/wiki/doc?path=${encodeURIComponent(path)}`),
  // kinds defaults to wiki documents server-side; pass ["wiki","card","skill"]
  // to search the whole knowledge base.
  wikiSearch: (wsId: string, q: string, kinds?: string[]) =>
    req<WikiSearchResponse>(
      "GET",
      `/workspaces/${wsId}/wiki/search?q=${encodeURIComponent(q)}${
        kinds?.length ? `&kind=${kinds.join(",")}` : ""
      }`
    ),
  wikiGraph: (wsId: string) => req<WikiGraph>("GET", `/workspaces/${wsId}/wiki/graph`),
  wikiPlan: (wsId: string) => req<any>("GET", `/workspaces/${wsId}/wiki/plan`),
  putWikiPlan: (wsId: string, yaml: string) => req<any>("PUT", `/workspaces/${wsId}/wiki/plan`, { yaml }),
  wikiBrief: (wsId: string) => req<any>("GET", `/workspaces/${wsId}/wiki/brief`),
  putWikiBrief: (wsId: string, markdown: string) => req<any>("PUT", `/workspaces/${wsId}/wiki/brief`, { markdown }),

  // Cards/modules/skills (T054–T056)
  cards: (wsId: string) => req<any>("GET", `/workspaces/${wsId}/cards`),
  card: (wsId: string, module: string, card: string) =>
    req<{ markdown: string; path: string; modified: string }>(
      "GET",
      `/workspaces/${wsId}/cards/${encodeURIComponent(module)}/${encodeURIComponent(card)}`
    ),
  modules: (wsId: string) => req<any>("GET", `/workspaces/${wsId}/modules`),
  putModules: (wsId: string, yaml: string) => req<any>("PUT", `/workspaces/${wsId}/modules`, { yaml }),
  skills: (wsId: string) => req<{ skills: Skill[] }>("GET", `/workspaces/${wsId}/skills`),
  getSkill: (wsId: string, name: string) =>
    req<{ name: string; description: string; sources: string[]; markdown: string; path: string }>(
      "GET",
      `/workspaces/${wsId}/skills/${encodeURIComponent(name)}`
    ),
  putSkill: (wsId: string, name: string, body: { description: string; sources: string[]; markdown: string }) =>
    req<{ name: string; description: string; sources: string[]; markdown: string; path: string }>(
      "PUT",
      `/workspaces/${wsId}/skills/${encodeURIComponent(name)}`,
      body
    ),

  // Settings (T061–T062)
  settings: () => req<any>("GET", "/settings"),
  putSettings: (body: any) => req<any>("PUT", "/settings", body),
  putKey: (provider: string, key: string) => req<void>("PUT", `/settings/keys/${provider}`, { key }),
  deleteKey: (provider: string) => req<void>("DELETE", `/settings/keys/${provider}`),
  testKey: (provider: string) => req<any>("POST", `/settings/keys/${provider}/test`),
  models: (provider: string, filter?: string) =>
    req<any>("GET", `/models?provider=${provider}${filter ? `&filter=${encodeURIComponent(filter)}` : ""}`),

  // Local inference servers. Probing touches the network, so this is a
  // separate call from settings() — the settings page must render instantly
  // whether or not five endpoints are refusing connections.
  localProviders: () => req<LocalProvidersResponse>("GET", "/settings/local"),
  addLocalProvider: (body: { name: string; base_url: string; label?: string }) =>
    req<LocalProviderStatus>("POST", "/settings/local", body),
  putEmbed: (body: { model: string; provider?: string; base_url?: string }) =>
    req<EmbedSettings>("PUT", "/settings/embed", body),

  // Cost dashboard. Named apart from usage() above, which reports one live
  // client's counters; this is the durable cross-workspace history.
  usageLedger: (days = 30, wsId?: string) =>
    req<UsageResponse>("GET", `/usage?days=${days}${wsId ? `&workspace=${wsId}` : ""}`),
  refreshPricing: () => req<{ models: number }>("POST", "/usage/pricing/refresh"),

  // Extensions (contract v4)
  listExtensions: () => req<{ extensions: ExtensionInfo[] }>("GET", "/extensions"),
  installExtension: (source: string) => req<ExtInstallReport>("POST", "/extensions", { source }),
  devExtension: (path: string) => req<ExtInstallReport>("POST", "/extensions/dev", { path }),
  removeExtension: (id: string) => req<void>("DELETE", `/extensions/${encodeURIComponent(id)}`),
  enableExtension: (id: string, enabled: boolean) =>
    req<void>("POST", `/extensions/${encodeURIComponent(id)}/enable`, { enabled }),
  trustExtension: (id: string) => req<{ tools: ExtTool[] }>("POST", `/extensions/${encodeURIComponent(id)}/trust`),
  untrustExtension: (id: string) => req<void>("POST", `/extensions/${encodeURIComponent(id)}/untrust`),
  extensionTools: (id: string, refresh = false) =>
    req<{ tools: ExtTool[] }>("GET", `/extensions/${encodeURIComponent(id)}/tools${refresh ? "?refresh=true" : ""}`),
  updateExtensions: (id?: string) =>
    req<{ results: ExtUpdateResult[] }>("POST", "/extensions/update", id ? { id } : {}),
  extensionRegistry: (q = "", refresh = false) =>
    req<{ entries: ExtRegistryEntry[] }>(
      "GET",
      `/extensions/registry?q=${encodeURIComponent(q)}${refresh ? "&refresh=true" : ""}`
    ),
}
