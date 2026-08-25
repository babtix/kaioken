// Package selfupdate upgrades the running kaioken binary in place from the
// project's GitHub releases. The flow is deliberately boring: query the
// latest release, compare versions, download the asset that matches this
// OS/arch, verify it (see verify.go — the cosign signature over checksums.txt
// first, then the binary's SHA-256 against the entry that signature covers),
// then swap the binary with a rename dance (a running exe on Windows can be
// renamed but never overwritten).
//
// Verification is not optional. A release that does not ship the material to
// check is refused rather than installed with a warning: this code replaces
// the executable the user is already trusting, so "probably fine" is not a
// state it may proceed from.
package selfupdate

import (
	"context"

	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"sync/atomic"
	"time"
)

// Release channels. Stable tracks published releases, beta tracks
// pre-releases, nightly tracks the dated builds tagged "nightly".
const (
	ChannelStable  = "stable"
	ChannelBeta    = "beta"
	ChannelNightly = "nightly"
)

var (
	// ErrNoRelease means the channel has nothing published yet. It is
	// distinct from a release existing without a binary for this machine.
	ErrNoRelease = errors.New("no release published in this channel")
	// ErrNoAssetForPlatform means the newest release in the channel ships
	// no asset matching this OS/arch.
	ErrNoAssetForPlatform = errors.New("release has no binary for this platform")
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
	Version   string // "1.2.0", no leading v
	AssetName string // e.g. kaioken-v1.2.0-windows-amd64.exe
	AssetURL  string
	// The release signs checksums.txt, not each binary — see verify.go. All
	// three are required to install; empty means the release did not publish
	// it, which Apply treats as fatal rather than as a reason to skip a check.
	ChecksumURL     string
	ChecksumSigURL  string
	ChecksumCertURL string
	PatchURL        string // empty when the release ships no .patch (bsdiff)
	ReleaseNotes    string // markdown release notes from the release body
	PublishedAt     time.Time
	Channel         string // stable, beta, nightly
}

// ReleaseInfo holds the raw release data from GitHub API
type ReleaseInfo struct {
	TagName     string `json:"tag_name"`
	Body        string `json:"body"`
	PublishedAt string `json:"published_at"`
	Prerelease  bool   `json:"prerelease"`
	Assets      []struct {
		Name string `json:"name"`
		URL  string `json:"browser_download_url"`
	} `json:"assets"`
}

// Check fetches the newest release on channel and reports whether it is
// strictly newer than current. It returns ErrNoRelease when the channel has
// published nothing, and ErrNoAssetForPlatform when a release exists but
// ships no binary for this OS/arch — callers need to tell those apart to say
// anything useful about why an upgrade is unavailable.
func Check(ctx context.Context, current string, channel string) (*Release, bool, error) {
	channel = NormalizeChannel(channel)
	rel, err := latestRelease(ctx, channel)
	if err != nil {
		return nil, false, err
	}
	return processRelease(*rel, current, channel)
}

// NormalizeChannel maps user input onto a known channel; anything empty or
// unrecognised falls back to stable, because an upgrade must never be driven
// by a channel name nobody publishes to.
func NormalizeChannel(c string) string {
	switch strings.ToLower(strings.TrimSpace(c)) {
	case ChannelBeta:
		return ChannelBeta
	case ChannelNightly:
		return ChannelNightly
	default:
		return ChannelStable
	}
}

// latestRelease returns the newest release belonging to channel. Stable uses
// GitHub's /releases/latest, which already excludes drafts and pre-releases;
// the other channels scan the release list, returned newest-first.
func latestRelease(ctx context.Context, channel string) (*ReleaseInfo, error) {
	if channel == ChannelStable {
		var rel ReleaseInfo
		if err := getJSON(ctx, fmt.Sprintf("%s/repos/%s/releases/latest", ghAPI, Repo), &rel); err != nil {
			return nil, fmt.Errorf("checking latest release: %w", err)
		}
		return &rel, nil
	}

	var releases []ReleaseInfo
	if err := getJSON(ctx, fmt.Sprintf("%s/repos/%s/releases?per_page=20", ghAPI, Repo), &releases); err != nil {
		return nil, fmt.Errorf("checking releases: %w", err)
	}
	for _, r := range releases {
		if releaseInChannel(r, channel) {
			found := r
			return &found, nil
		}
	}
	return nil, ErrNoRelease
}

// releaseInChannel reports whether r belongs to channel. Nightlies carry
// "nightly" in the tag; beta is every other pre-release, so subscribing to
// beta tracks release candidates without picking up the dailies.
func releaseInChannel(r ReleaseInfo, channel string) bool {
	isNightly := strings.Contains(strings.ToLower(r.TagName), "nightly")
	switch channel {
	case ChannelNightly:
		return isNightly
	case ChannelBeta:
		return r.Prerelease && !isNightly
	default:
		return !r.Prerelease && !isNightly
	}
}

func processRelease(rel ReleaseInfo, current string, channel string) (*Release, bool, error) {
	version := strings.TrimPrefix(rel.TagName, "v")
	want := AssetName(version)
	out := &Release{
		Version:      version,
		Channel:      channel,
		ReleaseNotes: rel.Body,
	}
	if t, err := time.Parse(time.RFC3339, rel.PublishedAt); err == nil {
		out.PublishedAt = t
	}
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
		// goreleaser signs the checksum file, so these names are fixed rather
		// than derived from the per-platform asset. Looking for
		// "<asset>.sig" instead — as this did until the signature path was
		// wired up — matches an artifact no release has ever published, which
		// is why the verification stub was never once executed.
		case "checksums.txt.sig":
			out.ChecksumSigURL = a.URL
		case "checksums.txt.pem":
			out.ChecksumCertURL = a.URL
		case want + ".patch":
			out.PatchURL = a.URL
		}
	}
	if out.AssetURL == "" {
		return nil, false, fmt.Errorf("%w: %s/%s in release %s", ErrNoAssetForPlatform, runtime.GOOS, runtime.GOARCH, rel.TagName)
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

// AssetName is the release artifact name for this OS/arch. It must stay in
// lockstep with the "kaioken-binary" archive in .goreleaser.yaml, whose
// name_template produces exactly this string — if the two drift, every
// upgrade reports that no build exists for the running platform.
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
func Apply(ctx context.Context, rel *Release, progressFunc func(downloaded, total int64)) (string, error) {
	exe, err := os.Executable()
	if err != nil {
		return "", fmt.Errorf("locating the running binary: %w", err)
	}
	// Stage the download next to the target so the final rename never
	// crosses a volume boundary.
	staged := exe + ".new"
	defer os.Remove(staged) // no-op after a successful rename

	// Full download (delta patches not yet implemented for this library)
	if err := download(ctx, rel.AssetURL, staged, progressFunc); err != nil {
		return "", err
	}

	// Fail closed. This binary is about to replace the one the user is
	// running, so anything short of a verified signature over a checksum that
	// matches is a refusal — not a warning followed by installing it anyway.
	if err := verifyRelease(ctx, staged, rel); err != nil {
		return "", err
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

// Rollback restores the previous binary from the .old backup.
func Rollback() error {
	exe, err := os.Executable()
	if err != nil {
		return fmt.Errorf("locating the running binary: %w", err)
	}
	old := exe + ".old"
	if _, err := os.Stat(old); err != nil {
		return fmt.Errorf("no backup found to roll back to: %w", err)
	}
	// On Windows, we can't overwrite the running exe, so we rename current to .new,
	// rename .old to current, then the .new will be cleaned up on next start
	if runtime.GOOS == "windows" {
		newBackup := exe + ".new"
		os.Remove(newBackup)
		if err := os.Rename(exe, newBackup); err != nil {
			return fmt.Errorf("moving current binary aside for rollback: %w", err)
		}
		if err := os.Rename(old, exe); err != nil {
			// Try to restore
			os.Rename(newBackup, exe)
			return fmt.Errorf("restoring backup: %w", err)
		}
		// The newBackup will be cleaned up on next start
		return nil
	}
	// Unix: simple rename
	if err := os.Rename(old, exe); err != nil {
		return fmt.Errorf("restoring backup: %w", err)
	}
	return nil
}

// notifyState caches what the last background check found. Checking costs a
// network round-trip, so a run refreshes the cache in the background and the
// NEXT run prints the notice from it instantly. Printing from the goroutine
// instead would interleave with the running command's own output, and under
// the TUI's alt-screen it would corrupt the display outright.
type notifyState struct {
	LastCheck time.Time `json:"last_check"`
	Version   string    `json:"version"` // newest version seen on Channel
	Channel   string    `json:"channel"`
}

func statePath(dir string) string { return filepath.Join(dir, "update-check.json") }

// loadState reads the cache, returning a zero state when it is missing or
// unreadable — a stale or corrupt cache must never block a command.
func loadState(dir string) notifyState {
	var st notifyState
	raw, err := os.ReadFile(statePath(dir))
	if err != nil {
		return notifyState{}
	}
	if err := json.Unmarshal(raw, &st); err != nil {
		return notifyState{}
	}
	return st
}

// saveState writes the cache atomically, so a process exiting mid-write
// cannot leave a truncated file behind for the next run to parse.
func saveState(dir string, st notifyState) error {
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return err
	}
	raw, err := json.Marshal(st)
	if err != nil {
		return err
	}
	tmp := statePath(dir) + ".tmp"
	if err := os.WriteFile(tmp, raw, 0o600); err != nil {
		return err
	}
	if err := os.Rename(tmp, statePath(dir)); err != nil {
		os.Remove(tmp)
		return err
	}
	return nil
}

// CachedNotice returns a one-line "update available" message when the last
// background check on this channel found something newer than current.
func CachedNotice(dir, current, channel string) (string, bool) {
	channel = NormalizeChannel(channel)
	st := loadState(dir)
	if st.Channel != channel || !newerVersion(st.Version, current) {
		return "", false
	}
	return fmt.Sprintf("kaioken %s → %s is available on the %s channel — run `kaioken upgrade` to install it",
		current, st.Version, channel), true
}

// RefreshInBackground starts an update check when the cached one has aged
// past every, and returns immediately. It is best-effort: a short command
// usually exits before the request lands, and the next long-running
// invocation (typically the TUI) picks the work up again.
func RefreshInBackground(dir, current, channel string, every time.Duration) {
	if every <= 0 {
		return
	}
	channel = NormalizeChannel(channel)
	st := loadState(dir)
	if st.Channel == channel && time.Since(st.LastCheck) < every {
		return
	}
	// Stamp the attempt before the request goes out, so a burst of quick
	// commands does not each fire their own check against the API.
	_ = saveState(dir, notifyState{LastCheck: time.Now(), Version: st.Version, Channel: channel})

	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		rel, _, err := Check(ctx, current, channel)
		if err != nil || rel == nil {
			return
		}
		_ = saveState(dir, notifyState{LastCheck: time.Now(), Version: rel.Version, Channel: channel})
	}()
}

// Verification lives in verify.go: the release signs checksums.txt, so the
// signature check and the hash check are one gate, not two independent ones.

// openFile is os.Open, named so verify.go reads without an os. prefix on the
// one filesystem call it makes.
func openFile(path string) (*os.File, error) { return os.Open(path) }

// download streams url into path (0600 until the caller chmods it).
// If progressFunc is provided, it is called periodically with bytes downloaded and total.
func download(ctx context.Context, url, path string, progressFunc func(downloaded, total int64)) error {
	resp, err := get(ctx, url)
	if err != nil {
		return fmt.Errorf("downloading %s: %w", url, err)
	}
	defer resp.Body.Close()

	f, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0o600)
	if err != nil {
		return err
	}

	var total int64 = resp.ContentLength
	var downloaded int64
	var reader io.Reader = resp.Body

	if progressFunc != nil && total > 0 {
		reader = &progressReader{
			reader:     resp.Body,
			total:      total,
			downloaded: &downloaded,
			callback:   progressFunc,
		}
	}

	if _, err := io.Copy(f, reader); err != nil {
		f.Close()
		os.Remove(path)
		return fmt.Errorf("downloading %s: %w", url, err)
	}
	return f.Close()
}

// progressReader wraps an io.Reader to report download progress
type progressReader struct {
	reader     io.Reader
	total      int64
	downloaded *int64
	callback   func(downloaded, total int64)
	lastCall   int64
}

func (pr *progressReader) Read(p []byte) (int, error) {
	n, err := pr.reader.Read(p)
	if n > 0 {
		atomic.AddInt64(pr.downloaded, int64(n))
		// Report at whole-percent steps, and always on the final byte, so a
		// fast link does not spend its time redrawing the same line.
		current := atomic.LoadInt64(pr.downloaded)
		if current-pr.lastCall >= pr.total/100 || current >= pr.total {
			pr.lastCall = current
			if pr.callback != nil {
				pr.callback(current, pr.total)
			}
		}
	}
	return n, err
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
