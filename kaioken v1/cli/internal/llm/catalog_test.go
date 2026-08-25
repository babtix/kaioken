package llm

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestCostForLongestMatch(t *testing.T) {
	mini, ok := CostFor("openai/gpt-4o-mini-2024-07-18")
	if !ok || mini.In != 0.15 {
		t.Errorf("gpt-4o-mini matched %+v, ok=%v", mini, ok)
	}
	full, ok := CostFor("openai/gpt-4o")
	if !ok || full.In != 2.5 {
		t.Errorf("gpt-4o matched %+v, ok=%v", full, ok)
	}
	if _, ok := CostFor("somelab/unpriced-model-9b"); ok {
		t.Error("unknown model must not be priced")
	}
}

func TestEstimateCostUSD(t *testing.T) {
	// claude-sonnet: $3/M in, $15/M out, $0.30/M cache read, $3.75/M write.
	usd, ok := EstimateCostUSD("anthropic/claude-sonnet-4.5", 1_000_000, 1_000_000, 1_000_000, 1_000_000)
	if !ok {
		t.Fatal("claude should be priced")
	}
	want := 3.0 + 0.30 + 3.75 + 15.0
	if usd < want-0.001 || usd > want+0.001 {
		t.Errorf("usd = %v, want %v", usd, want)
	}
}

func TestSpendUSDPrefersExact(t *testing.T) {
	c := &Client{Model: "anthropic/claude-sonnet-4.5"}
	cost := 0.5
	c.recordUsage(&usage{PromptTokens: 100, CompletionTokens: 50, Cost: &cost})
	usd, exact, known := c.SpendUSD()
	if !known || !exact || usd != 0.5 {
		t.Errorf("SpendUSD = %v, %v, %v; want 0.5, true, true", usd, exact, known)
	}
}

func TestSpendUSDEstimatesWithoutCost(t *testing.T) {
	c := &Client{Model: "anthropic/claude-sonnet-4.5"}
	c.recordUsage(&usage{PromptTokens: 1_000_000, CompletionTokens: 0})
	usd, exact, known := c.SpendUSD()
	if !known || exact {
		t.Fatalf("SpendUSD known=%v exact=%v; want estimated", known, exact)
	}
	if usd < 2.99 || usd > 3.01 {
		t.Errorf("usd = %v, want ~3.00", usd)
	}

	// Unpriced model: no estimate, guard stays silent.
	u := &Client{Model: "somelab/unpriced"}
	u.recordUsage(&usage{PromptTokens: 1000})
	if _, _, known := u.SpendUSD(); known {
		t.Error("unpriced model must report unknown spend")
	}
}

func TestRecordUsageCacheAccounting(t *testing.T) {
	// OpenAI style: cached tokens ride inside prompt_tokens.
	c := &Client{Model: "openai/gpt-4o"}
	c.recordUsage(&usage{
		PromptTokens:     1000,
		CompletionTokens: 10,
		PromptTokensDetails: &struct {
			CachedTokens int `json:"cached_tokens"`
		}{CachedTokens: 600},
	})
	read, write := c.CacheUsage()
	if read != 600 || write != 0 {
		t.Errorf("cache = (%d,%d), want (600,0)", read, write)
	}
	if c.billedToks != 400 {
		t.Errorf("billed = %d, want 400", c.billedToks)
	}

	// Anthropic style: cache traffic arrives outside input_tokens.
	a := &Client{Model: "claude-sonnet-4.5"}
	a.recordUsage(&usage{PromptTokens: 200, CompletionTokens: 5, cacheRead: 5000, cacheWrite: 300})
	read, write = a.CacheUsage()
	if read != 5000 || write != 300 {
		t.Errorf("anthropic cache = (%d,%d), want (5000,300)", read, write)
	}
	if a.billedToks != 200 {
		t.Errorf("anthropic billed = %d, want 200", a.billedToks)
	}
}

func TestWithThinkingDialects(t *testing.T) {
	body := []byte(`{"model":"m","temperature":0.3,"max_tokens":8192}`)

	// Off and empty leave the body alone.
	c := &Client{BaseURL: "https://openrouter.ai/api/v1"}
	if got := c.withThinking(body, 8192); string(got) != string(body) {
		t.Error("empty level must not rewrite the body")
	}

	// OpenRouter dialect.
	c.Thinking = "high"
	var m map[string]json.RawMessage
	if err := json.Unmarshal(c.withThinking(body, 8192), &m); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(m["reasoning"]), "high") {
		t.Errorf("openrouter body missing reasoning: %s", m["reasoning"])
	}

	// OpenAI dialect.
	oa := &Client{BaseURL: "https://api.openai.com/v1", Thinking: "medium"}
	m = nil // Unmarshal merges into an existing map; start clean per dialect
	if err := json.Unmarshal(oa.withThinking(body, 8192), &m); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(m["reasoning_effort"]), "medium") {
		t.Errorf("openai body missing reasoning_effort: %s", m["reasoning_effort"])
	}

	// Anthropic dialect: budget inside the ceiling, temperature dropped.
	an := &Client{BaseURL: "https://api.anthropic.com/v1", Protocol: protocolAnthropic, Thinking: "high"}
	m = nil
	if err := json.Unmarshal(an.withThinking(body, 8192), &m); err != nil {
		t.Fatal(err)
	}
	var th struct {
		Type   string `json:"type"`
		Budget int    `json:"budget_tokens"`
	}
	if err := json.Unmarshal(m["thinking"], &th); err != nil {
		t.Fatalf("anthropic body missing thinking: %v", err)
	}
	if th.Type != "enabled" || th.Budget >= 8192 || th.Budget < 1024 {
		t.Errorf("thinking = %+v, want enabled with budget inside the ceiling", th)
	}
	if _, hasTemp := m["temperature"]; hasTemp {
		t.Error("anthropic thinking must drop the explicit temperature")
	}

	// Unknown host: never risk an unknown key.
	other := &Client{BaseURL: "https://api.groq.com/openai/v1", Thinking: "high"}
	if got := other.withThinking(body, 8192); string(got) != string(body) {
		t.Error("unknown host must not be rewritten")
	}
}
