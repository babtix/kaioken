package ext

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"github.com/tetratelabs/wazero"
	"github.com/tetratelabs/wazero/imports/wasi_snapshot_preview1"
	"github.com/tetratelabs/wazero/sys"
)

// The wasm tier runs a plugin as a WASI command module under wazero:
// pure-Go, no CGo, works everywhere the host does. The sandbox is the whole
// point — a module gets no filesystem, no network, no environment, and no
// clock authority beyond what WASI itself defines, unless a declared
// permission grants a capability. wazero has no socket support at all, so
// "no network" is a property of the runtime, not a policy this code could
// get wrong.
//
// The ABI is a one-shot stdio protocol: every request instantiates the
// module fresh (memory isolation per call), writes one JSON request to
// stdin, and reads one JSON response from stdout:
//
//	→ {"method":"list_tools"}
//	← {"tools":[{"name":"echo","description":"…","inputSchema":{…}}]}
//	→ {"method":"call_tool","name":"echo","arguments":{…},"workspace":"/workspace"}
//	← {"content":"text result","isError":false}
//
// "workspace" is present only when fs:read:workspace is granted and a repo
// root is known. Authors compile with TinyGo, Rust, or plain Go
// (GOOS=wasip1 GOARCH=wasm). Streaming/stateful plugins are out of scope:
// the one-shot model is the contract.

// PermFSReadWorkspace grants read-only access to the repository the agent
// is working in, mounted at /workspace inside the module.
const PermFSReadWorkspace = "fs:read:workspace"

// knownPermission is the whole capability vocabulary. net:<host> is
// deliberately absent — it needs a host-function ABI with a guest allocator
// convention, and until that is designed, a manifest asking for it must be
// refused at install rather than silently ungranted.
func knownPermission(p string) bool { return p == PermFSReadWorkspace }

func hasPermission(man *Manifest, p string) bool {
	for _, got := range man.Permissions {
		if got == p {
			return true
		}
	}
	return false
}

// wasmMemoryLimitPages caps a module's linear memory (64 KiB pages).
// 4096 pages = 256 MB: roomy enough for Go-compiled modules, still a hard
// ceiling a runaway plugin cannot pass. A variable so tests can shrink it.
var wasmMemoryLimitPages uint32 = 4096

// wasmModule is one compiled plugin, cached per id@version: compilation is
// the expensive part, instantiation per call is cheap.
type wasmModule struct {
	runtime  wazero.Runtime
	compiled wazero.CompiledModule
}

var wasmManager = struct {
	mu      sync.Mutex
	modules map[string]*wasmModule // id@version → compiled module
}{modules: map[string]*wasmModule{}}

// wasmModuleFor returns the compiled module for an installed extension,
// compiling and caching it on first use.
func wasmModuleFor(ctx context.Context, entry *Installed, man *Manifest) (*wasmModule, error) {
	key := entry.ID + "@" + entry.Version
	wasmManager.mu.Lock()
	defer wasmManager.mu.Unlock()
	if wm, ok := wasmManager.modules[key]; ok {
		return wm, nil
	}

	dir := InstallDir(entry.ID, entry.Version)
	if err := safeRel(man.Wasm.Entry); err != nil {
		return nil, err
	}
	entryPath := filepath.Join(dir, filepath.FromSlash(man.Wasm.Entry))
	if !within(dir, entryPath) {
		return nil, fmt.Errorf("wasm entry %q escapes the extension directory", man.Wasm.Entry)
	}
	code, err := os.ReadFile(entryPath)
	if err != nil {
		return nil, fmt.Errorf("reading wasm module for %s: %w", entry.ID, err)
	}

	rc := wazero.NewRuntimeConfig().
		WithCloseOnContextDone(true). // timeouts actually stop the guest
		WithMemoryLimitPages(wasmMemoryLimitPages)
	r := wazero.NewRuntimeWithConfig(ctx, rc)
	wasi_snapshot_preview1.MustInstantiate(ctx, r)
	compiled, err := r.CompileModule(ctx, code)
	if err != nil {
		_ = r.Close(ctx)
		return nil, fmt.Errorf("compiling wasm module for %s: %w", entry.ID, err)
	}
	wm := &wasmModule{runtime: r, compiled: compiled}
	wasmManager.modules[key] = wm
	return wm, nil
}

// wasmShutdown drops every cached runtime for one extension id.
func wasmShutdown(id string) {
	wasmManager.mu.Lock()
	defer wasmManager.mu.Unlock()
	for key, wm := range wasmManager.modules {
		if strings.HasPrefix(key, id+"@") {
			_ = wm.runtime.Close(context.Background())
			delete(wasmManager.modules, key)
		}
	}
}

// wasmShutdownAll closes every cached wasm runtime.
func wasmShutdownAll() {
	wasmManager.mu.Lock()
	defer wasmManager.mu.Unlock()
	for key, wm := range wasmManager.modules {
		_ = wm.runtime.Close(context.Background())
		delete(wasmManager.modules, key)
	}
}

// runWasm executes one request against a fresh module instance and returns
// its stdout. The module sees exactly what its permissions grant: stdin,
// stdout, stderr, and — only with fs:read:workspace and a known root — the
// workspace mounted read-only at /workspace.
func runWasm(ctx context.Context, entry *Installed, man *Manifest, root string, request []byte) ([]byte, error) {
	wm, err := wasmModuleFor(ctx, entry, man)
	if err != nil {
		return nil, err
	}
	if _, ok := ctx.Deadline(); !ok {
		var cancel context.CancelFunc
		ctx, cancel = context.WithTimeout(ctx, extCallTimeout)
		defer cancel()
	}

	stdout := &cappedBuffer{max: maxArchiveBytes}
	stderr := &tailBuffer{}
	cfg := wazero.NewModuleConfig().
		WithName(""). // anonymous: parallel instantiations must not collide
		WithArgs("plugin.wasm").
		WithStdin(bytes.NewReader(request)).
		WithStdout(stdout).
		WithStderr(stderr).
		// Real clocks: wazero's deterministic fake clock makes sleeps return
		// instantly, which breaks language runtimes (Go's scheduler among
		// them). Time is not a secret; granting it costs the sandbox nothing.
		WithSysWalltime().
		WithSysNanotime().
		WithSysNanosleep()
	if hasPermission(man, PermFSReadWorkspace) && root != "" {
		cfg = cfg.WithFSConfig(wazero.NewFSConfig().WithReadOnlyDirMount(root, "/workspace"))
	}

	mod, err := wm.runtime.InstantiateModule(ctx, wm.compiled, cfg)
	if mod != nil {
		_ = mod.Close(ctx)
	}
	if err != nil {
		// A WASI command ends by calling proc_exit, which surfaces as an
		// ExitError even on success — code zero is the normal path.
		var exitErr *sys.ExitError
		switch {
		case errors.As(err, &exitErr) && exitErr.ExitCode() == 0:
			// success
		case ctx.Err() != nil:
			return nil, fmt.Errorf("wasm plugin %s timed out: %w", entry.ID, ctx.Err())
		case errors.As(err, &exitErr):
			return nil, wasmExplain(entry.ID, fmt.Errorf("wasm plugin exited with code %d", exitErr.ExitCode()), stderr)
		default:
			return nil, wasmExplain(entry.ID, fmt.Errorf("wasm plugin failed: %w", err), stderr)
		}
	}
	if stdout.overflow {
		return nil, fmt.Errorf("wasm plugin %s response exceeds the %d MB limit", entry.ID, maxArchiveBytes>>20)
	}
	return stdout.Bytes(), nil
}

func wasmExplain(id string, err error, stderr *tailBuffer) error {
	if tail := stderr.String(); tail != "" {
		return fmt.Errorf("%w\nplugin stderr:\n%s", err, tail)
	}
	return err
}

// wasmListTools asks the module for its catalog, in the same shape the mcp
// tier uses so the shared cache code applies unchanged.
func wasmListTools(ctx context.Context, entry *Installed, man *Manifest) ([]mcpToolInfo, error) {
	out, err := runWasm(ctx, entry, man, "", []byte(`{"method":"list_tools"}`))
	if err != nil {
		return nil, err
	}
	var res struct {
		Tools []mcpToolInfo `json:"tools"`
	}
	if err := json.Unmarshal(out, &res); err != nil {
		return nil, fmt.Errorf("parsing list_tools response from %s: %w", entry.ID, err)
	}
	return res.Tools, nil
}

// wasmCallTool invokes one tool. argsJSON must be a JSON object (or empty).
func wasmCallTool(ctx context.Context, entry *Installed, man *Manifest, root, name, argsJSON string) (string, error) {
	args := map[string]any{}
	if strings.TrimSpace(argsJSON) != "" {
		if err := json.Unmarshal([]byte(argsJSON), &args); err != nil {
			return "", fmt.Errorf("tool arguments must be a JSON object: %w", err)
		}
	}
	req := map[string]any{"method": "call_tool", "name": name, "arguments": args}
	if hasPermission(man, PermFSReadWorkspace) && root != "" {
		req["workspace"] = "/workspace"
	}
	raw, err := json.Marshal(req)
	if err != nil {
		return "", err
	}
	out, err := runWasm(ctx, entry, man, root, raw)
	if err != nil {
		return "", err
	}
	var res struct {
		Content string `json:"content"`
		IsError bool   `json:"isError"`
	}
	if err := json.Unmarshal(out, &res); err != nil {
		return "", fmt.Errorf("parsing call_tool response from %s: %w", entry.ID, err)
	}
	if res.IsError {
		return "", fmt.Errorf("tool %s reported an error: %s", name, res.Content)
	}
	return res.Content, nil
}

// cappedBuffer collects writes up to a limit and flags overflow instead of
// growing without bound — a plugin must not be able to balloon host memory
// through stdout.
type cappedBuffer struct {
	buf      bytes.Buffer
	max      int
	overflow bool
}

func (c *cappedBuffer) Write(p []byte) (int, error) {
	orig := len(p)
	room := c.max - c.buf.Len()
	if room <= 0 {
		c.overflow = true
		return orig, nil
	}
	if len(p) > room {
		c.overflow = true
		p = p[:room]
	}
	if _, err := c.buf.Write(p); err != nil {
		return 0, err
	}
	return orig, nil
}

func (c *cappedBuffer) Bytes() []byte { return c.buf.Bytes() }
