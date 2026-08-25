package main

import (
	"context"
	"fmt"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"kaioken/internal/llm"
	// Aliased because `usage` is already the name of this command's help text
	// constant in main.go.
	ledger "kaioken/internal/usage"
)

// Spend is booked centrally rather than at each command's exit. Every command
// that talks to a model goes through newClient, so registering there is the
// one place that cannot be forgotten when a new command is added — and a
// ledger with a hole in it is worse than no ledger, because the total looks
// authoritative either way.

var (
	spendMu      sync.Mutex
	spendClients []*llm.Client
	spendModel   string
)

// trackSpend registers a client whose usage should be booked when the command
// finishes.
func trackSpend(c *llm.Client, provider string) {
	if c == nil {
		return
	}
	spendMu.Lock()
	spendClients = append(spendClients, c)
	spendModel = provider
	spendMu.Unlock()
}

// bookSpend writes the command's usage to the ledger. Called explicitly from
// main rather than deferred, because the error path exits the process and
// os.Exit skips deferred calls — which would silently drop the spend from
// exactly the runs a user most wants to see.
func bookSpend(operation, repo string) {
	spendMu.Lock()
	clients, provider := spendClients, spendModel
	spendClients = nil
	spendMu.Unlock()

	if len(clients) == 0 {
		return
	}
	abs, err := filepath.Abs(repo)
	if err != nil {
		abs = repo
	}
	for _, c := range clients {
		ledger.FromClient(c, provider, operation, abs)
	}
}

// cmdUsage prints the spending ledger.
func cmdUsage(ctx context.Context, f flags) error {
	if f.positional == "refresh" {
		n, err := ledger.RefreshPrices(ctx)
		if err != nil {
			return fmt.Errorf("fetching the model price catalog: %w", err)
		}
		fmt.Printf("cached prices for %d models\n", n)
		return nil
	}
	if f.positional == "prune" {
		// Ninety days is long enough to answer any real question about
		// spending and short enough that the file stays small.
		kept, err := ledger.Prune(time.Now().AddDate(0, 0, -90))
		if err != nil {
			return err
		}
		fmt.Printf("kept %d event(s) from the last 90 days\n", kept)
		return nil
	}

	allTime := false
	days := 30
	if f.positional == "all" || f.positional == "all-time" || f.positional == "alltime" {
		allTime = true
	} else if f.positional != "" {
		fmt.Sscanf(strings.TrimSuffix(f.positional, "d"), "%d", &days)
	}
	if !allTime && days <= 0 {
		days = 30
	}

	// Refresh before summarising rather than warning afterwards: the estimate
	// is most of the number for most providers, and a dashboard that is wrong
	// on first view teaches people not to trust it.
	if ledger.Stale() {
		fmt.Println("fetching the model price catalog …")
		if _, err := ledger.RefreshPrices(ctx); err != nil {
			fmt.Printf("  ! could not refresh prices (%v) — estimates may be missing\n", err)
		}
	}

	var since time.Time
	if !allTime {
		since = time.Now().AddDate(0, 0, -days)
	}
	events, err := ledger.Load(since)
	if err != nil {
		return err
	}
	if len(events) == 0 {
		if allTime {
			fmt.Println("no recorded usage.")
		} else {
			fmt.Printf("no recorded usage in the last %d days.\n", days)
		}
		fmt.Println("the ledger fills as you run wiki, generate, chat, research or review.")
		return nil
	}
	s := ledger.Summarize(events)

	if allTime {
		fmt.Printf("all time — %s across %d call(s), %s tokens\n",
			ledger.FormatUSD(s.CostUSD), s.Calls, humanCount(s.PromptTokens+s.CompletionTokens))
	} else {
		fmt.Printf("last %d days — %s across %d call(s), %s tokens\n",
			days, ledger.FormatUSD(s.CostUSD), s.Calls, humanCount(s.PromptTokens+s.CompletionTokens))
	}
	if s.CostUSD > 0 {
		known := s.KnownCostUSD / s.CostUSD * 100
		fmt.Printf("  %.0f%% of that figure was reported by a provider; the rest is estimated from the price catalog\n", known)
	}
	if s.LocalCalls > 0 {
		fmt.Printf("  %d call(s) ran on local models at no cost\n", s.LocalCalls)
	}
	section := func(title string, buckets []ledger.Bucket, limit int) {
		if len(buckets) == 0 {
			return
		}
		fmt.Printf("\n%s\n", title)
		for i, b := range buckets {
			if limit > 0 && i >= limit {
				fmt.Printf("  … and %d more\n", len(buckets)-limit)
				break
			}
			fmt.Printf("  %-38s %10s  %8s tokens  %5d calls\n",
				truncateLeft(b.Key, 38), ledger.FormatUSD(b.CostUSD),
				humanCount(b.PromptTokens+b.CompletionTokens), b.Calls)
		}
	}

	section("by operation", s.ByOperation, 0)
	section("by model", s.ByModel, 8)
	section("by workspace", s.ByWorkspace, 8)

	// The daily series is the one people scan for a spike, so it goes last and
	// unabridged for short windows.
	if !allTime && days <= 31 {
		section("by day", s.ByDay, 0)
	}
	return nil
}

func humanCount(n int) string {
	switch {
	case n >= 1_000_000:
		return fmt.Sprintf("%.1fM", float64(n)/1e6)
	case n >= 1_000:
		return fmt.Sprintf("%.1fk", float64(n)/1e3)
	default:
		return fmt.Sprintf("%d", n)
	}
}

func truncateLeft(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return "…" + s[len(s)-n+1:]
}
