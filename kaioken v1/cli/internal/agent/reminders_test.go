package agent

import (
	"strings"
	"testing"

	"kaioken/internal/llm"
)

// TestStripReminders covers the parsing that stands between Kaioken's injected
// text and the user's own. A bug here does not fail loudly — it silently eats
// part of what the user typed, or leaves a stale constraint in place forever.
func TestStripReminders(t *testing.T) {
	cases := []struct{ name, in, want string }{
		{"plain text untouched", "hello", "hello"},
		{"one block removed", "do the thing\n\n" + reminderOpen + "\nrules\n" + reminderClose, "do the thing"},
		{"two blocks removed", "x" + reminderOpen + "a" + reminderClose + reminderOpen + "b" + reminderClose, "x"},
		{"unterminated block dropped to the end", "keep me\n" + reminderOpen + "\nruns off", "keep me"},
		{"empty stays empty", "", ""},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := stripReminders(tc.in); got != tc.want {
				t.Errorf("got %q, want %q", got, tc.want)
			}
		})
	}
}

// TestApplyRemindersIdempotent is the property that makes per-turn reminders
// safe: however many turns run, the conversation carries exactly one copy.
func TestApplyRemindersIdempotent(t *testing.T) {
	conv := []llm.Message{
		{Role: "system", Content: "sys"},
		{Role: "user", Content: "do it"},
	}
	out := ApplyReminders(ApplyReminders(ApplyReminders(conv, ModePlan), ModePlan), ModePlan)
	if n := strings.Count(out[1].Content, reminderOpen); n != 1 {
		t.Errorf("after three turns: %d reminder blocks, want 1", n)
	}
	if !strings.HasPrefix(out[1].Content, "do it") {
		t.Errorf("user's own text must lead the message, got %q", out[1].Content)
	}
	if strings.Contains(conv[1].Content, reminderOpen) {
		t.Error("the caller's conversation was mutated")
	}
}

// TestApplyRemindersSwitchingModes asserts reminders are replaced rather than
// stacked, and that leaving a restricted mode removes its constraint.
func TestApplyRemindersSwitchingModes(t *testing.T) {
	conv := []llm.Message{
		{Role: "system", Content: "sys"},
		{Role: "user", Content: "do it"},
	}
	planned := ApplyReminders(conv, ModePlan)
	if !strings.Contains(planned[1].Content, "Plan mode is active") {
		t.Fatalf("plan reminder missing: %q", planned[1].Content)
	}
	// No prior plan phase recorded, so build carries nothing and the message
	// returns to exactly what the user typed.
	built := ApplyReminders(planned, ModeBuild)
	if built[1].Content != "do it" {
		t.Errorf("want the bare prompt back, got %q", built[1].Content)
	}
}

// TestBuildSwitchReminder covers the transition Kaioken previously dropped: a
// model that spent a stretch forbidden from editing needs telling that the
// restriction lifted, or it keeps producing plans.
func TestBuildSwitchReminder(t *testing.T) {
	conv := []llm.Message{
		{Role: "system", Content: "sys"},
		ModeSwitch(ModePlan, "read-only"),
		{Role: "user", Content: "now build it"},
	}
	out := ApplyReminders(conv, ModeBuild)
	if !strings.Contains(out[2].Content, "changed from plan to build") {
		t.Errorf("build-switch reminder missing: %q", out[2].Content)
	}
}

// TestModeFromSwitch guards the reason the marker is structural: prose that
// merely mentions a mode must not be mistaken for a mode change.
func TestModeFromSwitch(t *testing.T) {
	if got := modeFromSwitch(ModeSwitch(ModePlan, "read-only").Content); got != ModePlan {
		t.Errorf("round trip: got %q, want %q", got, ModePlan)
	}
	if got := modeFromSwitch(ModeSwitch(ModeBuild, "").Content); got != ModeBuild {
		t.Errorf("no guidance: got %q, want %q", got, ModeBuild)
	}
	for _, s := range []string{
		"--- context update: something about a plan ---",
		ContextUpdate("the user asked about explore mode").Content,
		"ordinary assistant prose mentioning plan mode",
	} {
		if got := modeFromSwitch(s); got != "" {
			t.Errorf("%q parsed as mode %q; only real markers may match", s, got)
		}
	}
}

// TestApplyRemindersNoUserMessage guards the empty case: a conversation that is
// only a system prompt has nothing to attach to.
func TestApplyRemindersNoUserMessage(t *testing.T) {
	conv := []llm.Message{{Role: "system", Content: "sys"}}
	if out := ApplyReminders(conv, ModePlan); len(out) != 1 || out[0].Content != "sys" {
		t.Errorf("unexpected change: %+v", out)
	}
}
