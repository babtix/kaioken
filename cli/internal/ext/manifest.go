// Package ext implements Kaioken's community extension system: packages
// published as GitHub releases, installed into the per-user directory,
// tracked by a lockfile, and discovered through a community registry index.
//
// Phase 1 is deliberately code-free. A declarative extension contributes
// documents — skills in the same SKILL.md format the repo's own skills use —
// that the agent reads through its knowledge catalog. Nothing an extension
// ships is ever executed by the host; manifests declaring executable types
// (wasm, mcp) are rejected until a sandboxed runtime exists.
package ext

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"gopkg.in/yaml.v3"
)

// ManifestName is the file an extension repository must carry at its root.
const ManifestName = "extension.yaml"

// TypeDeclarative is the code-free capability tier: documents the agent
// reads, never code the host runs. An empty type means the same.
const TypeDeclarative = "declarative"

// TypeMCP is the subprocess tier: the extension declares an MCP server the
// host runs as a child process and whose tools the agent may call. A
// subprocess is arbitrary code, so an mcp extension installs untrusted and
// inert — nothing launches until the user explicitly trusts the exact
// installed version.
const TypeMCP = "mcp"

// TypeWasm is the sandboxed code tier: the extension ships a WASI module the
// host runs under wazero. It is sandboxed by construction — no filesystem,
// no network, no environment — unless a declared permission grants a
// capability. It still installs inert and requires per-version trust:
// reading the user's workspace is a grant worth an explicit yes.
const TypeWasm = "wasm"

// Executable reports whether an extension type runs code and therefore
// participates in the trust/tool machinery.
func Executable(t string) bool { return t == TypeMCP || t == TypeWasm }

// MCPConfig is how an mcp extension names its server process.
type MCPConfig struct {
	// Command is resolved on PATH when it is a bare name; a path containing
	// separators must stay inside the extension's install directory unless it
	// is absolute. It runs with the install directory as working directory.
	Command string   `yaml:"command"`
	Args    []string `yaml:"args,omitempty"`
	// Env entries are appended to the inherited environment.
	Env map[string]string `yaml:"env,omitempty"`
}

// WasmConfig is how a wasm extension names its module.
type WasmConfig struct {
	// Entry is the module path relative to the package root, e.g.
	// "dist/plugin.wasm". It must stay inside the package.
	Entry string `yaml:"entry"`
}

// CommandDecl is one user-invokable command a wasm extension contributes,
// surfaced in the TUI as /x <ext> <name>.
type CommandDecl struct {
	Name        string `yaml:"name"`
	Description string `yaml:"description,omitempty"`
}

// Manifest describes one extension. It lives at the root of the extension's
// repository and travels inside every release archive, so the installed copy
// always states what it is and what it needs.
type Manifest struct {
	// ID is "owner.name": two lowercase kebab-case segments, mirroring
	// VS Code's publisher.name convention so two authors can publish
	// extensions with the same short name without colliding.
	ID string `yaml:"id"`
	// Name is the human-readable title shown in listings.
	Name string `yaml:"name"`
	// Version is a strict MAJOR.MINOR.PATCH and must match the release tag
	// (a mismatch installs with a warning rather than failing).
	Version     string `yaml:"version"`
	Description string `yaml:"description,omitempty"`
	Author      string `yaml:"author,omitempty"`
	// Repo is the informational "owner/name" origin; the lockfile records
	// where the archive actually came from.
	Repo string `yaml:"repo,omitempty"`
	// Type is the capability tier: "declarative" (or empty) and "mcp";
	// "wasm" is reserved for a future sandboxed tier.
	Type string `yaml:"type,omitempty"`
	// MCP names the server process an mcp extension runs. Required for type
	// mcp, forbidden otherwise — a declarative extension must not smuggle in
	// an executable payload.
	MCP *MCPConfig `yaml:"mcp,omitempty"`
	// Wasm names the module a wasm extension runs. Required for type wasm,
	// forbidden otherwise.
	Wasm *WasmConfig `yaml:"wasm,omitempty"`
	// Permissions are the capabilities a wasm module asks for, granted (or
	// refused) as a set at trust time. Unknown permissions fail installation
	// outright: a capability the host cannot grant must never be silently
	// dropped, or the plugin breaks in confusing ways at runtime.
	Permissions []string `yaml:"permissions,omitempty"`
	// MinKaiokenVersion refuses installation on hosts older than the
	// extension needs, checked again at load through the lock entry's
	// installed manifest.
	MinKaiokenVersion string `yaml:"minKaiokenVersion,omitempty"`
	// Hooks are agent lifecycle events the extension wants forwarded into
	// the sandbox (tool_call, tool_result, agent_end, …). Wasm only, and
	// only dispatched once the installed version is trusted.
	Hooks []string `yaml:"hooks,omitempty"`
	// Commands are user-invokable entry points, run via /x. Wasm only.
	Commands []CommandDecl `yaml:"commands,omitempty"`
}

// LoadManifest reads and validates dir/extension.yaml.
func LoadManifest(dir string) (*Manifest, error) {
	raw, err := os.ReadFile(filepath.Join(dir, ManifestName))
	if err != nil {
		if os.IsNotExist(err) {
			return nil, fmt.Errorf("no %s found — this is not a Kaioken extension", ManifestName)
		}
		return nil, err
	}
	var m Manifest
	if err := yaml.Unmarshal(raw, &m); err != nil {
		return nil, fmt.Errorf("parsing %s: %w", ManifestName, err)
	}
	if err := m.Validate(); err != nil {
		return nil, err
	}
	return &m, nil
}

// Validate checks the fields an installer must be able to trust: the id
// shape (it becomes a directory name), the version (it drives updates), and
// the type (the security boundary of this whole phase).
func (m *Manifest) Validate() error {
	if err := validateID(m.ID); err != nil {
		return err
	}
	if strings.TrimSpace(m.Name) == "" {
		return fmt.Errorf("extension %s has no name", m.ID)
	}
	if _, err := parseSemver(m.Version); err != nil {
		return fmt.Errorf("extension %s: %w", m.ID, err)
	}
	switch m.Type {
	case "", TypeDeclarative:
		if m.MCP != nil {
			return fmt.Errorf("extension %s: declarative extensions must not declare an mcp server", m.ID)
		}
		if m.Wasm != nil {
			return fmt.Errorf("extension %s: declarative extensions must not declare a wasm module", m.ID)
		}
	case TypeMCP:
		if m.MCP == nil || strings.TrimSpace(m.MCP.Command) == "" {
			return fmt.Errorf("extension %s: mcp extensions must declare mcp.command", m.ID)
		}
		if m.Wasm != nil {
			return fmt.Errorf("extension %s: mcp extensions must not declare a wasm module", m.ID)
		}
	case TypeWasm:
		if m.Wasm == nil || strings.TrimSpace(m.Wasm.Entry) == "" {
			return fmt.Errorf("extension %s: wasm extensions must declare wasm.entry", m.ID)
		}
		entry := m.Wasm.Entry
		if !strings.HasSuffix(entry, ".wasm") || safeRel(entry) != nil || filepath.IsAbs(entry) {
			return fmt.Errorf("extension %s: wasm.entry must be a relative .wasm path inside the package", m.ID)
		}
		if m.MCP != nil {
			return fmt.Errorf("extension %s: wasm extensions must not declare an mcp server", m.ID)
		}
	default:
		return fmt.Errorf("extension type %q is not supported yet — only declarative, mcp and wasm extensions install in this version", m.Type)
	}
	if len(m.Permissions) > 0 && m.Type != TypeWasm {
		return fmt.Errorf("extension %s: permissions apply to wasm extensions only", m.ID)
	}
	for _, p := range m.Permissions {
		if !knownPermission(p) {
			return fmt.Errorf("extension %s: permission %q is not supported yet", m.ID, p)
		}
	}
	if strings.TrimSpace(m.MinKaiokenVersion) != "" {
		if _, err := parseSemver(m.MinKaiokenVersion); err != nil {
			return fmt.Errorf("extension %s: invalid minKaiokenVersion: %w", m.ID, err)
		}
	}
	if len(m.Hooks) > 0 && m.Type != TypeWasm {
		return fmt.Errorf("extension %s: hooks require a wasm extension in this version", m.ID)
	}
	for _, h := range m.Hooks {
		if !validHookName(h) {
			return fmt.Errorf("extension %s: unknown hook %q", m.ID, h)
		}
	}
	if len(m.Commands) > 0 && m.Type != TypeWasm {
		return fmt.Errorf("extension %s: commands require a wasm extension in this version", m.ID)
	}
	for _, c := range m.Commands {
		if !kebab(c.Name) {
			return fmt.Errorf("extension %s: command name %q must be lowercase kebab-case", m.ID, c.Name)
		}
	}
	return nil
}

// validateID enforces the "owner.name" shape. The id doubles as the install
// directory name, so the character set is deliberately narrow.
func validateID(id string) error {
	segs := strings.Split(id, ".")
	if len(segs) != 2 || !kebab(segs[0]) || !kebab(segs[1]) {
		return fmt.Errorf("invalid extension id %q: want owner.name in lowercase kebab-case", id)
	}
	return nil
}

// kebab reports whether s is non-empty lowercase kebab-case: [a-z0-9-] with
// no leading or trailing dash.
func kebab(s string) bool {
	if s == "" || s[0] == '-' || s[len(s)-1] == '-' {
		return false
	}
	for i := 0; i < len(s); i++ {
		c := s[i]
		if (c < 'a' || c > 'z') && (c < '0' || c > '9') && c != '-' {
			return false
		}
	}
	return true
}
