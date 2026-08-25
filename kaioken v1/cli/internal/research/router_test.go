package research

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
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
	// Two heuristic signals (a junction plus a comparison verb) would once
	// have bought one cheap call; without a client the fallback decides.
	d := triage(context.Background(), nil, "Compare Alpha and Beta, and assess the result")
	if d.Route != RouteFast {
		t.Errorf("triage without a model = %v, want fast", d.Route)
	}
	if !strings.Contains(d.Reason, "no router model") {
		t.Errorf("reason %q should say why the model was skipped", d.Reason)
	}
}

// routerServer replies to the triage call with one canned JSON verdict.
func routerServer(t *testing.T, path string, calls *int) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		*calls++
		w.Header().Set("Content-Type", "application/json")
		body := `{"strands":["a","b"],"path":"` + path + `","reason":"canned"}`
		json.NewEncoder(w).Encode(map[string]any{"choices": []any{map[string]any{
			"message": map[string]any{"role": "assistant", "content": body},
		}}})
	}))
}

// The model decides every auto-routed question, including the ones the old
// keyword scoring settled for free — that short-circuit is what made the
// boundary inaccurate, so both extremes must reach the router.
func TestTriageAsksTheModelEvenWhenHeuristicsAreCertain(t *testing.T) {
	cases := []struct {
		name     string
		question string
		verdict  string
		want     Route
	}{
		{
			// Scores 0: no junction, no deep word, one entity, short. The old
			// router returned fast without asking.
			name:     "narrow question the model reads as multi-stranded",
			question: "What changed in Go 1.24's garbage collector?",
			verdict:  "deep",
			want:     RouteDeep,
		},
		{
			// Scores well past routerDeepScore on keywords alone, yet asks
			// one thing of one source set.
			name: "keyword-heavy question the model reads as one strand",
			question: "How should we architect the auth layer, and what do Vault, " +
				"Keycloak and Authelia do differently in their token strategy, " +
				"compared against the landscape of alternatives available today?",
			verdict: "fast",
			want:    RouteFast,
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			calls := 0
			srv := routerServer(t, tc.verdict, &calls)
			defer srv.Close()

			d := triage(context.Background(), newTestClient(t, srv.URL), tc.question)
			if calls != 1 {
				t.Errorf("router made %d call(s), want exactly 1", calls)
			}
			if d.Route != tc.want {
				t.Errorf("triage = %v, want %v (reason %q)", d.Route, tc.want, d.Reason)
			}
			if !strings.HasPrefix(d.Reason, "router:") {
				t.Errorf("reason %q should be attributed to the router", d.Reason)
			}
		})
	}
}

// A failed router call must not sink the run: the heuristic decides, and
// says out loud that it is standing in.
func TestTriageFallsBackWhenTheRouterCallFails(t *testing.T) {
	// 400 rather than 5xx: the client does not retry it, so this exercises
	// the fallback without waiting out a backoff ladder. A 5xx takes the
	// same branch, just after routerTimeout caps the retries.
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "no such model", http.StatusBadRequest)
	}))
	defer srv.Close()

	// Scores 3 on keywords: the fallback is allowed to route deep, unlike
	// the no-model case above.
	q := "Compare Alpha, Beta and Gamma, and evaluate which suits us"
	d := triage(context.Background(), newTestClient(t, srv.URL), q)
	if d.Route != RouteDeep {
		t.Errorf("fallback triage = %v, want deep for %q", d.Route, q)
	}
	if !strings.Contains(d.Reason, "heuristic fallback") {
		t.Errorf("reason %q should admit the heuristic decided", d.Reason)
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
