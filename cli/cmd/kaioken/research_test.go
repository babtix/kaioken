package main

import "testing"

func TestParseResearchArgs(t *testing.T) {
	cases := []struct {
		name     string
		args     []string
		wantMult int
		wantQ    string
	}{
		{"bare question", []string{"is solar cheaper"}, 3, "is solar cheaper"},
		{"multiplier then question", []string{"x5", "is solar cheaper"}, 5, "is solar cheaper"},
		{"uppercase multiplier", []string{"X2", "why"}, 2, "why"},
		{"unquoted words join", []string{"is", "solar", "cheaper"}, 3, "is solar cheaper"},
		{"multiplier with unquoted words", []string{"x4", "is", "solar", "cheaper"}, 4, "is solar cheaper"},
		{"two-digit multiplier", []string{"x10", "q"}, 10, "q"},
		// The regression this helper exists for: an "x" word that is not a
		// multiplier must stay in the question.
		{"x-prefixed word kept", []string{"xbox", "exclusives", "2025"}, 3, "xbox exclusives 2025"},
		{"bare x kept", []string{"x", "y"}, 3, "x y"},
		{"x0 is not a multiplier", []string{"x0", "topic"}, 3, "x0 topic"},
		{"mixed alnum kept", []string{"x3d", "printing"}, 3, "x3d printing"},
		{"no args", nil, 3, ""},
		{"only a multiplier", []string{"x3"}, 3, ""},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			mult, q := parseResearchArgs(c.args)
			if mult != c.wantMult {
				t.Errorf("multiplier = %d, want %d", mult, c.wantMult)
			}
			if q != c.wantQ {
				t.Errorf("question = %q, want %q", q, c.wantQ)
			}
		})
	}
}

func TestSlugify(t *testing.T) {
	cases := map[string]string{
		"Is solar cheaper than nuclear?": "is-solar-cheaper-than-nuclear",
		"  spaces   everywhere  ":        "spaces-everywhere",
		"C++ vs Rust: which?":            "c-vs-rust-which",
		"!!!":                            "research",
		"":                               "research",
	}
	for in, want := range cases {
		if got := slugify(in); got != want {
			t.Errorf("slugify(%q) = %q, want %q", in, got, want)
		}
	}
}

// A filename stem must stay bounded however long the question is, and must
// never end on a separator.
func TestSlugifyIsBoundedAndClean(t *testing.T) {
	long := ""
	for i := 0; i < 50; i++ {
		long += "verylongword "
	}
	got := slugify(long)
	if len(got) > 60 {
		t.Errorf("slug length %d exceeds the cap: %q", len(got), got)
	}
	if got[len(got)-1] == '-' {
		t.Errorf("slug ends with a separator: %q", got)
	}
}
