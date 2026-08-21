package retrieval

import "context"

// Utility is the cheap instruct model behind query expansion and the
// relevance gate. It mirrors prism.Utility exactly (Go's structural interface
// typing means any value satisfying one satisfies the other, so PRISM passes
// its own Utility values here with no adapter needed).
type Utility interface {
	// Complete returns a short deterministic completion. Implementations must
	// run at temperature 0: non-deterministic control flow makes the same
	// question take different paths on different runs, which is unevaluable
	// and defeats every cache below it.
	Complete(ctx context.Context, system, user string, maxTokens int) (string, error)
	// ID names the model, for diagnostics.
	ID() string
}
