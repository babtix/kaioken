package memory

import (
	"strings"
	"testing"

	"kaioken/internal/llm"
	"kaioken/internal/skills"
)

func tc(name, args string) llm.ToolCall {
	return llm.ToolCall{ID: "c_" + name, Type: "function", Function: llm.FunctionCall{Name: name, Arguments: args}}
}

func assistantTool(calls ...llm.ToolCall) llm.Message {
	return llm.Message{Role: "assistant", ToolCalls: calls}
}
func userMsg(s string) llm.Message  { return llm.Message{Role: "user", Content: s} }
func toolRes(name, content string) llm.Message {
	return llm.Message{Role: "tool", Name: name, Content: content}
}

func hasSignal(got []Signal, want Signal) bool {
	for _, s := range got {
		if s == want {
			return true
		}
	}
	return false
}

func TestSignalsErrorRecovery(t *testing.T) {
	conv := []llm.Message{
		userMsg("run the tests"),
		assistantTool(tc("run_command", `{"command":"make test"}`)),
		toolRes("run_command", "command exited with error: exit 1\nFAIL"),
		assistantTool(tc("run_command", `{"command":"make vet"}`)),
		toolRes("run_command", "ok"),
	}
	got := Signals(conv)
	if !hasSignal(got, SignalErrorRecovery) {
		t.Errorf("expected error_recovery signal, got %v", got)
	}
}

func TestSignalsCorrection(t *testing.T) {
	conv := []llm.Message{
		userMsg("add a command"),
		assistantTool(tc("write_file", `{"path":"a.go","content":"x"}`)),
		toolRes("write_file", "wrote a.go"),
		userMsg("no, put it under cmd/ not internal/"),
	}
	got := Signals(conv)
	if !hasSignal(got, SignalCorrection) {
		t.Errorf("expected correction signal, got %v", got)
	}
}

func TestSignalsMultiFile(t *testing.T) {
	conv := []llm.Message{
		userMsg("wire the new endpoint end to end"),
		assistantTool(tc("edit_file", `{"path":"internal/api/handler.go","old":"a","new":"b"}`)),
		toolRes("edit_file", "edited"),
		assistantTool(tc("edit_file", `{"path":"internal/api/routes.go","old":"a","new":"b"}`)),
		toolRes("edit_file", "edited"),
		assistantTool(tc("edit_file", `{"path":"cmd/app/main.go","old":"a","new":"b"}`)),
		toolRes("edit_file", "edited"),
	}
	got := Signals(conv)
	if !hasSignal(got, SignalMultiFile) {
		t.Errorf("expected multi_file signal, got %v", got)
	}
	if !hasSignal(got, SignalManyTools) {
		t.Errorf("expected many_tools signal too, got %v", got)
	}
}

func TestSignalsQuietSession(t *testing.T) {
	conv := []llm.Message{
		userMsg("what does this repo do?"),
		assistantTool(tc("read_file", `{"path":"README.md"}`)),
		toolRes("read_file", "a readme"),
	}
	if got := Signals(conv); len(got) != 0 {
		t.Errorf("a read-only Q&A session should teach nothing, got %v", got)
	}
}

func TestLooksLikeCorrection(t *testing.T) {
	cases := map[string]bool{
		"No, that's the wrong file.":       true,
		"wait, use edit_file not write_file": true,
		"actually let me rephrase":          true,
		"don't commit that":                 true,
		"please add a test":                 false,
		"thanks":                            false,
		"now run the build":                 false,
	}
	for in, want := range cases {
		if got := looksLikeCorrection(in); got != want {
			t.Errorf("looksLikeCorrection(%q) = %v, want %v", in, got, want)
		}
	}
}

func TestArgPath(t *testing.T) {
	cases := map[string]string{
		`{"path":"internal/x.go"}`:        "internal/x.go",
		`{"path": "internal/y.go"}`:        "internal/y.go",
		`{"query":"foo"}`:                  "",
		`{"path":"a/b/c.go","content":""}`: "a/b/c.go",
	}
	for in, want := range cases {
		if got := argPath(in); got != want {
			t.Errorf("argPath(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestFilesTouched(t *testing.T) {
	conv := []llm.Message{
		assistantTool(tc("edit_file", `{"path":"a.go","old":"x","new":"y"}`)),
		toolRes("edit_file", "edited"),
		assistantTool(tc("edit_file", `{"path":"a.go","old":"p","new":"q"}`)),
		toolRes("edit_file", "edited"),
		assistantTool(tc("edit_file", `{"path":"b.go","old":"x","new":"y"}`)),
		toolRes("edit_file", "edited"),
		assistantTool(tc("read_file", `{"path":"c.go"}`)),
	}
	got := filesTouched(conv)
	want := []string{"a.go", "b.go"}
	if len(got) != 2 || got[0] != want[0] || got[1] != want[1] {
		t.Errorf("filesTouched = %v, want %v", got, want)
	}
}

func TestProposeName(t *testing.T) {
	conv := []llm.Message{
		userMsg("Add a new CLI subcommand for export"),
	}
	if got := proposeName(conv); got == "" || !strings.Contains(got, "add") {
		t.Errorf("proposeName = %q", got)
	}
}

func TestMatchSkillPrefersStrongOverlap(t *testing.T) {
	all := []*skills.Skill{
		{Name: "add-a-cli-command", Description: "How to add a cli command to the kaioken CLI."},
		{Name: "add-a-tui-command", Description: "How to add a slash command to the TUI."},
	}
	conv := []llm.Message{
		userMsg("add a new cli command to the kaioken CLI for export"),
	}
	match, score := matchSkill(all, conv)
	if match == nil {
		t.Fatal("expected a match")
	}
	if match.Name != "add-a-cli-command" {
		t.Errorf("matched %q, want add-a-cli-command (score %d)", match.Name, score)
	}
}

func TestMatchSkillRejectsWeakOverlap(t *testing.T) {
	all := []*skills.Skill{
		{Name: "run-the-test-suite", Description: "Run the tests with make test."},
	}
	conv := []llm.Message{
		userMsg("export the wiki to a static site"),
	}
	if match, score := matchSkill(all, conv); match != nil {
		t.Errorf("weak overlap should not match: %q (score %d)", match.Name, score)
	}
}
