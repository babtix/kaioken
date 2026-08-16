package research

import "testing"

// Escalation moves the in-memory route, not just the persisted one.
//
// A zero Budget keeps costReached and deadline false without a live meter:
// CostExceeded short-circuits on a zero ceiling, and WallClock of zero means
// no wall clock. That is what lets these construct an engine directly instead
// of standing up a whole run.

func autoFastEngine() *engine {
	return &engine{mode: "auto", route: RouteFast, budget: Budget{}}
}

// The bug: an escalated auto run skipped grounding, because e.route still said
// fast, !e.escalated had just gone false, and Verify was off.
func TestEscalatedRunStillWantsCitePass(t *testing.T) {
	e := autoFastEngine()
	if !e.wantsCitePass() {
		t.Fatal("a fresh auto fast run should want the grounding pass")
	}

	e.markEscalated()

	if e.route != RouteDeep {
		t.Errorf("route = %v after escalation, want %v", e.route, RouteDeep)
	}
	if !e.wantsCitePass() {
		t.Error("an escalated run skipped grounding — the exact bug this fixes")
	}
}

// A dossier run keeps its own shape and does not want the pass unless asked.
func TestWantsCitePassRespectsDossierAndVerify(t *testing.T) {
	dossier := &engine{mode: "auto", route: RouteFast, dossier: true, budget: Budget{}}
	if dossier.wantsCitePass() {
		t.Error("a dossier run wanted the grounding pass unasked")
	}

	dossier.opts.Verify = true
	if !dossier.wantsCitePass() {
		t.Error("explicit Verify did not force the grounding pass")
	}

	// A pinned deep run always wants it.
	deep := &engine{mode: "deep", route: RouteDeep, budget: Budget{}}
	if !deep.wantsCitePass() {
		t.Error("a deep run did not want the grounding pass")
	}
}

func TestCanEscalateAfterCite(t *testing.T) {
	e := autoFastEngine()
	if !e.canEscalateAfterCite() {
		t.Fatal("a fresh auto fast run should allow a post-cite promotion")
	}

	// Once per run: after escalating, a second promotion is off the table.
	e.markEscalated()
	if e.canEscalateAfterCite() {
		t.Error("a second post-cite promotion was allowed")
	}
}

// Setting e.route on escalation must not silently disable post-cite promotion
// for runs that have NOT escalated. This is the trap: a route test here would
// look equivalent to !e.escalated and is not.
func TestCanEscalateAfterCiteDoesNotDependOnRoute(t *testing.T) {
	e := autoFastEngine()
	e.route = RouteDeep // pinned deep, never escalated
	if !e.canEscalateAfterCite() {
		t.Error("a non-escalated run was refused a promotion because of its route")
	}

	pinned := &engine{mode: "deep", route: RouteDeep, budget: Budget{}}
	if pinned.canEscalateAfterCite() {
		t.Error("a run pinned by mode=deep was offered a post-cite promotion")
	}
}

// shouldEscalate is only ever reached before the first promotion, so its own
// route test still holds — and !already keeps it false afterwards regardless.
func TestShouldEscalateStopsAfterEscalating(t *testing.T) {
	e := autoFastEngine()
	e.pool = newCorpus(2)

	if _, ok := e.shouldEscalate(pathOutcome{}); !ok {
		t.Fatal("a fast run with no cited sources should escalate")
	}

	e.markEscalated()
	if _, ok := e.shouldEscalate(pathOutcome{}); ok {
		t.Error("shouldEscalate fired again after the run had already escalated")
	}
}
