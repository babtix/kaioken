package research

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
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

// Failing workers checkpoint at once from inside the errgroup wave. The
// checkpoints used to share one temp path — a half-overwritten file could be
// renamed over run.json — and on Windows two renames onto one destination do
// not even queue, they fail. So checkpoints must serialise end to end:
// under any interleaving, every call must succeed, run.json must land
// complete and parseable (the file a resume depends on), and no temp litter
// may survive.
func TestCheckpointConcurrentCallsLeaveRunJSONIntact(t *testing.T) {
	pinRunsHome(t)

	rs, err := NewRun("many hands on one run", "deep")
	if err != nil {
		t.Fatal(err)
	}

	const goroutines = 32
	const perGoroutine = 8
	var wg sync.WaitGroup
	errs := make(chan error, goroutines)
	for i := 0; i < goroutines; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			for j := 0; j < perGoroutine; j++ {
				rs.Mutate(func(r *RunMeta) {
					r.Multiplier++
					r.Fast.Queries = append(r.Fast.Queries, fmt.Sprintf("w%d-%d", i, j))
				})
				if err := rs.Checkpoint(); err != nil {
					errs <- err
					return
				}
			}
		}(i)
	}
	wg.Wait()
	close(errs)
	for err := range errs {
		t.Errorf("concurrent Checkpoint failed: %v", err)
	}

	raw, err := os.ReadFile(filepath.Join(rs.Dir(), "run.json"))
	if err != nil {
		t.Fatal(err)
	}
	if !json.Valid(raw) {
		t.Fatalf("run.json is not valid JSON after %d concurrent checkpoints:\n%s",
			goroutines*perGoroutine, raw)
	}
	var meta RunMeta
	if err := json.Unmarshal(raw, &meta); err != nil {
		t.Fatal(err)
	}
	// Every mutation is interleaved with a checkpoint, so the last writer's
	// snapshot carries all of them: anything less means a checkpoint renamed
	// away a state that never made it to disk.
	snap := rs.Snapshot()
	if meta.ID != runIDOf(rs.Dir()) || meta.Query != "many hands on one run" ||
		meta.Multiplier != snap.Multiplier || len(meta.Fast.Queries) != len(snap.Fast.Queries) {
		t.Errorf("run.json drifted from memory: disk %+v vs live %+v", meta, snap)
	}
	if want := goroutines * perGoroutine; meta.Multiplier != want || len(meta.Fast.Queries) != want {
		t.Errorf("checkpointed run lost mutations: multiplier %d and %d queries, want %d each",
			meta.Multiplier, len(meta.Fast.Queries), want)
	}

	entries, err := os.ReadDir(rs.Dir())
	if err != nil {
		t.Fatal(err)
	}
	for _, e := range entries {
		if filepath.Ext(e.Name()) == ".tmp" {
			t.Errorf("a failed or interrupted checkpoint left %s behind", e.Name())
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

// Stop-and-continue rests on the listing and the discard: interrupted runs
// show up with enough to recognise them, finished ones never do, and a
// discarded run is gone from both the list and the disk.
func TestResumableRunsListAndDelete(t *testing.T) {
	pinRunsHome(t)

	mid, err := NewRun("what changed in Go 1.24 GC?", "auto")
	if err != nil {
		t.Fatal(err)
	}
	mid.Mutate(func(r *RunMeta) { r.Path = "fast"; r.Multiplier = 3 })
	if err := mid.SetPhase(PhaseResearch); err != nil {
		t.Fatal(err)
	}

	done, err := NewRun("finished question", "auto")
	if err != nil {
		t.Fatal(err)
	}
	if err := done.SetPhase(PhaseDone); err != nil {
		t.Fatal(err)
	}

	runs := ResumableRuns()
	if len(runs) != 1 {
		t.Fatalf("ResumableRuns = %d runs, want only the interrupted one: %+v", len(runs), runs)
	}
	if runs[0].Question != "what changed in Go 1.24 GC?" || runs[0].Phase != PhaseResearch || runs[0].Path != "fast" {
		t.Errorf("the listing drifted: %+v", runs[0])
	}

	if err := DeleteRun(runIDOf(mid.Dir())); err != nil {
		t.Fatal(err)
	}
	if len(ResumableRuns()) != 0 {
		t.Error("a discarded run is still listed")
	}
	if _, err := os.Stat(mid.Dir()); !os.IsNotExist(err) {
		t.Error("the discarded run's directory is still on disk")
	}
	for _, id := range []string{"../escape", ""} {
		if err := DeleteRun(id); err == nil {
			t.Errorf("DeleteRun(%q) must be refused", id)
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
