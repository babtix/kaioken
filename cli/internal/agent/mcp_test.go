package agent

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"gopkg.in/yaml.v3"

	"kaioken/internal/config"
	"kaioken/internal/ext"
	"kaioken/internal/llm"
)

// seedTrustedMCPExtension hand-builds an installed, trusted mcp extension
// with a cached tool catalog — the state ext.Trust leaves behind — without
// launching any process.
func seedTrustedMCPExtension(t *testing.T) ext.Tool {
	t.Helper()
	t.Setenv(config.HomeEnv, t.TempDir())

	const id, ver = "alice.demo", "1.0.0"
	man := &ext.Manifest{
		ID: id, Name: "Demo", Version: ver, Type: ext.TypeMCP,
		MCP: &ext.MCPConfig{Command: "not-a-real-command"},
	}
	raw, err := yaml.Marshal(man)
	if err != nil {
		t.Fatal(err)
	}
	dir := ext.InstallDir(id, ver)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, ext.ManifestName), raw, 0o644); err != nil {
		t.Fatal(err)
	}

	tool := ext.Tool{
		ExtID: id, Kind: ext.TypeMCP, Name: "echo", FullName: "x_alice-demo_echo",
		Description: "Echo the text back.",
		InputSchema: json.RawMessage(`{"type":"object","properties":{"text":{"type":"string"}}}`),
	}
	cache, err := json.Marshal([]ext.Tool{tool})
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, ".ext-tools.json"), cache, 0o644); err != nil {
		t.Fatal(err)
	}

	lock := &ext.Lock{Extensions: []ext.Installed{{
		ID: id, Version: ver, Repo: "alice/kaioken-demo", Enabled: true, TrustedVersion: ver,
	}}}
	if err := lock.Save(); err != nil {
		t.Fatal(err)
	}
	return tool
}

// Extension tools must appear only where run_command would: build mode, top
// level, with provenance in the description — and never in read-only modes.
func TestMCPToolSchemasReachTheModel(t *testing.T) {
	tool := seedTrustedMCPExtension(t)

	a := &Agent{Root: t.TempDir(), UI: fakeUI{}, AllowRun: true}
	tools := a.Tools()
	var found *llm.Tool
	for i := range tools {
		if tools[i].Function.Name == tool.FullName {
			found = &tools[i]
			break
		}
	}
	if found == nil {
		t.Fatal("extension tool missing from the build-mode schema")
	}
	if !strings.Contains(found.Function.Description, "extension alice.demo") ||
		!strings.Contains(found.Function.Description, "outside the sandbox") {
		t.Errorf("description must carry provenance and the sandbox warning: %q", found.Function.Description)
	}
	if !strings.Contains(string(found.Function.Parameters), `"text"`) {
		t.Errorf("server input schema not forwarded: %s", found.Function.Parameters)
	}

	// Read-only mode: gone.
	ro := &Agent{Root: a.Root, UI: fakeUI{}, AllowRun: true, Mode: ModePlan}
	for _, tl := range ro.Tools() {
		if tl.Function.Name == tool.FullName {
			t.Fatal("extension tool offered in a read-only mode")
		}
	}
	// Sub-agent: gone.
	sub := &Agent{Root: a.Root, UI: fakeUI{}, AllowRun: true, Depth: 1}
	for _, tl := range sub.Tools() {
		if tl.Function.Name == tool.FullName {
			t.Fatal("extension tool offered to a delegate")
		}
	}
}

// Execution goes through approval and the (stubbed) dispatcher; a decline
// stops everything.
func TestMCPToolCallApprovalGate(t *testing.T) {
	tool := seedTrustedMCPExtension(t)

	old := extInvoke
	var gotRoot, gotExt, gotTool, gotArgs string
	extInvoke = func(ctx context.Context, root, extID, name, argsJSON string) (string, error) {
		gotRoot, gotExt, gotTool, gotArgs = root, extID, name, argsJSON
		return "stubbed result", nil
	}
	defer func() { extInvoke = old }()

	tc := llm.ToolCall{Function: llm.FunctionCall{
		Name: tool.FullName, Arguments: `{"text":"hi"}`,
	}}

	a := &Agent{Root: t.TempDir(), UI: fakeUI{approve: true}, AllowRun: true}
	if got := a.execTool(context.Background(), tc); got != "stubbed result" {
		t.Fatalf("execTool = %q", got)
	}
	if gotExt != "alice.demo" || gotTool != "echo" || gotArgs != `{"text":"hi"}` {
		t.Errorf("dispatch got (%q, %q, %q)", gotExt, gotTool, gotArgs)
	}
	if gotRoot != a.Root {
		t.Errorf("dispatch got root %q, want the agent's %q", gotRoot, a.Root)
	}

	declined := &Agent{Root: a.Root, UI: fakeUI{approve: false}, AllowRun: true}
	if got := declined.execTool(context.Background(), tc); !strings.Contains(got, "user declined") {
		t.Errorf("decline path returned %q", got)
	}

	// Oversized output is capped before it reaches the model, and the excerpt
	// says where the rest went.
	extInvoke = func(context.Context, string, string, string, string) (string, error) {
		return strings.Repeat("A", 150_000), nil
	}
	got := a.execTool(context.Background(), tc)
	if len(got) > DefaultMaxBytes*2 {
		t.Errorf("oversized tool output was not bounded (len %d)", len(got))
	}
	if !strings.Contains(got, "truncated:") || !strings.Contains(got, "Full output saved to") {
		t.Errorf("bounded output lost its truncation notice: %q", clipLine(got, 200))
	}

	// Unknown extension tools still report cleanly.
	unknown := llm.ToolCall{Function: llm.FunctionCall{Name: "x_nobody_nothing", Arguments: "{}"}}
	if got := a.execTool(context.Background(), unknown); !strings.Contains(got, "unknown tool") {
		t.Errorf("unknown tool returned %q", got)
	}
}
