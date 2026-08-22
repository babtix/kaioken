package agent

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestApplyEditsExact(t *testing.T) {
	content := "func a() {}\nfunc b() {}\n"
	got, fuzzy, _, _, err := applyEdits(content, []Edit{{Old: "func b() {}", New: "func c() {}"}}, "x.go")
	if err != nil {
		t.Fatal(err)
	}
	if fuzzy {
		t.Error("exact match reported as fuzzy")
	}
	if got != "func a() {}\nfunc c() {}\n" {
		t.Errorf("got %q", got)
	}
}

func TestApplyEditsSmartQuotes(t *testing.T) {
	// File has smart quotes; the model reproduces them as ASCII.
	content := "say(\u201Chello\u201D)\nother()\n"
	got, fuzzy, _, _, err := applyEdits(content, []Edit{{Old: `say("hello")`, New: `say("goodbye")`}}, "x.go")
	if err != nil {
		t.Fatal(err)
	}
	if !fuzzy {
		t.Error("expected fuzzy match")
	}
	if !strings.Contains(got, `say("goodbye")`) {
		t.Errorf("replacement missing: %q", got)
	}
	if !strings.Contains(got, "other()") {
		t.Errorf("untouched line lost: %q", got)
	}
}

func TestApplyEditsTrailingWhitespace(t *testing.T) {
	// old spans a line with trailing spaces the model did not reproduce.
	content := "line one   \nline two\n"
	got, fuzzy, _, strategy, err := applyEdits(content, []Edit{{Old: "line one\nline two", New: "line 1\nline two"}}, "x.txt")
	if err != nil {
		t.Fatal(err)
	}
	// Line-trimmed matching resolves this in the original content, so the
	// normalized-space fallback is never reached. Either tolerance is a pass;
	// what matters is that the whitespace difference did not defeat the edit.
	if !fuzzy && strategy == "" {
		t.Error("expected some tolerance to be applied, got an exact match")
	}
	if !strings.Contains(got, "line 1") || !strings.Contains(got, "line two") {
		t.Errorf("got %q", got)
	}
}

func TestApplyEditsPreservesUntouchedUnicode(t *testing.T) {
	// The untouched line contains an em-dash that must survive a fuzzy edit
	// elsewhere in the file byte-for-byte.
	content := "keep \u2014 this line\nchange me  \nend\n"
	got, fuzzy, _, strategy, err := applyEdits(content, []Edit{{Old: "change me\nend", New: "changed\nend"}}, "x.txt")
	if err != nil {
		t.Fatal(err)
	}
	if !fuzzy && strategy == "" {
		t.Error("expected some tolerance to be applied, got an exact match")
	}
	if !strings.Contains(got, "keep \u2014 this line") {
		t.Errorf("untouched unicode line was normalized: %q", got)
	}
	if !strings.Contains(got, "changed") {
		t.Errorf("edit missing: %q", got)
	}
}

func TestApplyEditsDuplicate(t *testing.T) {
	content := "x = 1\nx = 1\n"
	_, _, _, _, err := applyEdits(content, []Edit{{Old: "x = 1", New: "x = 2"}}, "x.txt")
	if err == nil || !strings.Contains(err.Error(), "2 occurrences") {
		t.Errorf("expected duplicate-occurrence error, got %v", err)
	}
}

func TestApplyEditsNotFound(t *testing.T) {
	_, _, _, _, err := applyEdits("abc\n", []Edit{{Old: "zzz", New: "y"}}, "x.txt")
	if err == nil || !strings.Contains(err.Error(), "not found") {
		t.Errorf("expected not-found error, got %v", err)
	}
}

func TestApplyEditsEmptyOld(t *testing.T) {
	_, _, _, _, err := applyEdits("abc\n", []Edit{{Old: "", New: "y"}}, "x.txt")
	if err == nil || !strings.Contains(err.Error(), "must not be empty") {
		t.Errorf("expected empty-old error, got %v", err)
	}
}

func TestApplyEditsNoChange(t *testing.T) {
	_, _, _, _, err := applyEdits("abc\n", []Edit{{Old: "abc", New: "abc"}}, "x.txt")
	if err == nil || !strings.Contains(err.Error(), "identical content") {
		t.Errorf("expected no-change error, got %v", err)
	}
}

func TestApplyEditsBatch(t *testing.T) {
	content := "one\ntwo\nthree\n"
	got, fuzzy, _, _, err := applyEdits(content, []Edit{
		{Old: "three", New: "3"},
		{Old: "one", New: "1"},
	}, "x.txt")
	if err != nil {
		t.Fatal(err)
	}
	if fuzzy {
		t.Error("unexpected fuzzy")
	}
	if got != "1\ntwo\n3\n" {
		t.Errorf("got %q", got)
	}
}

func TestApplyEditsOverlap(t *testing.T) {
	content := "abcdef\n"
	_, _, _, _, err := applyEdits(content, []Edit{
		{Old: "abcd", New: "x"},
		{Old: "cdef", New: "y"},
	}, "x.txt")
	if err == nil || !strings.Contains(err.Error(), "overlap") {
		t.Errorf("expected overlap error, got %v", err)
	}
}

func TestLineEndingRoundTrip(t *testing.T) {
	// A CRLF file edited through the raw path keeps CRLF everywhere — the
	// LF view is only ever a matching aid, never what gets written.
	original := "a\r\nb\r\nc\r\n"
	got, _, _, _, err := applyEdits(original, []Edit{{Old: "b", New: "B"}}, "x.txt")
	if err != nil {
		t.Fatal(err)
	}
	if got != "a\r\nB\r\nc\r\n" {
		t.Errorf("restored = %q", got)
	}
}

// Editing one line of a mixed-ending file must rewrite only that line: every
// other line keeps its exact bytes, bare-CR and CRLF terminators included.
// The bug this pins lived in edit_file, which normalized the whole body to LF
// and then restored one detected ending across all of it — so any edit in a
// mixed file silently rewrote every line. The comparison is on exact bytes; a
// normalized comparison would pass even with the bug present.
func TestEditFilePreservesMixedLineEndings(t *testing.T) {
	a := newAgent(t, true)
	content := "alpha crlf\r\n" +
		"beta lf\n" +
		"gamma cr\r" +
		"delta crlf\r\n" +
		"epsilon, no newline"
	if err := os.WriteFile(filepath.Join(a.Root, "mixed.txt"), []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}

	if got := a.editFile("mixed.txt", []Edit{{Old: "beta lf", New: "beta lf, edited"}}); !strings.HasPrefix(got, "edited") {
		t.Fatalf("editFile: %q", got)
	}
	data, err := os.ReadFile(filepath.Join(a.Root, "mixed.txt"))
	if err != nil {
		t.Fatal(err)
	}
	// The edited line is re-terminated with the file's first style (CRLF);
	// everything else is byte-identical to what was on disk before.
	want := "alpha crlf\r\n" +
		"beta lf, edited\r\n" +
		"gamma cr\r" +
		"delta crlf\r\n" +
		"epsilon, no newline"
	if string(data) != want {
		t.Errorf("untouched lines were disturbed:\n got %q\nwant %q", string(data), want)
	}
}

func TestBOMHandling(t *testing.T) {
	bom, text := stripBOM("\uFEFFhello")
	if bom != "\uFEFF" || text != "hello" {
		t.Errorf("stripBOM = %q, %q", bom, text)
	}
	bom, text = stripBOM("hello")
	if bom != "" || text != "hello" {
		t.Errorf("stripBOM no-bom = %q, %q", bom, text)
	}
}

func TestNormalizeForFuzzyMatchKeepsLineCount(t *testing.T) {
	in := "a\u00A0b  \n\u201Cq\u201D \u2013 r\nplain\n"
	out := normalizeForFuzzyMatch(in)
	if strings.Count(in, "\n") != strings.Count(out, "\n") {
		t.Fatalf("line count changed: %q -> %q", in, out)
	}
	if out != "a b\n\"q\" - r\nplain\n" {
		t.Errorf("got %q", out)
	}
}

func TestParseEditArgs(t *testing.T) {
	edits, err := parseEditArgs(`{"path":"f","old_string":"a","new_string":"b"}`)
	if err != nil || len(edits) != 1 || edits[0].Old != "a" || edits[0].New != "b" {
		t.Errorf("single form: %v %v", edits, err)
	}
	edits, err = parseEditArgs(`{"path":"f","edits":[{"old_string":"a","new_string":"b"},{"old_string":"c","new_string":"d"}]}`)
	if err != nil || len(edits) != 2 || edits[1].Old != "c" {
		t.Errorf("batch form: %v %v", edits, err)
	}
	if _, err = parseEditArgs(`{"path":"f"}`); err == nil {
		t.Error("expected error for missing edit arguments")
	}
}

// The model reproduced the code but re-indented it. Ported from opencode's
// LineTrimmedReplacer, the highest-yield of its nine strategies.
func TestApplyEditsLineTrimmed(t *testing.T) {
	content := "func f() {\n\t\tif x {\n\t\t\treturn 1\n\t\t}\n}\n"
	// Old text uses spaces where the file uses tabs.
	old := "if x {\n    return 1\n}"
	got, _, _, strategy, err := applyEdits(content, []Edit{{Old: old, New: "if y {\n\t\t\treturn 2\n\t\t}"}}, "x.go")
	if err != nil {
		t.Fatalf("line-trimmed match failed: %v", err)
	}
	if strategy != "line-trimmed" {
		t.Errorf("strategy = %q, want line-trimmed", strategy)
	}
	if !strings.Contains(got, "if y {") || !strings.Contains(got, "return 2") {
		t.Errorf("edit not applied: %q", got)
	}
	// The lines the edit did not target keep their exact bytes.
	if !strings.HasPrefix(got, "func f() {\n") || !strings.HasSuffix(got, "}\n") {
		t.Errorf("untouched lines disturbed: %q", got)
	}
}

// A block pasted out of its nesting: internally consistent, wrong absolute
// indentation.
func TestApplyEditsIndentationFlexible(t *testing.T) {
	content := "outer\n\t\tif a {\n\t\t\tb()\n\t\t}\nafter\n"
	old := "if a {\n\tb()\n}" // same relative shape, dedented
	got, _, _, strategy, err := applyEdits(content, []Edit{{Old: old, New: "if c {\n\t\t\td()\n\t\t}"}}, "x.go")
	if err != nil {
		t.Fatalf("indentation-flexible match failed: %v", err)
	}
	if strategy != "indentation-flexible" && strategy != "line-trimmed" {
		t.Errorf("strategy = %q, want an indentation-tolerant one", strategy)
	}
	if !strings.Contains(got, "if c {") || !strings.Contains(got, "after\n") {
		t.Errorf("got %q", got)
	}
}

// A long block reproduced with one middle line wrong. The anchors are right,
// so the edit should land — this is opencode's BlockAnchorReplacer.
func TestApplyEditsBlockAnchor(t *testing.T) {
	content := "func g() error {\n\tstep୧()\n\tstepTwo()\n\tstepThree()\n\treturn nil\n}\n"
	// Middle line differs from the file; first and last lines are exact.
	old := "func g() error {\n\tstepOne()\n\tstepTwo()\n\tstepThree()\n\treturn nil\n}"
	got, _, _, strategy, err := applyEdits(content,
		[]Edit{{Old: old, New: "func g() error {\n\treplaced()\n\treturn nil\n}"}}, "x.go")
	if err != nil {
		t.Fatalf("block-anchor match failed: %v", err)
	}
	if strategy != "block-anchor" {
		t.Errorf("strategy = %q, want block-anchor", strategy)
	}
	if !strings.Contains(got, "replaced()") {
		t.Errorf("edit not applied: %q", got)
	}
}

// The guard that makes the loose strategies safe: anchors that happen to match
// far apart must not swallow the region between them.
func TestApplyEditsRejectsDisproportionateMatch(t *testing.T) {
	var b strings.Builder
	b.WriteString("start\n")
	for i := 0; i < 200; i++ {
		b.WriteString("filler line\n")
	}
	b.WriteString("end\n")
	// Three lines whose anchors exist 200 lines apart.
	_, _, _, _, err := applyEdits(b.String(), []Edit{{Old: "start\nmiddle\nend", New: "x"}}, "x.txt")
	if err == nil {
		t.Fatal("expected the oversized anchored span to be refused")
	}
	if !strings.Contains(err.Error(), "not found") {
		t.Errorf("unexpected error: %v", err)
	}
}

func TestIsDisproportionate(t *testing.T) {
	cases := []struct {
		name         string
		matched, old string
		want         bool
	}{
		{"same size", "a\nb\nc", "a\nb\nc", false},
		{"one line grows freely", strings.Repeat("x", 5000), "x", false},
		{"double the lines", "a\nb\nc\nd\ne\nf", "a\nb\nc", true},
		// For a 4-line old the threshold is max(4+3, 4*2) = 8 lines, so 7 is
		// still within tolerance and 8 is not.
		{"just under the line threshold", "a\nb\nc\nd\ne\nf\ng", "a\nb\nc\nd", false},
		{"at the line threshold", "a\nb\nc\nd\ne\nf\ng\nh", "a\nb\nc\nd", true},
		{"slightly bigger is fine", "a\nb\nc\nd", "a\nb\nc", false},
		{"multi-line char blowup", "ab\n" + strings.Repeat("y", 3000), "ab\ncd", true},
	}
	for _, tc := range cases {
		if got := isDisproportionate(tc.matched, tc.old); got != tc.want {
			t.Errorf("%s: isDisproportionate = %v, want %v", tc.name, got, tc.want)
		}
	}
}

func TestLevenshtein(t *testing.T) {
	cases := []struct {
		a, b string
		want int
	}{
		{"", "", 0},
		{"abc", "abc", 0},
		{"abc", "abd", 1},
		{"kitten", "sitting", 3},
		{"", "abc", 3},
		{"héllo", "hello", 1}, // rune-based, not byte-based
	}
	for _, tc := range cases {
		if got := levenshtein(tc.a, tc.b); got != tc.want {
			t.Errorf("levenshtein(%q,%q) = %d, want %d", tc.a, tc.b, got, tc.want)
		}
	}
}
