package research

import (
	"sync"

	"kaioken/internal/llm"
)

// Cost is the line-itemised metering a run reports, in the shape Perplexity's
// public API exposes: searches, fetches and the token classes separately,
// with the dollar figure computed from them. One opaque token count hides
// where the money went; research runs spend most of it on reasoning tokens
// (10–20× the visible output is normal), so that column gets its own line.
type Cost struct {
	InputTokens     int     `json:"input_tokens"`
	OutputTokens    int     `json:"output_tokens"`
	ReasoningTokens int     `json:"reasoning_tokens"`
	Searches        int     `json:"searches"`
	Fetches         int     `json:"fetches"`
	USD             float64 `json:"usd"`
	// Exact reports that the USD figure came from the provider rather than a
	// catalog estimate, so a reader knows how much to trust the cents.
	Exact bool `json:"exact,omitempty"`
}

// The cascade roles. Four of them should be cheap models and the write step
// the best one available; the names are what the global config's
// research.models map keys against.
const (
	RoleRouter     = "router"
	RoleScope      = "scope"
	RolePlan       = "plan"
	RoleSupervisor = "supervisor"
	RoleWorker     = "worker"
	RoleCompress   = "compress"
	RoleWrite      = "write"
	RoleCite       = "cite"
)

// TrackClient, when set, receives every client the cascade derives for a
// role, so the host can book their spend alongside the primary client's.
// Async and optional by design: research must never depend on whatever
// metering sits behind it.
var TrackClient func(c *llm.Client)

// Clients hands each cascade role its own client, lazily derived from the
// primary one. A role with no configured model gets the primary client
// itself — the common case — so nothing extra is built.
type Clients struct {
	primary *llm.Client
	models  map[string]string

	mu    sync.Mutex
	cache map[string]*llm.Client
}

// NewClients builds the cascade around the primary client. models maps role
// names to model ids; nil means every role shares the primary.
func NewClients(primary *llm.Client, models map[string]string) *Clients {
	return &Clients{primary: primary, models: models, cache: map[string]*llm.Client{}}
}

// For returns the client that runs a role.
func (cs *Clients) For(role string) *llm.Client {
	model := cs.models[role]
	if model == "" || model == cs.primary.Model {
		return cs.primary
	}
	cs.mu.Lock()
	if c, ok := cs.cache[model]; ok {
		cs.mu.Unlock()
		return c
	}
	c := cs.primary.WithModel(model)
	cs.cache[model] = c
	cs.mu.Unlock()
	// Tracking happens outside the lock and at most once per derived
	// client: the cache entry is installed first, so a racing caller finds
	// it and never derives a second.
	if TrackClient != nil {
		TrackClient(c)
	}
	return c
}

// Each calls fn once for every distinct client in the cascade — the primary
// plus any derived models. The meter uses it to sum usage exactly once per
// client even when several roles share one.
func (cs *Clients) Each(fn func(c *llm.Client)) {
	seen := map[*llm.Client]bool{}
	fn(cs.primary)
	seen[cs.primary] = true
	cs.mu.Lock()
	derived := make([]*llm.Client, 0, len(cs.cache))
	for _, c := range cs.cache {
		derived = append(derived, c)
	}
	cs.mu.Unlock()
	for _, c := range derived {
		if !seen[c] {
			seen[c] = true
			fn(c)
		}
	}
}

// Meter aggregates one run's spend across every client the cascade used,
// plus the retrieval counters no token tally can see. One unified meter
// regardless of which path executed: escalation adds to the same running
// total rather than resetting it, which is what makes the final price
// honest.
type Meter struct {
	mu       sync.Mutex
	clients  *Clients
	searches int
	fetches  int
}

// NewMeter starts a meter over the cascade.
func NewMeter(clients *Clients) *Meter {
	return &Meter{clients: clients}
}

// AddSearches bills search calls against the run.
func (m *Meter) AddSearches(n int) {
	m.mu.Lock()
	m.searches += n
	m.mu.Unlock()
}

// AddFetches bills fetches against the run. A fetch served from the
// content-hash cache never calls this.
func (m *Meter) AddFetches(n int) {
	m.mu.Lock()
	m.fetches += n
	m.mu.Unlock()
}

// Retrieval reports the search and fetch counts so far.
func (m *Meter) Retrieval() (searches, fetches int) {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.searches, m.fetches
}

// searchCount is the search total, for budget trims mid-round.
func (m *Meter) searchCount() int {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.searches
}

// fetchCount is the fetch total, for budget trims mid-round.
func (m *Meter) fetchCount() int {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.fetches
}

// Snapshot sums the usage of every distinct client into one Cost. USD is
// the provider's figure where one was reported and a catalog estimate
// otherwise; Exact says which.
func (m *Meter) Snapshot() Cost {
	var out Cost
	allExact, anyKnown := true, false
	m.clients.Each(func(c *llm.Client) {
		_, prompt, completion := c.Usage()
		out.InputTokens += prompt
		out.OutputTokens += completion
		out.ReasoningTokens += c.ReasoningTokens()
		usd, exact, known := c.SpendUSD()
		if !known {
			return
		}
		anyKnown = true
		out.USD += usd
		if !exact {
			allExact = false
		}
	})
	out.Exact = anyKnown && allExact
	m.mu.Lock()
	out.Searches = m.searches
	out.Fetches = m.fetches
	m.mu.Unlock()
	return out
}

// CostExceeded reports whether the run's spend has reached the ceiling. A
// zero ceiling disables the check.
func (m *Meter) CostExceeded(ceiling float64) bool {
	if ceiling <= 0 {
		return false
	}
	return m.Snapshot().USD >= ceiling
}
