package mcp

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"kaioken/internal/config"
	"kaioken/internal/version"
)

// Manifest is the client-facing description of this server: enough for a user
// to paste into an MCP client's config, plus the full tool schemas so a
// reviewer can see what the server exposes without starting it.
type Manifest struct {
	Name        string `json:"name"`
	Version     string `json:"version"`
	Protocol    string `json:"protocol"`
	Description string `json:"description"`
	Repo        string `json:"repo"`

	// Command is the ready-to-paste client entry.
	Command  string            `json:"command"`
	Args     []string          `json:"args"`
	Env      map[string]string `json:"env,omitempty"`
	Tools    []manifestTool    `json:"tools"`
	Prompts  []string          `json:"prompts,omitempty"`
	Warnings []string          `json:"warnings,omitempty"`
}

type manifestTool struct {
	Name        string          `json:"name"`
	Description string          `json:"description"`
	InputSchema json.RawMessage `json:"inputSchema"`
}

// BuildManifest describes a server as configured. exe is the kaioken binary
// path clients should launch; an empty value resolves the running one.
func (s *Server) BuildManifest(exe string) *Manifest {
	if exe == "" {
		if p, err := os.Executable(); err == nil {
			exe = p
		} else {
			exe = "kaioken"
		}
	}

	tools := make([]manifestTool, 0, len(s.tools))
	for _, t := range s.tools {
		tools = append(tools, manifestTool{
			Name:        t.Name,
			Description: t.Description,
			InputSchema: t.InputSchema,
		})
	}
	prompts := make([]string, 0, len(s.prompts))
	for _, p := range s.prompts {
		prompts = append(prompts, p.Name)
	}

	m := &Manifest{
		Name:        "kaioken",
		Version:     version.Version,
		Protocol:    ProtocolVersion,
		Description: "Repository knowledge: generated wiki, knowledge cards, skills and freshness.",
		Repo:        s.repo,
		Command:     exe,
		Args:        []string{"mcp", "serve", "--repo", s.repo},
		Tools:       tools,
		Prompts:     prompts,
	}

	// Warn about the states that make this server much less useful, since the
	// person generating a manifest is exactly the person who can still fix them.
	if !dirHasMarkdown(filepath.Join(s.repo, config.Dir, "wiki")) {
		m.Warnings = append(m.Warnings,
			"no wiki generated yet — run `kaioken wiki` so wiki_search has something to find")
	}
	if !dirExists(filepath.Join(s.repo, config.Dir, "skills")) {
		m.Warnings = append(m.Warnings,
			"no skills generated yet — run `kaioken skills`")
	}
	return m
}

// ClientConfig renders the snippet a user pastes into an MCP client, which is
// the actual deliverable of `kaioken mcp manifest` for most people.
func (m *Manifest) ClientConfig() string {
	entry := map[string]any{
		"mcpServers": map[string]any{
			"kaioken": map[string]any{
				"command": m.Command,
				"args":    m.Args,
			},
		},
	}
	raw, err := json.MarshalIndent(entry, "", "  ")
	if err != nil {
		return ""
	}
	return string(raw)
}

// WriteManifest persists the manifest to .kaioken/mcp.json.
func (s *Server) WriteManifest(exe string) (string, error) {
	m := s.BuildManifest(exe)
	raw, err := json.MarshalIndent(m, "", "  ")
	if err != nil {
		return "", err
	}
	dir := filepath.Join(s.repo, config.Dir)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", err
	}
	path := filepath.Join(dir, "mcp.json")
	if err := os.WriteFile(path, append(raw, '\n'), 0o644); err != nil {
		return "", err
	}
	return path, nil
}

// tokenPath is where an HTTP transport's generated token persists, so a
// restart does not invalidate a client's saved config.
func tokenPath(repo string) string {
	return filepath.Join(repo, config.Dir, "mcp_token")
}

// EnsureToken returns the repo's persisted bearer token, generating one on
// first use. Only the HTTP transport needs it: STDIO's channel is a pipe the
// client already owns.
func EnsureToken(repo string) (string, error) {
	path := tokenPath(repo)
	if raw, err := os.ReadFile(path); err == nil {
		if tok := strings.TrimSpace(string(raw)); tok != "" {
			return tok, nil
		}
	}
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "", fmt.Errorf("generating token: %w", err)
	}
	tok := hex.EncodeToString(buf)
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return "", err
	}
	// 0600: this is a credential, and the repo directory is not private.
	if err := os.WriteFile(path, []byte(tok+"\n"), 0o600); err != nil {
		return "", err
	}
	return tok, nil
}

func dirExists(path string) bool {
	info, err := os.Stat(path)
	return err == nil && info.IsDir()
}

func dirHasMarkdown(dir string) bool {
	found := false
	_ = filepath.WalkDir(dir, func(_ string, d os.DirEntry, err error) error {
		if err == nil && !d.IsDir() && strings.HasSuffix(d.Name(), ".md") {
			found = true
			return filepath.SkipAll
		}
		return nil
	})
	return found
}
