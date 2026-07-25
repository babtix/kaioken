package tui

import (
	"strings"
	"testing"
)

// A key entered via /key for one provider must not leak into another
// provider's client after a /provider switch. It previously did: apiKey was a
// single session-wide string, so rebuildClient() kept reusing provider A's
// key as an override for provider B, even when B had its own saved key (or
// none at all).
func TestKeyDoesNotLeakAcrossProviderSwitch(t *testing.T) {
	m := newTestModel(t)
	m.global.Keys["groq"] = "groq-saved-key"

	updated, _ := m.dispatch("/key openrouter-key")
	m = updated.(Model)
	if got := m.apiKeys["openrouter"]; got != "openrouter-key" {
		t.Fatalf("session key for openrouter = %q, want it recorded", got)
	}

	updated, _ = m.dispatch("/provider groq")
	m = updated.(Model)

	if m.client == nil {
		t.Fatal("switching to groq should have built a client from its saved key")
	}
	if m.client.APIKey != "groq-saved-key" {
		t.Errorf("groq client key = %q, want its own saved key, not the leftover openrouter session key",
			m.client.APIKey)
	}
}

// A provider with neither a session key nor a saved key must fail closed
// rather than silently reusing another provider's session key.
func TestProviderSwitchWithNoKeyLeavesClientNil(t *testing.T) {
	m := newTestModel(t)
	updated, _ := m.dispatch("/key openrouter-key")
	m = updated.(Model)

	updated, _ = m.dispatch("/provider mistral")
	m = updated.(Model)

	if m.client != nil {
		t.Errorf("provider with no key of its own should leave the client nil, got key %q", m.client.APIKey)
	}
}

// The model picker queries whichever provider's client is currently active;
// naming it in the title is the only way to tell without inspecting a
// separate command, so a switch must be visible right there.
func TestModelPickerTitleNamesTheActiveProvider(t *testing.T) {
	m := newTestModel(t)
	m.global.Keys["groq"] = "groq-saved-key"
	updated, _ := m.dispatch("/provider groq")
	m = updated.(Model)

	updated, cmd := m.dispatch("/model")
	m = updated.(Model)
	if cmd == nil {
		t.Fatal("expected /model to kick off a fetch")
	}
	// Not executing cmd(): it hits the network via the real client. What
	// matters here is only that the title reflects m.cfg.Provider once the
	// fetch resolves, so feed the Update path a synthetic success directly.
	updated, _ = m.Update(modelsFetchedMsg{models: nil})
	m = updated.(Model)

	if !strings.Contains(m.list.Title, "groq") {
		t.Errorf("model picker title = %q, should name the active provider", m.list.Title)
	}
}

// /model, /provider and /key must all refresh the sticky header so a change
// is visible at once in the always-visible status panel at the top — not only
// in a one-line confirmation that scrolls away.
func TestProviderAndModelChangesUpdateStickyHeader(t *testing.T) {
	m := newTestModel(t)

	updated, _ := m.dispatch("/model some/other-model")
	m = updated.(Model)
	header := strings.Join(m.header, "\n")
	if !strings.Contains(header, "Model:") || !strings.Contains(header, "some/other-model") {
		t.Errorf("/model should refresh the sticky status header, got:\n%s", header)
	}

	m.global.Keys["groq"] = "groq-saved-key"
	updated, _ = m.dispatch("/provider groq")
	m = updated.(Model)
	header = strings.Join(m.header, "\n")
	if !strings.Contains(header, "Provider:") || !strings.Contains(header, "groq") {
		t.Errorf("/provider should refresh the sticky status header, got:\n%s", header)
	}
}
