package agent

import (
	"context"
	"sort"
	"sync"

	"kaioken/internal/llm"
)

// Dynamic tool registry.
//
// The built-in tools are compiled into Tools() and execTool — their
// availability rules (mode permissions, delegation depth, memory switches)
// are policy, and policy reads better as code than as table entries. What
// the static set cannot do is grow at runtime: an extension command, a
// front-end feature, or a test that wants to hand the model one more tool
// had no seam. The registry is that seam.
//
// Registered tools sit behind the same gates as the built-ins: read-only
// ones are offered in every mode, everything else needs a mode that can
// run commands. They always execute sequentially — the registry cannot
// know a stranger's Run function is safe to race.

// RegisteredTool is a tool added at runtime.
type RegisteredTool struct {
	// Schema is advertised to the model verbatim.
	Schema llm.Tool
	// ReadOnly tools are offered in every mode; others only where the mode
	// permits running commands.
	ReadOnly bool
	// Run executes the call. Errors are returned as "error: ..." text, the
	// same contract the built-ins follow.
	Run func(ctx context.Context, a *Agent, argsJSON string) string
}

var (
	regMu    sync.RWMutex
	registry = map[string]RegisteredTool{}
)

// RegisterTool adds (or replaces) a runtime tool. Registration is
// process-wide, like extension tools.
func RegisterTool(rt RegisteredTool) {
	if rt.Schema.Function.Name == "" || rt.Run == nil {
		return
	}
	regMu.Lock()
	defer regMu.Unlock()
	registry[rt.Schema.Function.Name] = rt
}

// UnregisterTool removes a runtime tool by name.
func UnregisterTool(name string) {
	regMu.Lock()
	defer regMu.Unlock()
	delete(registry, name)
}

// lookupRegistered returns a runtime tool by name.
func lookupRegistered(name string) (RegisteredTool, bool) {
	regMu.RLock()
	defer regMu.RUnlock()
	rt, ok := registry[name]
	return rt, ok
}

// registeredSchemas returns the schemas the current mode may offer, in a
// stable order.
func registeredSchemas(mode Mode) []llm.Tool {
	perms := PermissionsFor(mode)
	regMu.RLock()
	defer regMu.RUnlock()
	names := make([]string, 0, len(registry))
	for name := range registry {
		names = append(names, name)
	}
	// Map order is random; the model's tool list must not shuffle between
	// turns or the provider's prompt cache misses every time.
	sort.Strings(names)
	var out []llm.Tool
	for _, name := range names {
		rt := registry[name]
		if !rt.ReadOnly && !perms.CanRun {
			continue
		}
		out = append(out, rt.Schema)
	}
	return out
}
