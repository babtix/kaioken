package llm

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

const nvidiaFunction404Body = `{"status":"404","title":"Not Found","detail":"Function '23d4f03a-b8a6-4adb-a183-7daa083a09cc': Not found for account 'xQ3OPPbk9JmxOpLx3Wk5nAc87igs6geDlWEudJsic4'"}`

func TestNvidia404StateMachine(t *testing.T) {
	newClient := func(base string) *Client {
		return &Client{BaseURL: base, Model: "moonshotai/kimi-k2.6"}
	}
	functionErr := errors.New("provider HTTP 404: " + nvidiaFunction404Body)
	plainErr := errors.New("provider HTTP 404: 404 page not found")

	// Non-NVIDIA providers are never touched by the fallback.
	other := newClient("https://openrouter.ai/api/v1")
	if other.nvidia404(functionErr) {
		t.Error("fallback must not trigger for non-NVIDIA base URLs")
	}

	c := newClient("https://integrate.api.nvidia.com/v1")

	// 1. Generic router refusal → switch to the model-specific URL.
	if !c.nvidia404(functionErr) {
		t.Fatal("expected a retry after the generic router refusal")
	}
	if !c.nvidiaModelURL || !c.nvidiaTriedFallback {
		t.Errorf("state = (model=%v tried=%v), want (true, true)", c.nvidiaModelURL, c.nvidiaTriedFallback)
	}
	if got, want := c.chatURL(), "https://integrate.api.nvidia.com/v1/chat/completions/moonshotai/kimi-k2.6"; got != want {
		t.Errorf("chatURL = %q, want %q", got, want)
	}

	// 2. Model-specific URL does not exist → revert to the generic one.
	if !c.nvidia404(plainErr) {
		t.Fatal("expected a retry after the model-specific URL 404")
	}
	if c.nvidiaModelURL {
		t.Error("client must revert to the generic URL")
	}

	// 3. Back on the generic URL, already tried the fallback → stop and let
	// the account error surface.
	if c.nvidia404(functionErr) {
		t.Error("fallback must not ping-pong a second time")
	}

	// Non-404 errors never participate in the fallback.
	c2 := newClient("https://integrate.api.nvidia.com/v1")
	if c2.nvidia404(errors.New("provider HTTP 500: boom")) {
		t.Error("fallback must not trigger on non-404 errors")
	}
}

// nvidiaRewrite redirects requests addressed to integrate.api.nvidia.com to a
// local test server, preserving the path so URL-shape assertions still hold.
type nvidiaRewrite struct{ host string }

func (rt nvidiaRewrite) RoundTrip(r *http.Request) (*http.Response, error) {
	r2 := r.Clone(r.Context())
	r2.URL.Scheme = "http"
	r2.URL.Host = rt.host
	return http.DefaultTransport.RoundTrip(r2)
}

func newNvidiaTestClient(t *testing.T, h http.HandlerFunc) *Client {
	t.Helper()
	srv := httptest.NewServer(h)
	t.Cleanup(srv.Close)
	return &Client{
		APIKey:  "test",
		BaseURL: "https://integrate.api.nvidia.com/v1",
		Model:   "moonshotai/kimi-k2.6",
		HTTP: &http.Client{
			Timeout:   10 * time.Second,
			Transport: nvidiaRewrite{host: strings.TrimPrefix(srv.URL, "http://")},
		},
	}
}

// When the model-specific invoke URL does not exist for the model, the client
// must revert to the generic endpoint and surface the genuine account error —
// with the actionable hint — instead of a bare "404 page not found".
func TestNvidiaFallbackSurfacesAccountError(t *testing.T) {
	var paths []string
	c := newNvidiaTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		paths = append(paths, r.URL.Path)
		w.WriteHeader(http.StatusNotFound)
		if r.URL.Path == "/v1/chat/completions" {
			io.WriteString(w, nvidiaFunction404Body)
			return
		}
		io.WriteString(w, "404 page not found\n")
	})

	_, err := c.Chat(context.Background(), "sys", "hi")
	if err == nil {
		t.Fatal("expected an error")
	}
	msg := err.Error()
	if !strings.Contains(msg, "Not found for account") {
		t.Errorf("error must carry the genuine account refusal, got: %s", msg)
	}
	if !strings.Contains(msg, "Public API Endpoints") {
		t.Errorf("error must carry the remediation hint, got: %s", msg)
	}
	want := []string{
		"/v1/chat/completions",
		"/v1/chat/completions/moonshotai/kimi-k2.6",
		"/v1/chat/completions",
	}
	if fmt.Sprint(paths) != fmt.Sprint(want) {
		t.Errorf("request paths = %v, want %v", paths, want)
	}

	// A follow-up turn must not repeat the probe: one request, straight to
	// the point.
	paths = nil
	_, err = c.Chat(context.Background(), "sys", "hi again")
	if err == nil || !strings.Contains(err.Error(), "Public API Endpoints") {
		t.Fatalf("follow-up error = %v, want the hinted account error", err)
	}
	if fmt.Sprint(paths) != fmt.Sprint([]string{"/v1/chat/completions"}) {
		t.Errorf("follow-up paths = %v, want a single generic-endpoint call", paths)
	}
}

// When the model-specific invoke URL works, the fallback must stick with it
// and the turn must succeed.
func TestNvidiaFallbackModelURLWorks(t *testing.T) {
	c := newNvidiaTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/v1/chat/completions" {
			w.WriteHeader(http.StatusNotFound)
			io.WriteString(w, nvidiaFunction404Body)
			return
		}
		io.WriteString(w, `{"choices":[{"message":{"role":"assistant","content":"ok via model URL"}}]}`)
	})

	got, err := c.Chat(context.Background(), "sys", "hi")
	if err != nil {
		t.Fatal(err)
	}
	if got != "ok via model URL" {
		t.Errorf("content = %q", got)
	}
	if !c.nvidiaModelURL {
		t.Error("client must keep using the working model-specific URL")
	}
}

func TestRepairJSON(t *testing.T) {
	cases := []struct {
		name string
		in   string
		want string
	}{
		{"bare keys", `{id: "x", title: "y"}`, `{"id": "x", "title": "y"}`},
		{"nested bare keys", "{modules: [{id: \"a\", scope: [\"cmd/\",]}],}",
			`{"modules": [{"id": "a", "scope": ["cmd/"]}]}`},
		{"string contents untouched", `{"s": "key: value, {bare: yes}"}`, `{"s": "key: value, {bare: yes}"}`},
		{"literals kept bare", `{"a": true, "b": null, "c": false}`, `{"a": true, "b": null, "c": false}`},
		{"trailing commas", `{"a": [1, 2,], "b": {"c": 3,},}`,
			`{"a": [1, 2], "b": {"c": 3}}`},
		{"escaped quote in string", `{k: "say \"hi\"", j: 2}`, `{"k": "say \"hi\"", "j": 2}`},
	}
	for _, tc := range cases {
		if got := repairJSON(tc.in); got != tc.want {
			t.Errorf("%s: repairJSON(%q) = %q, want %q", tc.name, tc.in, got, tc.want)
		}
	}
}

// A model that answers with relaxed JSON (bare keys, trailing prose) must be
// decoded by the repair pass without costing an extra round trip.
func TestChatJSONRepairsRelaxedJSON(t *testing.T) {
	content := "{modules: [{id: \"core\", title: \"Core\",}]}\n\nBut note: I split it because\u2026"
	enc, _ := json.Marshal(content)
	var calls int
	c := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		calls++
		io.WriteString(w, `{"choices":[{"message":{"role":"assistant","content":`+
			string(enc)+`}}]}`)
	})

	var out struct {
		Modules []struct {
			ID    string `json:"id"`
			Title string `json:"title"`
		} `json:"modules"`
	}
	if err := c.ChatJSON(context.Background(), "sys", "user", &out); err != nil {
		t.Fatal(err)
	}
	if calls != 1 {
		t.Errorf("repair pass must not need a model retry, got %d calls", calls)
	}
	if len(out.Modules) != 1 || out.Modules[0].ID != "core" {
		t.Errorf("modules = %+v, want one module with id core", out.Modules)
	}
}

// When neither strict parsing nor repair works, the model gets exactly one
// chance to fix its own output.
func TestChatJSONRetryRound(t *testing.T) {
	var calls int
	c := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		calls++
		body := `{"choices":[{"message":{"role":"assistant","content":"{ \u2026 }"}}]}`
		if calls > 1 {
			body = `{"choices":[{"message":{"role":"assistant","content":"{\"ok\": true}"}}]}`
		}
		io.WriteString(w, body)
	})

	var out struct {
		OK bool `json:"ok"`
	}
	if err := c.ChatJSON(context.Background(), "sys", "user", &out); err != nil {
		t.Fatal(err)
	}
	if calls != 2 {
		t.Errorf("calls = %d, want exactly one repair round", calls)
	}
	if !out.OK {
		t.Error("repaired reply must be decoded")
	}
}

func TestNormalizeBaseURL(t *testing.T) {
	cases := []struct {
		input string
		want  string
	}{
		{"https://openrouter.ai/api/v1", "https://openrouter.ai/api/v1"},
		{"https://openrouter.ai/api/v1/", "https://openrouter.ai/api/v1"},
		{"https://openrouter.ai/api/v1//", "https://openrouter.ai/api/v1"},
		{"https://openrouter.ai/api/v1/chat/completions", "https://openrouter.ai/api/v1"},
		{"https://openrouter.ai/api/v1/chat/completions/", "https://openrouter.ai/api/v1"},
		{"  https://api.openai.com/v1/   ", "https://api.openai.com/v1"},
		{"https://api.anthropic.com/v1/messages", "https://api.anthropic.com/v1"},
		{"https://openrouter.ai/api/v1/models", "https://openrouter.ai/api/v1"},
	}
	for _, tc := range cases {
		if got := NormalizeBaseURL(tc.input); got != tc.want {
			t.Errorf("NormalizeBaseURL(%q) = %q, want %q", tc.input, got, tc.want)
		}
	}
}

