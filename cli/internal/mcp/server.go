package mcp

import (
	"context"
	"encoding/json"
	"fmt"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"

	"kaioken/internal/config"
	"kaioken/internal/llm"
	"kaioken/internal/search"
	"kaioken/internal/version"
)

// Options configure a server instance.
type Options struct {
	// Repo is the workspace root served. Every path resolved by a tool or
	// resource is confined to it.
	Repo string

	// Token, when non-empty, is required as a bearer credential on transports
	// that carry one. STDIO ignores it: the client already owns the process.
	Token string

	// AllowResearch gates research_run, the one tool that spends money and
	// reaches the network. Off unless the operator opts in.
	AllowResearch bool

	// Log receives structured events. Nil discards them.
	Log *Logger
}

// Server holds the registry and the resolved workspace. One instance serves
// any number of sequential requests over one transport.
type Server struct {
	repo  string
	token string
	log   *Logger

	tools     []Tool
	toolIndex map[string]int
	resources []Resource
	templates []ResourceTemplate
	prompts   []Prompt

	// mu guards the lazily-built pieces below. Handlers run concurrently on
	// the HTTP transport, and nothing here is cheap enough to rebuild per call.
	mu       sync.Mutex
	cfg      *config.Config
	index    *search.Index
	embedder search.Embedder

	// initialized flips on the client's initialize call. Tools stay callable
	// before it — some clients probe tools/list first — but the flag lets the
	// log show a client that skipped the handshake.
	initialized bool
}

// New builds a server for a repository. It does no I/O beyond resolving the
// path: NFR-01 wants cold start under 500ms, so config, scans and git all wait
// until a tool actually needs them.
func New(opts Options) (*Server, error) {
	repo := opts.Repo
	if repo == "" {
		repo = "."
	}
	abs, err := filepath.Abs(repo)
	if err != nil {
		return nil, fmt.Errorf("resolving repo path: %w", err)
	}
	s := &Server{
		repo:      abs,
		token:     opts.Token,
		log:       opts.Log,
		toolIndex: map[string]int{},
	}
	s.registerWikiTools()
	s.registerSkillTools()
	s.registerRepoTools()
	if opts.AllowResearch {
		s.registerResearchTools()
	}
	s.registerResources()
	s.registerPrompts()
	return s, nil
}

// Repo is the absolute workspace root this server reads from.
func (s *Server) Repo() string { return s.repo }

// Tools returns the registered tools, for the manifest generator.
func (s *Server) Tools() []Tool { return s.tools }

// register adds a tool, refusing duplicates loudly — a silently shadowed tool
// is the kind of bug that only shows up as a model calling the wrong thing.
func (s *Server) register(t Tool) {
	if _, dup := s.toolIndex[t.Name]; dup {
		panic("mcp: duplicate tool " + t.Name)
	}
	s.toolIndex[t.Name] = len(s.tools)
	s.tools = append(s.tools, t)
}

// config loads and caches the workspace config, falling back to defaults for
// a directory that was never `kaioken init`ed. Tools that only read the wiki
// still work there; ones that need a model will fail later with a clear error.
func (s *Server) config() *config.Config {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.cfg == nil {
		cfg, err := config.Load(s.repo)
		if err != nil {
			cfg = config.Default()
			g := config.LoadGlobal()
			if g.DefaultProvider != "" {
				cfg.Provider = g.DefaultProvider
			}
			if g.DefaultModel != "" {
				cfg.Model = g.DefaultModel
			}
		}
		s.cfg = cfg
	}
	return s.cfg
}

// client builds an LLM client from the workspace config, mirroring the CLI's
// key resolution: saved global key first, then the provider's env var.
func (s *Server) client() (*llm.Client, error) {
	cfg := s.config()
	provider := cfg.Provider
	if provider == "" {
		provider = "openrouter"
	}
	key := config.LoadGlobal().Keys[provider]
	if key == "" {
		if p, ok := llm.Providers[provider]; ok {
			key = envOr(p.KeyEnv)
		}
	}
	c, err := llm.NewForProvider(provider, cfg.BaseURL, cfg.Model, key)
	if err != nil {
		return nil, err
	}
	c.MaxTokens = cfg.MaxTokens
	return c, nil
}

// callContext is what a handler gets: the request context plus the server, so
// handlers stay plain functions instead of methods bound to construction order.
type callContext struct {
	context.Context
	srv *Server
}

// search runs a knowledge query, opening the index on first use and reusing
// it after. The embedder is attached only when one is configured, so a repo
// with no embedding model still searches — lexically — without a network call.
func (s *Server) search(ctx context.Context, q search.Query) ([]search.Result, error) {
	s.mu.Lock()
	if s.index == nil {
		idx, err := search.Open(s.repo)
		if err != nil {
			s.mu.Unlock()
			return nil, err
		}
		s.index = idx
		s.embedder, _ = search.NewEmbedder(search.EmbedConfigFor(s.repo))
	}
	idx, emb := s.index, s.embedder
	s.mu.Unlock()

	q.Embedder = emb
	return idx.Search(ctx, q)
}

// invalidateIndex drops the cached index so the next search picks up a wiki
// that was regenerated while this server was running.
func (s *Server) invalidateIndex() {
	s.mu.Lock()
	s.index = nil
	s.mu.Unlock()
}

const instructions = `Kaioken indexes this repository into a generated wiki, per-module knowledge
cards, and task-oriented skills.

Reach for it before reading source files directly: wiki_search finds the
chapter that already explains a subsystem, repo_status says whether that
explanation is still current, and skills_list surfaces procedures distilled
from work previously done in this repo. Falling back to raw file reads is
always fine when the knowledge base has no answer.`

// Handle routes one JSON-RPC request and returns the response, or nil for a
// notification. Transport-agnostic: stdio and HTTP both funnel through here.
func (s *Server) Handle(ctx context.Context, req *request) *response {
	if req.JSONRPC != "" && req.JSONRPC != "2.0" {
		return failure(req.ID, errf(codeInvalidRequest, "unsupported jsonrpc version %q", req.JSONRPC))
	}

	notification := req.isNotification()
	res, rerr := s.dispatch(ctx, req)
	if notification {
		// Notifications get no reply even when they fail; the error is only
		// worth a log line.
		if rerr != nil {
			s.log.warn("notification failed", "method", req.Method, "error", rerr.Message)
		}
		return nil
	}
	if rerr != nil {
		s.log.warn("request failed", "method", req.Method, "code", strconv.Itoa(rerr.Code), "error", rerr.Message)
		return failure(req.ID, rerr)
	}
	return result(req.ID, res)
}

func (s *Server) dispatch(ctx context.Context, req *request) (any, *rpcError) {
	switch req.Method {
	case "initialize":
		s.mu.Lock()
		s.initialized = true
		s.mu.Unlock()
		return initializeResult{
			ProtocolVersion: ProtocolVersion,
			Capabilities: capabilities{
				Tools:     &listCapability{},
				Resources: &listCapability{},
				Prompts:   &listCapability{},
			},
			ServerInfo:   serverInfo{Name: "kaioken", Version: version.Version},
			Instructions: instructions,
		}, nil

	case "notifications/initialized", "notifications/cancelled":
		return map[string]any{}, nil

	case "ping":
		return map[string]any{}, nil

	case "tools/list":
		return toolsListResult{Tools: s.tools}, nil

	case "tools/call":
		return s.callTool(ctx, req.Params)

	case "resources/list":
		return resourcesListResult{Resources: s.listResources()}, nil

	case "resources/templates/list":
		return resourceTemplatesListResult{ResourceTemplates: s.templates}, nil

	case "resources/read":
		return s.readResource(ctx, req.Params)

	case "prompts/list":
		return promptsListResult{Prompts: s.prompts}, nil

	case "prompts/get":
		return s.getPrompt(ctx, req.Params)

	default:
		return nil, errf(codeMethodNotFound, "unknown method %q", req.Method)
	}
}

func (s *Server) callTool(ctx context.Context, raw json.RawMessage) (any, *rpcError) {
	var p callToolParams
	if err := decodeArgs(raw, &p); err != nil {
		return nil, errf(codeInvalidParams, "bad tools/call params: %v", err)
	}
	idx, ok := s.toolIndex[p.Name]
	if !ok {
		return nil, errf(codeMethodNotFound, "unknown tool %q — call tools/list for the available set", p.Name)
	}
	t := s.tools[idx]
	s.log.info("tool call", "tool", p.Name)

	out, err := t.Handler(callContext{Context: ctx, srv: s}, p.Arguments)
	if err != nil {
		// A failing tool is data for the model, not a broken connection: it
		// comes back as a successful call whose content says what went wrong,
		// which is what lets the model try something else.
		s.log.warn("tool error", "tool", p.Name, "error", err.Error())
		return &ToolResult{
			Content: []content{{Type: "text", Text: err.Error()}},
			IsError: true,
		}, nil
	}
	return out, nil
}

func (s *Server) getPrompt(ctx context.Context, raw json.RawMessage) (any, *rpcError) {
	var p getPromptParams
	if err := decodeArgs(raw, &p); err != nil {
		return nil, errf(codeInvalidParams, "bad prompts/get params: %v", err)
	}
	for _, pr := range s.prompts {
		if pr.Name != p.Name {
			continue
		}
		out, err := pr.Handler(callContext{Context: ctx, srv: s}, p.Arguments)
		if err != nil {
			return nil, errf(codeInternalError, "%v", err)
		}
		return out, nil
	}
	return nil, errf(codeMethodNotFound, "unknown prompt %q", p.Name)
}

// authorize checks a bearer credential. Empty server token means open, which
// is the STDIO default: the transport is a pipe the client already owns.
func (s *Server) authorize(header string) *rpcError {
	if s.token == "" {
		return nil
	}
	got := strings.TrimSpace(strings.TrimPrefix(header, "Bearer "))
	if got == "" {
		return errf(codeUnauthorized, "missing bearer token")
	}
	if !constantTimeEqual(got, s.token) {
		return errf(codeUnauthorized, "invalid bearer token")
	}
	return nil
}

// sortedNames is a small helper for deterministic listings in tests and logs.
func sortedNames(t []Tool) []string {
	out := make([]string, 0, len(t))
	for _, x := range t {
		out = append(out, x.Name)
	}
	sort.Strings(out)
	return out
}
