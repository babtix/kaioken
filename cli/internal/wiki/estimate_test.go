package wiki

import (
	"os"
	"strings"
	"testing"

	"kaioken/internal/config"
	"kaioken/internal/scan"
)

func testResult(files int, sizeEach int64) *scan.Result {
	res := &scan.Result{Root: "/repo"}
	for i := 0; i < files; i++ {
		p := "internal/core/f" + string(rune('a'+i%26)) + ".go"
		res.Files = append(res.Files, scan.File{Path: p, Size: sizeEach, Ext: ".go"})
		res.TotalSize += sizeEach
	}
	return res
}

func TestExpectedSubsections(t *testing.T) {
	// ×1 generates section documents only.
	if got := expectedSubsections(1); got != 0 {
		t.Errorf("x1 subsections = %d, want 0", got)
	}
	if got := expectedSubsections(2); got <= 0 {
		t.Errorf("x2 should plan subsections, got %d", got)
	}
	// The sub-planner caps at 12, so the estimate must too.
	if got := expectedSubsections(10); got > 12 {
		t.Errorf("x10 subsections = %d, want the cap respected", got)
	}
	if expectedSubsections(3) <= expectedSubsections(2) {
		t.Error("a higher multiplier should expect more subsections")
	}
}

func TestExpectedOutputGrowsWithMultiplier(t *testing.T) {
	if expectedOutputTokens(1) >= expectedOutputTokens(2) ||
		expectedOutputTokens(2) >= expectedOutputTokens(3) {
		t.Error("output estimate should grow with the multiplier")
	}
}

// Without a saved plan the estimate falls back to a guessed section count and
// says so, since the whole forecast is rougher.
func TestEstimateUnplanned(t *testing.T) {
	repo := t.TempDir()
	cfg := config.Default()
	est := EstimateRun(repo, cfg, testResult(40, 4000), 3)

	if est.Planned {
		t.Error("no outline exists, so Planned should be false")
	}
	if est.Sections == 0 || est.Calls == 0 {
		t.Fatalf("empty estimate: %+v", est)
	}
	if !strings.Contains(est.String(), "no plan yet") {
		t.Errorf("summary should flag the guess:\n%s", est.String())
	}
}

// With a plan on disk the estimate is derived from the real sections.
func TestEstimatePlanned(t *testing.T) {
	repo := t.TempDir()
	cfg := config.Default()
	outline := &Outline{Version: 1, Multiplier: 3, Sections: []Section{
		{ID: "a", Title: "Alpha", Goal: "a", Files: []string{"internal/core"}},
		{ID: "b", Title: "Beta", Goal: "b", Files: []string{"internal/core"}},
	}}
	if err := saveOutline(repo, outline); err != nil {
		t.Fatal(err)
	}

	est := EstimateRun(repo, cfg, testResult(10, 4000), 3)
	if !est.Planned {
		t.Error("an outline exists, so Planned should be true")
	}
	if est.Sections != 2 {
		t.Errorf("sections = %d, want 2", est.Sections)
	}
	// Two sections, each: one sub-plan call plus one call per document (a
	// section doc and its subsection docs), times the passes this depth buys.
	// Plus one repo-wide architecture brief. No global planning call, because
	// the plan already exists.
	docs := 1 + expectedSubsections(3)
	perSection := 1 + docs*passesPerDoc(3)
	if want := 2*perSection + 1; est.Calls != want {
		t.Errorf("calls = %d, want %d", est.Calls, want)
	}
}

// Above x3 the multiplier buys extra passes per document, so the call count
// must climb even when the section and subsection counts are capped.
func TestEstimateCountsQualityPasses(t *testing.T) {
	if passesPerDoc(3) != 1 {
		t.Errorf("x3 should draft only, got %d passes", passesPerDoc(3))
	}
	if passesPerDoc(4) != 2 {
		t.Errorf("x4 should add a critique pass, got %d", passesPerDoc(4))
	}
	if passesPerDoc(10) != 3 {
		t.Errorf("x10 should add critique and correction, got %d", passesPerDoc(10))
	}

	repo := t.TempDir()
	cfg := config.Default()
	outline := &Outline{Version: 1, Sections: []Section{
		{ID: "a", Title: "Alpha", Goal: "a", Files: []string{"internal/core"}},
	}}
	if err := saveOutline(repo, outline); err != nil {
		t.Fatal(err)
	}
	res := testResult(10, 4000)

	// Subsection counts are already capped at x4 and above, so any increase
	// here comes from the passes rather than from more documents.
	x4 := EstimateRun(repo, cfg, res, 4)
	x10 := EstimateRun(repo, cfg, res, 10)
	if x10.Calls <= x4.Calls {
		t.Errorf("x10 calls (%d) should exceed x4 (%d) via extra passes", x10.Calls, x4.Calls)
	}
	if !strings.Contains(x10.Passes, "verification") {
		t.Errorf("x10 should advertise verification, got %q", x10.Passes)
	}
	if !strings.Contains(x4.Passes, "critique") {
		t.Errorf("x4 should advertise critique, got %q", x4.Passes)
	}
	if strings.Contains(EstimateRun(repo, cfg, res, 3).Passes, "critique/revise") {
		t.Error("x3 should not claim a critique pass it does not run")
	}
}

// A bigger multiplier must forecast a bigger run — that is the whole point of
// showing the number before starting.
func TestEstimateGrowsWithMultiplier(t *testing.T) {
	repo := t.TempDir()
	cfg := config.Default()
	res := testResult(20, 8000)

	x1 := EstimateRun(repo, cfg, res, 1)
	x3 := EstimateRun(repo, cfg, res, 3)
	if x3.Calls <= x1.Calls {
		t.Errorf("x3 calls (%d) should exceed x1 (%d)", x3.Calls, x1.Calls)
	}
	if x3.Total() <= x1.Total() {
		t.Errorf("x3 tokens (%d) should exceed x1 (%d)", x3.Total(), x1.Total())
	}
}

func TestEstimateRespectsTokenBudget(t *testing.T) {
	cfg := config.Default()
	cfg.MaxModuleTokens = 10_000
	huge := testResult(5, 10_000_000) // far more than the budget allows

	if got := bundleTokens(huge, huge.Files, cfg.MaxModuleTokens); got != cfg.MaxModuleTokens {
		t.Errorf("bundleTokens = %d, want it capped at %d", got, cfg.MaxModuleTokens)
	}
}

func TestHeavyThreshold(t *testing.T) {
	small := &Estimate{Calls: 3, PromptTokens: 1000}
	if small.Heavy() {
		t.Error("a small run should not need confirmation")
	}
	byCalls := &Estimate{Calls: heavyCalls, PromptTokens: 10}
	if !byCalls.Heavy() {
		t.Error("a run with many calls should be flagged heavy")
	}
	byTokens := &Estimate{Calls: 1, PromptTokens: heavyTokens}
	if !byTokens.Heavy() {
		t.Error("a token-heavy run should be flagged heavy")
	}
}

func TestHumanCount(t *testing.T) {
	cases := map[int]string{
		999: "999", 1_500: "2k", 2_000_000: "2.0M",
	}
	for n, want := range cases {
		if got := humanCount(n); got != want {
			t.Errorf("humanCount(%d) = %q, want %q", n, got, want)
		}
	}
}

// A repo whose plan file is unreadable must still produce a usable estimate
// rather than panicking or returning zeros.
func TestEstimateWithCorruptPlan(t *testing.T) {
	repo := t.TempDir()
	if err := os.MkdirAll(OutlinePath(repo)[:strings.LastIndex(OutlinePath(repo), string(os.PathSeparator))], 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(OutlinePath(repo), []byte("{{{not yaml"), 0o644); err != nil {
		t.Fatal(err)
	}
	est := EstimateRun(repo, config.Default(), testResult(10, 2000), 3)
	if est.Calls == 0 || est.Sections == 0 {
		t.Errorf("corrupt plan should fall back to a guess, got %+v", est)
	}
}
