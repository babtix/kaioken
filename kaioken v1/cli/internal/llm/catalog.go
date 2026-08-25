package llm

// Model cost catalog.
//
// Only OpenRouter tells us what a request actually cost; every other
// provider returns token counts and silence. That silence used to disable
// the budget guardrails exactly where users go to spend real money — the
// first-party APIs. The catalog closes that gap: published per-token prices
// for the recognizable model families, so spend can be *estimated* from the
// token counts every provider does report.
//
// Prices are USD per million tokens, taken from the providers' public price
// lists. They drift; an estimate is a seatbelt, not an invoice, and callers
// must present it as such (CostUSD stays provider-reported-only — see
// SpendUSD for the estimating variant).

import "strings"

// ModelCost is a family's USD price per million tokens. CacheRead and
// CacheWrite are zero for families without prompt caching (or where the
// price is unpublished); estimation then bills those tokens at the input
// rate, which errs high — the right direction for a guardrail.
type ModelCost struct {
	In, Out    float64
	CacheRead  float64
	CacheWrite float64
}

// modelCosts maps a substring of a model id to that family's prices,
// longest-match-wins like contextWindows. Entries only exist where a
// first-party price list does; a host-specific rehosting (openrouter free
// tiers, groq-hosted llama) is deliberately not guessed at.
var modelCosts = map[string]ModelCost{
	"claude-opus":      {In: 15, Out: 75, CacheRead: 1.5, CacheWrite: 18.75},
	"claude-sonnet":    {In: 3, Out: 15, CacheRead: 0.3, CacheWrite: 3.75},
	"claude-haiku":     {In: 0.8, Out: 4, CacheRead: 0.08, CacheWrite: 1},
	"claude":           {In: 3, Out: 15, CacheRead: 0.3, CacheWrite: 3.75},
	"gpt-4o-mini":      {In: 0.15, Out: 0.6, CacheRead: 0.075},
	"gpt-4o":           {In: 2.5, Out: 10, CacheRead: 1.25},
	"gpt-4.1-nano":     {In: 0.1, Out: 0.4, CacheRead: 0.025},
	"gpt-4.1-mini":     {In: 0.4, Out: 1.6, CacheRead: 0.1},
	"gpt-4.1":          {In: 2, Out: 8, CacheRead: 0.5},
	"gpt-5-mini":       {In: 0.25, Out: 2, CacheRead: 0.025},
	"gpt-5-nano":       {In: 0.05, Out: 0.4, CacheRead: 0.005},
	"gpt-5":            {In: 1.25, Out: 10, CacheRead: 0.125},
	"o1-mini":          {In: 1.1, Out: 4.4, CacheRead: 0.55},
	"o1":               {In: 15, Out: 60, CacheRead: 7.5},
	"o3-mini":          {In: 1.1, Out: 4.4, CacheRead: 0.55},
	"o3":               {In: 2, Out: 8, CacheRead: 0.5},
	"gemini-2.5-pro":   {In: 1.25, Out: 10, CacheRead: 0.31},
	"gemini-2.5-flash": {In: 0.3, Out: 2.5, CacheRead: 0.075},
	"gemini-2.0-flash": {In: 0.1, Out: 0.4, CacheRead: 0.025},
	"deepseek":         {In: 0.27, Out: 1.1, CacheRead: 0.07},
	"grok":             {In: 3, Out: 15, CacheRead: 0.75},
	"mistral-large":    {In: 2, Out: 6},
	"mistral-small":    {In: 0.1, Out: 0.3},
}

// CostFor returns the catalog prices for a model id, matching the longest
// known substring, or ok=false when the family is not priced.
func CostFor(model string) (ModelCost, bool) {
	id := strings.ToLower(model)
	var best ModelCost
	bestLen := 0
	for key, cost := range modelCosts {
		if len(key) > bestLen && strings.Contains(id, key) {
			best, bestLen = cost, len(key)
		}
	}
	return best, bestLen > 0
}

// EstimateCostUSD prices a token breakdown against the catalog. in must be
// the *billed* input tokens (cache reads already subtracted where the
// provider folds them into the prompt count). Unpriced cache traffic falls
// back to the input rate.
func EstimateCostUSD(model string, in, cacheRead, cacheWrite, out int) (float64, bool) {
	cost, ok := CostFor(model)
	if !ok {
		return 0, false
	}
	readRate := cost.CacheRead
	if readRate == 0 {
		readRate = cost.In
	}
	writeRate := cost.CacheWrite
	if writeRate == 0 {
		writeRate = cost.In
	}
	const mtok = 1_000_000
	usd := float64(in)/mtok*cost.In +
		float64(cacheRead)/mtok*readRate +
		float64(cacheWrite)/mtok*writeRate +
		float64(out)/mtok*cost.Out
	return usd, true
}
