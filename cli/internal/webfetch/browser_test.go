package webfetch

import (
	"errors"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

// ── Browser discovery ────────────────────────────────────────────────────────

func TestFindBrowserPrefersChromeOverEdge(t *testing.T) {
	t.Setenv(BrowserPathEnv, "")
	orig := browserCandidates
	t.Cleanup(func() { browserCandidates = orig })

	dir := t.TempDir()
	chrome := filepath.Join(dir, "chrome.exe")
	edge := filepath.Join(dir, "msedge.exe")
	if err := os.WriteFile(chrome, []byte("fake-chrome"), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(edge, []byte("fake-edge"), 0755); err != nil {
		t.Fatal(err)
	}

	browserCandidates = []browserCandidate{
		{path: chrome},
		{path: edge},
	}

	got, err := findBrowser()
	if err != nil {
		t.Fatalf("findBrowser failed: %v", err)
	}
	if got != chrome {
		t.Errorf("got = %q, want %q", got, chrome)
	}
}

func TestFindBrowserFallsThroughToTheNextCandidate(t *testing.T) {
	t.Setenv(BrowserPathEnv, "")
	orig := browserCandidates
	t.Cleanup(func() { browserCandidates = orig })

	dir := t.TempDir()
	missing := filepath.Join(dir, "nonexistent.exe")
	existing := filepath.Join(dir, "existing.exe")
	if err := os.WriteFile(existing, []byte("fake-browser"), 0755); err != nil {
		t.Fatal(err)
	}

	browserCandidates = []browserCandidate{
		{path: missing},
		{path: existing},
	}

	got, err := findBrowser()
	if err != nil {
		t.Fatalf("findBrowser failed: %v", err)
	}
	if got != existing {
		t.Errorf("got = %q, want %q", got, existing)
	}
}

func TestFindBrowserSkipsDirectories(t *testing.T) {
	t.Setenv(BrowserPathEnv, "")
	orig := browserCandidates
	t.Cleanup(func() { browserCandidates = orig })

	dir := t.TempDir()
	subDir := filepath.Join(dir, "chrome-dir")
	if err := os.Mkdir(subDir, 0755); err != nil {
		t.Fatal(err)
	}
	realFile := filepath.Join(dir, "chrome.exe")
	if err := os.WriteFile(realFile, []byte("fake-chrome"), 0755); err != nil {
		t.Fatal(err)
	}

	browserCandidates = []browserCandidate{
		{path: subDir},
		{path: realFile},
	}

	got, err := findBrowser()
	if err != nil {
		t.Fatalf("findBrowser failed: %v", err)
	}
	if got != realFile {
		t.Errorf("got = %q, want %q", got, realFile)
	}
}

func TestFindBrowserHonoursTheEnvOverride(t *testing.T) {
	orig := browserCandidates
	t.Cleanup(func() { browserCandidates = orig })

	dir := t.TempDir()
	envBrowser := filepath.Join(dir, "custom-browser.exe")
	candidateBrowser := filepath.Join(dir, "candidate-browser.exe")
	if err := os.WriteFile(envBrowser, []byte("custom"), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(candidateBrowser, []byte("candidate"), 0755); err != nil {
		t.Fatal(err)
	}

	t.Setenv(BrowserPathEnv, envBrowser)
	browserCandidates = []browserCandidate{
		{path: candidateBrowser},
	}

	got, err := findBrowser()
	if err != nil {
		t.Fatalf("findBrowser failed: %v", err)
	}
	if got != envBrowser {
		t.Errorf("got = %q, want %q", got, envBrowser)
	}
}

func TestFindBrowserRejectsAnUnusableEnvOverride(t *testing.T) {
	orig := browserCandidates
	t.Cleanup(func() { browserCandidates = orig })

	dir := t.TempDir()
	validCandidate := filepath.Join(dir, "valid-browser.exe")
	if err := os.WriteFile(validCandidate, []byte("valid"), 0755); err != nil {
		t.Fatal(err)
	}
	browserCandidates = []browserCandidate{
		{path: validCandidate},
	}

	missing := filepath.Join(dir, "does-not-exist.exe")
	t.Setenv(BrowserPathEnv, missing)

	got, err := findBrowser()
	if err == nil {
		t.Fatalf("findBrowser returned %q; want an error when %s points to a missing file", got, BrowserPathEnv)
	}
	if !strings.Contains(err.Error(), BrowserPathEnv) {
		t.Errorf("err = %q; want error to mention %s", err.Error(), BrowserPathEnv)
	}
	if got != "" {
		t.Errorf("got = %q; want empty string on error", got)
	}
}

func TestFindBrowserErrorsWhenNothingIsInstalled(t *testing.T) {
	t.Setenv(BrowserPathEnv, "")
	orig := browserCandidates
	t.Cleanup(func() { browserCandidates = orig })
	browserCandidates = nil

	_, err := findBrowser()
	if err == nil {
		t.Fatal("findBrowser succeeded with empty candidates; want an error")
	}
	if !errors.Is(err, ErrNoBrowser) {
		t.Errorf("err = %v, want errors.Is(err, ErrNoBrowser)", err)
	}
	msg := err.Error()
	if !strings.Contains(msg, "Chrome") {
		t.Errorf("error message %q does not mention Chrome", msg)
	}
	if !strings.Contains(msg, BrowserPathEnv) {
		t.Errorf("error message %q does not mention %s", msg, BrowserPathEnv)
	}
}

func TestDefaultBrowserCandidatesAreNonEmpty(t *testing.T) {
	candidates := defaultBrowserCandidates()
	if len(candidates) == 0 {
		t.Errorf("defaultBrowserCandidates() returned 0 candidates on %s", runtime.GOOS)
	}
}
