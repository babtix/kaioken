package retrieval

import (
	"context"
	"strings"
	"sync"
	"testing"
)

type fakeUtility struct {
	mu       sync.Mutex
	calls    int
	failNext int
	reply    func(system, user string) string
}

func (f *fakeUtility) ID() string { return "fake-utility" }

func (f *fakeUtility) Complete(_ context.Context, system, user string, _ int) (string, error) {
	f.mu.Lock()
	f.calls++
	failing := f.failNext > 0
	if failing {
		f.failNext--
	}
	f.mu.Unlock()

	if failing {
		return "", errAny
	}
	if f.reply == nil {
		return "relevant", nil
	}
	return f.reply(system, user), nil
}

func (f *fakeUtility) count() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.calls
}

var errAny = errString("utility model unavailable")

type errString string

func (e errString) Error() string { return string(e) }

func TestExpandQueryReturnsOriginalWithoutAModel(t *testing.T) {
	got := ExpandQuery(context.Background(), nil, NewVariantCache(), "how do we avoid rate limits", 4)
	if len(got) != 1 || got[0] != "how do we avoid rate limits" {
		t.Errorf("ExpandQuery without a model = %v", got)
	}
}

func TestExpandQueryReturnsOriginalAtOneVariant(t *testing.T) {
	u := &fakeUtility{reply: func(_, _ string) string { return "unused" }}
	got := ExpandQuery(context.Background(), u, NewVariantCache(), "q", 1)
	if len(got) != 1 {
		t.Errorf("ExpandQuery(n=1) = %v", got)
	}
	if u.count() != 0 {
		t.Error("expansion called the model when no expansion was asked for")
	}
}

func TestExpandQueryKeepsTheOriginalFirstAndStripsMarkers(t *testing.T) {
	u := &fakeUtility{reply: func(_, _ string) string {
		return "- backoff policy\n- retry ceiling\n2) throttling behaviour"
	}}
	got := ExpandQuery(context.Background(), u, NewVariantCache(), "rate limits", 4)

	if got[0] != "rate limits" {
		t.Errorf("original phrasing is not first: %v", got)
	}
	if len(got) != 4 {
		t.Errorf("got %d phrasings, want 4: %v", len(got), got)
	}
	for _, v := range got[1:] {
		if strings.HasPrefix(v, "-") || strings.HasPrefix(v, "2)") {
			t.Errorf("list marker survived stripping: %q", v)
		}
	}
}

func TestExpandQueryRespectsTheCeiling(t *testing.T) {
	u := &fakeUtility{reply: func(_, _ string) string {
		return "one\ntwo\nthree\nfour\nfive\nsix\nseven"
	}}
	got := ExpandQuery(context.Background(), u, NewVariantCache(), "q", 99)
	if len(got) > MaxVariants {
		t.Errorf("got %d phrasings, ceiling is %d", len(got), MaxVariants)
	}
}

func TestExpandQueryDropsDuplicates(t *testing.T) {
	u := &fakeUtility{reply: func(_, _ string) string {
		return "rate limits\nRATE LIMITS\nbackoff policy"
	}}
	got := ExpandQuery(context.Background(), u, NewVariantCache(), "rate limits", 4)

	seen := map[string]bool{}
	for _, v := range got {
		k := strings.ToLower(v)
		if seen[k] {
			t.Errorf("duplicate phrasing %q in %v", v, got)
		}
		seen[k] = true
	}
}

func TestExpandQueryFailureDegradesToTheOriginal(t *testing.T) {
	u := &fakeUtility{failNext: 99}
	got := ExpandQuery(context.Background(), u, NewVariantCache(), "rate limits", 4)
	if len(got) != 1 || got[0] != "rate limits" {
		t.Errorf("a failed expansion returned %v, want the original alone", got)
	}
}

func TestExpandQueryIsCached(t *testing.T) {
	u := &fakeUtility{reply: func(_, _ string) string { return "alpha\nbravo\ncharlie" }}
	vc := NewVariantCache()

	first := ExpandQuery(context.Background(), u, vc, "q", 4)
	second := ExpandQuery(context.Background(), u, vc, "q", 4)

	if u.count() != 1 {
		t.Errorf("expansion called %d times for the same query, want 1", u.count())
	}
	if strings.Join(first, "|") != strings.Join(second, "|") {
		t.Errorf("cached expansion differs:\n%v\n%v", first, second)
	}
}
