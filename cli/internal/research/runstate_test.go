package research

import (
	"os"
	"path/filepath"
	"testing"

	"kaioken/internal/config"
)

// writeFileForTest is the plain os.WriteFile behind a test-scoped name.
func writeFileForTest(dir, name, content string) error {
	return os.WriteFile(filepath.Join(dir, name), []byte(content), 0o644)
}

// pinRunsHome keeps run-state tests out of the developer's real home.
func pinRunsHome(t *testing.T) {
	t.Helper()
	t.Setenv(config.HomeEnv, t.TempDir())
}

// A run's checkpointed metadata must survive the exact path a --resume
// takes: write, reopen, compare.
func TestRunStateCheckpointRoundTrip(t *testing.T) {
	pinRunsHome(t)

	rs, err := NewRun("what costs more, solar or nuclear?", "auto")
	if err != nil {
		t.Fatal(err)
	}
	rs.Mutate(func(r *RunMeta) {
		r.Path = "fast"
		r.Plan = []Subtopic{{
			ID: "sub-1", Objective: "the cost of solar", Format: "one figure",
			Sources: []string{"web"}, Bounds: "Europe only", Status: SubtopicDone,
		}}
		r.Fast = FastState{Subs: []string{"the cost of solar"}, Round: 2}
	})
	if err := rs.SetPhase(PhaseResearch); err != nil {
		t.Fatal(err)
	}

	reopened, err := OpenRun(runIDOf(rs.Dir()))
	if err != nil {
		t.Fatal(err)
	}
	snap := reopened.Snapshot()
	if snap.Query != "what costs more, solar or nuclear?" || snap.Path != "fast" || snap.Phase != PhaseResearch {
		t.Errorf("reopened run drifted: %+v", snap)
	}
	if len(snap.Plan) != 1 || !snap.Plan[0].Complete() || snap.Fast.Round != 2 {
		t.Errorf("plan and fast state drifted: %+v", snap)
	}
}

// runIDOf peels the run id off a run directory path.
func runIDOf(dir string) string {
	return filepath.Base(dir)
}

// A finished run is not resumable, and a malformed id is refused before any
// path is touched.
func TestOpenRunRejectsFinishedAndMalformed(t *testing.T) {
	pinRunsHome(t)

	rs, err := NewRun("done question", "auto")
	if err != nil {
		t.Fatal(err)
	}
	if err := rs.SetPhase(PhaseDone); err != nil {
		t.Fatal(err)
	}
	if _, err := OpenRun(runIDOf(rs.Dir())); err == nil {
		t.Error("a finished run must not be resumable")
	}

	for _, id := range []string{"../escape", "20260101-000000-zzzz", ""} {
		if _, err := OpenRun(id); err == nil {
			t.Errorf("OpenRun(%q) must be refused", id)
		}
	}
}

// Findings persist as JSON and reload for the supervisor on resume; the
// matching subtopic is marked done.
func TestRunStateFindingsRoundTrip(t *testing.T) {
	pinRunsHome(t)

	rs, err := NewRun("q", "deep")
	if err != nil {
		t.Fatal(err)
	}
	rs.Mutate(func(r *RunMeta) {
		r.Plan = []Subtopic{{ID: "sub-1", Objective: "o", Format: "f", Sources: []string{"web"}, Bounds: "b", Status: SubtopicRunning}}
	})
	f := Finding{
		SubtopicID: "sub-1",
		Summary:    "solar is cheaper",
		Claims:     []Claim{{Text: "EUR 40/MWh", Support: []string{"abc"}}},
		SourceHash: []string{"abc"},
	}
	if err := rs.WriteFinding(f); err != nil {
		t.Fatal(err)
	}

	loaded, err := rs.LoadFindings()
	if err != nil || len(loaded) != 1 {
		t.Fatalf("LoadFindings = %v, %v", loaded, err)
	}
	if loaded[0].Summary != "solar is cheaper" || loaded[0].Claims[0].Text != "EUR 40/MWh" {
		t.Errorf("finding drifted: %+v", loaded[0])
	}
	snap := rs.Snapshot()
	if snap.Plan[0].Status != SubtopicDone {
		t.Errorf("subtopic status = %s, want done after its finding landed", snap.Plan[0].Status)
	}
}

// Model-produced ids flow into filenames; they must be reduced to a safe
// stem without ever carrying separators or traversal.
func TestSafeFindingName(t *testing.T) {
	cases := map[string]string{
		"sub-1":            "sub-1",
		"What costs more?": "what-costs-more",
		"../../etc/passwd": "etc-passwd",
		"":                 "finding",
	}
	for in, want := range cases {
		if got := safeFindingName(in); got != want {
			t.Errorf("safeFindingName(%q) = %q, want %q", in, got, want)
		}
	}
}

// The delegation contract is all four fields or the subtopic does not
// exist.
func TestSubtopicContract(t *testing.T) {
	full := Subtopic{Objective: "o", Format: "f", Sources: []string{"web"}, Bounds: "b"}
	if !full.Complete() {
		t.Error("a full contract must validate")
	}
	for _, broken := range []Subtopic{
		{Format: "f", Sources: []string{"web"}, Bounds: "b"},
		{Objective: "o", Sources: []string{"web"}, Bounds: "b"},
		{Objective: "o", Format: "f", Bounds: "b"},
		{Objective: "o", Format: "f", Sources: []string{"web"}},
	} {
		if broken.Complete() {
			t.Errorf("an incomplete contract validated: %+v", broken)
		}
	}
}
