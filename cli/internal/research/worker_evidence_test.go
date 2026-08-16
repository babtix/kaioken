package research

import (
	"strings"
	"testing"
)

// Evidence selection for a worker's compression call.
//
// The invariant: parts and order describe the SAME documents. Anything in
// order that is not in parts is a source the model never read, and it would go
// on to inflate the citation count and the confidence verdict downstream.

func evidenceLookup(docs map[string]Document) func(string) (Document, bool) {
	return func(id string) (Document, bool) {
		d, ok := docs[id]
		return d, ok
	}
}

func doc(id, hash, body string) Document {
	return Document{ID: id, Title: id, Hash: hash, Content: body}
}

// hashesIn pulls the hash= tag out of each fence, so the test can assert that
// order matches what was actually rendered rather than trusting it.
func hashesIn(parts []string) []string {
	var out []string
	for _, p := range parts {
		if _, rest, ok := strings.Cut(p, `hash="`); ok {
			if h, _, ok := strings.Cut(rest, `"`); ok {
				out = append(out, h)
			}
		}
	}
	return out
}

func TestSelectEvidenceKeepsPartsAndOrderInStep(t *testing.T) {
	docs := map[string]Document{
		"a": doc("a", strings.Repeat("1", 64), strings.Repeat("x", 100)),
		"b": doc("b", strings.Repeat("2", 64), strings.Repeat("y", 100)),
		"c": doc("c", strings.Repeat("3", 64), strings.Repeat("z", 100)),
	}
	parts, order := selectEvidence([]string{"a", "b", "c"}, evidenceLookup(docs), 0, 100_000)

	if len(parts) != 3 || len(order) != 3 {
		t.Fatalf("parts=%d order=%d, want 3 and 3", len(parts), len(order))
	}
	// The fence tags documents by the 12-char hash prefix; order carries the
	// full hash, so compare on the prefix.
	rendered := hashesIn(parts)
	for i := range order {
		if order[i][:12] != rendered[i] {
			t.Errorf("order[%d]=%s but the rendered fence carries %s", i, order[i][:12], rendered[i])
		}
	}
}

// The bug: a document that busts the evidence cap was recorded as a source
// despite never being rendered or sent to the model.
func TestSelectEvidenceDropsTheDocumentThatBustsTheCap(t *testing.T) {
	big := strings.Repeat("x", 400)
	docs := map[string]Document{
		"a": doc("a", strings.Repeat("1", 64), big),
		"b": doc("b", strings.Repeat("2", 64), big),
		"c": doc("c", strings.Repeat("3", 64), big),
	}
	// Room for two fences, not three.
	one := len(fenceDocument(docs["a"], 0))
	parts, order := selectEvidence([]string{"a", "b", "c"}, evidenceLookup(docs), 0, one*2+10)

	if len(parts) != 2 {
		t.Fatalf("parts = %d, want 2 to fit the cap", len(parts))
	}
	if len(order) != len(parts) {
		t.Fatalf("order = %d but only %d document(s) were rendered — a source the model never read", len(order), len(parts))
	}
	for _, h := range order {
		if h == docs["c"].Hash {
			t.Error("the capped-out document was recorded as a source")
		}
	}
}

func TestSelectEvidenceDeduplicatesByHash(t *testing.T) {
	shared := strings.Repeat("1", 64)
	docs := map[string]Document{
		"a":     doc("a", shared, "same content"),
		"a-alt": doc("a-alt", shared, "same content"),
		"b":     doc("b", strings.Repeat("2", 64), "different"),
	}
	parts, order := selectEvidence([]string{"a", "a-alt", "b"}, evidenceLookup(docs), 0, 100_000)

	if len(order) != 2 || len(parts) != 2 {
		t.Fatalf("parts=%d order=%d, want 2 and 2 after dedup", len(parts), len(order))
	}
	if order[0] != shared || order[1] != docs["b"].Hash {
		t.Errorf("unexpected order after dedup: %v", order)
	}
}

func TestSelectEvidenceSkipsUnknownIDs(t *testing.T) {
	docs := map[string]Document{"a": doc("a", strings.Repeat("1", 64), "body")}
	parts, order := selectEvidence([]string{"missing", "a", "also-missing"}, evidenceLookup(docs), 0, 100_000)

	if len(parts) != 1 || len(order) != 1 {
		t.Fatalf("parts=%d order=%d, want 1 and 1", len(parts), len(order))
	}
	if order[0] != docs["a"].Hash {
		t.Errorf("order[0] = %s, want the one known document", order[0][:8])
	}
}

func TestSelectEvidenceEmptyInput(t *testing.T) {
	parts, order := selectEvidence(nil, evidenceLookup(map[string]Document{}), 0, 100_000)
	if len(parts) != 0 || len(order) != 0 {
		t.Errorf("parts=%d order=%d, want empty", len(parts), len(order))
	}
}
