package daemon

import (
	"net/http"
	"strings"
	"testing"
)

// ── Fetcher settings ──────────────────────────────────────────────────────

// isolatedHome points the global config at a temp directory. Every variable
// os.UserHomeDir consults has to move, or the test writes to the real config.
func isolatedHome(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	t.Setenv("KAIOKEN_HOME", dir)
	t.Setenv("HOME", dir)
	t.Setenv("USERPROFILE", dir)
	return dir
}

func TestGetSettingsReportsTheFetcherTier(t *testing.T) {
	isolatedHome(t)
	ts, _ := prismFixture(t)

	_, body := ts.do(http.MethodGet, "/v1/settings", nil)
	fetcher, ok := body["fetcher"].(map[string]any)
	if !ok {
		t.Fatalf("no fetcher block in settings: %v", body)
	}
	// Empty is the on-disk spelling of auto.
	if fetcher["mode"] != "" {
		t.Errorf("mode = %v, want the default to read as empty", fetcher["mode"])
	}
	if detail, _ := fetcher["detail"].(string); detail == "" {
		t.Error("detail is empty, want a sentence describing the effective tier")
	}
	if fetcher["ok"] != true {
		t.Errorf("ok = %v, want the default configuration to be usable", fetcher["ok"])
	}
	modes, _ := fetcher["modes"].([]any)
	if len(modes) != 4 {
		t.Errorf("modes = %v, want all four offered to the UI", modes)
	}
}

func TestPutSettingsRoundTripsTheFetcherMode(t *testing.T) {
	isolatedHome(t)
	ts, _ := prismFixture(t)

	resp, body := ts.do(http.MethodPut, "/v1/settings", map[string]any{"fetcher_mode": "http"})
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("put returned %d: %v", resp.StatusCode, body)
	}
	fetcher, _ := body["fetcher"].(map[string]any)
	if fetcher["mode"] != "http" {
		t.Fatalf("mode = %v, want http", fetcher["mode"])
	}
	if detail, _ := fetcher["detail"].(string); !strings.Contains(detail, "HTTP only") {
		t.Errorf("detail = %q, want it to describe the pinned tier", detail)
	}

	_, got := ts.do(http.MethodGet, "/v1/settings", nil)
	gotFetcher, _ := got["fetcher"].(map[string]any)
	if gotFetcher["mode"] != "http" {
		t.Errorf("mode did not persist: %v", gotFetcher["mode"])
	}
}

func TestPutSettingsStoresAutoAsEmpty(t *testing.T) {
	isolatedHome(t)
	ts, _ := prismFixture(t)

	ts.do(http.MethodPut, "/v1/settings", map[string]any{"fetcher_mode": "http"})
	// Choosing auto again has to clear the pin, not store the word.
	_, body := ts.do(http.MethodPut, "/v1/settings", map[string]any{"fetcher_mode": "auto"})
	fetcher, _ := body["fetcher"].(map[string]any)
	if fetcher["mode"] != "" {
		t.Errorf("mode = %v, want auto stored as empty", fetcher["mode"])
	}
}

func TestPutSettingsFlipsOneSwitchWithoutTouchingTheOther(t *testing.T) {
	isolatedHome(t)
	ts, _ := prismFixture(t)

	// Default is both on. Turning the API off must leave the local tier on,
	// which is the "headless" mode.
	_, body := ts.do(http.MethodPut, "/v1/settings", map[string]any{"fetcher_api": false})
	fetcher, _ := body["fetcher"].(map[string]any)
	if fetcher["api"] != false || fetcher["local"] != true {
		t.Fatalf("api=%v local=%v, want api off and local untouched", fetcher["api"], fetcher["local"])
	}
	if fetcher["mode"] != "headless" {
		t.Errorf("mode = %v, want headless", fetcher["mode"])
	}

	// Now turn the local tier off too: nothing left but plain fetches.
	_, body = ts.do(http.MethodPut, "/v1/settings", map[string]any{"fetcher_local": false})
	fetcher, _ = body["fetcher"].(map[string]any)
	if fetcher["mode"] != "http" {
		t.Errorf("mode = %v, want http once both switches are off", fetcher["mode"])
	}

	// And back on, which is the stored-as-empty default.
	ts.do(http.MethodPut, "/v1/settings", map[string]any{"fetcher_api": true})
	_, body = ts.do(http.MethodPut, "/v1/settings", map[string]any{"fetcher_local": true})
	fetcher, _ = body["fetcher"].(map[string]any)
	if fetcher["mode"] != "" {
		t.Errorf("mode = %v, want both switches on to store as empty", fetcher["mode"])
	}
}

func TestGetSettingsReportsBothSwitches(t *testing.T) {
	isolatedHome(t)
	ts, _ := prismFixture(t)

	_, body := ts.do(http.MethodGet, "/v1/settings", nil)
	fetcher, _ := body["fetcher"].(map[string]any)
	if fetcher["api"] != true || fetcher["local"] != true {
		t.Errorf("api=%v local=%v, want both on by default", fetcher["api"], fetcher["local"])
	}
}

func TestPutSettingsRejectsAnUnknownFetcherMode(t *testing.T) {
	isolatedHome(t)
	ts, _ := prismFixture(t)

	resp, body := ts.do(http.MethodPut, "/v1/settings", map[string]any{"fetcher_mode": "telepathy"})
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", resp.StatusCode)
	}
	// Errors are nested: {"error": {"code": ..., "message": ...}}.
	errObj, _ := body["error"].(map[string]any)
	msg, _ := errObj["message"].(string)
	// The rejection has to name the alternatives, or the user has nowhere to go.
	for _, want := range []string{"auto", "firecrawl", "headless", "http"} {
		if !strings.Contains(msg, want) {
			t.Errorf("message %q does not offer %q", msg, want)
		}
	}
}

func TestFetcherSettingsReportsFirecrawlKeyState(t *testing.T) {
	isolatedHome(t)
	t.Setenv("FIRECRAWL_API_KEY", "fc-test-key-abcdef")
	ts, _ := prismFixture(t)

	_, body := ts.do(http.MethodGet, "/v1/settings", nil)
	fetcher, _ := body["fetcher"].(map[string]any)
	if fetcher["firecrawl_key"] != true {
		t.Errorf("firecrawl_key = %v, want true when the env key is set", fetcher["firecrawl_key"])
	}
	if fetcher["firecrawl_key_source"] != "env" {
		t.Errorf("key_source = %v, want env", fetcher["firecrawl_key_source"])
	}
	// A key alone now selects Firecrawl, so the sentence must say so.
	if detail, _ := fetcher["detail"].(string); !strings.Contains(detail, "Firecrawl") {
		t.Errorf("detail = %q, want it to name Firecrawl", detail)
	}
	// The hint is a fingerprint, never the key.
	if hint, _ := fetcher["firecrawl_hint"].(string); strings.Contains(hint, "abcdef") {
		t.Errorf("hint = %q leaks the key", hint)
	}
}
