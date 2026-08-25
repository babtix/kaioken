package usage

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"kaioken/internal/config"
)

// Only OpenRouter reports what a call cost. Every other provider returns token
// counts and leaves the arithmetic to the caller, so a ledger without a price
// table shows $0 for most real usage.
//
// The table is pulled from OpenRouter's public model catalog, which prices
// several hundred models across every major provider and needs no API key to
// read. It is cached on disk and refreshed lazily, so the common path is a
// file read and the failure path is "no estimate", never a blocked call.

// Price is per-token cost in USD.
type Price struct {
	Prompt     float64 `json:"prompt"`
	Completion float64 `json:"completion"`
}

type priceTable struct {
	FetchedAt time.Time        `json:"fetched_at"`
	Models    map[string]Price `json:"models"`
}

var (
	priceMu    sync.RWMutex
	priceCache *priceTable
)

func pricePath() string {
	return filepath.Join(config.GlobalDir(), "pricing.json")
}

// priceMaxAge is how long a cached table is trusted. Model prices move on the
// scale of weeks, and a stale estimate beats no estimate.
const priceMaxAge = 7 * 24 * time.Hour

// EstimateCost prices a call from the cached table. ok is false when the model
// is unknown, which the caller must treat as "no estimate" rather than free.
func EstimateCost(model string, promptTokens, completionTokens int) (float64, bool) {
	t := loadPrices()
	if t == nil {
		return 0, false
	}
	p, ok := lookup(t.Models, model)
	if !ok {
		return 0, false
	}
	cost := float64(promptTokens)*p.Prompt + float64(completionTokens)*p.Completion
	return cost, true
}

// lookup resolves a model id against the table, tolerating the naming drift
// between providers: a bare "claude-sonnet-4.5" should still find
// "anthropic/claude-sonnet-4.5", and a ":free" suffix is a routing detail.
func lookup(models map[string]Price, model string) (Price, bool) {
	id := strings.ToLower(strings.TrimSpace(model))
	if id == "" {
		return Price{}, false
	}
	if p, ok := models[id]; ok {
		return p, true
	}
	if base, _, found := strings.Cut(id, ":"); found {
		if p, ok := models[base]; ok {
			return p, true
		}
		id = base
	}
	if _, bare, found := strings.Cut(id, "/"); found {
		for key, p := range models {
			if key == bare || strings.HasSuffix(key, "/"+bare) {
				return p, true
			}
		}
		return Price{}, false
	}
	for key, p := range models {
		if strings.HasSuffix(key, "/"+id) {
			return p, true
		}
	}
	return Price{}, false
}

func loadPrices() *priceTable {
	priceMu.RLock()
	cached := priceCache
	priceMu.RUnlock()
	if cached != nil {
		return cached
	}

	raw, err := os.ReadFile(pricePath())
	if err != nil {
		return nil
	}
	var t priceTable
	if err := json.Unmarshal(raw, &t); err != nil || len(t.Models) == 0 {
		return nil
	}
	priceMu.Lock()
	priceCache = &t
	priceMu.Unlock()
	return &t
}

// Stale reports whether the price table is missing or old enough to refresh.
func Stale() bool {
	t := loadPrices()
	return t == nil || time.Since(t.FetchedAt) > priceMaxAge
}

// RefreshPrices fetches the catalog and rewrites the cache. Callers decide
// when: it is a network call, so nothing on a hot path should trigger it.
func RefreshPrices(ctx context.Context) (int, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet,
		"https://openrouter.ai/api/v1/models", nil)
	if err != nil {
		return 0, err
	}
	resp, err := (&http.Client{Timeout: 20 * time.Second}).Do(req)
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(resp.Body, 16<<20))
	if err != nil {
		return 0, err
	}

	var parsed struct {
		Data []struct {
			ID      string `json:"id"`
			Pricing struct {
				// OpenRouter sends prices as decimal strings per token.
				Prompt     string `json:"prompt"`
				Completion string `json:"completion"`
			} `json:"pricing"`
		} `json:"data"`
	}
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return 0, err
	}

	t := &priceTable{FetchedAt: time.Now(), Models: map[string]Price{}}
	for _, m := range parsed.Data {
		prompt, err1 := strconv.ParseFloat(m.Pricing.Prompt, 64)
		completion, err2 := strconv.ParseFloat(m.Pricing.Completion, 64)
		if err1 != nil || err2 != nil {
			continue
		}
		if prompt == 0 && completion == 0 {
			// A genuinely free model; recording it keeps the estimate at zero
			// rather than falling through to "unknown".
			t.Models[strings.ToLower(m.ID)] = Price{}
			continue
		}
		t.Models[strings.ToLower(m.ID)] = Price{Prompt: prompt, Completion: completion}
	}
	if len(t.Models) == 0 {
		return 0, nil
	}

	body, err := json.Marshal(t)
	if err != nil {
		return 0, err
	}
	if err := os.MkdirAll(filepath.Dir(pricePath()), 0o700); err != nil {
		return 0, err
	}
	if err := os.WriteFile(pricePath(), body, 0o600); err != nil {
		return 0, err
	}

	priceMu.Lock()
	priceCache = t
	priceMu.Unlock()
	return len(t.Models), nil
}
