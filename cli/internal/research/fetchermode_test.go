package research

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"kaioken/internal/config"
	"kaioken/internal/webfetch"
	"kaioken/internal/websearch"
)

// ── Fetcher mode ──────────────────────────────────────────────────────────

// stubProvider stands in for a search provider so the Firecrawl rule — its
// scrape API is only in play when its key already backs the search side — can
// be exercised without a network or a key.
type stubProvider struct{ name string }

func (s stubProvider) Name() string { return s.name }
func (s stubProvider) Search(context.Context, string, int) ([]websearch.Result, error) {
	return nil, nil
}

// noBrowser points discovery at a path that does not exist, so the headless
// tier is unavailable no matter what is installed on the machine running this.
func noBrowser(t *testing.T) {
	t.Helper()
	t.Setenv(webfetch.BrowserPathEnv, filepath.Join(t.TempDir(), "no-such-browser"))
}

func TestResolveFetcherRejectsUnknownMode(t *testing.T) {
	opts := Options{FetcherMode: "browserless"}
	_, _, err := resolveFetcher(opts, &config.Global{}, stubProvider{name: "tavily"})
	if err == nil {
		t.Fatal("err = nil, want an unknown-mode error")
	}
	// The message has to name the alternatives; a bare rejection makes the
	// user go read the source.
	for _, want := range []string{"auto", "http", "headless", "firecrawl"} {
		if !strings.Contains(err.Error(), want) {
			t.Errorf("err = %q, want it to mention %q", err.Error(), want)
		}
	}
}

func TestResolveFetcherHTTPModeNeverStartsABrowser(t *testing.T) {
	opts := Options{FetcherMode: "http"}
	got, detail, err := resolveFetcher(opts, &config.Global{}, stubProvider{name: "tavily"})
	if err != nil {
		t.Fatal(err)
	}
	if _, ok := got.(*webfetch.Fetcher); !ok {
		t.Errorf("got %T, want the plain *webfetch.Fetcher", got)
	}
	if detail == "" {
		t.Error("detail is empty, want a sentence naming the tier")
	}
}

func TestResolveFetcherKeepsAnExplicitOptionsFetcher(t *testing.T) {
	stub := &fakeFetcher{}
	opts := Options{Fetcher: stub, FetcherMode: "headless"}
	got, _, err := resolveFetcher(opts, &config.Global{}, stubProvider{name: "tavily"})
	if err != nil {
		t.Fatal(err)
	}
	if got != Fetcher(stub) {
		t.Errorf("got %T, want the caller-supplied fetcher to win over the mode", got)
	}
}

func TestResolveFetcherPrefersFirecrawlWhenItsKeyBacksTheSearchProvider(t *testing.T) {
	global := &config.Global{Keys: map[string]string{"firecrawl": "fc-test-key"}}
	got, detail, err := resolveFetcher(Options{}, global, stubProvider{name: "firecrawl"})
	if err != nil {
		t.Fatal(err)
	}
	if _, ok := got.(*webfetch.FirecrawlFetcher); !ok {
		t.Errorf("got %T, want a *webfetch.FirecrawlFetcher", got)
	}
	if !strings.Contains(detail, "Firecrawl") {
		t.Errorf("detail = %q, want it to name Firecrawl", detail)
	}
}

func TestResolveFetcherIgnoresFirecrawlWhenItIsNotTheSearchProvider(t *testing.T) {
	// A key on its own is not enough: pinning tavily means no Firecrawl calls.
	global := &config.Global{Keys: map[string]string{"firecrawl": "fc-test-key"}}
	got, _, err := resolveFetcher(Options{}, global, stubProvider{name: "tavily"})
	if err != nil {
		t.Fatal(err)
	}
	if _, ok := got.(*webfetch.FirecrawlFetcher); ok {
		t.Error("got a Firecrawl fetcher, want none when firecrawl is not the search provider")
	}
}

func TestResolveFetcherFirecrawlModeErrorsWithoutAKey(t *testing.T) {
	t.Setenv("FIRECRAWL_API_KEY", "")
	opts := Options{FetcherMode: "firecrawl"}
	_, _, err := resolveFetcher(opts, &config.Global{}, stubProvider{name: "firecrawl"})
	if err == nil {
		t.Fatal("err = nil, want a missing-key error")
	}
	if !strings.Contains(err.Error(), "FIRECRAWL_API_KEY") {
		t.Errorf("err = %q, want it to name the environment variable", err.Error())
	}
}

func TestResolveFetcherFallsBackToHTTPWhenNoBrowserIsInstalled(t *testing.T) {
	noBrowser(t)
	got, detail, err := resolveFetcher(Options{}, &config.Global{}, stubProvider{name: "tavily"})
	if err != nil {
		t.Fatalf("auto must never fail, got %v", err)
	}
	if _, ok := got.(*webfetch.Fetcher); !ok {
		t.Errorf("got %T, want the plain fetcher when there is no browser", got)
	}
	if !strings.Contains(detail, "no local browser") {
		t.Errorf("detail = %q, want it to explain the downgrade", detail)
	}
}

func TestResolveFetcherHeadlessModeFailsLoudlyWithoutABrowser(t *testing.T) {
	noBrowser(t)
	opts := Options{FetcherMode: "headless"}
	_, _, err := resolveFetcher(opts, &config.Global{}, stubProvider{name: "tavily"})
	if err == nil {
		t.Fatal("err = nil, want an explicit headless request to fail when none is installed")
	}
}

func TestResolveFetcherFallsBackToTheGlobalConfigMode(t *testing.T) {
	// KAIOKEN_HOME must be set before anything reads the global config.
	home := t.TempDir()
	t.Setenv(config.HomeEnv, home)
	if err := os.WriteFile(filepath.Join(home, "config.yaml"),
		[]byte("research:\n  fetcher_mode: http\n"), 0o600); err != nil {
		t.Fatal(err)
	}

	global := config.LoadGlobal()
	if global.Research.FetcherMode != "http" {
		t.Fatalf("config did not load: FetcherMode = %q", global.Research.FetcherMode)
	}

	// No mode on Options, so the config's value is what should apply.
	got, _, err := resolveFetcher(Options{}, global, stubProvider{name: "tavily"})
	if err != nil {
		t.Fatal(err)
	}
	if _, ok := got.(*webfetch.Fetcher); !ok {
		t.Errorf("got %T, want the config's http mode to be honoured", got)
	}
}

func TestResolveFetcherOptionsModeBeatsTheConfig(t *testing.T) {
	global := &config.Global{Research: config.Research{FetcherMode: "headless"}}
	noBrowser(t) // so headless would fail if the config won
	got, _, err := resolveFetcher(Options{FetcherMode: "http"}, global, stubProvider{name: "tavily"})
	if err != nil {
		t.Fatal(err)
	}
	if _, ok := got.(*webfetch.Fetcher); !ok {
		t.Errorf("got %T, want the explicit option to beat the config", got)
	}
}
