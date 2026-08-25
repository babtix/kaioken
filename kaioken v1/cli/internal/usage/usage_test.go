package usage

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"

	"kaioken/internal/config"
)

// isolate points the global config dir — and therefore the ledger — at a temp
// directory. Mandatory: without it these tests would append to the developer's
// real spending history.
func isolate(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	t.Setenv(config.HomeEnv, dir)
	priceMu.Lock()
	priceCache = nil
	priceMu.Unlock()
	return dir
}

func TestRecordAndLoadRoundTrip(t *testing.T) {
	isolate(t)

	Record(Event{
		Provider: "openrouter", Model: "test/model", Operation: "wiki",
		Workspace: "/repo/a", Calls: 3, PromptTokens: 1000, CompletionTokens: 500,
		CostUSD: 0.02,
	})
	Record(Event{
		Provider: "ollama", Model: "llama3.2", Operation: "chat",
		Workspace: "/repo/a", Calls: 1, PromptTokens: 200, CompletionTokens: 100,
		Local: true,
	})

	events, err := Load(time.Time{})
	if err != nil {
		t.Fatal(err)
	}
	if len(events) != 2 {
		t.Fatalf("loaded %d events, want 2", len(events))
	}
	if events[0].Model != "test/model" || events[0].CostUSD != 0.02 {
		t.Errorf("first event lost fields: %+v", events[0])
	}
	if !events[1].Local {
		t.Error("local flag not persisted")
	}
}

func TestRecordIgnoresEmptyEvents(t *testing.T) {
	isolate(t)
	Record(Event{Provider: "openrouter", Model: "m"})

	events, err := Load(time.Time{})
	if err != nil {
		t.Fatal(err)
	}
	if len(events) != 0 {
		t.Errorf("an event with no calls and no tokens was recorded: %+v", events)
	}
}

func TestLoadFiltersBySince(t *testing.T) {
	isolate(t)
	old := time.Now().AddDate(0, 0, -40)
	Record(Event{At: old, Model: "m", Calls: 1, PromptTokens: 10})
	Record(Event{Model: "m", Calls: 1, PromptTokens: 10})

	recent, err := Load(time.Now().AddDate(0, 0, -7))
	if err != nil {
		t.Fatal(err)
	}
	if len(recent) != 1 {
		t.Errorf("since filter returned %d events, want 1", len(recent))
	}
}

func TestLoadSkipsCorruptLines(t *testing.T) {
	dir := isolate(t)
	Record(Event{Model: "good", Calls: 1, PromptTokens: 5})

	path := filepath.Join(dir, "usage.jsonl")
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	// A truncated write must not hide the history around it.
	if err := os.WriteFile(path, append([]byte("{broken\n"), raw...), 0o600); err != nil {
		t.Fatal(err)
	}

	events, err := Load(time.Time{})
	if err != nil {
		t.Fatal(err)
	}
	if len(events) != 1 || events[0].Model != "good" {
		t.Errorf("corrupt line swallowed valid history: %+v", events)
	}
}

func TestSummarizeGroupsEveryDimension(t *testing.T) {
	day1 := time.Date(2026, 3, 1, 10, 0, 0, 0, time.UTC)
	day2 := day1.AddDate(0, 0, 1)
	events := []Event{
		{At: day1, Provider: "openrouter", Model: "big", Operation: "wiki",
			Workspace: "/x/alpha", Calls: 2, PromptTokens: 1000, CompletionTokens: 200, CostUSD: 0.50},
		{At: day1, Provider: "openrouter", Model: "small", Operation: "chat",
			Workspace: "/x/alpha", Calls: 5, PromptTokens: 300, CompletionTokens: 100, CostUSD: 0.05},
		{At: day2, Provider: "ollama", Model: "llama3.2", Operation: "chat",
			Workspace: "/x/beta", Calls: 4, PromptTokens: 900, CompletionTokens: 400, Local: true},
	}

	s := Summarize(events)
	if s.Calls != 11 {
		t.Errorf("calls = %d, want 11", s.Calls)
	}
	if s.CostUSD != 0.55 {
		t.Errorf("cost = %v, want 0.55", s.CostUSD)
	}
	if s.LocalCalls != 4 {
		t.Errorf("local calls = %d, want 4", s.LocalCalls)
	}
	if len(s.ByDay) != 2 {
		t.Errorf("by_day = %d buckets, want 2", len(s.ByDay))
	}
	// Days are chronological; everything else is ranked by cost.
	if s.ByDay[0].Key != "2026-03-01" {
		t.Errorf("by_day not chronological: %+v", s.ByDay)
	}
	if s.ByModel[0].Key != "big" {
		t.Errorf("by_model not cost-ranked: %+v", s.ByModel)
	}
	if s.ByWorkspace[0].Key != "alpha" {
		t.Errorf("workspace path not shortened to its base: %+v", s.ByWorkspace)
	}

	var chat Bucket
	for _, b := range s.ByOperation {
		if b.Key == "chat" {
			chat = b
		}
	}
	if chat.Calls != 9 {
		t.Errorf("chat calls = %d, want 9 across two providers", chat.Calls)
	}
}

func TestSummarizeRanksFreeModelsByTokens(t *testing.T) {
	// Local and free models all cost zero; without a tiebreak the busiest one
	// would sort arbitrarily and the dashboard would look random.
	events := []Event{
		{At: time.Now(), Model: "quiet", Calls: 1, PromptTokens: 10, Local: true},
		{At: time.Now(), Model: "busy", Calls: 1, PromptTokens: 9000, Local: true},
	}
	s := Summarize(events)
	if s.ByModel[0].Key != "busy" {
		t.Errorf("zero-cost models not ranked by tokens: %+v", s.ByModel)
	}
}

func TestSummarizeTracksEstimatedShare(t *testing.T) {
	now := time.Now()
	events := []Event{
		{At: now, Model: "m", Operation: "wiki", Calls: 1, PromptTokens: 100, CostUSD: 0.30},
		{At: now, Model: "m", Operation: "wiki", Calls: 1, PromptTokens: 100, CostUSD: 0.10, Estimated: true},
	}
	s := Summarize(events)
	if s.KnownCostUSD != 0.30 {
		t.Errorf("known cost = %v, want 0.30", s.KnownCostUSD)
	}
	got := s.ByModel[0].EstimatedShare
	if got < 0.24 || got > 0.26 {
		t.Errorf("estimated share = %v, want ~0.25", got)
	}
}

func TestSummarizeEmptyIsSafe(t *testing.T) {
	s := Summarize(nil)
	if s.Calls != 0 || len(s.ByDay) != 0 {
		t.Errorf("empty summary is not empty: %+v", s)
	}
}

func TestPruneDropsOldRows(t *testing.T) {
	isolate(t)
	Record(Event{At: time.Now().AddDate(0, 0, -100), Model: "old", Calls: 1, PromptTokens: 1})
	Record(Event{Model: "new", Calls: 1, PromptTokens: 1})

	kept, err := Prune(time.Now().AddDate(0, 0, -90))
	if err != nil {
		t.Fatal(err)
	}
	if kept != 1 {
		t.Fatalf("kept %d, want 1", kept)
	}
	events, _ := Load(time.Time{})
	if len(events) != 1 || events[0].Model != "new" {
		t.Errorf("wrong row survived: %+v", events)
	}
}

func TestEstimateCostUsesPriceTable(t *testing.T) {
	dir := isolate(t)
	writePrices(t, dir, map[string]Price{
		"anthropic/claude-sonnet-4.5": {Prompt: 0.000003, Completion: 0.000015},
	})

	got, ok := EstimateCost("anthropic/claude-sonnet-4.5", 1_000_000, 100_000)
	if !ok {
		t.Fatal("known model was not priced")
	}
	want := 3.0 + 1.5
	if got < want-0.0001 || got > want+0.0001 {
		t.Errorf("cost = %v, want %v", got, want)
	}

	if _, ok := EstimateCost("nobody/knows-this", 1000, 1000); ok {
		t.Error("unknown model returned a price — that would report a guess as fact")
	}
}

func TestEstimateCostToleratesNamingDrift(t *testing.T) {
	dir := isolate(t)
	writePrices(t, dir, map[string]Price{
		"meta-llama/llama-3.3-70b-instruct": {Prompt: 0.0000001, Completion: 0.0000002},
	})

	// A bare id, and a ":free" routing suffix, must both resolve.
	for _, id := range []string{
		"llama-3.3-70b-instruct",
		"meta-llama/llama-3.3-70b-instruct:free",
	} {
		if _, ok := EstimateCost(id, 100, 100); !ok {
			t.Errorf("%q did not resolve against the table", id)
		}
	}
}

func TestRecordEstimatesWhenProviderIsSilent(t *testing.T) {
	dir := isolate(t)
	writePrices(t, dir, map[string]Price{"x/y": {Prompt: 0.00001, Completion: 0.00002}})

	Record(Event{Provider: "x", Model: "x/y", Operation: "wiki",
		Calls: 1, PromptTokens: 1000, CompletionTokens: 500})

	events, _ := Load(time.Time{})
	if len(events) != 1 {
		t.Fatalf("got %d events", len(events))
	}
	e := events[0]
	if !e.Estimated {
		t.Error("estimated flag not set — the dashboard would present a guess as reported")
	}
	want := 1000*0.00001 + 500*0.00002
	if e.CostUSD < want-1e-9 || e.CostUSD > want+1e-9 {
		t.Errorf("estimated cost = %v, want %v", e.CostUSD, want)
	}
}

func TestRecordNeverEstimatesLocalSpend(t *testing.T) {
	dir := isolate(t)
	writePrices(t, dir, map[string]Price{"llama3.2": {Prompt: 0.001, Completion: 0.002}})

	Record(Event{Provider: "ollama", Model: "llama3.2", Operation: "chat",
		Calls: 1, PromptTokens: 5000, CompletionTokens: 5000, Local: true})

	events, _ := Load(time.Time{})
	if events[0].CostUSD != 0 {
		t.Errorf("local call was billed %v — local inference costs nothing", events[0].CostUSD)
	}
}

func TestFormatUSDKeepsSmallNumbersMeaningful(t *testing.T) {
	for _, tc := range []struct {
		in   float64
		want string
	}{
		{0, "$0"},
		{0.0003, "$0.0003"},
		{0.25, "$0.250"},
		{12.5, "$12.50"},
	} {
		if got := FormatUSD(tc.in); got != tc.want {
			t.Errorf("FormatUSD(%v) = %q, want %q", tc.in, got, tc.want)
		}
	}
}

func TestStaleReportsMissingTable(t *testing.T) {
	dir := isolate(t)
	if !Stale() {
		t.Error("a missing price table is not stale")
	}
	writePrices(t, dir, map[string]Price{"a/b": {Prompt: 1}})
	if Stale() {
		t.Error("a table written just now is stale")
	}
}

func writePrices(t *testing.T, dir string, models map[string]Price) {
	t.Helper()
	raw, err := json.Marshal(priceTable{FetchedAt: time.Now(), Models: models})
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "pricing.json"), raw, 0o600); err != nil {
		t.Fatal(err)
	}
	priceMu.Lock()
	priceCache = nil
	priceMu.Unlock()
}
