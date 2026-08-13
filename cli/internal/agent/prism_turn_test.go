package agent

import (
	"context"
	"strings"
	"testing"

	"kaioken/internal/llm"
	"kaioken/internal/prism"
)

func TestParseModePrism(t *testing.T) {
	cases := []struct {
		input string
		want  Mode
	}{
		{"prism", ModePrism},
		{"PRISM", ModePrism},
		{"prisme", ModePrism},
		{"  prism  ", ModePrism},
		{"review", ModeReview},
		{"build", ModeBuild},
		{"plan", ModePlan},
		{"explore", ModeExplore},
		{"general", ModeGeneral},
	}
	for _, tc := range cases {
		got, err := ParseMode(tc.input)
		if err != nil {
			t.Errorf("ParseMode(%q) unexpected err: %v", tc.input, err)
		}
		if got != tc.want {
			t.Errorf("ParseMode(%q) = %q, want %q", tc.input, got, tc.want)
		}
	}
}

func TestModePrismPermissionsAndGuidance(t *testing.T) {
	perms := PermissionsFor(ModePrism)
	if perms.CanWrite || perms.CanRun {
		t.Errorf("ModePrism must be read-only, got %+v", perms)
	}
	guidance := ModePrism.PromptGuidance()
	if !strings.Contains(guidance, "prism mode") || !strings.Contains(guidance, "imported") {
		t.Errorf("ModePrism guidance missing keywords: %q", guidance)
	}
}

func TestApplyRemindersPrism(t *testing.T) {
	conv := []llm.Message{
		{Role: "system", Content: "sys"},
		{Role: "user", Content: "how does clause 4 work?"},
	}
	out := ApplyReminders(conv, ModePrism)
	if !strings.Contains(out[1].Content, "PRISM mode is active") {
		t.Errorf("PRISM reminder missing: %q", out[1].Content)
	}
}

func TestPrismTurnContextInjectionAndTool(t *testing.T) {
	dir := t.TempDir()
	store := prism.NewStore(dir)
	mod, err := store.CreateModule("Legal Docs", "legal-docs", "Legal contracts")
	if err != nil {
		t.Fatalf("CreateModule error: %v", err)
	}

	doc := prism.Document{
		ID:          "doc1",
		Filename:    "contract.txt",
		Status:      prism.StatusReady,
		ParentCount: 1,
		ChildCount:  1,
	}
	if err := store.PutDocument(mod.Slug, doc); err != nil {
		t.Fatalf("PutDocument error: %v", err)
	}

	chunks := []prism.Chunk{
		{DocID: doc.ID, Index: 0, Type: prism.Parent, Section: "Clause 4", Text: "Clause 4 states that the contract expires in 30 days.", ParentIndex: -1, Vec: -1},
		{DocID: doc.ID, Index: 1, Type: prism.Child, Section: "Clause 4", Text: "contract expires in 30 days", ParentIndex: 0, Vec: -1},
	}
	if err := store.AppendChunks(mod.Slug, "", chunks, nil); err != nil {
		t.Fatalf("AppendChunks error: %v", err)
	}

	a := &Agent{
		Root: dir,
		Mode: ModePrism,
	}

	// Test injectPrismContext
	history := []llm.Message{
		{Role: "system", Content: "system prompt"},
		{Role: "user", Content: "when does the contract expire?"},
	}

	injected := a.injectPrismContext(context.Background(), history)
	if len(injected) <= len(history) {
		t.Fatalf("expected injected PRISM context message, got len=%d", len(injected))
	}
	lastMsg := injected[len(injected)-1]
	if !strings.Contains(lastMsg.Content, "PRISM Grounded Context") || !strings.Contains(lastMsg.Content, "contract expires in 30 days") {
		t.Errorf("injected message missing PRISM context: %q", lastMsg.Content)
	}

	// Test queryPrism tool
	toolResult := a.queryPrism(context.Background(), "contract expires", "legal-docs")
	if !strings.Contains(toolResult, "PRISM Result") || !strings.Contains(toolResult, "Clause 4 states that the contract expires") {
		t.Errorf("queryPrism unexpected output: %q", toolResult)
	}
}
