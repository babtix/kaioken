package research

import (
	"encoding/json"
	"testing"
)

// Resuming the fast path.
//
// The gap audit costs a model call and produces the one thing that makes a
// later round different from the first: a list of what is actually missing. A
// resume that drops it re-searches the original question and pays for the
// audit twice.

func TestResumeQueriesUsesThePersistedPlan(t *testing.T) {
	fast := FastState{Pending: []string{"gap query one", "gap query two"}}

	got := resumeQueries(fast, "the original question")

	if len(got) != 2 || got[0] != "gap query one" || got[1] != "gap query two" {
		t.Fatalf("resumeQueries = %v, want the persisted gap plan", got)
	}
	// The returned slice must not alias the checkpoint's.
	got[0] = "mutated"
	if fast.Pending[0] != "gap query one" {
		t.Error("resumeQueries handed back a slice aliasing the checkpoint")
	}
}

func TestResumeQueriesFallsBackToTheQuestion(t *testing.T) {
	for name, fast := range map[string]FastState{
		"no pending field": {Subs: []string{"a"}, Round: 2},
		"empty pending":    {Pending: []string{}},
		"zero value":       {},
	} {
		t.Run(name, func(t *testing.T) {
			got := resumeQueries(fast, "the original question")
			if len(got) != 1 || got[0] != "the original question" {
				t.Errorf("resumeQueries = %v, want the question as the fallback", got)
			}
		})
	}
}

func TestFastStateRoundTripsPendingAndGaps(t *testing.T) {
	want := FastState{
		Subs:    []string{"sub one"},
		Queries: []string{"issued query"},
		Round:   2,
		Pending: []string{"next query"},
		Gaps: &gapReport{
			Complete:  false,
			Missing:   []string{"a figure nobody supplied"},
			Queries:   []string{"next query"},
			Questions: []string{"what is the figure?"},
		},
	}

	raw, err := json.Marshal(want)
	if err != nil {
		t.Fatal(err)
	}
	var got FastState
	if err := json.Unmarshal(raw, &got); err != nil {
		t.Fatal(err)
	}

	if len(got.Pending) != 1 || got.Pending[0] != "next query" {
		t.Errorf("Pending = %v, want it preserved", got.Pending)
	}
	if got.Gaps == nil {
		t.Fatal("Gaps was dropped by the round trip")
	}
	if got.Gaps.Complete != want.Gaps.Complete {
		t.Errorf("Gaps.Complete = %v", got.Gaps.Complete)
	}
	if len(got.Gaps.Questions) != 1 || got.Gaps.Questions[0] != "what is the figure?" {
		t.Errorf("Gaps.Questions = %v, want it preserved", got.Gaps.Questions)
	}
	if len(got.Gaps.Missing) != 1 || len(got.Gaps.Queries) != 1 {
		t.Errorf("Gaps lost Missing/Queries: %+v", got.Gaps)
	}
}

// A checkpoint written before these fields existed must still load, with the
// new fields empty and no error. This is the backward-compatibility guarantee,
// proved against the old serialised shape rather than assumed.
func TestFastStateLoadsPreExistingCheckpoint(t *testing.T) {
	old := `{"subs":["sub one"],"queries":["issued query"],"round":2}`

	var got FastState
	if err := json.Unmarshal([]byte(old), &got); err != nil {
		t.Fatalf("an older checkpoint failed to load: %v", err)
	}
	if got.Round != 2 || len(got.Subs) != 1 || len(got.Queries) != 1 {
		t.Errorf("older fields did not survive: %+v", got)
	}
	if len(got.Pending) != 0 || got.Gaps != nil {
		t.Errorf("new fields should be empty on an older checkpoint: %+v", got)
	}
	// And such a run resumes on the fallback rather than an empty search list.
	if q := resumeQueries(got, "the original question"); len(q) != 1 || q[0] != "the original question" {
		t.Errorf("older checkpoint resumed with %v", q)
	}
}

// Empty values must not write noise into the checkpoint.
func TestFastStateOmitsEmptyPendingAndGaps(t *testing.T) {
	raw, err := json.Marshal(FastState{Round: 1})
	if err != nil {
		t.Fatal(err)
	}
	if s := string(raw); s != `{"round":1}` {
		t.Errorf("marshalled = %s, want only the set field", s)
	}
}
