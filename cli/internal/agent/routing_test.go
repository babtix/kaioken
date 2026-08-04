package agent

import (
	"testing"

	"kaioken/internal/config"
	"kaioken/internal/llm"
)

func TestRoutedClient(t *testing.T) {
	base := &llm.Client{APIKey: "k", BaseURL: "http://x", Model: "session/model"}

	// No config: no routing, same client.
	a := &Agent{Client: base}
	if got := a.routedClient("task"); got != base {
		t.Error("nil config must return the session client")
	}

	// Config without the role: falls back to the session default, which is
	// the session model — so still the same client, no churn.
	a.Config = &config.Config{Model: "session/model"}
	if got := a.routedClient("task"); got != base {
		t.Error("an unrouted role must return the session client")
	}

	// Configured role: a new client on the routed model, original untouched.
	a.Config = &config.Config{
		Model:  "session/model",
		Models: map[string]string{"task": "cheap/model"},
	}
	got := a.routedClient("task")
	if got == base {
		t.Fatal("a routed role must produce a distinct client")
	}
	if got.Model != "cheap/model" {
		t.Errorf("routed model = %q", got.Model)
	}
	if base.Model != "session/model" {
		t.Errorf("routing must not mutate the session client, got %q", base.Model)
	}
	// Endpoint and credentials travel with the routing.
	if got.APIKey != base.APIKey || got.BaseURL != base.BaseURL {
		t.Error("routed client must keep the endpoint and credentials")
	}
}
