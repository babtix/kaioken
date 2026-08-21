package retrieval

import (
	"strings"
	"testing"
)

func TestSplitAtBoundaryPrefersParagraphBreaks(t *testing.T) {
	a := strings.Repeat("alpha ", 40)
	b := strings.Repeat("bravo ", 40)
	segs := SplitAtBoundary([]rune(a+"\n\n"+b), 250)

	if len(segs) < 2 {
		t.Fatalf("got %d segments, want at least 2", len(segs))
	}
	for i, s := range segs {
		if strings.Contains(s.Text, "alpha") && strings.Contains(s.Text, "bravo") {
			t.Errorf("segment %d spans the paragraph break: %.60s", i, s.Text)
		}
	}
}

func TestSplitAtBoundaryKeepsMultibyteRunesIntact(t *testing.T) {
	src := strings.Repeat("日本語のテキストです。", 60)
	segs := SplitAtBoundary([]rune(src), 100)

	var rebuilt strings.Builder
	for _, s := range segs {
		rebuilt.WriteString(s.Text)
	}
	if strings.ContainsRune(rebuilt.String(), '�') {
		t.Error("splitting produced a replacement character — a rune was cut")
	}
}

func TestSplitAtBoundaryTerminatesWithoutAnyBoundary(t *testing.T) {
	segs := SplitAtBoundary([]rune(strings.Repeat("x", 1000)), 100)
	if len(segs) == 0 {
		t.Fatal("no segments from a boundaryless document")
	}
	total := 0
	for _, s := range segs {
		total += len([]rune(s.Text))
	}
	if total != 1000 {
		t.Errorf("segments hold %d runes, want all 1000", total)
	}
}

func TestChunkParentChildCoversEveryParent(t *testing.T) {
	src := strings.Repeat("Sentence number one is here. Sentence number two follows it. ", 120)
	cfg := ChunkConfig{ParentTokens: 100, ChildTokens: 25, ChildOverlap: 5, CharsPerToken: 4}
	pairs := ChunkParentChild(src, cfg)

	if len(pairs) == 0 {
		t.Fatal("no pairs produced")
	}
	byParent := map[int][]string{}
	for _, p := range pairs {
		byParent[p.ParentIdx] = append(byParent[p.ParentIdx], p.ChildText)
	}
	if len(byParent) < 2 {
		t.Fatalf("got %d parents, want several", len(byParent))
	}
	for _, p := range pairs {
		if !strings.Contains(p.ParentText, strings.TrimSpace(p.ChildText)) {
			t.Errorf("child is not inside its parent:\nchild:  %.60s\nparent: %.60s", p.ChildText, p.ParentText)
		}
	}
}

func TestChunkParentChildShortParentIsItsOwnChild(t *testing.T) {
	cfg := ChunkConfig{ParentTokens: 100, ChildTokens: 50, ChildOverlap: 5, CharsPerToken: 4}
	pairs := ChunkParentChild("A short document.", cfg)

	if len(pairs) != 1 {
		t.Fatalf("got %d pairs from a short document, want 1", len(pairs))
	}
	if pairs[0].ChildText != pairs[0].ParentText {
		t.Error("a parent small enough to embed should be its own child")
	}
}

func TestChunkParentChildDoesNotCrawlTheTail(t *testing.T) {
	// Regression: stepping back by the overlap after the final window steps
	// back to before the cursor, so a broken progress guard emits one
	// near-duplicate child per remaining character.
	src := strings.Repeat("A sentence of quite ordinary length appears here. ", 200)
	cfg := ChunkConfig{ParentTokens: 600, ChildTokens: 150, ChildOverlap: 20, CharsPerToken: 4}
	pairs := ChunkParentChild(src, cfg)

	advance := cfg.ChildTokens*cfg.CharsPerToken - cfg.ChildOverlap*cfg.CharsPerToken
	ceiling := 3 * (len([]rune(src))/advance + len(pairs)/4 + 2)
	if len(pairs) > ceiling {
		t.Fatalf("%d children from %d runes — the tail is being crawled (ceiling %d)",
			len(pairs), len([]rune(src)), ceiling)
	}
}

func TestChunkConfigWithDefaultsRepairsDegenerateValues(t *testing.T) {
	got := ChunkConfig{ParentTokens: 50, ChildTokens: 200, ChildOverlap: 500}.WithDefaults()
	if got.ChildTokens > got.ParentTokens {
		t.Errorf("child window %d exceeds parent %d", got.ChildTokens, got.ParentTokens)
	}
	if got.ChildOverlap >= got.ChildTokens {
		t.Errorf("overlap %d does not advance a %d window", got.ChildOverlap, got.ChildTokens)
	}
	if got.CharsPerToken <= 0 {
		t.Error("zero chars-per-token would make every window empty")
	}
}

func TestIndexHeadingsIgnoresCodeFences(t *testing.T) {
	src := "# Real\n\ntext\n\n```sh\n# not a heading\n```\n\n## Also Real\n\nmore\n"
	h := IndexHeadings([]rune(src))

	titles := h.Titles()
	if len(titles) != 2 || titles[0] != "Real" || titles[1] != "Also Real" {
		t.Errorf("titles = %v, want [Real, Also Real]", titles)
	}
}

func TestHeadingsAtReturnsNearestPreceding(t *testing.T) {
	src := "# One\n\nalpha\n\n# Two\n\nbravo\n"
	runes := []rune(src)
	h := IndexHeadings(runes)

	alpha := strings.Index(src, "alpha")
	bravo := strings.Index(src, "bravo")
	if got := h.At(len([]rune(src[:alpha]))); got != "One" {
		t.Errorf("section for alpha = %q, want One", got)
	}
	if got := h.At(len([]rune(src[:bravo]))); got != "Two" {
		t.Errorf("section for bravo = %q, want Two", got)
	}
}

func TestHeadingsAtEmptyWithoutHeadings(t *testing.T) {
	if got := IndexHeadings([]rune("just prose\n")).At(3); got != "" {
		t.Errorf("section = %q for a document with no headings, want empty", got)
	}
}
