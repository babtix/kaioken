// Package selfupdate upgrades the running kaioken binary in place from the
// project's GitHub releases. The flow is deliberately boring: query the
// latest release, compare versions, download the asset that matches this
// OS/arch, verify its SHA-256 against checksums.txt, then swap the binary
// with a rename dance (a running exe on Windows can be renamed but never
// overwritten).
package selfupdate

import (
	"bufio"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"runtime"
	"strconv"
	"strings"
	"time"
)

// Repo is the GitHub repository releases are published to.
var Repo = "babtix/kaioken"

// ghAPI is the GitHub API base URL; tests point it at an httptest server.
var ghAPI = "https://api.github.com"

// httpClient covers both the API call and the binary download, so the
// timeout is generous.
var httpClient = &http.Client{Timeout: 5 * time.Minute}

// Release describes the newest published build relevant to this machine.
type Release struct {
	Version     string // "1.2.0", no leading v
	AssetName   string // e.g. kaioken-v1.2.0-windows-amd64.exe
	AssetURL    string
	ChecksumURL string // empty when the release ships no checksums.txt
}

// Check fetches the latest release and reports whether it is strictly newer
// than current. A nil Release with a nil error means the repo has no release
// asset for this OS/arch.
func Check(ctx context.Context, current string) (*Release, bool, error) {
	var rel struct {
		TagName string `json:"tag_name"`
		Assets  []struct {
			Name string `json:"name"`
			URL  string `json:"browser_download_url"`
		} `json:"assets"`
	}
	apiURL := fmt.Sprintf("%s/repos/%s/releases/latest", ghAPI, Repo)
	if err := getJSON(ctx, apiURL, &rel); err != nil {
		return nil, false, fmt.Errorf("checking latest release: %w", err)
	}
	version := strings.TrimPrefix(rel.TagName, "v")
	want := AssetName(version)
	out := &Release{Version: version}
	for _, a := range rel.Assets {
		if !trustedAssetURL(a.URL) {
			continue
		}
		switch a.Name {
		case want:
			out.AssetName = a.Name
			out.AssetURL = a.URL
		case "checksums.txt":
			out.ChecksumURL = a.URL
		}
	}
	if out.AssetURL == "" {
		return nil, false, nil
	}
	return out, newerVersion(version, current), nil
}

// trustedAssetURL refuses download URLs the release API should never hand
// out: anything that is not HTTPS on a GitHub-owned host (or the test
// server standing in for the API). The binary we execute must only ever
// come from where releases actually live.
func trustedAssetURL(raw string) bool {
	if strings.HasPrefix(raw, ghAPI+"/") && ghAPI != "https://api.github.com" {
		return true // httptest override in unit tests
	}
	u, err := url.Parse(raw)
	if err != nil || u.Scheme != "https" {
		return false
	}
	host := strings.ToLower(u.Hostname())
	return host == "github.com" || host == "api.github.com" ||
		host == "githubusercontent.com" || strings.HasSuffix(host, ".githubusercontent.com") ||
		strings.HasSuffix(host, ".github.com")
}

// AssetName is the release artifact name for this OS/arch, matching what
// the release workflow publishes.
func AssetName(version string) string {
	name := fmt.Sprintf("kaioken-v%s-%s-%s", version, runtime.GOOS, runtime.GOARCH)
	if runtime.GOOS == "windows" {
		name += ".exe"
	}
	return name
}

// Apply downloads rel and swaps it in for the running binary. It returns the
// path that was replaced. The old binary survives as "<path>.old" until the
// next run cleans it up.
func Apply(ctx context.Context, rel *Release) (string, error) {
	exe, err := os.Executable()
	if err != nil {
		return "", fmt.Errorf("locating the running binary: %w", err)
	}
	// Stage the download next to the target so the final rename never
	// crosses a volume boundary.
	staged := exe + ".new"
	if err := download(ctx, rel.AssetURL, staged); err != nil {
		return "", err
	}
	defer os.Remove(staged) // no-op after a successful rename

	if rel.ChecksumURL != "" {
		if err := verifyChecksum(ctx, staged, rel); err != nil {
			return "", err
		}
	}
	if err := os.Chmod(staged, 0o755); err != nil {
		return "", fmt.Errorf("marking the new binary executable: %w", err)
	}
	if err := swap(exe, staged); err != nil {
		return "", err
	}
	return exe, nil
}

// swap replaces target with staged: the live binary is renamed aside first,
// because Windows refuses to overwrite a running exe but happily renames it.
// A failed second rename rolls the original back.
func swap(target, staged string) error {
	old := target + ".old"
	os.Remove(old) // stale leftover from an earlier upgrade
	if err := os.Rename(target, old); err != nil {
		return fmt.Errorf("moving the current binary aside: %w", err)
	}
	if err := os.Rename(staged, target); err != nil {
		if rb := os.Rename(old, target); rb != nil {
			return fmt.Errorf("installing the new binary: %w (rollback also failed: %v — restore %s manually)", err, rb, old)
		}
		return fmt.Errorf("installing the new binary: %w (previous version restored)", err)
	}
	os.Remove(old) // fails on Windows while the old exe still runs; CleanupOld handles it
	return nil
}

// CleanupOld removes the "<exe>.old" leftover a previous upgrade could not
// delete (Windows keeps the running image locked). Called best-effort at
// startup; every error is deliberately ignored.
func CleanupOld() {
	if exe, err := os.Executable(); err == nil {
		os.Remove(exe + ".old")
	}
}

// verifyChecksum downloads checksums.txt and compares the staged file's
// SHA-256 to the line matching the asset name. Format: "<hex>  <name>".
func verifyChecksum(ctx context.Context, staged string, rel *Release) error {
	resp, err := get(ctx, rel.ChecksumURL)
	if err != nil {
		return fmt.Errorf("fetching checksums.txt: %w", err)
	}
	defer resp.Body.Close()

	want := ""
	sc := bufio.NewScanner(resp.Body)
	for sc.Scan() {
		fields := strings.Fields(sc.Text())
		if len(fields) == 2 && fields[1] == rel.AssetName {
			want = strings.ToLower(fields[0])
			break
		}
	}
	if err := sc.Err(); err != nil {
		return fmt.Errorf("reading checksums.txt: %w", err)
	}
	if want == "" {
		return fmt.Errorf("checksums.txt has no entry for %s", rel.AssetName)
	}

	f, err := os.Open(staged)
	if err != nil {
		return err
	}
	defer f.Close()
	h := sha256.New()
	if _, err := io.Copy(h, f); err != nil {
		return err
	}
	got := hex.EncodeToString(h.Sum(nil))
	if got != want {
		return fmt.Errorf("checksum mismatch for %s: got %s, want %s — download corrupted or tampered, not installed", rel.AssetName, got, want)
	}
	return nil
}

// download streams url into path (0600 until the caller chmods it).
func download(ctx context.Context, url, path string) error {
	resp, err := get(ctx, url)
	if err != nil {
		return fmt.Errorf("downloading %s: %w", url, err)
	}
	defer resp.Body.Close()

	f, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0o600)
	if err != nil {
		return err
	}
	if _, err := io.Copy(f, resp.Body); err != nil {
		f.Close()
		os.Remove(path)
		return fmt.Errorf("downloading %s: %w", url, err)
	}
	return f.Close()
}

// getJSON GETs a GitHub API URL into out.
func getJSON(ctx context.Context, url string, out any) error {
	resp, err := get(ctx, url)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	return json.NewDecoder(resp.Body).Decode(out)
}

// get issues a GET and treats every non-200 as an error. GITHUB_TOKEN, when
// set, raises the unauthenticated API rate limit.
func get(ctx context.Context, url string) (*http.Response, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/vnd.github+json, application/octet-stream, */*")
	if tok := os.Getenv("GITHUB_TOKEN"); tok != "" {
		req.Header.Set("Authorization", "Bearer "+tok)
	}
	resp, err := httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode != http.StatusOK {
		resp.Body.Close()
		if resp.StatusCode == http.StatusNotFound {
			return nil, fmt.Errorf("not found: %s", url)
		}
		return nil, fmt.Errorf("GET %s: %s", url, resp.Status)
	}
	return resp, nil
}

// newerVersion reports whether candidate is a strictly newer MAJOR.MINOR.PATCH
// than current. Unparseable input reports false: an upgrade must never fire
// on garbage (which also exempts dev builds with custom ldflags versions).
func newerVersion(candidate, current string) bool {
	c, ok := parseSemver(candidate)
	if !ok {
		return false
	}
	cur, ok := parseSemver(current)
	if !ok {
		return false
	}
	for i := range c {
		switch {
		case c[i] > cur[i]:
			return true
		case c[i] < cur[i]:
			return false
		}
	}
	return false
}

func parseSemver(s string) ([3]int, bool) {
	var v [3]int
	parts := strings.Split(strings.TrimPrefix(strings.TrimSpace(s), "v"), ".")
	if len(parts) != 3 {
		return v, false
	}
	for i, p := range parts {
		n, err := strconv.Atoi(p)
		if err != nil || n < 0 {
			return v, false
		}
		v[i] = n
	}
	return v, true
}
