package research

import "testing"

// The ×N dial folds into presets smoothly and steps up at ×10, exactly the
// shape the multiplier had before the fold.
func TestBudgetForFollowsTheMultiplier(t *testing.T) {
	cases := []struct {
		mult    int
		dossier bool
		want    Budget
	}{
		{1, false, budgetQuick},
		{2, false, budgetQuick},
		{3, false, budgetStandard},
		{5, false, budgetStandard},
		{6, false, budgetDeep},
		{9, false, budgetDeep},
		{10, false, budgetDossier},
		{1, true, budgetDossier},
	}
	for _, c := range cases {
		if got := budgetFor(c.mult, c.dossier); got != c.want {
			t.Errorf("budgetFor(%d, %v) = %+v, want %+v", c.mult, c.dossier, got, c.want)
		}
	}
}

func TestPresetName(t *testing.T) {
	if PresetName(1, false) != "quick" || PresetName(3, false) != "standard" ||
		PresetName(6, false) != "deep" || PresetName(10, false) != "dossier" ||
		PresetName(1, true) != "dossier" {
		t.Error("preset names drifted from the multiplier mapping")
	}
}

// Budget trims must never return more than what remains, and an exhausted
// budget returns nothing rather than an error.
func TestBudgetRemainingTrims(t *testing.T) {
	b := Budget{MaxSearches: 3, MaxFetches: 2}
	if got := b.remainingQueries([]string{"a", "b", "c", "d"}, 1); len(got) != 2 {
		t.Errorf("remainingQueries = %v, want 2 of 4 with 1 spent", got)
	}
	if got := b.remainingQueries([]string{"a"}, 3); got != nil {
		t.Errorf("remainingQueries on an exhausted budget = %v, want nil", got)
	}
	if got := b.remainingFetches([]string{"x", "y", "z"}, 0); len(got) != 2 {
		t.Errorf("remainingFetches = %v, want the first 2", got)
	}
}
