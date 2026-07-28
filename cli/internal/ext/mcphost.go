package ext

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
)

// The host side of the executable extension tiers: which plugins may run,
// when they start, and how their tools surface to the agent. It serves both
// tiers — mcp (subprocess servers) and wasm (sandboxed modules) — through
// one trust/cache/dispatch pipeline.
//
// Trust is the boundary. An executable extension installs inert; Trust() is
// the only thing that ever runs its code for the first time, it happens on
// an explicit user command that displayed what would run (the command line,
// or the module and its permissions), and it is recorded per version — an
// update silently revokes it. Tool schemas are cached on disk at trust time
// so building a prompt never runs plugin code.

// extToolsCacheFile lives inside the installed version's directory, so it is
// wiped together with the version on update or removal.
const extToolsCacheFile = ".ext-tools.json"

// Tool is one extension tool as the agent sees it, whatever tier serves it.
type Tool struct {
	ExtID string `json:"ext_id"`
	// Kind is the tier that executes the tool: TypeMCP or TypeWasm. The
	// agent uses it to phrase the sandbox warning honestly.
	Kind        string          `json:"kind,omitempty"`
	Name        string          `json:"name"`      // the plugin-side tool name
	FullName    string          `json:"full_name"` // the agent-facing tool name
	Description string          `json:"description"`
	InputSchema json.RawMessage `json:"input_schema,omitempty"`
}

// mcpManager tracks the running server per mcp extension id.
var mcpManager = struct {
	mu      sync.Mutex
	clients map[string]*mcpClient
}{clients: map[string]*mcpClient{}}

// InstalledManifest loads the manifest of an installed extension along with
// its lock entry — the pair every trust/tool operation needs.
func InstalledManifest(id string) (*Manifest, *Installed, error) {
	lock, err := LoadLock()
	if err != nil {
		return nil, nil, err
	}
	e := lock.Find(id)
	if e == nil {
		return nil, nil, fmt.Errorf("extension %s is not installed", id)
	}
	man, err := LoadManifest(InstallDir(e.ID, e.Version))
	if err != nil {
		return nil, nil, err
	}
	entry := *e
	return man, &entry, nil
}

// Trusted reports whether an entry's exact installed version has been
// trusted. The comparison is what makes updates revoke trust for free.
func (e *Installed) Trusted() bool {
	return e.TrustedVersion != "" && e.TrustedVersion == e.Version
}

// Trust marks an installed executable extension's current version as
// trusted, runs it once to fetch the tool catalog, and caches the schemas.
// Callers are responsible for having shown the user what will run — this is
// the mechanism, not the consent UX.
func Trust(ctx context.Context, id string) ([]Tool, error) {
	man, entry, err := InstalledManifest(id)
	if err != nil {
		return nil, err
	}
	if !Executable(man.Type) {
		return nil, fmt.Errorf("extension %s runs no code — nothing to trust", id)
	}

	infos, err := listPluginTools(ctx, entry, man)
	if err != nil {
		return nil, err
	}
	tools := toolsFrom(id, man.Type, infos)
	if err := writeToolCache(entry, tools); err != nil {
		return nil, err
	}

	lock, err := LoadLock()
	if err != nil {
		return nil, err
	}
	e := lock.Find(id)
	if e == nil {
		return nil, fmt.Errorf("extension %s is not installed", id)
	}
	e.TrustedVersion = e.Version
	if err := lock.Save(); err != nil {
		return nil, err
	}
	return tools, nil
}

// listPluginTools fetches the tool catalog from whichever tier serves it.
// For mcp a throwaway server run is used so an untrusted extension never
// enters the long-lived manager.
func listPluginTools(ctx context.Context, entry *Installed, man *Manifest) ([]mcpToolInfo, error) {
	switch man.Type {
	case TypeMCP:
		c, err := startMCP(ctx, entry, man)
		if err != nil {
			return nil, err
		}
		defer c.close()
		return c.listTools(ctx)
	case TypeWasm:
		return wasmListTools(ctx, entry, man)
	default:
		return nil, fmt.Errorf("extension %s runs no code", entry.ID)
	}
}

func toolsFrom(id, kind string, infos []mcpToolInfo) []Tool {
	tools := make([]Tool, 0, len(infos))
	for _, ti := range infos {
		tools = append(tools, Tool{
			ExtID:       id,
			Kind:        kind,
			Name:        ti.Name,
			FullName:    toolFullName(id, ti.Name),
			Description: ti.Description,
			InputSchema: ti.InputSchema,
		})
	}
	return tools
}

// Untrust revokes trust and stops anything the extension has running. The
// tool cache stays on disk but is inert: schemas are only served for trusted
// entries.
func Untrust(id string) error {
	lock, err := LoadLock()
	if err != nil {
		return err
	}
	e := lock.Find(id)
	if e == nil {
		return fmt.Errorf("extension %s is not installed", id)
	}
	e.TrustedVersion = ""
	if err := lock.Save(); err != nil {
		return err
	}
	shutdownExtension(id)
	return nil
}

// RefreshTools re-lists a trusted extension's tools and rewrites the cache —
// for plugins whose catalog changed since trust was granted.
func RefreshTools(ctx context.Context, id string) ([]Tool, error) {
	man, entry, err := InstalledManifest(id)
	if err != nil {
		return nil, err
	}
	if !entry.Trusted() {
		return nil, fmt.Errorf("extension %s is not trusted — run trust first", id)
	}
	var infos []mcpToolInfo
	switch man.Type {
	case TypeMCP:
		c, err := mcpClientFor(ctx, entry, man)
		if err != nil {
			return nil, err
		}
		infos, err = c.listTools(ctx)
		if err != nil {
			return nil, err
		}
	default:
		infos, err = listPluginTools(ctx, entry, man)
		if err != nil {
			return nil, err
		}
	}
	tools := toolsFrom(id, man.Type, infos)
	if err := writeToolCache(entry, tools); err != nil {
		return nil, err
	}
	return tools, nil
}

// CachedTools returns the tool catalog recorded at trust time for one
// extension, without running anything.
func CachedTools(id string) ([]Tool, error) {
	_, entry, err := InstalledManifest(id)
	if err != nil {
		return nil, err
	}
	return readToolCache(entry)
}

// ToolSchemas lists every tool of every enabled, trusted executable
// extension — from the on-disk caches only, so prompt building never runs
// plugin code. Broken entries are skipped, never fatal.
func ToolSchemas() []Tool {
	lock, err := LoadLock()
	if err != nil {
		return nil
	}
	var out []Tool
	for i := range lock.Extensions {
		e := &lock.Extensions[i]
		if !e.Enabled || !e.Trusted() {
			continue
		}
		tools, err := readToolCache(e)
		if err != nil {
			continue
		}
		out = append(out, tools...)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].FullName < out[j].FullName })
	return out
}

// LookupTool resolves an agent-facing tool name to its extension tool.
func LookupTool(fullName string) (Tool, bool) {
	for _, t := range ToolSchemas() {
		if t.FullName == fullName {
			return t, true
		}
	}
	return Tool{}, false
}

// CallTool invokes a tool on an enabled, trusted extension. root is the
// repository the agent is working in: a wasm plugin holding the
// fs:read:workspace permission gets it mounted read-only; mcp servers do not
// receive it at all. mcp servers start on first use and are reused; wasm
// modules are instantiated fresh per call.
func CallTool(ctx context.Context, root, extID, tool, argsJSON string) (string, error) {
	man, entry, err := InstalledManifest(extID)
	if err != nil {
		return "", err
	}
	if !entry.Enabled {
		return "", fmt.Errorf("extension %s is disabled", extID)
	}
	if !entry.Trusted() {
		return "", fmt.Errorf("extension %s %s is not trusted — trust it explicitly before its tools can run", extID, entry.Version)
	}
	switch man.Type {
	case TypeMCP:
		c, err := mcpClientFor(ctx, entry, man)
		if err != nil {
			return "", err
		}
		out, err := c.callTool(ctx, tool, argsJSON)
		if err != nil {
			// A dead server stays dead in the manager only until the next
			// call: drop it so the next invocation gets a fresh start.
			select {
			case <-c.done:
				shutdownMCP(extID)
			default:
			}
			return "", err
		}
		return out, nil
	case TypeWasm:
		return wasmCallTool(ctx, entry, man, root, tool, argsJSON)
	default:
		return "", fmt.Errorf("extension %s runs no code", extID)
	}
}

// mcpClientFor returns the running client for an mcp extension, starting it
// when needed. Callers have already checked enabled and trusted.
func mcpClientFor(ctx context.Context, entry *Installed, man *Manifest) (*mcpClient, error) {
	mcpManager.mu.Lock()
	defer mcpManager.mu.Unlock()
	if c, ok := mcpManager.clients[entry.ID]; ok {
		select {
		case <-c.done:
			delete(mcpManager.clients, entry.ID) // exited; start over below
		default:
			return c, nil
		}
	}
	c, err := startMCP(ctx, entry, man)
	if err != nil {
		return nil, err
	}
	mcpManager.clients[entry.ID] = c
	return c, nil
}

// shutdownMCP stops one extension's mcp server if it is running.
func shutdownMCP(id string) {
	mcpManager.mu.Lock()
	c := mcpManager.clients[id]
	delete(mcpManager.clients, id)
	mcpManager.mu.Unlock()
	if c != nil {
		c.close()
	}
}

// shutdownExtension stops whatever an extension has running in either tier.
func shutdownExtension(id string) {
	shutdownMCP(id)
	wasmShutdown(id)
}

// ShutdownAll stops every running extension server and wasm runtime.
// Front-ends defer this so quitting Kaioken never leaks plugin resources.
func ShutdownAll() {
	mcpManager.mu.Lock()
	clients := mcpManager.clients
	mcpManager.clients = map[string]*mcpClient{}
	mcpManager.mu.Unlock()
	for _, c := range clients {
		c.close()
	}
	wasmShutdownAll()
}

// toolFullName builds the agent-facing tool name: model tool names must
// match [a-zA-Z0-9_-]{1,64}, so the id and tool are sanitised and the whole
// thing clamped. The "x_" prefix keeps extension tools visibly distinct from
// built-ins.
func toolFullName(extID, tool string) string {
	name := "x_" + sanitizeToolPart(extID) + "_" + sanitizeToolPart(tool)
	if len(name) > 64 {
		name = name[:64]
		name = strings.TrimRight(name, "-_")
	}
	return name
}

func sanitizeToolPart(s string) string {
	var b strings.Builder
	for i := 0; i < len(s); i++ {
		c := s[i]
		switch {
		case c >= 'a' && c <= 'z', c >= 'A' && c <= 'Z', c >= '0' && c <= '9', c == '_':
			b.WriteByte(c)
		default:
			b.WriteByte('-')
		}
	}
	return b.String()
}

func toolCachePath(e *Installed) string {
	return filepath.Join(InstallDir(e.ID, e.Version), extToolsCacheFile)
}

func writeToolCache(e *Installed, tools []Tool) error {
	raw, err := json.MarshalIndent(tools, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(toolCachePath(e), raw, 0o644)
}

func readToolCache(e *Installed) ([]Tool, error) {
	raw, err := os.ReadFile(toolCachePath(e))
	if err != nil {
		return nil, err
	}
	var tools []Tool
	if err := json.Unmarshal(raw, &tools); err != nil {
		return nil, err
	}
	return tools, nil
}
