package embed

import (
	"context"
	"encoding/json"
	"math"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestNewIsNilWhenDisabled(t *testing.T) {
	e, err := New(Config{})
	if err != nil {
		t.Fatalf("New() on an empty config errored: %v", err)
	}
	if e != nil {
		t.Error("New() built an embedder with no model configured")
	}
}

func TestNewRejectsModelWithoutEndpoint(t *testing.T) {
	if _, err := New(Config{Model: "nomic-embed-text"}); err == nil {
		t.Error("New() accepted a model with nowhere to send it")
	}
}

func TestNormalizeProducesUnitLength(t *testing.T) {
	v := Normalize([]float32{3, 4})
	var sum float64
	for _, x := range v {
		sum += float64(x) * float64(x)
	}
	if math.Abs(sum-1) > 1e-6 {
		t.Errorf("normalized vector has squared length %.6f, want 1", sum)
	}
}

func TestNormalizeLeavesZeroVectorAlone(t *testing.T) {
	// Dividing by a zero norm produces NaNs, which poison every later
	// comparison silently rather than failing.
	v := Normalize([]float32{0, 0})
	for i, x := range v {
		if x != 0 {
			t.Errorf("zero vector element %d became %v", i, x)
		}
	}
}

func TestDotOnMismatchedWidthsScoresZero(t *testing.T) {
	// A stale index must degrade to lexical, not panic.
	if got := Dot([]float32{1, 0}, []float32{1, 0, 0}); got != 0 {
		t.Errorf("Dot() on mismatched widths = %v, want 0", got)
	}
	if got := Dot(nil, nil); got != 0 {
		t.Errorf("Dot() of empty vectors = %v, want 0", got)
	}
}

func TestEmbedPlacesVectorsByResponseIndex(t *testing.T) {
	// The spec says every result carries its input index; not every server
	// sorts them, so a shuffled response must still land in input order.
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{
			"data": []map[string]any{
				{"index": 1, "embedding": []float32{0, 1}},
				{"index": 0, "embedding": []float32{1, 0}},
			},
		})
	}))
	defer srv.Close()

	e, err := New(Config{Model: "test", BaseURL: srv.URL})
	if err != nil {
		t.Fatal(err)
	}
	vecs, err := e.Embed(context.Background(), []string{"first", "second"})
	if err != nil {
		t.Fatal(err)
	}
	if vecs[0][0] != 1 || vecs[1][1] != 1 {
		t.Errorf("vectors landed out of order: %v", vecs)
	}
}

func TestEmbedRefusesShortResponse(t *testing.T) {
	// Padding a missing vector would store a chunk that no query can ever
	// reach, inside a document reported as ready.
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{
			"data": []map[string]any{{"index": 0, "embedding": []float32{1, 0}}},
		})
	}))
	defer srv.Close()

	e, _ := New(Config{Model: "test", BaseURL: srv.URL})
	if _, err := e.Embed(context.Background(), []string{"first", "second"}); err == nil {
		t.Error("Embed() accepted a response missing a vector")
	}
}

func TestEmbedSurfacesEndpointError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "model not found", http.StatusNotFound)
	}))
	defer srv.Close()

	e, _ := New(Config{Model: "test", BaseURL: srv.URL})
	_, err := e.Embed(context.Background(), []string{"x"})
	if err == nil {
		t.Fatal("Embed() swallowed a 404")
	}
	if !contains(err.Error(), "model not found") {
		t.Errorf("error lost the endpoint's explanation: %v", err)
	}
}

func TestIDDistinguishesEndpoints(t *testing.T) {
	// Vectors from two endpoints are not comparable even at the same model id,
	// so the identity that invalidates a stored index must include both.
	a, _ := New(Config{Model: "m", BaseURL: "http://one"})
	b, _ := New(Config{Model: "m", BaseURL: "http://two"})
	if a.ID() == b.ID() {
		t.Errorf("two endpoints share the vector-space id %q", a.ID())
	}
}

func contains(s, sub string) bool {
	for i := 0; i+len(sub) <= len(s); i++ {
		if s[i:i+len(sub)] == sub {
			return true
		}
	}
	return false
}
