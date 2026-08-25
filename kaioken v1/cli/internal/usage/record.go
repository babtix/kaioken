package usage

import (
	"strings"

	"kaioken/internal/llm"
)

// FromClient books a finished operation's spend against the ledger, reading
// the counters the client accumulated. Called once when an operation ends
// rather than per request: a wiki run makes hundreds of calls and the ledger
// is for answering "what did the wiki cost", not for replaying every request.
//
// Safe to call with a nil client or an operation that made no calls; both are
// no-ops, so call sites need no guard.
func FromClient(c *llm.Client, provider, operation, workspace string) {
	if c == nil {
		return
	}
	calls, promptToks, completionToks := c.Usage()
	if calls == 0 {
		return
	}
	cost, known := c.CostUSD()

	e := Event{
		Provider:         strings.TrimSpace(provider),
		Model:            c.Model,
		Operation:        operation,
		Workspace:        workspace,
		Calls:            calls,
		PromptTokens:     promptToks,
		CompletionTokens: completionToks,
		Local:            llm.IsLocal(provider),
	}
	if known {
		e.CostUSD = cost
	}
	// Record fills in an estimate when the provider reported nothing, so a
	// silent provider still produces a priced row.
	Record(e)
}
