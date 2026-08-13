// Package prism is a retrieval engine for documents the user imports, as
// opposed to the knowledge Kaioken generates about a repository (that is
// internal/search). It is a Go port of PRISM — Precision Retrieval with
// Intelligent Source Matching.
//
// Three layers stack into one pipeline:
//
//   - Parent-child chunking. Small children are embedded and searched; their
//     larger parents are what reach the model. Retrieval stays precise while
//     generation context stays coherent.
//   - Hybrid retrieval. BM25 and vector search run over the same children and
//     are fused with reciprocal rank fusion, optionally across several
//     phrasings of the query.
//   - A corrective gate. Every fused child is graded for relevance before its
//     parent is fetched, so irrelevant context is dropped rather than
//     explained away by the model that receives it.
//
// What makes it worth having over plain hybrid search is the last one, and the
// honesty that follows from it: a result says whether a graded source actually
// backs it, whether the gate ran at all, and whether the pipeline was impaired.
// See Result.
package prism

import "time"

// Module is a named knowledge domain. Retrieval is scoped to one, so a
// question about contract law does not surface a cardiology chapter.
type Module struct {
	// Slug identifies the module on disk and in URLs.
	Slug string `json:"slug"`
	Name string `json:"name"`
	// Description is for humans browsing a module list.
	Description string `json:"description,omitempty"`
	// SystemPrompt, when set, specialises generation for this domain.
	SystemPrompt string `json:"system_prompt,omitempty"`

	// DocumentCount counts only documents that reached StatusReady: a module's
	// advertised count should reflect what is actually retrievable, not what
	// is mid-ingest or failed.
	DocumentCount int `json:"document_count"`
	ChunkCount    int `json:"chunk_count"`

	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// Status tracks a document through ingestion.
type Status string

const (
	// StatusProcessing means chunking or embedding is under way.
	StatusProcessing Status = "processing"
	// StatusReady means every chunk is stored and retrievable.
	StatusReady Status = "ready"
	// StatusFailed means the pipeline errored; see Document.Error. A failed
	// document leaves no chunks behind — embedding completes before the first
	// write, so there is nothing to clean up.
	StatusFailed Status = "failed"
)

// Document is one imported file, tracked through the pipeline.
type Document struct {
	ID       string `json:"id"`
	Filename string `json:"filename"`
	// Source is the path it was imported from, kept so a stale document can be
	// re-imported without the user hunting for the original.
	Source string `json:"source,omitempty"`
	Status Status `json:"status"`

	ChildCount  int `json:"child_count"`
	ParentCount int `json:"parent_count"`
	Bytes       int64 `json:"bytes"`

	// Error explains a StatusFailed document in terms the importer can act on.
	Error string `json:"error,omitempty"`

	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// ChunkType discriminates a retrieval target from a context payload.
type ChunkType string

const (
	// Child is a small passage carrying an embedding. Children are the only
	// thing either retrieval leg ever searches.
	Child ChunkType = "child"
	// Parent is the larger enclosing section, stored text-only. Parents are
	// never searched — they exist purely as expansion targets, fetched once a
	// child of theirs has won retrieval.
	Parent ChunkType = "parent"
)

// NoParent marks a child with no parent to expand to. Zero would be
// indistinguishable from "the parent at index 0".
const NoParent = -1

// Chunk is one stored passage, child or parent.
type Chunk struct {
	DocID string    `json:"doc"`
	Index int       `json:"index"`
	Type  ChunkType `json:"type"`
	// ParentIndex is the Index of this child's parent, or NoParent. Set on
	// children only.
	ParentIndex int `json:"parent_index"`
	// Section is the nearest enclosing heading, when the source had one. It
	// gives an isolated passage its subject back, which matters both for
	// embedding quality and for telling a reader where a quote came from.
	Section string `json:"section,omitempty"`
	Text    string `json:"text"`
	// Vec is this child's row in the module's vector file, or -1 when it has
	// no embedding. Parents are always -1.
	Vec int `json:"vec"`
}

// NoVector marks a chunk with no embedding row.
const NoVector = -1

// Result is the outcome of a retrieval.
//
// The three booleans are deliberately not collapsed into one. A single flag
// cannot distinguish "the corpus genuinely has no answer" from "retrieval is
// broken", and those call for opposite responses: the first is worth telling
// the user plainly, the second is worth retrying or fixing. Collapsing them is
// the failure this type exists to prevent.
type Result struct {
	// Chunks holds parent texts in fused rank order, ready for a prompt.
	Chunks []string `json:"chunks"`
	// SourceFound reports that a graded, query-relevant source backs these
	// chunks. When false the caller must tell the model no source was found
	// rather than letting it answer as though one were present.
	SourceFound bool `json:"source_found"`
	// Graded reports that the relevance gate ran successfully on every
	// candidate. False means the context is unverified, however good it looks.
	Graded bool `json:"graded"`
	// Degraded reports that retrieval ran on a reduced pipeline — no query
	// embedding, an empty leg, or a handled failure. Quality is materially
	// below normal and a caller should say so rather than retry blindly.
	Degraded bool `json:"degraded"`
}
