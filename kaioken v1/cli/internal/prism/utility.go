package prism

import (
	"context"
	"strings"

	"kaioken/internal/llm"
)

// Every internal gate in this package — the relevance grader, query expansion,
// the agent's router and planner — runs on one cheap instruct model, reached
// through this interface.
//
// No model id appears anywhere in the package. Which model to spend on is a
// deployment decision, and burying a default here would make changing it a
// code change. When none is configured the interface is nil and each caller
// falls back to its own safe behaviour: the gate does not run and reports
// Graded false, expansion returns the query unchanged, the router answers
// "simple". An unconfigured install is therefore degraded and honest about it,
// never broken.

// Utility is the cheap instruct model behind the internal gates.
type Utility interface {
	// Complete returns a short deterministic completion. Implementations must
	// run at temperature 0: non-deterministic control flow makes the same
	// question take different paths on different runs, which is unevaluable
	// and defeats every cache below it.
	Complete(ctx context.Context, system, user string, maxTokens int) (string, error)
	// ID names the model, for diagnostics.
	ID() string
}

// llmUtility adapts an llm.Client.
type llmUtility struct{ base *llm.Client }

// NewUtility wraps a client as the package's utility model. A nil client
// yields a nil Utility, which every caller already handles.
func NewUtility(c *llm.Client) Utility {
	if c == nil {
		return nil
	}
	return &llmUtility{base: c}
}

func (u *llmUtility) ID() string { return u.base.Model }

func (u *llmUtility) Complete(ctx context.Context, system, user string, maxTokens int) (string, error) {
	// A fresh client per call: MaxTokens differs by gate — five tokens for a
	// one-word verdict, a couple of hundred for a decomposition — and mutating
	// a shared client would race the concurrent grader calls.
	c := u.base.WithModel(u.base.Model)
	c.MaxTokens = maxTokens
	zero := 0.0
	c.Temperature = &zero
	// Reasoning tokens on a one-word verdict are pure waste, and some models
	// spend the whole output budget on them and return nothing.
	c.Thinking = "off"

	out, err := c.Chat(ctx, system, user)
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(out), nil
}
