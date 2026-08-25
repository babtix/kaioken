package ext

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"gopkg.in/yaml.v3"

	"kaioken/internal/config"
)

// The MCP tier is tested against a real subprocess speaking real
// newline-delimited JSON-RPC: the test binary re-executes itself as the
// server via the helper-process pattern, so the transport, handshake and
// lifecycle code paths all run for real.

const mcpHelperEnv = "KAIOKEN_MCP_HELPER"

// TestHelperMCPServer is not a test: it is the fake MCP server the other
// tests launch. It only runs when the env gate is set.
func TestHelperMCPServer(t *testing.T) {
	if os.Getenv(mcpHelperEnv) != "1" {
		return
	}
	runHelperMCPServer()
	os.Exit(0)
}

func runHelperMCPServer() {
	sc := bufio.NewScanner(os.Stdin)
	sc.Buffer(make([]byte, 64*1024), mcpMaxLine)
	out := bufio.NewWriter(os.Stdout)
	reply := func(id *int64, result any) {
		raw, _ := json.Marshal(result)
		msg, _ := json.Marshal(rpcMessage{JSONRPC: "2.0", ID: id, Result: raw})
		out.Write(append(msg, '\n'))
		out.Flush()
	}
	for sc.Scan() {
		var msg rpcMessage
		if json.Unmarshal(sc.Bytes(), &msg) != nil {
			continue
		}
		switch msg.Method {
		case "initialize":
			reply(msg.ID, map[string]any{
				"protocolVersion": mcpProtocolVersion,
				"capabilities":    map[string]any{"tools": map[string]any{}},
				"serverInfo":      map[string]any{"name": "fake-server", "version": "1.0.0"},
			})
		case "notifications/initialized":
			// notification: no reply
		case "tools/list":
			// Two pages, so the client's cursor-following runs for real.
			var params struct {
				Cursor string `json:"cursor"`
			}
			_ = json.Unmarshal(msg.Params, &params)
			if params.Cursor == "" {
				reply(msg.ID, map[string]any{"nextCursor": "page2", "tools": []map[string]any{
					{"name": "echo", "description": "Echo the text back.",
						"inputSchema": map[string]any{"type": "object", "properties": map[string]any{
							"text": map[string]any{"type": "string"}}}},
					{"name": "fail", "description": "Always errors."},
					{"name": "slow", "description": "Sleeps before answering."},
				}})
			} else {
				reply(msg.ID, map[string]any{"tools": []map[string]any{
					{"name": "huge", "description": "Returns a large payload."},
					{"name": "die", "description": "Exits without replying."},
				}})
			}
		case "tools/call":
			var params struct {
				Name      string         `json:"name"`
				Arguments map[string]any `json:"arguments"`
			}
			_ = json.Unmarshal(msg.Params, &params)
			switch params.Name {
			case "echo":
				text, _ := params.Arguments["text"].(string)
				reply(msg.ID, map[string]any{"content": []map[string]any{
					{"type": "text", "text": "echo: " + text}}})
			case "fail":
				reply(msg.ID, map[string]any{"isError": true, "content": []map[string]any{
					{"type": "text", "text": "boom"}}})
			case "slow":
				time.Sleep(5 * time.Second)
				reply(msg.ID, map[string]any{"content": []map[string]any{
					{"type": "text", "text": "finally"}}})
			case "huge":
				reply(msg.ID, map[string]any{"content": []map[string]any{
					{"type": "text", "text": strings.Repeat("A", 150_000)}}})
			case "die":
				os.Exit(1) // crash mid-call, without replying
			}
		}
	}
}

// seedMCPExtension installs a fake mcp extension by hand: manifest pointing
// at the test binary in helper mode, plus a lock entry. Returns the id.
func seedMCPExtension(t *testing.T, trusted bool) string {
	t.Helper()
	t.Setenv(config.HomeEnv, t.TempDir())
	t.Cleanup(ShutdownAll)

	const id, ver = "alice.demo", "1.0.0"
	exe, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	man := &Manifest{
		ID: id, Name: "Demo", Version: ver, Type: TypeMCP,
		MCP: &MCPConfig{
			Command: exe,
			Args:    []string{"-test.run=TestHelperMCPServer"},
			Env:     map[string]string{mcpHelperEnv: "1"},
		},
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
	entry := Installed{ID: id, Version: ver, Repo: "alice/kaioken-demo", Enabled: true}
	if trusted {
		entry.TrustedVersion = ver
	}
	lock := &Lock{Extensions: []Installed{entry}}
	if err := lock.Save(); err != nil {
		t.Fatal(err)
	}
	return id
}

func TestMCPTrustLifecycle(t *testing.T) {
	id := seedMCPExtension(t, false)
	ctx := context.Background()

	// Untrusted: no schemas, no execution. Inert is the default.
	if got := ToolSchemas(); len(got) != 0 {
		t.Fatalf("untrusted extension leaked schemas: %+v", got)
	}
	if _, err := CallTool(ctx, "", id, "echo", `{"text":"hi"}`); err == nil || !strings.Contains(err.Error(), "not trusted") {
		t.Fatalf("untrusted call must be refused, got %v", err)
	}

	tools, err := Trust(ctx, id)
	if err != nil {
		t.Fatal(err)
	}
	if len(tools) != 5 || tools[0].Name != "echo" {
		t.Fatalf("trust returned %+v", tools)
	}
	if tools[0].FullName != "x_alice-demo_echo" {
		t.Errorf("full name = %q", tools[0].FullName)
	}
	man, entry, err := InstalledManifest(id)
	if err != nil || man == nil {
		t.Fatal(err)
	}
	if !entry.Trusted() {
		t.Fatal("trust was not recorded in the lock")
	}
	if _, err := os.Stat(toolCachePath(entry)); err != nil {
		t.Fatalf("tool cache missing: %v", err)
	}

	// Schemas now come from the cache, and lookup resolves the full name.
	if got := ToolSchemas(); len(got) != 5 {
		t.Fatalf("schemas after trust: %+v", got)
	}
	if _, ok := LookupTool("x_alice-demo_echo"); !ok {
		t.Fatal("LookupMCPTool failed")
	}

	// Calls run against a live server started on demand.
	out, err := CallTool(ctx, "", id, "echo", `{"text":"hi"}`)
	if err != nil {
		t.Fatal(err)
	}
	if out != "echo: hi" {
		t.Errorf("echo returned %q", out)
	}
	if _, err := CallTool(ctx, "", id, "fail", "{}"); err == nil || !strings.Contains(err.Error(), "boom") {
		t.Errorf("isError result must surface as an error, got %v", err)
	}

	// Untrust: schemas vanish, execution is refused again.
	if err := Untrust(id); err != nil {
		t.Fatal(err)
	}
	if got := ToolSchemas(); len(got) != 0 {
		t.Errorf("untrusted extension still advertises schemas: %+v", got)
	}
	if _, err := CallTool(ctx, "", id, "echo", `{"text":"hi"}`); err == nil || !strings.Contains(err.Error(), "not trusted") {
		t.Errorf("call after untrust must be refused, got %v", err)
	}
}

func TestMCPCallTimeout(t *testing.T) {
	id := seedMCPExtension(t, false)
	if _, err := Trust(context.Background(), id); err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 300*time.Millisecond)
	defer cancel()
	if _, err := CallTool(ctx, "", id, "slow", "{}"); err == nil || !strings.Contains(err.Error(), "timed out") {
		t.Fatalf("slow tool should time out, got %v", err)
	}
}

// A server that dies mid-call must surface a clean error, and the next call
// must get a fresh server rather than a dead handle.
func TestMCPServerExitRecovery(t *testing.T) {
	id := seedMCPExtension(t, false)
	ctx := context.Background()
	if _, err := Trust(ctx, id); err != nil {
		t.Fatal(err)
	}
	if _, err := CallTool(ctx, "", id, "die", "{}"); err == nil || !strings.Contains(err.Error(), "exited") {
		t.Fatalf("crash should report the server exit, got %v", err)
	}
	out, err := CallTool(ctx, "", id, "echo", `{"text":"back"}`)
	if err != nil {
		t.Fatalf("call after crash should restart the server: %v", err)
	}
	if out != "echo: back" {
		t.Errorf("restarted server returned %q", out)
	}
}

// Large tool output passes through the transport intact; capping for the
// model's benefit is the agent layer's job, not the client's.
func TestMCPHugeOutput(t *testing.T) {
	id := seedMCPExtension(t, false)
	ctx := context.Background()
	if _, err := Trust(ctx, id); err != nil {
		t.Fatal(err)
	}
	out, err := CallTool(ctx, "", id, "huge", "{}")
	if err != nil {
		t.Fatal(err)
	}
	if len(out) != 150_000 {
		t.Errorf("huge output arrived with %d bytes, want 150000", len(out))
	}
}

// RefreshMCPTools re-queries a trusted server and refuses untrusted ones.
func TestMCPRefreshTools(t *testing.T) {
	id := seedMCPExtension(t, false)
	ctx := context.Background()
	if _, err := RefreshTools(ctx, id); err == nil || !strings.Contains(err.Error(), "not trusted") {
		t.Fatalf("refresh before trust must be refused, got %v", err)
	}
	if _, err := Trust(ctx, id); err != nil {
		t.Fatal(err)
	}
	tools, err := RefreshTools(ctx, id)
	if err != nil {
		t.Fatal(err)
	}
	if len(tools) != 5 {
		t.Errorf("refresh returned %d tools, want 5", len(tools))
	}
	if cached, err := CachedTools(id); err != nil || len(cached) != 5 {
		t.Errorf("refresh should rewrite the cache: %d tools, %v", len(cached), err)
	}
}

func TestMCPDisabledRefusesToRun(t *testing.T) {
	id := seedMCPExtension(t, true)
	if err := SetEnabled(id, false); err != nil {
		t.Fatal(err)
	}
	if _, err := CallTool(context.Background(), "", id, "echo", "{}"); err == nil || !strings.Contains(err.Error(), "disabled") {
		t.Fatalf("disabled extension must not run, got %v", err)
	}
	if got := ToolSchemas(); len(got) != 0 {
		t.Errorf("disabled extension still advertises schemas: %+v", got)
	}
}

// Installing an mcp extension reports NeedsTrust, and an update revokes any
// previously granted trust because trust is per exact version.
func TestInstallMCPNeedsTrustAndUpdateRevokes(t *testing.T) {
	h := newFakeHub(t)
	t.Cleanup(ShutdownAll)
	mcpManifest := func(ver string) string {
		return fmt.Sprintf("id: alice.demo\nname: Demo\nversion: %s\ntype: mcp\nmcp:\n  command: not-a-real-command\n", ver)
	}
	h.publish(t, "v1.0.0", map[string]string{"extension.yaml": mcpManifest("1.0.0")})

	res, err := Install(context.Background(), "alice/kaioken-demo")
	if err != nil {
		t.Fatal(err)
	}
	if !res.NeedsTrust {
		t.Fatal("mcp install must report NeedsTrust")
	}
	if res.Entry.TrustedVersion != "" {
		t.Fatal("fresh install must not be trusted")
	}

	// Grant trust by hand (launching not-a-real-command would fail), then
	// update: the new entry must come back untrusted.
	lock, err := LoadLock()
	if err != nil {
		t.Fatal(err)
	}
	lock.Find("alice.demo").TrustedVersion = "1.0.0"
	if err := lock.Save(); err != nil {
		t.Fatal(err)
	}

	h.publish(t, "v1.1.0", map[string]string{"extension.yaml": mcpManifest("1.1.0")})
	results, err := Update(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if len(results) != 1 || !results[0].Updated {
		t.Fatalf("update results: %+v", results)
	}
	lock, err = LoadLock()
	if err != nil {
		t.Fatal(err)
	}
	if e := lock.Find("alice.demo"); e.Trusted() || e.TrustedVersion != "" {
		t.Errorf("update must revoke trust, got %+v", e)
	}
}

func TestManifestMCPValidation(t *testing.T) {
	// mcp without a command is broken.
	m := Manifest{ID: "alice.demo", Name: "Demo", Version: "1.0.0", Type: TypeMCP}
	if err := m.Validate(); err == nil || !strings.Contains(err.Error(), "mcp.command") {
		t.Errorf("mcp without command: %v", err)
	}
	// declarative must not smuggle a server in.
	m = Manifest{ID: "alice.demo", Name: "Demo", Version: "1.0.0",
		MCP: &MCPConfig{Command: "node"}}
	if err := m.Validate(); err == nil || !strings.Contains(err.Error(), "must not declare") {
		t.Errorf("declarative with mcp config: %v", err)
	}
	// a proper mcp manifest passes.
	m = Manifest{ID: "alice.demo", Name: "Demo", Version: "1.0.0", Type: TypeMCP,
		MCP: &MCPConfig{Command: "node", Args: []string{"server.js"}}}
	if err := m.Validate(); err != nil {
		t.Errorf("valid mcp manifest rejected: %v", err)
	}
}

func TestLaunchCommandContainment(t *testing.T) {
	dir := t.TempDir()
	// Bare names pass through to PATH lookup.
	if got, err := launchCommand(dir, &MCPConfig{Command: "node"}); err != nil || got != "node" {
		t.Errorf("bare name: %q, %v", got, err)
	}
	// Relative paths stay inside the extension.
	if _, err := launchCommand(dir, &MCPConfig{Command: "bin/server"}); err != nil {
		t.Errorf("in-tree relative path refused: %v", err)
	}
	if _, err := launchCommand(dir, &MCPConfig{Command: "../../evil"}); err == nil {
		t.Error("escaping relative path must be refused")
	}
}
