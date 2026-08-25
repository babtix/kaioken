package agent

import (
	"context"
	"strings"
	"testing"

	"kaioken/internal/llm"
)

func regTool(name string, readOnly bool) RegisteredTool {
	return RegisteredTool{
		Schema: llm.Tool{Type: "function", Function: llm.FunctionDef{
			Name:       name,
			Parameters: raw(`{"type":"object"}`),
		}},
		ReadOnly: readOnly,
		Run: func(ctx context.Context, a *Agent, argsJSON string) string {
			return "ran " + name
		},
	}
}

func TestRegisteredToolOfferedAndExecuted(t *testing.T) {
	RegisterTool(regTool("zz_test_tool", true))
	defer UnregisterTool("zz_test_tool")

	a := newAgent(t, true)
	found := false
	for _, tool := range a.Tools() {
		if tool.Function.Name == "zz_test_tool" {
			found = true
		}
	}
	if !found {
		t.Fatal("registered tool missing from Tools()")
	}

	got := a.execTool(context.Background(), llm.ToolCall{
		ID: "c1", Type: "function",
		Function: llm.FunctionCall{Name: "zz_test_tool", Arguments: "{}"},
	})
	if got != "ran zz_test_tool" {
		t.Fatalf("execTool = %q", got)
	}
}

func TestRegisteredToolRespectsMode(t *testing.T) {
	RegisterTool(regTool("zz_mut_tool", false))
	defer UnregisterTool("zz_mut_tool")

	a := newAgent(t, true)
	a.Mode = ModePlan // read-only mode: mutating registered tools withheld
	for _, tool := range a.Tools() {
		if tool.Function.Name == "zz_mut_tool" {
			t.Fatal("mutating registered tool offered in plan mode")
		}
	}
	got := a.execTool(context.Background(), llm.ToolCall{
		ID: "c1", Type: "function",
		Function: llm.FunctionCall{Name: "zz_mut_tool", Arguments: "{}"},
	})
	if !strings.Contains(got, "not available in plan mode") {
		t.Fatalf("expected mode denial, got %q", got)
	}
}

func TestRegisteredToolHiddenFromSubAgents(t *testing.T) {
	RegisterTool(regTool("zz_sub_tool", true))
	defer UnregisterTool("zz_sub_tool")

	a := newAgent(t, true)
	a.Depth = 1
	for _, tool := range a.Tools() {
		if tool.Function.Name == "zz_sub_tool" {
			t.Fatal("registered tool offered to a sub-agent")
		}
	}
}
