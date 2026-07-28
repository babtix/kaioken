package agent

import (
	"fmt"
	"sync"
)

// Proactive spending guardrails.
//
// The reactive budget machinery in internal/llm handles the moment a provider
// refuses a request for lack of credit. By then it is too late to be graceful:
// the user is mid-task, the context is full of work in progress, and the next
// request simply fails. The guard here acts earlier, on the user's own terms —
// a warning at one threshold, a refusal at another — so a session approaching
// its limit gets steered rather than cut off.
//
// One guard lives beside each llm.Client and shares its lifetime: the TUI and
// the daemon build both together, so "session spend" means exactly what the
// client's CostUSD reports, and a /model or /provider switch resets both.

// BudgetGuard enforces the config's budget thresholds across every turn that
// shares a client. The zero value (and nil) disables everything.
type BudgetGuard struct {
	WarnAt   float64 // USD; 0 disables the warning
	HardStop float64 // USD; 0 disables the stop

	mu     sync.Mutex
	warned bool
}

// NewBudgetGuard builds a guard from configured thresholds. Both zero yields
// nil, which every method treats as "no guardrails".
func NewBudgetGuard(warnAt, hardStop float64) *BudgetGuard {
	if warnAt <= 0 && hardStop <= 0 {
		return nil
	}
	return &BudgetGuard{WarnAt: warnAt, HardStop: hardStop}
}

// Check compares a session's spend against the thresholds. usd and known come
// straight from llm.Client.CostUSD; when the provider never reported cost the
// guard stays silent rather than guessing. The warning fires exactly once per
// guard, the stop fires on every call past the limit.
func (g *BudgetGuard) Check(usd float64, known bool) (warn string, stop error) {
	if g == nil || !known {
		return "", nil
	}
	if g.HardStop > 0 && usd >= g.HardStop {
		return "", fmt.Errorf("session budget reached: $%.4f spent ≥ the $%.2f hard_stop — "+
			"start fresh with /new, trim with /compact, or raise budget.hard_stop in %s",
			usd, g.HardStop, "config.yaml")
	}
	if g.WarnAt > 0 && usd >= g.WarnAt {
		g.mu.Lock()
		first := !g.warned
		g.warned = true
		g.mu.Unlock()
		if first {
			return fmt.Sprintf("session cost $%.4f has passed the $%.2f warn threshold — "+
				"be economical: prefer targeted reads and delegate broad searches", usd, g.WarnAt), nil
		}
	}
	return "", nil
}
