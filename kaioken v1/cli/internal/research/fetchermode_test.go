package research

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"kaioken/internal/config"
	"kaioken/internal/webfetch"
)

// ── Fetcher mode ──────────────────────────────────────────────────────────

// noBrowser points discovery at a path that does not exist, so the headless
// tier is unavailable no matter what is installed on the machine running this.
func noBrowser(t *testing.T) {
	t.Helper()
	t.Setenv(webfetch.BrowserPathEnv, filepath.Join(t.TempDir(), "no-such-browser"))
}

func TestFetcherTogglesRoundTripEveryMode(t *testing.T) {
	// Every mode has to survive the trip through the two switches a settings
	// screen shows, or the UI and the config drift apart.
	for _, mode := range []string{"", "auto", "firecrawl", "headless", "http"} {
		api, local := FetcherToggles(mode)
		got := FetcherModeFor(api, local)
		want := mode
		if want == "auto" {
			want = "" // both switches on is stored as the empty default
		}
		if got != want {
			t.Errorf("%q -> api=%v local=%v -> %q, want %q", mode, api, local, got, want)
		}
	}
}

func TestFetcherTogglesMapTheFourCombinations(t *testing.T) {
	cases := []struct {
		api, local bool
		want       string
	}{
		{true, true, ""},
		{true, false, "firecrawl"},
		{false, true, "headless"},
		{false, false, "http"},
	}
	for _, c := range cases {
		if got := FetcherModeFor(c.api, c.local); got != c.want {
			t.Errorf("api=%v local=%v = %q, want %q", c.api, c.local, got, c.want)
		}
	}
}

func TestFirecrawlOnlyModeDoesNotStartABrowser(t *testing.T) {
	// api on, local off. The fallback must be a plain fetch: starting a
	// browser would contradict the switch that turned the local tier off.
	global := &config.Global{Keys: map[string]string{"firecrawl": "fc-test-key"}}
	_, detail, err := resolveFetcher(Options{FetcherMode: "firecrawl"}, global)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(detail, "browser") {
		t.Errorf("detail = %q, want no browser in the firecrawl-only fallback", detail)
	}
	if !strings.Contains(detail, "HTTP") {
		t.Errorf("detail = %q, want it to name the HTTP fallback", detail)
	}
}

func TestResolveFetcherRejectsUnknownMode(t *testing.T) {
	opts := Options{FetcherMode: "browserless"}
	_, _, err := resolveFetcher(opts, &config.Global{})
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
	got, detail, err := resolveFetcher(opts, &config.Global{})
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
	got, _, err := resolveFetcher(opts, &config.Global{})
	if err != nil {
		t.Fatal(err)
	}
	if got != Fetcher(stub) {
		t.Errorf("got %T, want the caller-supplied fetcher to win over the mode", got)
	}
}

func TestResolveFetcherUsesFirecrawlWheneverAKeyIsSet(t *testing.T) {
	// The key is the whole signal now — it no longer matters which provider
	// is doing the searching.
	global := &config.Global{Keys: map[string]string{"firecrawl": "fc-test-key"}}
	got, detail, err := resolveFetcher(Options{}, global)
	if err != nil {
		t.Fatal(err)
	}
	if _, ok := got.(*webfetch.FirecrawlFetcher); !ok {
		t.Errorf("got %T, want Firecrawl to read pages whenever its key is set", got)
	}
	if !strings.Contains(detail, "Firecrawl") {
		t.Errorf("detail = %q, want it to name Firecrawl", detail)
	}
}

func TestResolveFetcherReadsTheFirecrawlKeyFromTheEnvironment(t *testing.T) {
	t.Setenv("FIRECRAWL_API_KEY", "fc-from-env")
	got, _, err := resolveFetcher(Options{}, &config.Global{})
	if err != nil {
		t.Fatal(err)
	}
	if _, ok := got.(*webfetch.FirecrawlFetcher); !ok {
		t.Errorf("got %T, want the environment key to count too", got)
	}
}

func TestResolveFetcherHTTPModeStillSkipsFirecrawl(t *testing.T) {
	// The off switch has to keep working now that a key alone turns it on.
	global := &config.Global{Keys: map[string]string{"firecrawl": "fc-test-key"}}
	got, _, err := resolveFetcher(Options{FetcherMode: "http"}, global)
	if err != nil {
		t.Fatal(err)
	}
	if _, ok := got.(*webfetch.Fetcher); !ok {
		t.Errorf("got %T, want http mode to skip Firecrawl entirely", got)
	}
}

func TestResolveFetcherFirecrawlModeErrorsWithoutAKey(t *testing.T) {
	t.Setenv("FIRECRAWL_API_KEY", "")
	opts := Options{FetcherMode: "firecrawl"}
	_, _, err := resolveFetcher(opts, &config.Global{})
	if err == nil {
		t.Fatal("err = nil, want a missing-key error")
	}
	if !strings.Contains(err.Error(), "FIRECRAWL_API_KEY") {
		t.Errorf("err = %q, want it to name the environment variable", err.Error())
	}
}

func TestResolveFetcherFallsBackToHTTPWhenNoBrowserIsInstalled(t *testing.T) {
	noBrowser(t)
	got, detail, err := resolveFetcher(Options{}, &config.Global{})
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
	_, _, err := resolveFetcher(opts, &config.Global{})
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
	got, _, err := resolveFetcher(Options{}, global)
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
	got, _, err := resolveFetcher(Options{FetcherMode: "http"}, global)
	if err != nil {
		t.Fatal(err)
	}
	if _, ok := got.(*webfetch.Fetcher); !ok {
		t.Errorf("got %T, want the explicit option to beat the config", got)
	}
}
