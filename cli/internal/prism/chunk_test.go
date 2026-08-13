package prism

import (
	"strings"
	"testing"
)

func TestSplitPrefersParagraphBreaks(t *testing.T) {
	a := strings.Repeat("alpha ", 40)  // 240 chars
	b := strings.Repeat("bravo ", 40)
	segs := splitAtBoundary([]rune(a+"\n\n"+b), 250)

	if len(segs) < 2 {
		t.Fatalf("got %d segments, want at least 2", len(segs))
	}
	// The cut landed on the blank line, so no segment mixes the two words.
	for i, s := range segs {
		if strings.Contains(s.text, "alpha") && strings.Contains(s.text, "bravo") {
			t.Errorf("segment %d spans the paragraph break: %.60s", i, s.text)
		}
	}
}

func TestSplitFallsBackToSentenceEnd(t *testing.T) {
	// No paragraph breaks anywhere, so only the sentence rule can save it.
	var b strings.Builder
	for i := 0; i < 30; i++ {
		b.WriteString("This is a complete sentence of moderate length. ")
	}
	segs := splitAtBoundary([]rune(b.String()), 200)

	if len(segs) < 2 {
		t.Fatalf("got %d segments, want several", len(segs))
	}
	for i, s := range segs[:len(segs)-1] {
		if !strings.HasSuffix(strings.TrimSpace(s.text), ".") {
			t.Errorf("segment %d did not end on a sentence: %q", i, tail(s.text))
		}
	}
}

func TestSplitTerminatesWithoutAnyBoundary(t *testing.T) {
	// One unbroken run of characters: every boundary search fails, and the
	// guard in the loop is the only thing preventing a hang.
	segs := splitAtBoundary([]rune(strings.Repeat("x", 1000)), 100)
	if len(segs) == 0 {
		t.Fatal("no segments from a boundaryless document")
	}
	total := 0
	for _, s := range segs {
		total += len([]rune(s.text))
	}
	if total != 1000 {
		t.Errorf("segments hold %d runes, want all 1000", total)
	}
}

func TestSplitKeepsMultibyteRunesIntact(t *testing.T) {
	// Byte arithmetic here would cut a 3-byte rune in half and size every
	// chunk a third of what was asked for.
	src := strings.Repeat("日本語のテキストです。", 60)
	segs := splitAtBoundary([]rune(src), 100)

	var rebuilt strings.Builder
	for _, s := range segs {
		rebuilt.WriteString(s.text)
	}
	if strings.ContainsRune(rebuilt.String(), '�') {
		t.Error("splitting produced a replacement character — a rune was cut")
	}
	for _, s := range segs {
		if n := len([]rune(s.text)); n > 100+searchWindow {
			t.Errorf("segment of %d runes far exceeds the 100-rune target", n)
		}
	}
}

func TestSplitOffsetsPointAtTheirText(t *testing.T) {
	src := "# One\n\n" + strings.Repeat("alpha ", 60) + "\n\n# Two\n\n" + strings.Repeat("bravo ", 60)
	runes := []rune(src)
	for _, s := range splitAtBoundary(runes, 200) {
		// The offset must land inside the source and at or before the text it
		// names, or heading attribution silently points at the wrong section.
		if s.start < 0 || s.start >= len(runes) {
			t.Fatalf("offset %d outside a %d-rune document", s.start, len(runes))
		}
		rest := string(runes[s.start:])
		if !strings.Contains(rest, firstWord(s.text)) {
			t.Errorf("offset %d does not precede its text %q", s.start, firstWord(s.text))
		}
	}
}

func TestChunkParentChildCoversEveryParent(t *testing.T) {
	src := strings.Repeat("Sentence number one is here. Sentence number two follows it. ", 120)
	cfg := ChunkConfig{ParentTokens: 100, ChildTokens: 25, ChildOverlap: 5, CharsPerToken: 4}
	pairs := chunkParentChild(src, cfg)

	if len(pairs) == 0 {
		t.Fatal("no pairs produced")
	}
	byParent := map[int][]string{}
	for _, p := range pairs {
		byParent[p.parentIdx] = append(byParent[p.parentIdx], p.childText)
	}
	if len(byParent) < 2 {
		t.Fatalf("got %d parents, want several", len(byParent))
	}
	// Every child must be a substring of the parent it claims, or parent
	// expansion would hand the model context the match did not come from.
	for _, p := range pairs {
		if !strings.Contains(p.parentText, strings.TrimSpace(p.childText)) {
			t.Errorf("child is not inside its parent:\nchild:  %.60s\nparent: %.60s",
				p.childText, p.parentText)
		}
	}
}

func TestChunkParentChildShortParentIsItsOwnChild(t *testing.T) {
	cfg := ChunkConfig{ParentTokens: 100, ChildTokens: 50, ChildOverlap: 5, CharsPerToken: 4}
	pairs := chunkParentChild("A short document.", cfg)

	if len(pairs) != 1 {
		t.Fatalf("got %d pairs from a short document, want 1", len(pairs))
	}
	if pairs[0].childText != pairs[0].parentText {
		t.Error("a parent small enough to embed should be its own child")
	}
}

func TestChunkParentChildChildrenOverlap(t *testing.T) {
	// Overlap is what keeps a sentence spanning two children findable from
	// both; without it the boundary is a hole in the index.
	src := strings.Repeat("word ", 400)
	cfg := ChunkConfig{ParentTokens: 200, ChildTokens: 20, ChildOverlap: 8, CharsPerToken: 4}
	pairs := chunkParentChild(src, cfg)

	if len(pairs) < 3 {
		t.Fatalf("got %d children, want several", len(pairs))
	}
	var covered int
	for _, p := range pairs {
		covered += len([]rune(p.childText))
	}
	if covered <= len([]rune(strings.TrimSpace(src))) {
		t.Error("children cover no more than the source — no overlap was applied")
	}
}

func TestChunkParentChildDoesNotCrawlTheTail(t *testing.T) {
	// Regression. Stepping back by the overlap after the final window steps
	// back to before the cursor, so the progress guard advances a single rune
	// and the loop emits one near-duplicate child per remaining character —
	// eighty extra chunks on a normal parent, each costing an embedding call
	// and each crowding real passages out of fusion.
	src := strings.Repeat("A sentence of quite ordinary length appears here. ", 200)
	cfg := ChunkConfig{ParentTokens: 600, ChildTokens: 150, ChildOverlap: 20, CharsPerToken: 4}
	pairs := chunkParentChild(src, cfg)

	childChars := cfg.ChildTokens * cfg.CharsPerToken
	advance := childChars - cfg.ChildOverlap*cfg.CharsPerToken
	// Allow generous slack for boundary snapping, but nothing like the
	// per-character flood the bug produced.
	ceiling := 3 * (len([]rune(src))/advance + len(pairs)/4 + 2)
	if len(pairs) > ceiling {
		t.Fatalf("%d children from %d runes — the tail is being crawled (ceiling %d)",
			len(pairs), len([]rune(src)), ceiling)
	}

	// No child may be a prefix-shifted copy of the one before it.
	for i := 1; i < len(pairs); i++ {
		if pairs[i].parentIdx != pairs[i-1].parentIdx {
			continue
		}
		if pairs[i].childStart-pairs[i-1].childStart <= 1 {
			t.Fatalf("children %d and %d advance by one rune: %q / %q",
				i-1, i, trim40(pairs[i-1].childText), trim40(pairs[i].childText))
		}
	}
}

func TestChunkParentChildCoversTheWholeParent(t *testing.T) {
	// Stopping at the end must not stop short of it: the last sentence of a
	// section is exactly where conclusions live.
	src := strings.Repeat("Filler sentence with content. ", 50) + "THE FINAL DISTINCTIVE SENTENCE."
	cfg := ChunkConfig{ParentTokens: 600, ChildTokens: 40, ChildOverlap: 5, CharsPerToken: 4}

	found := false
	for _, p := range chunkParentChild(src, cfg) {
		if strings.Contains(p.childText, "FINAL DISTINCTIVE") {
			found = true
		}
	}
	if !found {
		t.Error("the parent's last sentence is in no child — it is unretrievable")
	}
}

func TestChunkConfigDefaultsRepairDegenerateValues(t *testing.T) {
	// Overlap at or above the window never advances the cursor, and a child
	// bigger than its parent has nothing to expand into. Both are user input.
	got := ChunkConfig{ParentTokens: 50, ChildTokens: 200, ChildOverlap: 500}.withDefaults()
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
	h := indexHeadings([]rune(src))

	if len(h.titles) != 2 {
		t.Fatalf("found %d headings %v, want 2", len(h.titles), h.titles)
	}
	if h.titles[0] != "Real" || h.titles[1] != "Also Real" {
		t.Errorf("headings = %v, want [Real, Also Real]", h.titles)
	}
}

func TestHeadingAtReturnsNearestPreceding(t *testing.T) {
	src := "# One\n\nalpha\n\n# Two\n\nbravo\n"
	runes := []rune(src)
	h := indexHeadings(runes)

	alpha := strings.Index(src, "alpha")
	bravo := strings.Index(src, "bravo")
	if got := h.at(len([]rune(src[:alpha]))); got != "One" {
		t.Errorf("section for alpha = %q, want One", got)
	}
	if got := h.at(len([]rune(src[:bravo]))); got != "Two" {
		t.Errorf("section for bravo = %q, want Two", got)
	}
	if got := h.at(0); got != "One" {
		t.Errorf("section at the first heading = %q, want One", got)
	}
}

func TestHeadingAtEmptyWithoutHeadings(t *testing.T) {
	if got := indexHeadings([]rune("just prose\n")).at(3); got != "" {
		t.Errorf("section = %q for a document with no headings, want empty", got)
	}
}

func firstWord(s string) string {
	if i := strings.IndexAny(s, " \n"); i > 0 {
		return s[:i]
	}
	return s
}

func trim40(s string) string {
	if len(s) <= 40 {
		return s
	}
	return s[:40] + "…"
}

func tail(s string) string {
	if len(s) <= 40 {
		return s
	}
	return "…" + s[len(s)-40:]
}
