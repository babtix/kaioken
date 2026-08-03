package research

import (
	"context"
	"strings"
	"testing"
)

// The router's decision boundary is the piece the design left open; these
// cases pin down the shipped heuristic: narrow lookups stay contained,
// multi-stranded questions go deep, and everything unclear can be tuned
// later from the decision log.
func TestHeuristicScoreSeparatesNarrowFromBroad(t *testing.T) {
	narrow := []string{
		"What changed in Go 1.24's garbage collector?",
		"Summarize the latest IPCC report",
		"Current price of uranium per pound",
	}
	broad := []string{
		"How should we architect the auth layer, and what do Vault, Keycloak and Authelia do differently?",
		"Compare the LCOE of solar, wind and nuclear in Europe per IEA data, and evaluate which strategy suits a utility",
	}
	for _, q := range narrow {
		if s := heuristicScore(q); s > routerFastScore+1 {
			t.Errorf("narrow question scored %d: %q", s, q)
		}
	}
	for _, q := range broad {
		if s := heuristicScore(q); s < routerDeepScore {
			t.Errorf("broad question scored only %d: %q", s, q)
		}
	}
}

func TestCountEntitiesIgnoresTheLeadingWord(t *testing.T) {
	// "What" is capitalised by grammar; Vault/Keycloak/Authelia are names.
	if got := countEntities("What do Vault, Keycloak and Authelia share?"); got < 3 {
		t.Errorf("countEntities = %d, want at least 3", got)
	}
	if got := countEntities("What is the price of uranium?"); got != 0 {
		t.Errorf("countEntities = %d, want 0 for a sentence with no names", got)
	}
}

// With no router model available the decision must land on fast — the bias
// the escalation safety net exists to support.
func TestTriageFallsBackToFastWithoutAModel(t *testing.T) {
	// Two heuristic signals (a junction plus a comparison verb) land in the
	// middle band that would normally cost one cheap call.
	d := triage(context.Background(), nil, "Compare Alpha and Beta, and assess the result")
	if d.Route != RouteFast {
		t.Errorf("triage without a model = %v, want fast", d.Route)
	}
	if !strings.Contains(d.Reason, "no router model") {
		t.Errorf("reason %q should say why the model was skipped", d.Reason)
	}
}

func TestParseRoute(t *testing.T) {
	if parseRoute("deep") != RouteDeep {
		t.Error(`parseRoute("deep") must be RouteDeep`)
	}
	if parseRoute("fast") != RouteFast || parseRoute("") != RouteFast || parseRoute("garbage") != RouteFast {
		t.Error("anything but deep must read as fast")
	}
}

func TestRouteString(t *testing.T) {
	if RouteFast.String() != "fast" || RouteDeep.String() != "deep" {
		t.Error("Route.String lost its names")
	}
}
