# 02 — API contract  *(normative)*

This document defines the daemon's HTTP surface. Field names, types, status codes
and event names are **normative**: the Go implementation and the TypeScript client
must both match it exactly. Amend this file in the same commit that changes a
handler.

- **Base URL** `http://127.0.0.1:{port}/v1`
- **Auth** `Authorization: Bearer {token}` on every request, including SSE.
- **Content type** `application/json; charset=utf-8` in and out, except SSE
  (`text/event-stream`) and raw file reads.
- **Encoding of paths** every path in a payload is **slash-separated and
  repo-relative** (`internal/agent/tools.go`), except `Workspace.path`, which is
  absolute and slash-normalised (`D:/project/ai_now_know`). Windows backslashes
  never appear in JSON.
- **Time** RFC 3339 with timezone (`2026-07-25T19:31:07+02:00`).
- **Ids** opaque strings. Do not parse them.

## 2.1 Envelopes

Success returns the resource directly with `200` (or `201`/`202` where noted).

Errors return the matching 4xx/5xx status and:

```json
{
  "error": {
    "code": "workspace_not_found",
    "message": "no workspace with id ws_3f2a",
    "detail": "open it first with POST /v1/workspaces"
  }
}
```

`code` is a stable snake_case identifier the front-end may branch on. `message` is
human-readable and may be shown verbatim. `detail` is optional.

### Error codes

| Code | Status | Meaning |
| --- | --- | --- |
| `unauthorized` | 401 | Missing or wrong bearer token |
| `forbidden_origin` | 403 | `Origin` header not in the allow-list |
| `bad_request` | 400 | Malformed JSON or missing required field |
| `workspace_not_found` | 404 | Unknown workspace id |
| `not_found` | 404 | Unknown session/run/document/skill/module |
| `no_config` | 409 | Repo has no `.kaioken/config.yaml` — call `/init` |
| `no_api_key` | 409 | No key for the active provider |
| `run_conflict` | 409 | A run of this kind is already active for the workspace |
| `run_not_cancellable` | 409 | Run already finished |
| `invalid_yaml` | 422 | Editor payload failed to parse or validate (see §2.9) |
| `path_escape` | 403 | A path argument resolved outside the repo root |
| `engine_error` | 500 | The engine returned an error; `message` is its text |
| `provider_error` | 502 | The LLM provider failed; `detail` carries the upstream message |

## 2.2 System

### `GET /v1/health`
```json
{
  "status": "ok",
  "version": "0.4.0",
  "go_version": "go1.26.5",
  "os": "windows",
  "arch": "amd64",
  "pid": 9184,
  "uptime_ms": 84213,
  "workspaces_open": 1,
  "runs_active": 0
}
```
Unauthenticated callers still get `401` here — health is not a public endpoint.

### `POST /v1/shutdown`
`202` with an empty body, then the process exits after in-flight requests drain
(2 s grace). Active runs are cancelled.

### `GET /v1/events`  *(SSE)*

Query: `since` (optional, uint64) — replay buffered events with `seq > since`.
Response headers: `Content-Type: text/event-stream`, `Cache-Control: no-cache`,
`Connection: keep-alive`, `X-Accel-Buffering: no`.

Frame shape — every frame carries `id`, `event`, and JSON `data`:

```
id: 1043
event: chat.delta
data: {"seq":1043,"ts":"2026-07-25T19:31:07+02:00","workspace_id":"ws_3f2a","run_id":"run_91c","session_id":"20260725-193044-8812","text":"the "}

```

A comment heartbeat `: ping` is sent every 20 s so intermediaries and idle
detection do not close the stream. The ring buffer holds the last **512** events;
a client reconnecting with a `since` older than the buffer receives a
`stream.reset` event first and must refetch its state.

## 2.3 Event catalogue

Every event object contains `seq` (uint64, monotonic), `ts`, and `type`. Most also
carry `workspace_id`. Listed below with their additional fields.

| `event` | Payload fields | Emitted when |
| --- | --- | --- |
| `ready` | `port`, `version` | First frame of every stream |
| `stream.reset` | `from_seq` | Requested `since` predates the ring buffer |
| `workspace.opened` | `workspace` (§2.4) | A workspace is opened |
| `workspace.closed` | `workspace_id` | Closed or forgotten |
| `workspace.changed` | `workspace_id`, `fields[]` | Config, git state, or scan cache changed |
| `run.started` | `run` (§2.7) | A run begins |
| `run.progress` | `run_id`, `phase`, `message`, `done`, `total` | Pipeline progress; `total` may be `0` when unknown |
| `run.log` | `run_id`, `level` (`info`\|`warn`\|`error`), `text` | Free-text engine output |
| `run.artifact` | `run_id`, `path`, `lines`, `kind` (`wiki_doc`\|`card`\|`skill`\|`plan`) | A file was written |
| `run.finished` | `run_id`, `state`, `duration_ms`, `error?`, `summary{}` | A run ends |
| `chat.delta` | `run_id`, `session_id`, `text` | Assistant prose token(s) |
| `chat.message` | `run_id`, `session_id`, `role`, `content`, `index` | A complete message is appended to the transcript |
| `chat.tool_call` | `run_id`, `session_id`, `call_id`, `name`, `args`, `summary` | A tool is about to run |
| `chat.tool_result` | `run_id`, `session_id`, `call_id`, `result`, `is_error`, `duration_ms` | Tool finished |
| `approval.request` | `approval` (§2.6) | The agent needs a decision; the run is blocked |
| `approval.resolved` | `approval_id`, `decision`, `by` (`user`\|`timeout`\|`auto`) | Decision recorded |
| `undo.recorded` | `workspace_id`, `path`, `had_previous`, `depth` | A write/edit was applied |
| `usage.updated` | `workspace_id`, `calls`, `prompt_tokens`, `completion_tokens` | After each provider call |
| `session.updated` | `workspace_id`, `session` (meta) | Title/turn count changed, session saved |
| `error` | `code`, `message` | An out-of-band failure |

`chat.tool_call.summary` is the compact one-line form the TUI shows
(`compactArgs` in `internal/tui/tui.go`): the `path`, `command` or `query`
argument, clipped to 80 characters.

**Ordering guarantee:** within one `run_id`, events are emitted in causal order.
Across runs there is no ordering guarantee beyond `seq`.

## 2.4 Workspaces

### `Workspace` object
```json
{
  "id": "ws_3f2a91",
  "path": "D:/project/ai_now_know",
  "name": "ai_now_know",
  "last_opened": "2026-07-25T19:20:11+02:00",
  "has_config": true,
  "config_path": ".kaioken/config.yaml",
  "git": {
    "is_repo": true,
    "head": "058e2d9c1b…",
    "short": "058e2d9",
    "branch": "master",
    "dirty_count": 3,
    "hook_installed": false
  },
  "knowledge": {
    "has_modules": true,
    "module_count": 9,
    "has_cards": true,
    "has_wiki": true,
    "wiki_sections": 11,
    "wiki_docs": 71,
    "wiki_base": "8006cb3",
    "wiki_model": "anthropic/claude-sonnet-4.5",
    "wiki_multiplier": 3,
    "wiki_failed": [],
    "has_skills": true,
    "skill_count": 6,
    "has_brief": true
  },
  "model": "anthropic/claude-sonnet-4.5",
  "provider": "openrouter",
  "allow_run": false
}
```

`knowledge` is derived from `plan.Load`, `state.Load`, `wiki.LoadStamp`,
`skills.List` and directory existence checks. Missing pieces are `false`/`0`, never
an error.

### `GET /v1/workspaces`
`{ "workspaces": [Workspace…], "recents": ["D:/path/a", "D:/path/b"] }`
Recents come from `~/.kaioken/recents.json`, most recent first, capped at 20.
Recents that no longer exist on disk are returned with `"missing": true`.

### `POST /v1/workspaces`
```json
{ "path": "D:/project/ai_now_know" }
```
`201` with a `Workspace`. Creates the in-memory workspace, adds to recents, emits
`workspace.opened`. Errors: `bad_request` (path missing / not a directory).
A repo without `.kaioken/config.yaml` still opens — `has_config` is `false` and the
UI offers *Initialize*.

### `GET /v1/workspaces/{id}` → `Workspace`

### `DELETE /v1/workspaces/{id}?forget=true`
`204`. Cancels the workspace's runs, drops it from memory; `forget=true` also
removes it from recents.

### `POST /v1/workspaces/{id}/init`
Body: `{ "model": "…" }` (optional override). Writes `.kaioken/config.yaml` via
`config.Default().Save`. `409 no_config` is impossible here; if the file already
exists returns `409` with code `already_initialized`.

### `GET /v1/workspaces/{id}/scan?refresh=true`
```json
{
  "root": "D:/project/ai_now_know",
  "files": 214,
  "bytes": 1843211,
  "stats": "214 files, 1.8 MB",
  "languages": [ {"lang": "go", "files": 71, "bytes": 512334} ],
  "tree": "cli/\n  internal/\n    agent/ (5 files)\n…",
  "scanned_at": "2026-07-25T19:31:00+02:00",
  "cached": true
}
```
`stats` is `scan.Result.Stats()` verbatim; `tree` is `TreeSummary(8)`.

### `GET /v1/workspaces/{id}/status`
Module freshness — the GUI equivalent of `kaioken status`.
```json
{ "modules": [
  { "id": "cli.internal.agent", "title": "Agent", "state": "fresh",
    "files": 5, "generated_at": "2026-07-25T18:52:00+02:00" },
  { "id": "cli.internal.wiki", "title": "Wiki", "state": "changed",
    "files": 12, "generated_at": "2026-07-24T20:10:00+02:00" },
  { "id": "website", "title": "Website", "state": "missing", "files": 38 },
  { "id": "docs", "title": "Docs", "state": "empty", "files": 0 }
] }
```
`state` ∈ `fresh` | `changed` | `missing` | `empty`, mapping to the CLI's
`✓ / Δ / ○ / ∅`.

### `GET /v1/workspaces/{id}/git` → the `git` sub-object of `Workspace`, refreshed.

### `POST /v1/workspaces/{id}/hook`
`{ "action": "install" | "remove" }` → `{ "installed": true, "path": ".git/hooks/post-commit" }`

## 2.5 Configuration and settings

### `GET /v1/workspaces/{id}/config`
JSON mirror of `config.Config`:
```json
{
  "version": 1,
  "model": "anthropic/claude-sonnet-4.5",
  "provider": "openrouter",
  "base_url": "",
  "concurrency": 4,
  "effective_concurrency": 4,
  "concurrency_clamped": false,
  "max_module_tokens": 60000,
  "max_tokens": 0,
  "scope": { "include": [], "exclude": ["**/*.lock"] },
  "notes": ["Real-time features follow the dual-router pattern…"],
  "allow_run": false
}
```
`effective_concurrency` / `concurrency_clamped` come from
`Config.EffectiveConcurrency(model)` so the UI can explain the free-tier clamp.
`allow_run` is desktop-only state persisted in the repo config as `allow_run`.

### `PUT /v1/workspaces/{id}/config`
Full replacement. Validates: `concurrency ≥ 1`, `max_module_tokens ≥ 4000`,
`provider` ∈ `llm.Providers` or `base_url` non-empty. Rewrites the YAML preserving
the leading comment header. Emits `workspace.changed` with
`fields: ["config"]`. Rebuilds the workspace's `llm.Client` if model, provider,
base URL or max tokens changed.

### `GET /v1/settings`
```json
{
  "default_provider": "openrouter",
  "default_model": "anthropic/claude-sonnet-4.5",
  "config_path": "C:/Users/ROG/.kaioken/config.yaml",
  "providers": [
    { "name": "openrouter", "base_url": "https://openrouter.ai/api/v1",
      "key_env": "OPENROUTER_API_KEY", "has_key": true,
      "key_source": "config", "hint": "sk-or-…3f2a" },
    { "name": "openai", "base_url": "https://api.openai.com/v1",
      "key_env": "OPENAI_API_KEY", "has_key": false, "key_source": "none" }
  ]
}
```
`key_source` ∈ `config` (saved in `~/.kaioken/config.yaml`) | `env` (found in the
environment) | `none`. **Key values are never returned.** `hint` shows the first
five and last four characters only, and is omitted when the key is shorter than 12.

### `PUT /v1/settings`
`{ "default_provider": "openrouter", "default_model": "…" }` → the new settings.

### `PUT /v1/settings/keys/{provider}`
`{ "key": "sk-or-v1-…" }` → `204`. Writes `~/.kaioken/config.yaml` with mode 0600.
### `DELETE /v1/settings/keys/{provider}` → `204`
### `POST /v1/settings/keys/{provider}/test`
Calls the provider's `/models`. → `{ "ok": true, "models": 312 }` or `502
provider_error` with the upstream message.

### `GET /v1/models?provider=openrouter&filter=claude`
```json
{ "provider": "openrouter", "models": [ {"id": "anthropic/claude-sonnet-4.5", "name": "Claude Sonnet 4.5"} ], "count": 4 }
```
Cached for 10 minutes per provider; `?refresh=true` bypasses the cache.

## 2.6 Chat

### `GET /v1/workspaces/{id}/sessions`
```json
{ "sessions": [
  { "id": "20260725-193044-8812", "title": "why does update skip new files?",
    "model": "anthropic/claude-sonnet-4.5", "turns": 7,
    "updated": "2026-07-25T19:41:02+02:00" }
] }
```

### `POST /v1/workspaces/{id}/sessions` → `201` with the session meta.
Optional body `{ "model": "…" }` overrides the workspace model for this session.

### `GET /v1/workspaces/{id}/sessions/{sid}`
```json
{
  "id": "20260725-193044-8812",
  "title": "…", "model": "…", "provider": "openrouter",
  "created": "…", "updated": "…",
  "messages": [
    { "role": "system", "content": "You are Kaioken…" },
    { "role": "user", "content": "why does update skip new files?" },
    { "role": "assistant", "content": "Let me look.",
      "tool_calls": [ { "id": "call_1", "type": "function",
        "function": { "name": "read_file", "arguments": "{\"path\":\"cli/internal/wiki/update.go\"}" } } ] },
    { "role": "tool", "tool_call_id": "call_1", "name": "read_file", "content": "…" }
  ],
  "usage": { "calls": 12, "prompt_tokens": 184300, "completion_tokens": 9120 }
}
```
Message shape is `llm.Message` as already serialised into
`.kaioken/sessions/*.json` — do not invent a new shape.

### `DELETE /v1/workspaces/{id}/sessions/{sid}` → `204`

### `POST /v1/workspaces/{id}/sessions/{sid}/messages`
```json
{ "content": "add a -json flag to kaioken status",
  "auto_approve": false,
  "allow_run": false,
  "max_steps": 25 }
```
`202` → `{ "run_id": "run_91c", "session_id": "20260725-193044-8812" }`.
All output arrives on the event stream. `auto_approve` maps to `agent.AutoApprove`
(the `/yolo` equivalent) and applies to this turn only.

### `POST /v1/workspaces/{id}/sessions/{sid}/compact`
Summarises the transcript and replaces it, mirroring the TUI's `/compact`.
→ `{ "before_messages": 48, "after_messages": 6, "saved_tokens_estimate": 91000 }`

### `POST /v1/workspaces/{id}/undo`
Pops the workspace undo stack and calls `agent.Restore`.
→ `{ "path": "cli/internal/wiki/update.go", "restored": true, "deleted": false, "depth": 2 }`
`404 not_found` when the stack is empty.

### `GET /v1/workspaces/{id}/usage`
→ `{ "calls": 12, "prompt_tokens": 184300, "completion_tokens": 9120, "model": "…", "since": "…" }`
Counts come from `llm.Client.Usage()` and reset when the client is rebuilt — the
UI must say "this session" not "all time".

### Approvals

`Approval` object, delivered on `approval.request`:
```json
{
  "approval_id": "apr_7d1",
  "run_id": "run_91c",
  "workspace_id": "ws_3f2a91",
  "action": "edit",
  "target": "cli/internal/wiki/update.go",
  "preview": "- \treturn nil\n+ \treturn fmt.Errorf(…)",
  "diff": {
    "path": "cli/internal/wiki/update.go",
    "kind": "edit",
    "is_new_file": false,
    "added": 3, "removed": 1,
    "hunks": [
      { "old_start": 212, "old_lines": 4, "new_start": 212, "new_lines": 6,
        "lines": [
          { "op": " ", "text": "\tif err != nil {" },
          { "op": "-", "text": "\t\treturn nil" },
          { "op": "+", "text": "\t\treturn fmt.Errorf(\"resolve base: %w\", err)" }
        ] }
    ]
  },
  "command": null,
  "expires_at": "2026-07-25T19:46:02+02:00"
}
```
`action` ∈ `write` | `edit` | `run`. For `run`, `diff` is `null` and `command`
holds the command line. `preview` is the plain-text form the TUI shows, kept so a
minimal client can render something without understanding hunks.

### `POST /v1/approvals/{approval_id}`
```json
{ "decision": "approve" }
```
`decision` ∈ `approve` | `deny` | `approve_all`. `approve_all` approves this
request and sets `AutoApprove` for the remainder of the run. → `204`.
`404 not_found` if already resolved or expired.

## 2.7 Runs

### `Run` object
```json
{
  "id": "run_91c",
  "workspace_id": "ws_3f2a91",
  "kind": "wiki",
  "params": { "multiplier": 3, "force": false },
  "state": "running",
  "started": "2026-07-25T19:31:00+02:00",
  "ended": null,
  "duration_ms": null,
  "progress": { "phase": "sections", "message": "Architecture Overview", "done": 4, "total": 11 },
  "artifacts": [ { "path": ".kaioken/wiki/Getting Started/Getting Started.md", "lines": 412, "kind": "wiki_doc" } ],
  "error": null,
  "summary": null
}
```
`kind` ∈ `scan` | `plan` | `generate` | `wiki` | `wiki_retry` | `update` | `skills`.
`state` ∈ `queued` | `running` | `done` | `failed` | `cancelled` | `interrupted`.

### `POST /v1/workspaces/{id}/runs`
```json
{ "kind": "wiki", "params": { "multiplier": 3, "force": false } }
```
`202` → the `Run` object in state `running`.

Parameters per kind:

| kind | params | engine call |
| --- | --- | --- |
| `scan` | `{}` | `scan.Repo` |
| `plan` | `{}` | `plan.Generate` → `Plan.Save` |
| `generate` | `{ "only": ["mod.id"], "force": false }` | `generate.Run` |
| `wiki` | `{ "multiplier": 1..10, "force": false }` | `wiki.Run` |
| `wiki_retry` | `{}` | `wiki.Retry` |
| `update` | `{ "base": "HEAD~10" }` (optional) | `wiki.Update` |
| `skills` | `{ "only": ["add-a-tui-command"], "force": false }` | `skills.Run` |

`409 run_conflict` if a run of the same kind is active on that workspace.
`409 no_api_key` if no key resolves for the workspace's provider.

**Run summaries** (`run.finished` payload and `Run.summary`) per kind:

```jsonc
// wiki      { "sections": 11, "documents": 71, "failed": [] }
// update    { "changed_files": 6, "updated_docs": 4, "unassigned": ["new/file.go"], "base": "8006cb3" }
// generate  { "generated": 3, "skipped": 6, "failed": 0 }
// skills    { "written": 6 }
// plan      { "modules": 9, "coverage_pct": 92 }
// scan      { "files": 214, "bytes": 1843211 }
```

### `GET /v1/workspaces/{id}/runs?active=true&limit=20` → `{ "runs": [Run…] }`
### `GET /v1/runs/{run_id}` → `Run`
### `POST /v1/runs/{run_id}/cancel` → `202`, or `409 run_not_cancellable`

### `GET /v1/workspaces/{id}/estimate?kind=wiki&multiplier=3`
The pre-flight cost estimate from `wiki.EstimateRun`:
```json
{
  "kind": "wiki", "multiplier": 3,
  "calls": 96, "prompt_tokens": 1840000, "output_tokens": 410000,
  "total_tokens": 2250000, "heavy": true,
  "passes": ["global plan", "architecture brief", "section plans", "section documents", "subsection documents"],
  "text": "estimate: 96 calls · ~2.25M tokens · ×3 (plan → brief → sections → subsections)"
}
```
`text` is `Estimate.String()` verbatim so the GUI and CLI never disagree.

## 2.8 Documents

All document endpoints return **raw markdown** plus metadata; rendering is the
front-end's job (decision D5).

### `GET /v1/workspaces/{id}/wiki/tree`
```json
{
  "root": ".kaioken/wiki",
  "has_readme": true,
  "sections": [
    { "name": "Architecture Overview", "docs": [
      { "title": "Architecture Overview", "rel": "Architecture Overview/Architecture Overview.md",
        "lines": 812, "words": 6120, "reading_minutes": 28,
        "modified": "2026-07-25T19:19:44+02:00", "is_section_doc": true },
      { "title": "Data Flow", "rel": "Architecture Overview/Data Flow.md", "lines": 320, "…": "…" }
    ] }
  ],
  "changelog": true
}
```
Ordering matches `internal/serve`: the section's own document first, then
alphabetical.

### `GET /v1/workspaces/{id}/wiki/doc?path=Architecture%20Overview/Data%20Flow.md`
```json
{
  "path": "Architecture Overview/Data Flow.md",
  "title": "Data Flow",
  "markdown": "# Data Flow\n\n…",
  "lines": 320, "words": 2410, "reading_minutes": 11,
  "modified": "2026-07-25T19:19:44+02:00",
  "provenance": ["cli/internal/wiki/wiki.go", "cli/internal/wiki/passes.go"],
  "toc": [ { "level": 2, "text": "Sequence", "slug": "sequence" } ]
}
```
`provenance` is parsed from the `<!-- kaioken:files … -->` footer
(`internal/wiki/provenance.go`); empty when the document predates it. `toc` is
extracted server-side so the reader does not need to parse markdown twice.
`403 path_escape` if `path` climbs out of the wiki directory.

### `GET /v1/workspaces/{id}/wiki/search?q=provenance&limit=50`
```json
{ "query": "provenance", "hits": [
  { "path": "Knowledge Engine/Incremental Updates.md", "title": "Incremental Updates",
    "line": 88, "snippet": "…the **provenance footer** every generated document carries…",
    "score": 7 }
] }
```
Case-insensitive substring, scored by hit count, capped at `limit`.

### `GET /v1/workspaces/{id}/wiki/changelog` → `{ "markdown": "…" }`

### `GET|PUT /v1/workspaces/{id}/wiki/plan`
GET returns the outline as JSON plus the raw YAML, so the editor can offer both a
form and a text view:
```json
{
  "outline": { "version": 1, "multiplier": 3, "sections": [
    { "id": "getting-started", "title": "Getting Started",
      "goal": "Install, configure and run the first pipeline",
      "files": ["README.md", "cli/cmd/kaioken/main.go"] } ] },
  "yaml": "version: 1\nmultiplier: 3\nsections:\n  - id: getting-started\n…",
  "path": ".kaioken/wiki_plan.yaml",
  "modified": "2026-07-25T18:56:12+02:00"
}
```
PUT accepts **either** `{ "outline": {…} }` **or** `{ "yaml": "…" }`. YAML is
parsed and validated before writing; failures return `422 invalid_yaml` (§2.9) and
leave the file untouched.

### `GET|PUT /v1/workspaces/{id}/wiki/brief`
`.kaioken/architecture.md` — the shared brief injected into every chapter.
`{ "markdown": "…", "path": ".kaioken/architecture.md", "modified": "…" }`

### `GET|PUT /v1/workspaces/{id}/modules`
`.kaioken/modules.yaml`, same dual shape as the wiki plan:
```json
{ "plan": { "modules": [ { "id": "cli.internal.agent", "title": "Agent",
    "purpose": "Tool-calling assistant loop", "paths": ["cli/internal/agent"],
    "children": [] } ] },
  "yaml": "…", "path": ".kaioken/modules.yaml", "modified": "…",
  "validation": ["module 'website' claims no files"],
  "coverage_pct": 92 }
```
`validation` is `plan.Validate` output; `coverage_pct` is the share of scanned
files claimed by some module.

### `GET /v1/workspaces/{id}/cards`
```json
{ "index_path": ".kaioken/KNOWLEDGE.md", "modules": [
  { "id": "cli.internal.agent", "title": "Agent", "generated_at": "…",
    "model": "…", "state": "fresh",
    "cards": [ { "name": "overview", "path": ".kaioken/knowledge/cli.internal.agent/overview.md", "lines": 140 } ] } ] }
```

### `GET /v1/workspaces/{id}/cards/{module}/{card}` → `{ "markdown": "…", "path": "…", "modified": "…" }`

### `GET /v1/workspaces/{id}/skills`
```json
{ "index_path": ".kaioken/skills/README.md", "skills": [
  { "name": "add-a-tui-command",
    "description": "How to add a slash command to the Kaioken TUI…",
    "sources": ["cli/internal/tui/tui.go"],
    "generated_at": "2026-07-24T19:02:36Z",
    "path": ".kaioken/skills/add-a-tui-command/SKILL.md",
    "stale": false } ] }
```
`stale` is true when any source file is newer than `generated_at`.

### `GET|PUT /v1/workspaces/{id}/skills/{name}`
`{ "name": "…", "description": "…", "sources": [], "markdown": "…", "path": "…" }`
PUT validates the front-matter through `skills.Parse` before writing.

### `GET /v1/workspaces/{id}/file?path=cli/internal/wiki/update.go&from=200&to=260`
```json
{ "path": "cli/internal/wiki/update.go", "language": "go",
  "content": "…", "from": 200, "to": 260, "total_lines": 469, "truncated": false }
```
Serves repo source for the diff viewer and *Referenced Files* links. Confined to
the repo root; `403 path_escape` otherwise. Hard cap 1 MB, `truncated: true` past it.

## 2.9 Validation errors

`422 invalid_yaml` carries structured detail so the editor can place a marker:

```json
{ "error": {
    "code": "invalid_yaml",
    "message": "sections[2]: title is required",
    "detail": "yaml: line 18: mapping values are not allowed in this context",
    "problems": [ { "line": 18, "column": 7, "message": "title is required", "path": "sections[2].title" } ] } }
```

## 2.10 Endpoint index

```
GET    /v1/health
POST   /v1/shutdown
GET    /v1/events                                   SSE

GET    /v1/workspaces
POST   /v1/workspaces
GET    /v1/workspaces/{id}
DELETE /v1/workspaces/{id}
POST   /v1/workspaces/{id}/init
GET    /v1/workspaces/{id}/scan
GET    /v1/workspaces/{id}/status
GET    /v1/workspaces/{id}/git
POST   /v1/workspaces/{id}/hook
GET    /v1/workspaces/{id}/config
PUT    /v1/workspaces/{id}/config

GET    /v1/settings
PUT    /v1/settings
PUT    /v1/settings/keys/{provider}
DELETE /v1/settings/keys/{provider}
POST   /v1/settings/keys/{provider}/test
GET    /v1/models

GET    /v1/workspaces/{id}/sessions
POST   /v1/workspaces/{id}/sessions
GET    /v1/workspaces/{id}/sessions/{sid}
DELETE /v1/workspaces/{id}/sessions/{sid}
POST   /v1/workspaces/{id}/sessions/{sid}/messages
POST   /v1/workspaces/{id}/sessions/{sid}/compact
POST   /v1/workspaces/{id}/undo
GET    /v1/workspaces/{id}/usage
POST   /v1/approvals/{approval_id}

POST   /v1/workspaces/{id}/runs
GET    /v1/workspaces/{id}/runs
GET    /v1/workspaces/{id}/estimate
GET    /v1/runs/{run_id}
POST   /v1/runs/{run_id}/cancel

GET    /v1/workspaces/{id}/wiki/tree
GET    /v1/workspaces/{id}/wiki/doc
GET    /v1/workspaces/{id}/wiki/search
GET    /v1/workspaces/{id}/wiki/changelog
GET    /v1/workspaces/{id}/wiki/plan
PUT    /v1/workspaces/{id}/wiki/plan
GET    /v1/workspaces/{id}/wiki/brief
PUT    /v1/workspaces/{id}/wiki/brief
GET    /v1/workspaces/{id}/modules
PUT    /v1/workspaces/{id}/modules
GET    /v1/workspaces/{id}/cards
GET    /v1/workspaces/{id}/cards/{module}/{card}
GET    /v1/workspaces/{id}/skills
GET    /v1/workspaces/{id}/skills/{name}
PUT    /v1/workspaces/{id}/skills/{name}
GET    /v1/workspaces/{id}/file
```

47 endpoints, one event stream, 21 event types.
