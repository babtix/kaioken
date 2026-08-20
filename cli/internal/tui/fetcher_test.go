package tui

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"kaioken/internal/config"
	"kaioken/internal/webfetch"
)

// ── /fetcher ──────────────────────────────────────────────────────────────

// isolatedGlobal points the global config at a temp directory so a test never
// reads or writes the real one.
func isolatedGlobal(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	t.Setenv(config.HomeEnv, dir)
	t.Setenv("HOME", dir)
	t.Setenv("USERPROFILE", dir)
	return dir
}

func TestFetcherLinesReportBothReaders(t *testing.T) {
	isolatedGlobal(t)
	lines := strings.Join(fetcherLines(config.LoadGlobal()), "\n")

	if !strings.Contains(lines, "api") || !strings.Contains(lines, "local") {
		t.Errorf("lines = %q, want both readers named", lines)
	}
	// Both default to on, so both must read as on.
	if strings.Count(lines, "on") < 2 {
		t.Errorf("lines = %q, want both readers on by default", lines)
	}
}

func TestFetcherLinesSayWhatTheAPIReaderIsMissing(t *testing.T) {
	isolatedGlobal(t)
	t.Setenv("FIRECRAWL_API_KEY", "")
	lines := strings.Join(fetcherLines(config.LoadGlobal()), "\n")

	// A reader that is on but cannot run has to say so, and say what to do.
	if !strings.Contains(lines, "no key") {
		t.Errorf("lines = %q, want the missing key named", lines)
	}
	if !strings.Contains(lines, "FIRECRAWL_API_KEY") {
		t.Errorf("lines = %q, want the environment variable named", lines)
	}
}

func TestFetcherLinesWarnWhenBothReadersAreOff(t *testing.T) {
	isolatedGlobal(t)
	g := config.LoadGlobal()
	g.Research.FetcherMode = "http"

	lines := strings.Join(fetcherLines(g), "\n")
	if !strings.Contains(lines, "single-page apps") {
		t.Errorf("lines = %q, want the consequence of both-off spelled out", lines)
	}
}

func TestDoFetcherFlipsOneReaderAndPersists(t *testing.T) {
	dir := isolatedGlobal(t)
	m := &Model{}

	m.doFetcher([]string{"api", "off"})

	g := config.LoadGlobal()
	if g.Research.FetcherMode != "headless" {
		t.Fatalf("mode = %q, want headless after turning the API reader off", g.Research.FetcherMode)
	}
	// And it reached disk, not just memory.
	raw, err := os.ReadFile(filepath.Join(dir, "config.yaml"))
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(raw), "fetcher_mode: headless") {
		t.Errorf("config.yaml = %q, want the mode saved", raw)
	}
}

func TestDoFetcherTurningBothOffLeavesPlainHTTP(t *testing.T) {
	isolatedGlobal(t)
	m := &Model{}

	m.doFetcher([]string{"api", "off"})
	m.doFetcher([]string{"local", "off"})

	if got := config.LoadGlobal().Research.FetcherMode; got != "http" {
		t.Errorf("mode = %q, want http with both readers off", got)
	}
}

func TestDoFetcherBothOnStoresTheDefaultAsEmpty(t *testing.T) {
	isolatedGlobal(t)
	m := &Model{}

	m.doFetcher([]string{"api", "off"})
	m.doFetcher([]string{"api", "on"})

	// Back to the default, which is written as nothing rather than "auto".
	if got := config.LoadGlobal().Research.FetcherMode; got != "" {
		t.Errorf("mode = %q, want the default stored as empty", got)
	}
}

func TestDoFetcherRejectsNonsense(t *testing.T) {
	isolatedGlobal(t)
	m := &Model{}

	m.doFetcher([]string{"sideways", "on"})
	m.doFetcher([]string{"api", "maybe"})

	// Neither should have written anything.
	if got := config.LoadGlobal().Research.FetcherMode; got != "" {
		t.Errorf("mode = %q, want an unparseable command to change nothing", got)
	}
}

func TestParseOnOffAcceptsTheUsualSpellings(t *testing.T) {
	on := []string{"on", "yes", "true", "1", "ON"}
	for _, v := range on {
		if got, ok := parseOnOff(v); !ok || !got {
			t.Errorf("parseOnOff(%q) = %v,%v, want true,true", v, got, ok)
		}
	}
	off := []string{"off", "no", "false", "0", "OFF"}
	for _, v := range off {
		if got, ok := parseOnOff(v); !ok || got {
			t.Errorf("parseOnOff(%q) = %v,%v, want false,true", v, got, ok)
		}
	}
	if _, ok := parseOnOff("perhaps"); ok {
		t.Error("parseOnOff(\"perhaps\") accepted, want rejected")
	}
}

func TestFetcherLinesNameTheBrowserWhenOneIsInstalled(t *testing.T) {
	isolatedGlobal(t)
	if _, err := webfetch.BrowserPath(); err != nil {
		t.Skip("no browser installed: " + err.Error())
	}
	lines := strings.Join(fetcherLines(config.LoadGlobal()), "\n")
	if strings.Contains(lines, "no Chromium-family browser found") {
		t.Errorf("lines = %q, want the installed browser named", lines)
	}
}
