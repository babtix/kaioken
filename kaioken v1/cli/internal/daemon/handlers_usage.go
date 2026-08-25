package daemon

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"time"

	"kaioken/internal/llm"
	"kaioken/internal/usage"
)

// The cost dashboard's data source. Everything here reads the ledger written
// by internal/usage; nothing recomputes spend, so the API and the CLI can
// never disagree about what a week cost.

// GET /v1/usage?days=30&workspace=<id> (days can be a number or "all")
//
// Distinct from GET /v1/workspaces/{id}/usage, which reports one live client's
// counters. This is the durable history: it survives restarts and spans every
// workspace, which is what a spending question actually asks about.
func (s *Server) handleUsageLedger(w http.ResponseWriter, r *http.Request) {
	qDays := strings.TrimSpace(r.URL.Query().Get("days"))
	var since time.Time
	var daysRes any
	if qDays == "all" || qDays == "all-time" || qDays == "alltime" || qDays == "0" {
		daysRes = "all"
	} else {
		days := 30
		if qDays != "" {
			fmt.Sscanf(qDays, "%d", &days)
		}
		if days <= 0 {
			days = 30
		}
		if days > 365 {
			days = 365
		}
		since = time.Now().AddDate(0, 0, -days)
		daysRes = days
	}

	events, err := usage.Load(since)
	if err != nil {
		writeError(w, http.StatusInternalServerError, codeEngineError, err.Error(), "")
		return
	}

	// Workspace filtering happens here rather than in Load: the ledger is
	// global on purpose, and most dashboard views want every repo.
	if wsID := strings.TrimSpace(r.URL.Query().Get("workspace")); wsID != "" {
		if ws, ok := s.mgr.Get(wsID); ok {
			var kept []usage.Event
			for _, e := range events {
				if sameWorkspace(e.Workspace, ws.Path) {
					kept = append(kept, e)
				}
			}
			events = kept
		}
	}

	summary := usage.Summarize(events)
	writeJSON(w, http.StatusOK, map[string]any{
		"days":    daysRes,
		"summary": summary,
		// pricing_stale tells the UI whether to offer a refresh: an old table
		// means the estimated half of the numbers is drifting.
		"pricing_stale": usage.Stale(),
	})
}

// POST /v1/usage/pricing/refresh — pull the current model price catalog.
func (s *Server) handleRefreshPricing(w http.ResponseWriter, r *http.Request) {
	n, err := usage.RefreshPrices(r.Context())
	if err != nil {
		writeError(w, http.StatusBadGateway, codeEngineError,
			"could not fetch the model price catalog: "+err.Error(), "")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"models": n})
}

// bookRunSpend wraps a run body so whatever it spends reaches the ledger.
//
// The workspace's client is cached and its counters are cumulative, so this
// records the delta across the run rather than the running total — otherwise
// the second run of a session would book the first one's tokens again.
func (s *Server) bookRunSpend(ws *Workspace, kind string,
	fn func(ctx context.Context, r *RunRecord) error) func(ctx context.Context, r *RunRecord) error {

	return func(ctx context.Context, r *RunRecord) error {
		client, err := ws.Client()
		if err != nil {
			// No client means no spend to book; the run either needs no model
			// or is about to fail on its own with a clearer message.
			return fn(ctx, r)
		}
		beforeCalls, beforePrompt, beforeCompletion := client.Usage()
		beforeCost, _ := client.CostUSD()

		runErr := fn(ctx, r)

		// Booked even when the run failed: a run that died halfway still spent
		// what it spent, and those are the runs worth noticing on a bill.
		afterCalls, afterPrompt, afterCompletion := client.Usage()
		afterCost, known := client.CostUSD()
		if afterCalls > beforeCalls {
			e := usage.Event{
				Provider:         ws.ProviderName(),
				Model:            client.Model,
				Operation:        kind,
				Workspace:        ws.Path,
				Calls:            afterCalls - beforeCalls,
				PromptTokens:     afterPrompt - beforePrompt,
				CompletionTokens: afterCompletion - beforeCompletion,
				Local:            llm.IsLocal(ws.ProviderName()),
			}
			if known {
				e.CostUSD = afterCost - beforeCost
			}
			usage.Record(e)
		}
		return runErr
	}
}

func sameWorkspace(recorded, path string) bool {
	if recorded == "" || path == "" {
		return false
	}
	return strings.EqualFold(strings.TrimRight(recorded, `/\`), strings.TrimRight(path, `/\`))
}
