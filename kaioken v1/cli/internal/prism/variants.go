package prism

import (
	"context"

	"kaioken/internal/retrieval"
)

// RAG-Fusion query expansion lives in internal/retrieval; see its variants.go
// for the design notes. What follows forwards into it under this package's
// existing unexported names, which grader_test.go exercises directly.

// MaxVariants caps expansion. Past four the variants begin paraphrasing each
// other and fusion just re-ranks the same documents at four times the price.
const MaxVariants = retrieval.MaxVariants

type variantCache = retrieval.VariantCache

func newVariantCache() *variantCache { return retrieval.NewVariantCache() }

// expandQuery returns up to n phrasings of query, the original first.
func expandQuery(ctx context.Context, u Utility, vc *variantCache, query string, n int) []string {
	return retrieval.ExpandQuery(ctx, u, vc, query, n)
}
