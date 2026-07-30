// Package usage keeps a durable ledger of what Kaioken spent: every LLM call
// that finished, what it cost, and what it was for.
//
// Two things make this worth a package rather than a counter on the client.
// First, a Client's counters die with the process, so "what did this week
// cost" was previously unanswerable. Second, most providers never report a
// price — only OpenRouter does — so a ledger that only recorded known costs
// would show $0 for the majority of real usage. Events therefore always carry
// token counts, and cost is either reported or estimated from a price table,
// with the difference recorded rather than smoothed over.
package usage

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"kaioken/internal/config"
)

// Event is one recorded LLM call, or one batch of calls from a single
// operation.
type Event struct {
	At       time.Time `json:"at"`
	Provider string    `json:"provider"`
	Model    string    `json:"model"`
	// Operation is what the tokens were spent on: wiki, generate, chat,
	// research, review, skills, plan. It is what makes the ledger actionable —
	// "chat is 80% of the bill" is a decision, "$14 this week" is not.
	Operation string `json:"operation"`
	// Workspace is the repo path, so a multi-repo user can attribute spend.
	Workspace string `json:"workspace,omitempty"`
	Calls     int    `json:"calls"`

	PromptTokens     int `json:"prompt_tokens"`
	CompletionTokens int `json:"completion_tokens"`

	// CostUSD is the spend. Estimated says whether it came from the provider
	// or from the price table — a dashboard that hides that distinction is
	// lying by omission.
	CostUSD   float64 `json:"cost_usd"`
	Estimated bool    `json:"estimated,omitempty"`
	// Local marks a call served by the user's own hardware, which costs
	// nothing and would otherwise look like a suspiciously free hosted model.
	Local bool `json:"local,omitempty"`
}

// TotalTokens is the sum a dashboard shows as one number.
func (e Event) TotalTokens() int { return e.PromptTokens + e.CompletionTokens }

// ledgerPath is the append-only JSONL file, global rather than per-repo: a
// user's spending question spans workspaces.
func ledgerPath() string {
	return filepath.Join(config.GlobalDir(), "usage.jsonl")
}

var writeMu sync.Mutex

// Record appends an event. Recording is best-effort by design: a failure to
// write the ledger must never fail the work that produced it.
func Record(e Event) {
	if e.Calls == 0 && e.TotalTokens() == 0 {
		return
	}
	if e.At.IsZero() {
		e.At = time.Now()
	}
	if e.Calls == 0 {
		e.Calls = 1
	}
	// Fill in an estimate when the provider stayed silent, so the ledger has a
	// usable number for every row rather than a hole for most of them.
	if e.CostUSD == 0 && !e.Local {
		if est, ok := EstimateCost(e.Model, e.PromptTokens, e.CompletionTokens); ok {
			e.CostUSD = est
			e.Estimated = true
		}
	}

	raw, err := json.Marshal(e)
	if err != nil {
		return
	}

	writeMu.Lock()
	defer writeMu.Unlock()
	if err := os.MkdirAll(filepath.Dir(ledgerPath()), 0o700); err != nil {
		return
	}
	f, err := os.OpenFile(ledgerPath(), os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o600)
	if err != nil {
		return
	}
	defer f.Close()
	f.Write(append(raw, '\n'))
}

// Load reads events newer than since. A zero since reads the whole ledger.
func Load(since time.Time) ([]Event, error) {
	raw, err := os.ReadFile(ledgerPath())
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}

	var out []Event
	for _, line := range strings.Split(string(raw), "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		var e Event
		if err := json.Unmarshal([]byte(line), &e); err != nil {
			// One corrupt line must not hide the rest of the history.
			continue
		}
		if !since.IsZero() && e.At.Before(since) {
			continue
		}
		out = append(out, e)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].At.Before(out[j].At) })
	return out, nil
}

// Bucket is one aggregated row.
type Bucket struct {
	Key              string  `json:"key"`
	Calls            int     `json:"calls"`
	PromptTokens     int     `json:"prompt_tokens"`
	CompletionTokens int     `json:"completion_tokens"`
	CostUSD          float64 `json:"cost_usd"`
	// EstimatedShare is the fraction of this bucket's cost that came from the
	// price table rather than from a provider. Surfaced so a user knows how
	// much to trust the figure.
	EstimatedShare float64 `json:"estimated_share"`
}

// Summary is the whole dashboard payload.
type Summary struct {
	From  time.Time `json:"from"`
	To    time.Time `json:"to"`
	Calls int       `json:"calls"`

	PromptTokens     int     `json:"prompt_tokens"`
	CompletionTokens int     `json:"completion_tokens"`
	CostUSD          float64 `json:"cost_usd"`
	// KnownCostUSD is the part providers actually reported.
	KnownCostUSD float64 `json:"known_cost_usd"`
	// LocalCalls is how many calls ran on the user's own hardware — the number
	// that says how much a local setup is actually saving.
	LocalCalls int `json:"local_calls"`

	ByDay       []Bucket `json:"by_day"`
	ByModel     []Bucket `json:"by_model"`
	ByProvider  []Bucket `json:"by_provider"`
	ByOperation []Bucket `json:"by_operation"`
	ByWorkspace []Bucket `json:"by_workspace"`
}

// Summarize aggregates events into the dashboard shape.
func Summarize(events []Event) *Summary {
	s := &Summary{}
	if len(events) == 0 {
		return s
	}
	s.From, s.To = events[0].At, events[len(events)-1].At

	day := map[string]*Bucket{}
	model := map[string]*Bucket{}
	provider := map[string]*Bucket{}
	operation := map[string]*Bucket{}
	workspace := map[string]*Bucket{}

	// estimated tracks the estimated portion per bucket so EstimatedShare can
	// be computed at the end rather than accumulated as a running average.
	estimated := map[*Bucket]float64{}

	add := func(m map[string]*Bucket, key string, e Event) {
		if key == "" {
			key = "(unknown)"
		}
		b, ok := m[key]
		if !ok {
			b = &Bucket{Key: key}
			m[key] = b
		}
		b.Calls += e.Calls
		b.PromptTokens += e.PromptTokens
		b.CompletionTokens += e.CompletionTokens
		b.CostUSD += e.CostUSD
		if e.Estimated {
			estimated[b] += e.CostUSD
		}
	}

	for _, e := range events {
		s.Calls += e.Calls
		s.PromptTokens += e.PromptTokens
		s.CompletionTokens += e.CompletionTokens
		s.CostUSD += e.CostUSD
		if !e.Estimated {
			s.KnownCostUSD += e.CostUSD
		}
		if e.Local {
			s.LocalCalls += e.Calls
		}

		add(day, e.At.Format("2006-01-02"), e)
		add(model, e.Model, e)
		add(provider, e.Provider, e)
		add(operation, e.Operation, e)
		add(workspace, shortWorkspace(e.Workspace), e)
	}

	finish := func(m map[string]*Bucket, chronological bool) []Bucket {
		out := make([]Bucket, 0, len(m))
		for _, b := range m {
			if b.CostUSD > 0 {
				b.EstimatedShare = estimated[b] / b.CostUSD
			}
			out = append(out, *b)
		}
		sort.Slice(out, func(i, j int) bool {
			if chronological {
				return out[i].Key < out[j].Key
			}
			if out[i].CostUSD != out[j].CostUSD {
				return out[i].CostUSD > out[j].CostUSD
			}
			// Cost ties are common with unpriced models; tokens break them so
			// the busiest row still sorts to the top.
			ti := out[i].PromptTokens + out[i].CompletionTokens
			tj := out[j].PromptTokens + out[j].CompletionTokens
			if ti != tj {
				return ti > tj
			}
			return out[i].Key < out[j].Key
		})
		return out
	}

	s.ByDay = finish(day, true)
	s.ByModel = finish(model, false)
	s.ByProvider = finish(provider, false)
	s.ByOperation = finish(operation, false)
	s.ByWorkspace = finish(workspace, false)
	return s
}

// shortWorkspace trims a repo path to its final component, which is what a
// user recognises — the full path is noise in a table.
func shortWorkspace(p string) string {
	if p == "" {
		return ""
	}
	return filepath.Base(filepath.Clean(p))
}

// Prune drops events older than cutoff, keeping the ledger from growing
// forever. Returns how many rows survived.
func Prune(cutoff time.Time) (int, error) {
	events, err := Load(time.Time{})
	if err != nil {
		return 0, err
	}
	var kept []Event
	for _, e := range events {
		if e.At.After(cutoff) {
			kept = append(kept, e)
		}
	}
	if len(kept) == len(events) {
		return len(kept), nil
	}

	writeMu.Lock()
	defer writeMu.Unlock()
	var b strings.Builder
	for _, e := range kept {
		raw, err := json.Marshal(e)
		if err != nil {
			continue
		}
		b.Write(raw)
		b.WriteByte('\n')
	}
	tmp := ledgerPath() + ".tmp"
	if err := os.WriteFile(tmp, []byte(b.String()), 0o600); err != nil {
		return 0, err
	}
	if err := os.Rename(tmp, ledgerPath()); err != nil {
		os.Remove(tmp)
		return 0, err
	}
	return len(kept), nil
}

// FormatUSD renders a cost at a precision that stays meaningful for the very
// small numbers this deals in — $0.0003 is a real answer, "$0.00" is not.
func FormatUSD(v float64) string {
	switch {
	case v == 0:
		return "$0"
	case v < 0.01:
		return fmt.Sprintf("$%.4f", v)
	case v < 1:
		return fmt.Sprintf("$%.3f", v)
	default:
		return fmt.Sprintf("$%.2f", v)
	}
}
