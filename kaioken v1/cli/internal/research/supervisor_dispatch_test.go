package research

import (
	"fmt"
	"testing"
)

// Dispatch admission for the deep path's supervisor.
//
// The rule these pin down: a PLANNED strand is work waiting to be done, and the
// supervisor must be able to dispatch it. Only a strand that is already settled
// by a finding, or already handed to a worker in this run, is refused.

func sub(id, objective string) Subtopic {
	return Subtopic{ID: id, Objective: objective, Format: "prose", Sources: []string{"web"}, Bounds: "none"}
}

func dispatchArgs(objective string) string {
	return fmt.Sprintf(`{"objective":%q,"format":"prose","sources":["web"],"bounds":"none"}`, objective)
}

// A planned-but-undispatched objective must be accepted. This is the bug: the
// dedup set used to be seeded from the plan, so the supervisor's own plan came
// back as "already covered" and the deep path produced nothing.
func TestAcceptDispatchAllowsPlannedObjective(t *testing.T) {
	plan := []Subtopic{sub("sub-1", "How does the retry ladder work?")}
	objectives := settledObjectives(nil, plan)
	nextID, spawned := nextSubtopicID(plan), 0

	e := &engine{}
	got, why := e.acceptDispatch(dispatchArgs("How does the retry ladder work?"), objectives, &nextID, &spawned)
	if got == nil {
		t.Fatalf("planned objective was refused: %s", why)
	}
	if got.ID == "sub-1" {
		t.Errorf("spawned strand reused a planned id: %s", got.ID)
	}
	if spawned != 1 {
		t.Errorf("spawned = %d, want 1", spawned)
	}
}

// Dispatching the same objective twice must be refused the second time.
func TestAcceptDispatchRefusesSecondDispatch(t *testing.T) {
	plan := []Subtopic{sub("sub-1", "How does the retry ladder work?")}
	objectives := settledObjectives(nil, plan)
	nextID, spawned := nextSubtopicID(plan), 0
	e := &engine{}

	first, why := e.acceptDispatch(dispatchArgs("How does the retry ladder work?"), objectives, &nextID, &spawned)
	if first == nil {
		t.Fatalf("first dispatch refused: %s", why)
	}
	objectives[normObjective(first.Objective)] = true // what the loop does on accept

	second, why := e.acceptDispatch(dispatchArgs("How does the retry ladder work?"), objectives, &nextID, &spawned)
	if second != nil {
		t.Fatal("the same objective was dispatched twice")
	}
	if why == "" {
		t.Error("refusal carried no reason")
	}
}

// Normalisation must survive: case and surrounding whitespace do not make a
// different question.
func TestAcceptDispatchNormalisesObjective(t *testing.T) {
	plan := []Subtopic{sub("sub-1", "Retry semantics")}
	objectives := settledObjectives(nil, plan)
	objectives[normObjective("Retry semantics")] = true // already dispatched
	nextID, spawned := nextSubtopicID(plan), 0

	e := &engine{}
	for _, variant := range []string{"  retry semantics  ", "RETRY SEMANTICS", "Retry Semantics"} {
		if got, _ := e.acceptDispatch(dispatchArgs(variant), objectives, &nextID, &spawned); got != nil {
			t.Errorf("variant %q was accepted as a new objective", variant)
		}
	}
}

// A finding already on disk settles its objective, resolved through the plan.
func TestSettledObjectivesResolvesFindingsThroughPlan(t *testing.T) {
	plan := []Subtopic{sub("sub-1", "Answered already"), sub("sub-2", "Still open")}
	spawnedPlan := []Subtopic{sub("sub-7", "Spawned in an earlier wave")}
	findings := []Finding{
		{SubtopicID: "sub-1", Summary: "..."},
		{SubtopicID: "sub-7", Summary: "..."},
		{SubtopicID: "sub-99", Summary: "orphan with no plan entry"},
	}

	settled := settledObjectives(findings, plan, spawnedPlan)

	if !settled[normObjective("Answered already")] {
		t.Error("a finding's objective was not marked settled")
	}
	if !settled[normObjective("Spawned in an earlier wave")] {
		t.Error("a supervisor-spawned strand's finding was not marked settled")
	}
	if settled[normObjective("Still open")] {
		t.Error("an unanswered planned objective was marked settled")
	}
	if len(settled) != 2 {
		t.Errorf("settled = %d entries, want 2 (the orphan must not add one)", len(settled))
	}
}

// A settled objective is refused even though it is also in the plan.
func TestAcceptDispatchRefusesSettledObjective(t *testing.T) {
	plan := []Subtopic{sub("sub-1", "Answered already")}
	objectives := settledObjectives([]Finding{{SubtopicID: "sub-1"}}, plan)
	nextID, spawned := nextSubtopicID(plan), 1

	e := &engine{}
	if got, _ := e.acceptDispatch(dispatchArgs("Answered already"), objectives, &nextID, &spawned); got != nil {
		t.Error("an objective a finding already answers was dispatched again")
	}
}

func TestAcceptDispatchRejectsIncompleteContract(t *testing.T) {
	e := &engine{}
	cases := map[string]string{
		"no objective": `{"objective":"","format":"prose","sources":["web"],"bounds":"none"}`,
		"no format":    `{"objective":"q","format":"","sources":["web"],"bounds":"none"}`,
		"no bounds":    `{"objective":"q","format":"prose","sources":["web"],"bounds":""}`,
		"bad json":     `{"objective":`,
	}
	for name, args := range cases {
		t.Run(name, func(t *testing.T) {
			objectives := map[string]bool{}
			nextID, spawned := 1, 0
			got, why := e.acceptDispatch(args, objectives, &nextID, &spawned)
			if got != nil {
				t.Error("an incomplete delegation contract was accepted")
			}
			if why == "" {
				t.Error("refusal carried no reason")
			}
			if spawned != 0 {
				t.Errorf("a refused dispatch consumed spawn budget: %d", spawned)
			}
		})
	}
}

// An empty or unrecognised source list is normalised to web rather than
// refused: a strand always needs somewhere to search, and cleanSourceTags
// supplies the default. Pinned here so the dedup change above is not read as
// having relaxed contract validation.
func TestAcceptDispatchNormalisesEmptySources(t *testing.T) {
	e := &engine{}
	for name, args := range map[string]string{
		"empty list":        `{"objective":"q","format":"prose","sources":[],"bounds":"none"}`,
		"unknown tags":      `{"objective":"q","format":"prose","sources":["carrier-pigeon"],"bounds":"none"}`,
		"code without repo": `{"objective":"q","format":"prose","sources":["code"],"bounds":"none"}`,
	} {
		t.Run(name, func(t *testing.T) {
			objectives := map[string]bool{}
			nextID, spawned := 1, 0
			got, why := e.acceptDispatch(args, objectives, &nextID, &spawned)
			if got == nil {
				t.Fatalf("refused instead of normalising: %s", why)
			}
			if len(got.Sources) != 1 || got.Sources[0] != "web" {
				t.Errorf("Sources = %v, want [web]", got.Sources)
			}
		})
	}
}

func TestAcceptDispatchHonoursSpawnBudget(t *testing.T) {
	e := &engine{}
	objectives := map[string]bool{}
	nextID, spawned := 1, maxDeepSubtopics

	got, why := e.acceptDispatch(dispatchArgs("one more strand"), objectives, &nextID, &spawned)
	if got != nil {
		t.Error("dispatch accepted past the spawn budget")
	}
	if why == "" {
		t.Error("refusal carried no reason")
	}
}

// Ids must not collide with strands an earlier wave already appended.
func TestNextSubtopicIDAvoidsCollision(t *testing.T) {
	plan := []Subtopic{sub("sub-1", "a"), sub("sub-2", "b")}
	spawned := []Subtopic{sub("sub-3", "c"), sub("sub-9", "d")}

	if got := nextSubtopicID(plan, spawned); got != 10 {
		t.Errorf("nextSubtopicID = %d, want 10 (past the highest in use)", got)
	}
	if got := nextSubtopicID(nil); got != 1 {
		t.Errorf("nextSubtopicID on an empty plan = %d, want 1", got)
	}
	// An id that does not match the sub-N shape must not derail the count.
	odd := []Subtopic{{ID: "seed", Objective: "x"}, sub("sub-4", "y")}
	if got := nextSubtopicID(odd); got != 5 {
		t.Errorf("nextSubtopicID with an off-shape id = %d, want 5", got)
	}
}
