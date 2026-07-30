# Kaioken MCP Server — Implementation Specification

> **Target:** Claude Code (or any AI coding agent)
> **Priority:** P0 — Highest ROI feature
> **Estimated effort:** 2–3 weeks for a single agent
> **Review gate:** Human review after implementation (this spec author will review)

---

## 1. Executive Summary

**What:** Add a Model Context Protocol (MCP) server to Kaioken that exposes its knowledge engine (wiki, skills, research, repo analysis) to any MCP-compatible client (Claude Desktop, Cursor, Windsurf, VS Code Copilot, Continue, etc.).

**Why:** Kaioken's core value is *deep repository knowledge* — wiki chapters, task skills, semantic understanding. Currently only accessible via Kaioken's own TUI/desktop. MCP makes it a **universal knowledge provider** for every AI assistant on the market.

**Scope:** STDIO transport (primary) + HTTP/SSE transport (optional stretch). No UI changes. Pure Go package + CLI command.

---

## 2. Requirements

### 2.1 Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-01 | MCP server starts via `kaioken mcp serve` (STDIO) | P0 |
| FR-02 | Exposes tools: `wiki_search`, `wiki_read`, `wiki_tree`, `skills_list`, `skills_get`, `research_run`, `repo_scan`, `repo_status`, `repo_git` | P0 |
| FR-03 | Exposes resources: `wiki://<section>`, `skill://<name>`, `card://<module>/<card>`, `repo://<path>` | P0 |
| FR-04 | Auto-discovers workspace from CWD or `--repo` flag | P0 |
| FR-05 | Reuses existing `internal/daemon` logic (no duplicate business logic) | P0 |
| FR-06 | Auth via bearer token (same as daemon) or `--no-auth` for local STDIO | P0 |
| FR-07 | Structured logging to stderr (JSONL) for debugging | P1 |
| FR-08 | HTTP/SSE transport on `--port` (for remote clients) | P2 |
| FR-09 | Capability negotiation (tools, resources, prompts) | P0 |
| FR-10 | Graceful shutdown on stdin close / SIGTERM | P0 |

### 2.2 Non-Functional Requirements

| ID | Requirement |
|----|-------------|
| NFR-01 | Cold start < 500ms (no LLM calls on startup) |
| NFR-02 | Memory < 50MB idle |
| NFR-03 | Compatible with MCP spec 2024-11-05 (current stable) |
| NFR-04 | Works with Claude Desktop, Cursor, VS Code Copilot, Continue |
| NFR-05 | No breaking changes to existing CLI/TUI/daemon |

---

## 3. Architecture

### 3.1 Package Structure

```
cli/
├── internal/
│   └── mcp/
│       ├── server.go          # Main server, transport abstraction
│       ├── server_test.go
│       ├── stdio.go           # STDIO transport
│       ├── http.go            # HTTP/SSE transport (P2)
│       ├── tools.go           # Tool definitions + handlers
│       ├── tools_test.go
│       ├── resources.go       # Resource definitions + handlers
│       ├── resources_test.go
│       ├── prompts.go         # Prompt templates (optional)
│       ├── registry.go        # Tool/resource/prompt registry
│       ├── config.go          # MCP-specific config
│       └── types.go           # MCP protocol types (or use github.com/mark3labs/mcp-go-mcp)
├── cmd/
│   └── kaioken/
│       └── mcp.go             # `kaioken mcp` subcommand
└── .kaioken/
    └── mcp.json               # Auto-generated manifest for clients
```

### 3.2 Transport Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      MCP Server                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │  STDIO       │  │  HTTP/SSE    │  │  Registry        │  │
│  │  Transport   │  │  Transport   │  │  (tools/resources│  │
│  │  (primary)   │  │  (optional)  │  │   /prompts)      │  │
│  └──────┬───────┘  └──────┬───────┘  └────────┬─────────┘  │
│         │                 │                     │           │
│         └─────────────────┼─────────────────────┘           │
│                           ▼                                 │
│              ┌────────────────────────┐                     │
│              │   Handler Pipeline     │                     │
│              │  auth → validate →     │                     │
│              │  route → execute       │                     │
│              └───────────┬────────────┘                     │
│                          │                                   │
│         ┌───────────────┼───────────────┐                   │
│         ▼               ▼               ▼                   │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐              │
│  │ Wiki Tools │ │Skills Tools│ │Research/   │              │
│  │            │ │            │ │Repo Tools  │              │
│  └────────────┘ └────────────┘ └────────────┘              │
│         │               │               │                   │
│         └───────────────┼───────────────┘                   │
│                         ▼                                   │
│              ┌────────────────────────┐                     │
│              │  Existing Internals    │                     │
│              │  wiki, skills, scan,   │                     │
│              │  research, gitx, config│                     │
│              └────────────────────────┘                     │
└─────────────────────────────────────────────────────────────┘
```

### 3.3 Dependency on Existing Code

**Reuse (do not duplicate):**
- `internal/wiki` — `LoadOutline`, `ReadDoc`, `Search`, `LoadStamp`
- `internal/skills` — `List`, `Load`, `Parse`, `Stale`
- `internal/research` — `Run`, `Options`
- `internal/scan` — `Repo`, `Result.Languages()`, `Result.Stats()`
- `internal/gitx` — `Status`, `Log`, `Diff`
- `internal/config` — `Load`, `Path`, `Dir`
- `internal/state` — `Load` (for module freshness)
- `internal/daemon/workspace` — `Manager` (for multi-repo later)

**New code only for:**
- MCP protocol framing (JSON-RPC 2.0)
- Transport layers (STDIO, HTTP/SSE)
- Tool/resource schema definitions
- Request routing + auth

---

## 4. MCP Protocol Surface

### 4.1 Tools (Callable by LLM)

| Tool | Description | Parameters | Returns |
|------|-------------|------------|---------|
| `wiki_search` | Full-text search across wiki docs | `query: string`, `section?: string`, `limit?: int (default 10)` | `{results: [{title, section, snippet, path}]}` |
| `wiki_read` | Read a wiki document with TOC | `path: string` (e.g. `architecture/overview.md`) | `{title, markdown, toc: [{level, title, anchor}], provenance}` |
| `wiki_tree` | Get wiki section tree | `section?: string` | `{sections: [{id, title, children: [...]}}]}` |
| `skills_list` | List all skills with staleness | `include_stale?: bool` | `{skills: [{name, description, origin, stale, sources[]}]}` |
| `skills_get` | Get full skill content | `name: string` | `{name, description, body, frontmatter, sources[]}` |
| `research_run` | Run iterative web research | `question: string`, `multiplier?: int (1-10, default 3)`, `max_rounds?: int` | `{markdown, sources: [{id, url, title}], rounds, cost_usd}` |
| `repo_scan` | Scan repository structure | `refresh?: bool` | `{stats: {files, lines, size}, languages: {lang: count}, tree_summary}` |
| `repo_status` | Module freshness status | (none) | `{modules: [{id, title, state: "uptodate"|"changed"|"missing"|"empty", files, generated_at}]}` |
| `repo_git` | Git status/log/diff | `operation: "status"|"log"|"diff"`, `args?: object` | `{output: string}` |

### 4.2 Resources (Readable by LLM)

| URI Pattern | Description | MIME Type |
|-------------|-------------|-----------|
| `wiki://<section>/<doc>` | Wiki document | `text/markdown` |
| `wiki://<section>` | Section index | `application/json` |
| `skill://<name>` | Skill document | `text/markdown` |
| `card://<module>/<card>` | Knowledge card | `text/markdown` |
| `repo://<path>` | Source file | `text/<lang>` |
| `config://workspace` | Workspace config | `application/yaml` |

### 4.3 Prompts (Optional, P2)

| Prompt | Description |
|--------|-------------|
| `wiki_plan_review` | "Review this wiki_plan.yaml for completeness..." |
| `skill_create` | "Create a skill for [task] based on repo analysis..." |
| `code_review` | "Review this diff against project conventions..." |

---

## 5. CLI Interface

### 5.1 Command Structure

```bash
kaioken mcp <subcommand> [flags]

Subcommands:
  serve       Start MCP server (STDIO by default)
  manifest    Generate mcp.json for client auto-discovery
  validate    Validate server starts and responds to initialize

Flags (serve):
  --repo <path>         Target repository (default: CWD)
  --transport <stdio|http>  Transport (default: stdio)
  --port <int>          HTTP port (required if --transport http)
  --token <string>      Bearer token (default: auto-generate for stdio)
  --no-auth             Disable auth (local stdio only)
  --log-level <debug|info|warn|error>  Log level (default: info)
  --log-file <path>     JSONL log file (default: stderr)
```

### 5.2 Examples

```bash
# STDIO for Claude Desktop (auto-token, no auth needed locally)
kaioken mcp serve

# HTTP for remote Cursor/VS Code
kaioken mcp serve --transport http --port 3456 --token my-secret

# Generate manifest for client config
kaioken mcp manifest --repo . > .kaioken/mcp.json
```

### 5.3 Client Config (Claude Desktop)

```json
// ~/Library/Application Support/Claude/claude_desktop_config.json
{
  "mcpServers": {
    "kaioken": {
      "command": "kaioken",
      "args": ["mcp", "serve", "--repo", "/path/to/your/project"],
      "env": {}
    }
  }
}
```

---

## 6. Implementation Plan (Task Breakdown)

### Phase 1: Foundation (Week 1)

| Task | Files | Description | Check |
|------|-------|-------------|-------|
| T1.1 | `internal/mcp/types.go` | MCP protocol types (JSON-RPC 2.0, Initialize, Tool, Resource, etc.) or import `github.com/mark3l/go-mcp` | `go build ./internal/mcp` |
| T1.2 | `internal/mcp/registry.go` | Tool/Resource/Prompt registry with type-safe registration | Unit test: register 10 tools, lookup by name |
| T1.3 | `internal/mcp/stdio.go` | STDIO transport: newline-delimited JSON-RPC, stdin→decode→handle→encode→stdout | `echo '{"jsonrpc":"2.0","id":1,"method":"initialize",...}' | go run ./cmd/kaioken mcp serve` → valid response |
| T1.4 | `cmd/kaioken/mcp.go` | `mcp` command with `serve`, `manifest`, `validate` subcommands | `kaioken mcp --help` shows all subcommands |

### Phase 2: Core Tools (Week 1–2)

| Task | Files | Description | Check |
|------|-------|-------------|-------|
| T2.1 | `internal/mcp/tools_wiki.go` | `wiki_search`, `wiki_read`, `wiki_tree` handlers | `go test ./internal/mcp -run TestWikiTools` |
| T2.2 | `internal/mcp/tools_skills.go` | `skills_list`, `skills_get` handlers | `go test ./internal/mcp -run TestSkillsTools` |
| T2.3 | `internal/mcp/tools_repo.go` | `repo_scan`, `repo_status`, `repo_git` handlers | `go test ./internal/mcp -run TestRepoTools` |
| T2.4 | `internal/mcp/tools_research.go` | `research_run` handler (async, returns run_id + poll) | `go test ./internal/mcp -run TestResearchTool` |

### Phase 3: Resources & Auth (Week 2)

| Task | Files | Description | Check |
|------|-------|-------------|-------|
| T3.1 | `internal/mcp/resources.go` | Resource handlers for all URI schemes | `curl -H "Authorization: Bearer $TOKEN" http://localhost:3456/resources/wiki://architecture/overview` |
| T3.2 | `internal/mcp/auth.go` | Bearer token validation (reuse `daemon` auth logic) | Unauthenticated request → 401; wrong token → 403 |
| T3.3 | `internal/mcp/config.go` | MCP config: token generation, persist to `.kaioken/mcp_token` | Token persists across restarts |

### Phase 4: HTTP Transport & Polish (Week 2–3)

| Task | Files | Description | Check |
|------|-------|-------------|-------|
| T4.1 | `internal/mcp/http.go` | HTTP/SSE transport (upgrade from stdio pattern) | `kaioken mcp serve --transport http --port 3456` → health check works |
| T4.2 | `internal/mcp/manifest.go` | Generate `mcp.json` with server metadata, tool schemas | `kaioken mcp manifest` → valid JSON Schema for all tools |
| T4.3 | `internal/mcp/logging.go` | Structured JSONL logging to stderr/file | Logs show request/response/timing |
| T4.4 | Integration tests | Full flow with real repo | `go test ./internal/mcp -run TestIntegration` |

### Phase 5: Client Validation (Week 3)

| Task | Description | Check |
|------|-------------|-------|
| T5.1 | Test with Claude Desktop | Add to config, restart Claude, ask "search wiki for architecture" → returns results |
| T5.2 | Test with Cursor | Add MCP server, use `@kaioken wiki_search` → works |
| T5.3 | Test with VS Code Copilot / Continue | Verify tool calling works end-to-end |

---

## 7. Detailed Tool Specifications

### 7.1 `wiki_search`

```json
{
  "name": "wiki_search",
  "description": "Search Kaioken-generated wiki documents by full-text query. Returns ranked snippets with section context.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "query": {"type": "string", "description": "Search query (case-insensitive, supports phrases)"},
      "section": {"type": "string", "description": "Optional section ID to limit search (e.g. 'architecture', 'chat_agent')"},
      "limit": {"type": "integer", "minimum": 1, "maximum": 50, "default": 10}
    },
    "required": ["query"]
  },
  "outputSchema": {
    "type": "object",
    "properties": {
      "results": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "title": {"type": "string"},
            "section": {"type": "string"},
            "path": {"type": "string"},
            "snippet": {"type": "string"},
            "score": {"type": "number"}
          }
        }
      },
      "total_hits": {"type": "integer"}
    }
  }
}
```

**Handler logic:**
1. Load `wiki_state.yaml` → get `wiki_dir`
2. Call `wiki.Search(ctx, repo, query, section, limit)` (new function, mirrors `internal/serve` search)
3. Return formatted results

### 7.2 `wiki_read`

```json
{
  "name": "wiki_read",
  "description": "Read a full wiki document with table of contents and provenance metadata.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "path": {"type": "string", "description": "Document path relative to wiki root (e.g. 'architecture/overview.md', 'chat_agent/llm_integration.md')"}
    },
    "required": ["path"]
  },
  "outputSchema": {
    "type": "object",
    "properties": {
      "title": {"type": "string"},
      "markdown": {"type": "string"},
      "toc": {
        "type": "array",
        "items": {"type": "object", "properties": {"level": {"type": "integer"}, "title": {"type": "string"}, "anchor": {"type": "string"}}}
      },
      "provenance": {
        "type": "object",
        "properties": {
          "generated_at": {"type": "string", "format": "date-time"},
          "model": {"type": "string"},
          "multiplier": {"type": "integer"},
          "source_files": {"type": "array", "items": {"type": "string"}}
        }
      }
    }
  }
}
```

### 7.3 `skills_list`

```json
{
  "name": "skills_list",
  "description": "List all project skills with metadata and staleness status.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "include_stale": {"type": "boolean", "default": true}
    }
  },
  "outputSchema": {
    "type": "object",
    "properties": {
      "skills": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "name": {"type": "string"},
            "description": {"type": "string"},
            "origin": {"type": "string", "enum": ["generated", "learned", "human"]},
            "stale": {"type": "boolean"},
            "sources": {"type": "array", "items": {"type": "string"}},
            "generated_at": {"type": "string", "format": "date-time"},
            "use_count": {"type": "integer"},
            "last_used": {"type": "string", "format": "date-time"}
          }
        }
      }
    }
  }
}
```

### 7.4 `research_run` (Async Pattern)

```json
{
  "name": "research_run",
  "description": "Start an iterative web research run. Returns immediately with a run_id; poll research_status for completion.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "question": {"type": "string"},
      "multiplier": {"type": "integer", "minimum": 1, "maximum": 10, "default": 3},
      "max_rounds": {"type": "integer", "minimum": 1, "maximum": 10, "default": 5}
    },
    "required": ["question"]
  },
  "outputSchema": {
    "type": "object",
    "properties": {
      "run_id": {"type": "string"},
      "status": {"type": "string", "enum": ["started"]},
      "estimated_duration_seconds": {"type": "integer"}
    }
  }
}
```

**Companion tool:** `research_status` (poll for completion)
```json
{
  "name": "research_status",
  "inputSchema": {"type": "object", "properties": {"run_id": {"type": "string"}}, "required": ["run_id"]},
  "outputSchema": {
    "type": "object",
    "properties": {
      "status": {"type": "string", "enum": ["running", "completed", "failed"]},
      "markdown": {"type": "string"},
      "sources": {"type": "array", "items": {"type": "object", "properties": {"id": {"type": "integer"}, "url": {"type": "string"}, "title": {"type": "string"}}}},
      "rounds": {"type": "integer"},
      "cost_usd": {"type": "number"},
      "error": {"type": "string"}
    }
  }
}
```

---

## 8. Resource Specifications

### 8.1 Resource Template (for dynamic resources)

```json
{
  "uriTemplate": "wiki://{section}/{document}",
  "name": "Wiki Document",
  "description": "A generated wiki document",
  "mimeType": "text/markdown"
}
```

### 8.2 Resource Read Handler

```go
// In resources.go
func (h *ResourceHandler) ReadWiki(ctx context.Context, section, document string) (ResourceContent, error) {
    path := filepath.Join("wiki", section, document)
    content, err := wiki.ReadDoc(h.repo, path)
    if err != nil { return ResourceContent{}, err }
    return ResourceContent{
        URI:      fmt.Sprintf("wiki://%s/%s", section, document),
        MIMEType: "text/markdown",
        Text:     content.Markdown,
    }, nil
}
```

---

## 9. Configuration & Security

### 9.1 Token Management

- **STDIO (local):** Auto-generate token on first run, save to `.kaioken/mcp_token` (chmod 600). Client reads from manifest or env.
- **HTTP (remote):** Require `--token` flag or `KAIOKEN_MCP_TOKEN` env var.
- **No-auth mode:** `--no-auth` flag (STDIO only, for trusted local use).

### 9.2 Manifest File (`.kaioken/mcp.json`)

```json
{
  "name": "kaioken",
  "version": "0.4.0",
  "description": "Kaioken knowledge engine MCP server",
  "transports": {
    "stdio": {"command": "kaioken", "args": ["mcp", "serve", "--repo", "/absolute/path"]},
    "http": {"url": "http://127.0.0.1:3456", "token_env": "KAIOKEN_MCP_TOKEN"}
  },
  "capabilities": {
    "tools": true,
    "resources": true,
    "prompts": false
  },
  "tools": [...],  // Full tool schemas
  "resources": [...],  // Resource templates
  "repo_root": "/absolute/path/to/repo"
}
```

Generated by `kaioken mcp manifest`.

---

## 10. Testing Strategy

### 10.1 Unit Tests (per handler)

```go
// tools_wiki_test.go
func TestWikiSearch(t *testing.T) {
    repo := testutil.SetupFixture(t, "testdata/simple_repo")
    cfg := config.Load(repo)
    srv := NewTestServer(repo, cfg)
    
    result := srv.CallTool("wiki_search", map[string]any{"query": "architecture"})
    assert.Contains(t, result.Text, "Architecture Overview")
}
```

### 10.2 Integration Tests

```go
// integration_test.go
func TestMCPFullFlow(t *testing.T) {
    // 1. Start server via STDIO pipe
    // 2. Send initialize → verify capabilities
    // 3. Call wiki_search → verify results
    // 4. Call wiki_read → verify markdown + toc
    // 5. Call skills_list → verify skills
    // 6. Call research_run → poll status → verify report
    // 7. Shutdown → verify clean exit
}
```

### 10.3 Client Compatibility Tests (Manual)

| Client | Config Method | Test Case |
|--------|---------------|-----------|
| Claude Desktop | `claude_desktop_config.json` | "Search wiki for authentication flow" |
| Cursor | `.cursor/mcp.json` | `@kaioken wiki_read architecture/overview.md` |
| VS Code Copilot | `settings.json` | "List all skills in this project" |
| Continue | `config.json` | "Run research on latest Go 1.24 features" |

---

## 11. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| MCP spec changes | Low | Medium | Pin to 2024-11-05; abstract protocol in `types.go` |
| STDIO deadlock | Medium | High | Use non-blocking reads; timeout on each request |
| Token leakage in logs | Low | Critical | Never log tokens; redact in JSONL output |
| Large wiki → slow search | Medium | Medium | Add index caching; limit results; paginate |
| Research tool hangs | Medium | High | Hard timeout (5min); cancel on client disconnect |
| Windows STDIO issues | Medium | Medium | Test on Windows; use `golang.org/x/sys/windows` for pipes |

---

## 12. Acceptance Criteria (Definition of Done)

### Automated Checks (must pass in CI)

- [ ] `go test ./internal/mcp/... -count=1` — all unit tests pass
- [ ] `go vet ./internal/mcp/...` — no vet warnings
- [ ] `golangci-lint run ./internal/mcp/...` — no lint errors
- [ ] `go build ./cmd/kaioken` — binary builds with `mcp` command

### Functional Checks (manual verification)

- [ ] `kaioken mcp serve` starts, prints handshake to stderr, waits on stdin
- [ ] `echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1"}}}' | kaioken mcp serve` → valid `initialize` response with capabilities
- [ ] `wiki_search` returns results for known query
- [ ] `wiki_read` returns markdown + TOC for existing doc
- [ ] `skills_list` returns all skills with correct metadata
- [ ] `repo_scan` returns stats matching `kaioken scan`
- [ ] `research_run` + `research_status` completes a research query
- [ ] Manifest generated by `kaioken mcp manifest` is valid JSON with all tool schemas
- [ ] **Claude Desktop:** Add to config, restart, ask question → gets answer from wiki
- [ ] **Cursor:** Add MCP, use `@kaioken` → tool calls work

### Security Checks

- [ ] No tokens in logs (verify JSONL output)
- [ ] Unauthenticated HTTP request → 401
- [ ] Invalid token → 403
- [ ] Path traversal in `repo://` resource blocked (reuse `daemon` safeJoin)

---

## 13. Future Extensions (Out of Scope)

| Feature | Description |
|---------|-------------|
| **Prompts** | Reusable prompt templates for common workflows |
| **Sampling** | Let server request LLM completions (for agentic loops) |
| **Roots** | Let client expose filesystem roots to server |
| **Progress notifications** | Streaming progress for long-running tools |
| **Tool annotations** | `readOnlyHint`, `destructiveHint`, `idempotentHint` |
| **Multi-workspace** | Single server serving multiple repos |

---

## 14. References

- [MCP Specification (2024-11-05)](https://modelcontextprotocol.io/specification/2024-11-05)
- [MCP Go SDK (mark3labs)](https://github.com/mark3labs/mcp-go)
- [Claude Desktop MCP Config](https://docs.anthropic.com/claude/docs/mcp)
- [Cursor MCP Guide](https://cursor.sh/docs/mcp)
- Kaioken `internal/daemon` — existing HTTP+SSE patterns to reuse
- Kaioken `internal/wiki`, `internal/skills`, `internal/research` — business logic to expose

---

## 15. Handoff Notes for Reviewer

When reviewing the implementation, verify:

1. **No business logic duplication** — handlers delegate to existing `wiki`, `skills`, `research`, `scan` packages
2. **Transport abstraction** — STDIO and HTTP share same handler pipeline
3. **Auth consistency** — uses same token validation as `internal/daemon`
4. **Error handling** — MCP error codes (`-32600` to `-32603`, `-32000+`) used correctly
5. **Resource cleanup** — no goroutine leaks on client disconnect
6. **Backward compatibility** — existing `kaioken` commands unchanged
7. **Documentation** — `kaioken mcp --help` is comprehensive

**Review command:** `cd cli && go test ./internal/mcp/... -v && kaioken mcp validate`

---

*End of Specification*