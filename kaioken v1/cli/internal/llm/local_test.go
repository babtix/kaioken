package llm

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestIsLocalCoversBuiltins(t *testing.T) {
	for _, name := range []string{"ollama", "lmstudio", "llamacpp", "vllm", "jan"} {
		if !IsLocal(name) {
			t.Errorf("%s not recognised as local", name)
		}
	}
	if IsLocal("openrouter") || IsLocal("anthropic") {
		t.Error("a hosted provider was classified as local")
	}
}

func TestNewForProviderSkipsKeyForLocal(t *testing.T) {
	// The whole point of local support: no key, no error.
	c, err := NewForProvider("ollama", "", "llama3.2", "")
	if err != nil {
		t.Fatalf("local provider demanded a key: %v", err)
	}
	if c.BaseURL != "http://localhost:11434/v1" {
		t.Errorf("base URL = %q", c.BaseURL)
	}

	// A hosted provider must still refuse.
	if _, err := NewForProvider("openai", "", "gpt-4o", ""); err == nil {
		t.Error("hosted provider accepted an empty key")
	}
}

func TestNewLocalRequiresModel(t *testing.T) {
	_, err := NewLocal("ollama", "", "")
	if err == nil {
		t.Fatal("empty model accepted")
	}
	if !strings.Contains(err.Error(), "kaioken models") {
		t.Errorf("error does not point at the discovery command: %v", err)
	}
}

func TestNewLocalUsesGenerousTimeout(t *testing.T) {
	c, err := NewLocal("ollama", "", "llama3.2")
	if err != nil {
		t.Fatal(err)
	}
	// A hosted client caps at 300s; local CPU generation routinely exceeds it.
	if c.HTTP.Timeout <= 300e9 {
		t.Errorf("local timeout = %s, want more than the hosted 5m ceiling", c.HTTP.Timeout)
	}
}

func TestProbeLocalListsModels(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/models" {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"data":[{"id":"qwen3:8b"},{"id":"llama3.2"}]}`))
	}))
	defer srv.Close()

	st := ProbeLocal(context.Background(), LocalProvider{
		Name: "test", Label: "Test", BaseURL: srv.URL + "/v1",
	})
	if !st.Running {
		t.Fatalf("probe reported not running: %s", st.Error)
	}
	if len(st.Models) != 2 {
		t.Fatalf("models = %v, want 2", st.Models)
	}
	// Sorted, so the UI ordering does not depend on server whim.
	if st.Models[0] != "llama3.2" {
		t.Errorf("models not sorted: %v", st.Models)
	}
}

func TestProbeLocalReadsOllamaNativeShape(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`{"models":[{"name":"nomic-embed-text"}]}`))
	}))
	defer srv.Close()

	st := ProbeLocal(context.Background(), LocalProvider{Name: "t", BaseURL: srv.URL})
	if !st.Running || len(st.Models) != 1 || st.Models[0] != "nomic-embed-text" {
		t.Errorf("native tags shape not handled: %+v", st)
	}
}

func TestProbeLocalExplainsRefusedConnection(t *testing.T) {
	// Port 1 is reserved and nothing listens there.
	st := ProbeLocal(context.Background(), LocalProvider{
		Name: "ollama", Label: "Ollama", BaseURL: "http://127.0.0.1:1/v1",
	})
	if st.Running {
		t.Fatal("probe claimed a dead endpoint was running")
	}
	if !strings.Contains(st.Error, "Ollama") {
		t.Errorf("error does not name the server to start: %q", st.Error)
	}
}

func TestProbeLocalRejectsNonCompatibleEndpoint(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`<html>not an api</html>`))
	}))
	defer srv.Close()

	st := ProbeLocal(context.Background(), LocalProvider{Name: "t", BaseURL: srv.URL})
	if st.Running {
		t.Fatal("an HTML page was accepted as an OpenAI-compatible API")
	}
	if !strings.Contains(st.Error, "not OpenAI-compatible") {
		t.Errorf("unhelpful error: %q", st.Error)
	}
}

func TestRegisterLocalJoinsProviderRegistry(t *testing.T) {
	if err := RegisterLocal(LocalProvider{Name: "mybox", BaseURL: "http://10.0.0.5:8000/v1/"}); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		delete(Providers, "mybox")
		localMu.Lock()
		delete(localExtra, "mybox")
		localMu.Unlock()
	})

	if !IsLocal("mybox") {
		t.Error("registered endpoint is not local")
	}
	if p, ok := Providers["mybox"]; !ok || p.BaseURL != "http://10.0.0.5:8000/v1" {
		t.Errorf("not in the provider registry with a trimmed URL: %+v", Providers["mybox"])
	}
	c, err := NewForProvider("mybox", "", "some-model", "")
	if err != nil {
		t.Fatalf("custom local endpoint needs no key: %v", err)
	}
	if c.BaseURL != "http://10.0.0.5:8000/v1" {
		t.Errorf("client base URL = %q", c.BaseURL)
	}
}

func TestRegisterLocalRejectsHostedNameCollision(t *testing.T) {
	err := RegisterLocal(LocalProvider{Name: "anthropic", BaseURL: "http://localhost:9/v1"})
	if err == nil {
		t.Fatal("shadowing a built-in hosted provider was allowed")
	}
}

func TestRegisterLocalRequiresBothFields(t *testing.T) {
	if err := RegisterLocal(LocalProvider{Name: "x"}); err == nil {
		t.Error("missing base_url accepted")
	}
	if err := RegisterLocal(LocalProvider{BaseURL: "http://localhost:1/v1"}); err == nil {
		t.Error("missing name accepted")
	}
}

func TestDiscoverLocalReturnsEveryKnownEndpoint(t *testing.T) {
	found := DiscoverLocal(context.Background())
	if len(found) < len(LocalDefaults) {
		t.Errorf("discovered %d endpoints, want at least %d", len(found), len(LocalDefaults))
	}
	// Nothing is expected to be running in CI; the contract is that each entry
	// reports a reason rather than being silently omitted.
	for _, st := range found {
		if !st.Running && st.Error == "" {
			t.Errorf("%s is neither running nor explained", st.Name)
		}
	}
}
