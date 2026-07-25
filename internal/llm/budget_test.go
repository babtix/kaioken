package llm

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
)

// A real 402 body: OpenRouter nests every upstream provider that declined
// under previous_errors, each with its own affordability number.
const credit402 = `{"error":{"message":"This request requires more credits, or fewer max_tokens. ` +
	`You requested up to 32768 tokens, but can only afford 10757.","code":402,` +
	`"metadata":{"provider_name":null,"previous_errors":[{"code":402,"message":` +
	`"This request requires more credits, or fewer max_tokens. You requested up to 65536 tokens, ` +
	`but can only afford 5842."}]}}}`

// The smallest number in the body is the only safe one to trust — the larger
// ones came from providers that also refused.
func TestAffordableTokensTakesTheSmallest(t *testing.T) {
	err := fmt.Errorf("provider HTTP 402: %s", credit402)
	got, ok := affordableTokens(err)
	if !ok {
		t.Fatal("a 402 body with affordability numbers should yield a ceiling")
	}
	if got != 5842 {
		t.Errorf("ceiling = %d, want 5842 (the smallest offered)", got)
	}
}

func TestAffordableTokensIgnoresOtherErrors(t *testing.T) {
	for _, err := range []error{
		nil,
		fmt.Errorf("provider HTTP 401: missing auth"),
		fmt.Errorf("provider HTTP 500: boom"),
		fmt.Errorf("context canceled"),
	} {
		if _, ok := affordableTokens(err); ok {
			t.Errorf("%v should not yield a token ceiling", err)
		}
	}
}

// A ceiling too small to hold a useful reply means the account is empty, not
// that we should keep shrinking.
func TestAffordableTokensRejectsUselesslySmallCeilings(t *testing.T) {
	err := fmt.Errorf("provider HTTP 402: can only afford 12 tokens")
	if _, ok := affordableTokens(err); ok {
		t.Error("a ceiling below the useful floor should be refused")
	}
}

func TestTokenCeilingPrefersTheLowerOfConfigAndLearned(t *testing.T) {
	c := &Client{}
	if got := c.tokenCeiling(); got != DefaultMaxTokens {
		t.Errorf("unconfigured ceiling = %d, want the default %d", got, DefaultMaxTokens)
	}

	c.MaxTokens = 4000
	if got := c.tokenCeiling(); got != 4000 {
		t.Errorf("configured ceiling = %d, want 4000", got)
	}

	c.learnCeiling(1500)
	if got := c.tokenCeiling(); got != 1500 {
		t.Errorf("learned ceiling should win when lower, got %d", got)
	}

	// A later, more generous report must not raise the cap back up.
	c.learnCeiling(9000)
	if got := c.tokenCeiling(); got != 1500 {
		t.Errorf("the ceiling must only ratchet down, got %d", got)
	}
}

func TestWithMaxTokens(t *testing.T) {
	body := []byte(`{"model":"m","messages":[{"role":"user","content":"hi"}]}`)

	out := withMaxTokens(body, 1234)
	var m map[string]any
	if err := json.Unmarshal(out, &m); err != nil {
		t.Fatalf("rewritten body is not valid JSON: %v", err)
	}
	if m["max_tokens"] != float64(1234) {
		t.Errorf("max_tokens = %v, want 1234", m["max_tokens"])
	}
	if m["model"] != "m" {
		t.Error("rewriting max_tokens dropped other fields")
	}

	// A zero cap and an unparseable body both pass through untouched rather
	// than failing the call.
	if string(withMaxTokens(body, 0)) != string(body) {
		t.Error("a zero cap should leave the body alone")
	}
	if got := withMaxTokens([]byte("not json"), 10); string(got) != "not json" {
		t.Errorf("an unparseable body should pass through, got %q", got)
	}
}

// The whole point: a 402 must be retried once at the ceiling the provider
// named, without the caller ever seeing an error.
func TestRawChatRetriesAtTheAffordableCeiling(t *testing.T) {
	var mu sync.Mutex
	var seen []int

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body map[string]any
		json.NewDecoder(r.Body).Decode(&body)
		n, _ := body["max_tokens"].(float64)

		mu.Lock()
		seen = append(seen, int(n))
		first := len(seen) == 1
		mu.Unlock()

		if first {
			w.WriteHeader(http.StatusPaymentRequired)
			w.Write([]byte(credit402))
			return
		}
		w.Write([]byte(`{"choices":[{"message":{"content":"ok"}}]}`))
	}))
	defer srv.Close()

	c := &Client{APIKey: "k", BaseURL: srv.URL, Model: "m", HTTP: srv.Client(), MaxTokens: 20000}
	got, err := c.Chat(context.Background(), "sys", "user")
	if err != nil {
		t.Fatalf("the 402 should have been recovered from: %v", err)
	}
	if got != "ok" {
		t.Errorf("reply = %q, want %q", got, "ok")
	}

	mu.Lock()
	defer mu.Unlock()
	if len(seen) != 2 {
		t.Fatalf("expected exactly one retry, got %d requests: %v", len(seen), seen)
	}
	if seen[0] != 20000 {
		t.Errorf("first request sent max_tokens=%d, want the configured 20000", seen[0])
	}
	if seen[1] != 5842 {
		t.Errorf("retry sent max_tokens=%d, want the affordable 5842", seen[1])
	}

	// The lesson must stick, so the next call does not repeat the mistake.
	if got := c.tokenCeiling(); got != 5842 {
		t.Errorf("ceiling after recovery = %d, want it remembered as 5842", got)
	}
}

// When the account simply cannot pay, the user gets an actionable sentence
// rather than nested provider JSON.
func TestRawChatReportsCreditExhaustionReadably(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusPaymentRequired)
		w.Write([]byte(credit402))
	}))
	defer srv.Close()

	c := &Client{APIKey: "k", BaseURL: srv.URL, Model: "m", HTTP: srv.Client()}
	_, err := c.Chat(context.Background(), "sys", "user")
	if err == nil {
		t.Fatal("a persistent 402 should surface an error")
	}
	msg := err.Error()
	for _, want := range []string{"out of credits", "openrouter.ai/settings/credits", "max_tokens"} {
		if !strings.Contains(msg, want) {
			t.Errorf("error should mention %q, got: %s", want, msg)
		}
	}
}

// Every request carries an explicit cap, because the provider reserves credit
// against it — leaving it unset is what made a large model unaffordable.
func TestEveryRequestCarriesAMaxTokensCap(t *testing.T) {
	got := make(chan float64, 1)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body map[string]any
		json.NewDecoder(r.Body).Decode(&body)
		n, _ := body["max_tokens"].(float64)
		got <- n
		w.Write([]byte(`{"choices":[{"message":{"content":"ok"}}]}`))
	}))
	defer srv.Close()

	c := &Client{APIKey: "k", BaseURL: srv.URL, Model: "m", HTTP: srv.Client()}
	if _, err := c.Chat(context.Background(), "sys", "user"); err != nil {
		t.Fatalf("Chat: %v", err)
	}
	if n := <-got; int(n) != DefaultMaxTokens {
		t.Errorf("max_tokens = %v, want the default %d", n, DefaultMaxTokens)
	}
}
