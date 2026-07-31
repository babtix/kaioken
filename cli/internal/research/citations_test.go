package research

import (
	"strings"
	"testing"
)

func sources(ns ...int) []Source {
	out := make([]Source, 0, len(ns))
	for _, n := range ns {
		out = append(out, Source{N: n, URL: "https://s" + string(rune('a'+n)) + ".example", Fetched: true})
	}
	return out
}

func TestRewriteCitationsKeepsOnlyCitedSources(t *testing.T) {
	md, used := rewriteCitations("Solar is cheap [1] and nuclear is steady [3].", sources(1, 2, 3))
	if len(used) != 2 {
		t.Fatalf("used = %+v, want the two cited sources", used)
	}
	// Renumbered densely: 1 stays 1, 3 becomes 2.
	if used[0].N != 1 || used[1].N != 2 {
		t.Errorf("numbering = %d,%d; want a dense 1,2", used[0].N, used[1].N)
	}
	if !strings.Contains(md, "steady [2].") {
		t.Errorf("body was not renumbered to match the reference list:\n%s", md)
	}
}

// The failure this whole file exists for: a model wrote its markers with
// full-width brackets, the substring check for "[20]" matched nothing, and the
// report silently listed every page that had been fetched — including the ones
// it read and rejected.
func TestRewriteCitationsNormalisesExoticBrackets(t *testing.T) {
	md, used := rewriteCitations("Solar costs about EUR 87/MWh【20】, per the study【16】.",
		sources(3, 16, 20, 21))
	if len(used) != 2 {
		t.Fatalf("used = %+v, want only sources 16 and 20", used)
	}
	if strings.Contains(md, "【") {
		t.Errorf("full-width markers survived:\n%s", md)
	}
	// 16 → 1 and 20 → 2, in ascending original order.
	if !strings.Contains(md, "EUR 87/MWh[2]") || !strings.Contains(md, "study[1]") {
		t.Errorf("markers not rewritten to dense ASCII ids:\n%s", md)
	}
}

func TestRewriteCitationsSplitsLists(t *testing.T) {
	md, used := rewriteCitations("Both agree [1, 3] on the trend [2;3].", sources(1, 2, 3))
	if len(used) != 3 {
		t.Fatalf("used = %+v, want all three", used)
	}
	if !strings.Contains(md, "[1][3]") || !strings.Contains(md, "[2][3]") {
		t.Errorf("comma and semicolon lists were not split into separate markers:\n%s", md)
	}
}

// A citation that resolves to nothing is worse than no citation, because it
// reads as verified.
func TestRewriteCitationsDropsInventedIDs(t *testing.T) {
	md, used := rewriteCitations("Real [1]. Invented [99]. Unfetched [2].", sources(1))
	if len(used) != 1 || used[0].N != 1 {
		t.Fatalf("used = %+v, want only source 1", used)
	}
	if strings.Contains(md, "99") || strings.Contains(md, "[2]") {
		t.Errorf("an unresolvable marker survived:\n%s", md)
	}
	if !strings.Contains(md, "Invented.") {
		t.Errorf("dropping a marker left dangling whitespace:\n%s", md)
	}
}

// A Markdown link whose text is a number is not a citation.
func TestRewriteCitationsLeavesMarkdownLinksAlone(t *testing.T) {
	md, _ := rewriteCitations("See [1](https://x.example) and the finding [1].", sources(1))
	if !strings.Contains(md, "[1](https://x.example)") {
		t.Errorf("a Markdown link was rewritten as a citation:\n%s", md)
	}
}

// With no usable markers at all the evidence still has to be listed, or the
// reader has no way to check anything.
func TestRewriteCitationsFallsBackToTheFullReadSet(t *testing.T) {
	_, used := rewriteCitations("No markers here at all.", sources(4, 7))
	if len(used) != 2 {
		t.Fatalf("used = %+v, want both sources listed as a fallback", used)
	}
	if used[0].N != 1 || used[1].N != 2 {
		t.Errorf("fallback numbering = %d,%d; want a dense 1,2", used[0].N, used[1].N)
	}
}

// Years and figures in brackets are not citation ids.
func TestRewriteCitationsIgnoresLargeNumbers(t *testing.T) {
	md, _ := rewriteCitations("The [2019] edition says so [1].", sources(1))
	if !strings.Contains(md, "[2019]") {
		t.Errorf("a four-digit number was treated as a citation:\n%s", md)
	}
}
