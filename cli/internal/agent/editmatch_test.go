package agent

import (
	"strings"
	"testing"
)

func TestApplyEditsExact(t *testing.T) {
	content := "func a() {}\nfunc b() {}\n"
	got, fuzzy, err := applyEdits(content, []Edit{{Old: "func b() {}", New: "func c() {}"}}, "x.go")
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
	got, fuzzy, err := applyEdits(content, []Edit{{Old: `say("hello")`, New: `say("goodbye")`}}, "x.go")
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
	got, fuzzy, err := applyEdits(content, []Edit{{Old: "line one\nline two", New: "line 1\nline two"}}, "x.txt")
	if err != nil {
		t.Fatal(err)
	}
	if !fuzzy {
		t.Error("expected fuzzy match")
	}
	if !strings.Contains(got, "line 1") || !strings.Contains(got, "line two") {
		t.Errorf("got %q", got)
	}
}

func TestApplyEditsPreservesUntouchedUnicode(t *testing.T) {
	// The untouched line contains an em-dash that must survive a fuzzy edit
	// elsewhere in the file byte-for-byte.
	content := "keep \u2014 this line\nchange me  \nend\n"
	got, fuzzy, err := applyEdits(content, []Edit{{Old: "change me\nend", New: "changed\nend"}}, "x.txt")
	if err != nil {
		t.Fatal(err)
	}
	if !fuzzy {
		t.Error("expected fuzzy match")
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
	_, _, err := applyEdits(content, []Edit{{Old: "x = 1", New: "x = 2"}}, "x.txt")
	if err == nil || !strings.Contains(err.Error(), "2 occurrences") {
		t.Errorf("expected duplicate-occurrence error, got %v", err)
	}
}

func TestApplyEditsNotFound(t *testing.T) {
	_, _, err := applyEdits("abc\n", []Edit{{Old: "zzz", New: "y"}}, "x.txt")
	if err == nil || !strings.Contains(err.Error(), "not found") {
		t.Errorf("expected not-found error, got %v", err)
	}
}

func TestApplyEditsEmptyOld(t *testing.T) {
	_, _, err := applyEdits("abc\n", []Edit{{Old: "", New: "y"}}, "x.txt")
	if err == nil || !strings.Contains(err.Error(), "must not be empty") {
		t.Errorf("expected empty-old error, got %v", err)
	}
}

func TestApplyEditsNoChange(t *testing.T) {
	_, _, err := applyEdits("abc\n", []Edit{{Old: "abc", New: "abc"}}, "x.txt")
	if err == nil || !strings.Contains(err.Error(), "identical content") {
		t.Errorf("expected no-change error, got %v", err)
	}
}

func TestApplyEditsBatch(t *testing.T) {
	content := "one\ntwo\nthree\n"
	got, fuzzy, err := applyEdits(content, []Edit{
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
	_, _, err := applyEdits(content, []Edit{
		{Old: "abcd", New: "x"},
		{Old: "cdef", New: "y"},
	}, "x.txt")
	if err == nil || !strings.Contains(err.Error(), "overlap") {
		t.Errorf("expected overlap error, got %v", err)
	}
}

func TestLineEndingRoundTrip(t *testing.T) {
	original := "a\r\nb\r\nc\r\n"
	ending := detectLineEnding(original)
	if ending != "\r\n" {
		t.Fatalf("ending = %q", ending)
	}
	normalized := normalizeToLF(original)
	got, _, err := applyEdits(normalized, []Edit{{Old: "b", New: "B"}}, "x.txt")
	if err != nil {
		t.Fatal(err)
	}
	if restored := restoreLineEndings(got, ending); restored != "a\r\nB\r\nc\r\n" {
		t.Errorf("restored = %q", restored)
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
