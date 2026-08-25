package ext

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"gopkg.in/yaml.v3"

	"kaioken/internal/config"
)

// The wasm tier is tested end-to-end against a real module: the fixture
// under testdata/wasmplugin is compiled with the host Go toolchain
// (GOOS=wasip1 GOARCH=wasm) and executed under wazero — protocol, sandbox
// and lifecycle all run for real, with no binaries checked in.

var (
	wasmFixtureOnce sync.Once
	wasmFixture     string
	wasmFixtureErr  error
)

// buildWasmFixture compiles the fixture plugin once per test process.
func buildWasmFixture(t *testing.T) string {
	t.Helper()
	wasmFixtureOnce.Do(func() {
		out := filepath.Join(os.TempDir(), fmt.Sprintf("kaioken-wasm-fixture-%d.wasm", os.Getpid()))
		cmd := exec.Command("go", "build", "-o", out, "./testdata/wasmplugin")
		cmd.Env = append(os.Environ(), "GOOS=wasip1", "GOARCH=wasm")
		if msg, err := cmd.CombinedOutput(); err != nil {
			wasmFixtureErr = fmt.Errorf("compiling wasm fixture: %v\n%s", err, msg)
			return
		}
		wasmFixture = out
	})
	if wasmFixtureErr != nil {
		t.Skipf("wasip1 toolchain unavailable: %v", wasmFixtureErr)
	}
	return wasmFixture
}

// seedWasmExtension installs the fixture as a wasm extension by hand:
// module + manifest + lock entry. Permissions come from the caller so the
// same fixture proves both the grant and the denial.
func seedWasmExtension(t *testing.T, perms []string) string {
	t.Helper()
	fixture := buildWasmFixture(t)
	t.Setenv(config.HomeEnv, t.TempDir())
	t.Cleanup(ShutdownAll)

	const id, ver = "alice.wasm", "1.0.0"
	man := &Manifest{
		ID: id, Name: "Wasm Demo", Version: ver, Type: TypeWasm,
		Wasm:        &WasmConfig{Entry: "plugin.wasm"},
		Permissions: perms,
	}
	raw, err := yaml.Marshal(man)
	if err != nil {
		t.Fatal(err)
	}
	dir := InstallDir(id, ver)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, ManifestName), raw, 0o644); err != nil {
		t.Fatal(err)
	}
	code, err := os.ReadFile(fixture)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "plugin.wasm"), code, 0o644); err != nil {
		t.Fatal(err)
	}
	lock := &Lock{Extensions: []Installed{{ID: id, Version: ver, Repo: "alice/kaioken-wasm", Enabled: true}}}
	if err := lock.Save(); err != nil {
		t.Fatal(err)
	}
	return id
}

func TestWasmTrustLifecycle(t *testing.T) {
	id := seedWasmExtension(t, nil)
	ctx := context.Background()

	// Untrusted: inert.
	if got := ToolSchemas(); len(got) != 0 {
		t.Fatalf("untrusted wasm extension leaked schemas: %+v", got)
	}
	if _, err := CallTool(ctx, "", id, "echo", `{"text":"hi"}`); err == nil || !strings.Contains(err.Error(), "not trusted") {
		t.Fatalf("untrusted call must be refused, got %v", err)
	}

	tools, err := Trust(ctx, id)
	if err != nil {
		t.Fatal(err)
	}
	if len(tools) != 4 || tools[0].Name != "echo" || tools[0].FullName != "x_alice-wasm_echo" {
		t.Fatalf("trust returned %+v", tools)
	}
	if tools[0].Kind != TypeWasm {
		t.Errorf("tool kind = %q, want wasm", tools[0].Kind)
	}
	_, entry, err := InstalledManifest(id)
	if err != nil {
		t.Fatal(err)
	}
	if !entry.Trusted() {
		t.Fatal("trust was not recorded")
	}
	if _, err := os.Stat(toolCachePath(entry)); err != nil {
		t.Fatalf("tool cache missing: %v", err)
	}

	// Calls instantiate the module fresh and round-trip the protocol.
	out, err := CallTool(ctx, "", id, "echo", `{"text":"hi"}`)
	if err != nil {
		t.Fatal(err)
	}
	if out != "echo: hi" {
		t.Errorf("echo returned %q", out)
	}

	// isError surfaces as an error, symmetric with the mcp tier.
	if _, err := CallTool(ctx, "", id, "nope", "{}"); err == nil || !strings.Contains(err.Error(), "unknown tool") {
		t.Errorf("plugin error must surface, got %v", err)
	}

	// Untrust re-inerts it.
	if err := Untrust(id); err != nil {
		t.Fatal(err)
	}
	if got := ToolSchemas(); len(got) != 0 {
		t.Errorf("untrusted wasm extension still advertises schemas: %+v", got)
	}
}

// The capability boundary: /workspace exists exactly when fs:read:workspace
// was declared AND a root is known — never otherwise.
func TestWasmWorkspacePermission(t *testing.T) {
	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, "probe.txt"), []byte("proof of mount\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	t.Run("granted", func(t *testing.T) {
		id := seedWasmExtension(t, []string{PermFSReadWorkspace})
		if _, err := Trust(context.Background(), id); err != nil {
			t.Fatal(err)
		}
		out, err := CallTool(context.Background(), root, id, "read_ws", "{}")
		if err != nil {
			t.Fatalf("granted permission should allow the read: %v", err)
		}
		if out != "proof of mount" {
			t.Errorf("read_ws returned %q", out)
		}
		// Granted but no root known: nothing is mounted.
		if _, err := CallTool(context.Background(), "", id, "read_ws", "{}"); err == nil || !strings.Contains(err.Error(), "read failed") {
			t.Errorf("empty root must not mount anything, got %v", err)
		}
	})

	t.Run("denied", func(t *testing.T) {
		id := seedWasmExtension(t, nil)
		if _, err := Trust(context.Background(), id); err != nil {
			t.Fatal(err)
		}
		if _, err := CallTool(context.Background(), root, id, "read_ws", "{}"); err == nil || !strings.Contains(err.Error(), "read failed") {
			t.Errorf("undeclared permission must deny the mount, got %v", err)
		}
	})
}

func TestWasmCallTimeout(t *testing.T) {
	id := seedWasmExtension(t, nil)
	if _, err := Trust(context.Background(), id); err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 300*time.Millisecond)
	defer cancel()
	if _, err := CallTool(ctx, "", id, "sleep", "{}"); err == nil || !strings.Contains(err.Error(), "timed out") {
		t.Fatalf("sleeping plugin should time out, got %v", err)
	}
	// The runtime survives a timed-out call: the next one works.
	if out, err := CallTool(context.Background(), "", id, "echo", `{"text":"still alive"}`); err != nil || out != "echo: still alive" {
		t.Fatalf("call after timeout: %q, %v", out, err)
	}
}

func TestWasmHugeOutput(t *testing.T) {
	id := seedWasmExtension(t, nil)
	if _, err := Trust(context.Background(), id); err != nil {
		t.Fatal(err)
	}
	out, err := CallTool(context.Background(), "", id, "huge", "{}")
	if err != nil {
		t.Fatal(err)
	}
	if len(out) != 150_000 {
		t.Errorf("huge output arrived with %d bytes, want 150000", len(out))
	}
}

func TestWasmManifestValidation(t *testing.T) {
	base := Manifest{ID: "alice.wasm", Name: "Demo", Version: "1.0.0", Type: TypeWasm}

	m := base
	if err := m.Validate(); err == nil || !strings.Contains(err.Error(), "wasm.entry") {
		t.Errorf("wasm without entry: %v", err)
	}
	m = base
	m.Wasm = &WasmConfig{Entry: "../../evil.wasm"}
	if err := m.Validate(); err == nil || !strings.Contains(err.Error(), "inside the package") {
		t.Errorf("escaping entry: %v", err)
	}
	m = base
	m.Wasm = &WasmConfig{Entry: "dist/plugin.wasm"}
	m.Permissions = []string{"net:api.github.com"}
	if err := m.Validate(); err == nil || !strings.Contains(err.Error(), "not supported yet") {
		t.Errorf("unknown permission: %v", err)
	}
	m.Permissions = []string{PermFSReadWorkspace}
	if err := m.Validate(); err != nil {
		t.Errorf("valid wasm manifest rejected: %v", err)
	}
	// Permissions are a wasm concept.
	d := Manifest{ID: "alice.demo", Name: "Demo", Version: "1.0.0", Permissions: []string{PermFSReadWorkspace}}
	if err := d.Validate(); err == nil || !strings.Contains(err.Error(), "wasm extensions only") {
		t.Errorf("permissions on declarative: %v", err)
	}
}

// Trust is per exact version for wasm exactly as for mcp — shared lock
// logic, asserted once here so a regression cannot hide behind the tier.
func TestWasmTrustIsPerVersion(t *testing.T) {
	e := Installed{ID: "alice.wasm", Version: "1.1.0", TrustedVersion: "1.0.0"}
	if e.Trusted() {
		t.Fatal("a different trusted version must not count")
	}
	e.TrustedVersion = "1.1.0"
	if !e.Trusted() {
		t.Fatal("matching version must count")
	}
}
