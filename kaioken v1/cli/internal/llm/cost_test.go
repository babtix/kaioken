package llm

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// A buffered response carrying OpenRouter's usage-accounting cost must
// accumulate into CostUSD, and the request must have asked for it.
func TestCostAccountingBuffered(t *testing.T) {
	var gotBody map[string]json.RawMessage
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		json.NewDecoder(r.Body).Decode(&gotBody)
		w.Write([]byte(`{"choices":[{"message":{"content":"ok"}}],
			"usage":{"prompt_tokens":10,"completion_tokens":5,"cost":0.0123}}`))
	}))
	defer srv.Close()

	// The client believes it talks to OpenRouter; the URL override keeps the
	// traffic on the test server.
	c := &Client{APIKey: "k", BaseURL: srv.URL, Model: "m", HTTP: srv.Client()}
	c.BaseURL = srv.URL // sanity: not an openrouter host — no usage key expected

	if _, err := c.Chat(context.Background(), "s", "u"); err != nil {
		t.Fatal(err)
	}
	if _, ok := gotBody["usage"]; ok {
		t.Error("usage accounting requested from a non-OpenRouter endpoint")
	}
	// Cost still accumulates if a provider volunteers it.
	if usd, known := c.CostUSD(); !known || usd != 0.0123 {
		t.Errorf("CostUSD = %v, %v; want 0.0123, true", usd, known)
	}

	// Same server, but the client thinks it is OpenRouter via a redirecting
	// transport — now the request must carry the usage key.
	c2 := &Client{APIKey: "k", BaseURL: "https://openrouter.ai/api/v1", Model: "m",
		HTTP: &http.Client{Transport: rewriteHost{srv}}}
	if _, err := c2.Chat(context.Background(), "s", "u"); err != nil {
		t.Fatal(err)
	}
	raw, ok := gotBody["usage"]
	if !ok || !strings.Contains(string(raw), "true") {
		t.Errorf("openrouter request body missing usage accounting, got %s", raw)
	}
	if _, err := c2.Chat(context.Background(), "s", "u"); err != nil {
		t.Fatal(err)
	}
	if usd, known := c2.CostUSD(); !known || usd < 0.0245 || usd > 0.0247 {
		t.Errorf("CostUSD after two calls = %v, %v; want ~0.0246, true", usd, known)
	}
}

// rewriteHost sends every request to the test server regardless of URL.
type rewriteHost struct{ srv *httptest.Server }

func (rt rewriteHost) RoundTrip(req *http.Request) (*http.Response, error) {
	u := *req.URL
	u.Scheme = "http"
	u.Host = strings.TrimPrefix(rt.srv.URL, "http://")
	req.URL = &u
	return rt.srv.Client().Transport.RoundTrip(req)
}

// A response with no cost field must leave the figure unknown — 0 spent and
// "free so far" are different claims.
func TestCostUnknownWithoutCostField(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`{"choices":[{"message":{"content":"ok"}}],
			"usage":{"prompt_tokens":10,"completion_tokens":5}}`))
	}))
	defer srv.Close()

	c := &Client{APIKey: "k", BaseURL: srv.URL, Model: "m", HTTP: srv.Client()}
	if _, err := c.Chat(context.Background(), "s", "u"); err != nil {
		t.Fatal(err)
	}
	if usd, known := c.CostUSD(); known || usd != 0 {
		t.Errorf("CostUSD = %v, %v; want 0, false", usd, known)
	}
	// A free-tier $0 IS a known figure.
	zero := 0.0
	c.recordUsage(&usage{Cost: &zero})
	if _, known := c.CostUSD(); !known {
		t.Error("explicit cost 0 should mark spend as known")
	}
}

// The streaming path must also request accounting and pick the cost out of
// the final usage frame.
func TestCostAccountingStreaming(t *testing.T) {
	var gotBody map[string]json.RawMessage
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		json.NewDecoder(r.Body).Decode(&gotBody)
		w.Header().Set("Content-Type", "text/event-stream")
		w.Write([]byte("data: {\"choices\":[{\"delta\":{\"content\":\"hi\"}}]}\n\n" +
			"data: {\"choices\":[],\"usage\":{\"prompt_tokens\":7,\"completion_tokens\":3,\"cost\":0.005}}\n\n" +
			"data: [DONE]\n\n"))
	}))
	defer srv.Close()

	c := &Client{APIKey: "k", BaseURL: "https://openrouter.ai/api/v1", Model: "m",
		HTTP: &http.Client{Transport: rewriteHost{srv}}}
	msg, err := c.ChatWithToolsStream(context.Background(), []Message{{Role: "user", Content: "u"}}, nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	if msg.Content != "hi" {
		t.Errorf("content = %q", msg.Content)
	}
	if raw, ok := gotBody["usage"]; !ok || !strings.Contains(string(raw), "true") {
		t.Errorf("streaming body missing usage accounting, got %s", raw)
	}
	if usd, known := c.CostUSD(); !known || usd != 0.005 {
		t.Errorf("CostUSD = %v, %v; want 0.005, true", usd, known)
	}
}

// withUsageAccounting must be a no-op on unparseable bodies and must not
// clobber other keys.
func TestWithUsageAccounting(t *testing.T) {
	out := withUsageAccounting([]byte(`{"model":"m","max_tokens":100}`))
	var m map[string]json.RawMessage
	if err := json.Unmarshal(out, &m); err != nil {
		t.Fatal(err)
	}
	if string(m["max_tokens"]) != "100" || !strings.Contains(string(m["usage"]), "true") {
		t.Errorf("rewritten body = %s", out)
	}
	if got := withUsageAccounting([]byte("not json")); string(got) != "not json" {
		t.Errorf("unparseable body must pass through, got %s", got)
	}
}
