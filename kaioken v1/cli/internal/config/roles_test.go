package config

import "testing"

func TestResolveModel(t *testing.T) {
	cfg := &Config{
		Model: "default/model",
		Models: map[string]string{
			"compact": "cheap/model",
			"task":    "",
		},
	}

	if got := cfg.ResolveModel("compact"); got != "cheap/model" {
		t.Errorf("compact = %q, want cheap/model", got)
	}
	// Set-but-empty entries fall through to the default rather than routing
	// to nothing.
	if got := cfg.ResolveModel("task"); got != "default/model" {
		t.Errorf("task = %q, want default/model", got)
	}
	// Unknown and unset roles alike fall back to the session default.
	if got := cfg.ResolveModel("impact"); got != "default/model" {
		t.Errorf("impact = %q, want default/model", got)
	}

	var nilCfg *Config
	if got := nilCfg.ResolveModel("compact"); got != "" {
		t.Errorf("nil config = %q, want empty", got)
	}
}

func TestRolesCoverRoutingCallSites(t *testing.T) {
	// Guard against a role being dropped from the documented list while a
	// call site still resolves it.
	want := map[string]bool{
		"plan": true, "edit": true, "task": true,
		"compact": true, "impact": true, "summarize": true,
	}
	for _, r := range Roles {
		if !want[r] {
			t.Errorf("unexpected role %q in Roles", r)
		}
		delete(want, r)
	}
	for r := range want {
		t.Errorf("role %q missing from Roles", r)
	}
}
