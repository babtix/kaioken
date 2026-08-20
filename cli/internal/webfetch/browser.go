package webfetch

import (
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
)

// ErrNoBrowser is returned when no Chromium-family browser binary could be
// located on the host system. Headless rendering relies on the Chrome DevTools
// Protocol, which only Chromium-family engines provide.
var ErrNoBrowser = errors.New("no Chromium-family browser found")

// BrowserPathEnv overrides the path to a Chromium-family browser executable.
// Sandboxed environments, containerized setups, or non-standard installations
// can set this variable to bypass automated discovery and pin a specific binary.
const BrowserPathEnv = "KAIOKEN_BROWSER_PATH"

// browserCandidate describes a potential browser installation on the host
// system, represented either as a direct filesystem path or as an executable
// name resolved against PATH.
type browserCandidate struct {
	path    string
	command string
}

func (c browserCandidate) resolve() (string, bool) {
	if c.path != "" {
		info, err := os.Stat(c.path)
		if err == nil && !info.IsDir() {
			return c.path, true
		}
		return "", false
	}
	if c.command != "" {
		path, err := exec.LookPath(c.command)
		if err == nil {
			if info, err := os.Stat(path); err == nil && !info.IsDir() {
				return path, true
			}
		}
		return "", false
	}
	return "", false
}

// browserCandidates is the ordered list of browser candidates inspected by
// findBrowser on this platform. It is a package-level variable initialized from
// defaultBrowserCandidates so tests can substitute mocked candidate lists
// without touching the host filesystem.
var browserCandidates = defaultBrowserCandidates()

// defaultBrowserCandidates returns the platform-specific candidate table for
// discovering Chromium-family browsers in descending preference order.
func defaultBrowserCandidates() []browserCandidate {
	switch runtime.GOOS {
	case "windows":
		// Chrome comes before Edge deliberately: chromedp is developed and
		// tested against Chrome, so it is the better render when present. Edge
		// is second because it ships with Windows 10/11 and is therefore the
		// one that makes this work with zero install. Brave and standalone
		// Chromium builds follow as alternatives.
		var candidates []browserCandidate
		addPath := func(envVar string, sub ...string) {
			if base := os.Getenv(envVar); base != "" {
				elem := append([]string{base}, sub...)
				candidates = append(candidates, browserCandidate{path: filepath.Join(elem...)})
			}
		}

		addPath("ProgramFiles", "Google", "Chrome", "Application", "chrome.exe")
		addPath("ProgramFiles(x86)", "Google", "Chrome", "Application", "chrome.exe")
		addPath("LOCALAPPDATA", "Google", "Chrome", "Application", "chrome.exe")
		addPath("ProgramFiles(x86)", "Microsoft", "Edge", "Application", "msedge.exe")
		addPath("ProgramFiles", "Microsoft", "Edge", "Application", "msedge.exe")
		addPath("LOCALAPPDATA", "Microsoft", "Edge", "Application", "msedge.exe")
		addPath("ProgramFiles", "BraveSoftware", "Brave-Browser", "Application", "brave.exe")
		addPath("LOCALAPPDATA", "BraveSoftware", "Brave-Browser", "Application", "brave.exe")
		addPath("ProgramFiles", "Chromium", "Application", "chrome.exe")

		for _, name := range []string{"chrome.exe", "msedge.exe", "brave.exe", "chromium.exe"} {
			candidates = append(candidates, browserCandidate{command: name})
		}
		return candidates

	case "darwin":
		// Chrome is preferred, followed by Chromium, Brave, and Edge.
		// Safari is NOT a candidate — it is not Chromium and speaks no DevTools Protocol.
		candidates := []browserCandidate{
			{path: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"},
		}
		if home := os.Getenv("HOME"); home != "" {
			candidates = append(candidates, browserCandidate{
				path: filepath.Join(home, "Applications", "Google Chrome.app", "Contents", "MacOS", "Google Chrome"),
			})
		}
		candidates = append(candidates,
			browserCandidate{path: "/Applications/Chromium.app/Contents/MacOS/Chromium"},
			browserCandidate{path: "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser"},
			browserCandidate{path: "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"},
			browserCandidate{command: "google-chrome"},
			browserCandidate{command: "chromium"},
		)
		return candidates

	default:
		// LookPath comes first because Linux distributions vary too much
		// (/usr/bin, /usr/local/bin, /snap/bin, Flatpak) for a static path
		// table to be reliable. Common absolute paths serve as fallbacks.
		return []browserCandidate{
			{command: "google-chrome"},
			{command: "google-chrome-stable"},
			{command: "chromium"},
			{command: "chromium-browser"},
			{command: "brave-browser"},
			{command: "microsoft-edge"},
			{command: "microsoft-edge-stable"},
			{path: "/opt/google/chrome/chrome"},
			{path: "/snap/bin/chromium"},
			{path: "/usr/bin/chromium"},
		}
	}
}

// findBrowser locates an installed Chromium-family browser executable.
// It checks the KAIOKEN_BROWSER_PATH environment override first, falling
// through to an ordered candidate list, and returns an actionable error
// wrapping ErrNoBrowser if none can be found.
func findBrowser() (string, error) {
	if override := os.Getenv(BrowserPathEnv); override != "" {
		info, err := os.Stat(override)
		if err != nil {
			return "", fmt.Errorf("%s is set to %q, but that file does not exist: %w", BrowserPathEnv, override, err)
		}
		if info.IsDir() {
			return "", fmt.Errorf("%s is set to %q, but that is a directory, not a browser executable", BrowserPathEnv, override)
		}
		return override, nil
	}

	for _, c := range browserCandidates {
		if path, ok := c.resolve(); ok {
			return path, nil
		}
	}

	return "", fmt.Errorf("%w: install Google Chrome (https://www.google.com/chrome/) or set %s to a browser executable", ErrNoBrowser, BrowserPathEnv)
}
