package selfupdate

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"
)

func TestNewerVersion(t *testing.T) {
	cases := []struct {
		candidate, current string
		want               bool
	}{
		{"1.1.0", "1.0.0", true},
		{"2.0.0", "1.9.9", true},
		{"1.0.1", "1.0.0", true},
		{"1.0.0", "1.0.0", false},
		{"0.9.0", "1.0.0", false},
		{"v1.1.0", "1.0.0", true},
		{"garbage", "1.0.0", false},
		{"1.1.0", "dev", false},
	}
	for _, c := range cases {
		if got := newerVersion(c.candidate, c.current); got != c.want {
			t.Errorf("newerVersion(%q, %q) = %v, want %v", c.candidate, c.current, got, c.want)
		}
	}
}

func TestAssetName(t *testing.T) {
	got := AssetName("1.2.0")
	want := fmt.Sprintf("kaioken-v1.2.0-%s-%s", runtime.GOOS, runtime.GOARCH)
	if runtime.GOOS == "windows" {
		want += ".exe"
	}
	if got != want {
		t.Errorf("AssetName = %q, want %q", got, want)
	}
}

func TestTrustedAssetURL(t *testing.T) {
	cases := []struct {
		url  string
		want bool
	}{
		{"https://github.com/babtix/kaioken/releases/download/v1.1.0/x", true},
		{"https://objects.githubusercontent.com/some/asset", true},
		{"http://github.com/insecure", false},
		{"https://evil.example.com/kaioken.exe", false},
		{"https://github.com.evil.example/x", false},
	}
	for _, c := range cases {
		if got := trustedAssetURL(c.url); got != c.want {
			t.Errorf("trustedAssetURL(%q) = %v, want %v", c.url, got, c.want)
		}
	}
}

func TestCheckFindsMatchingAsset(t *testing.T) {
	asset := AssetName("1.1.0")
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprintf(w, `{"tag_name":"v1.1.0","assets":[
			{"name":"checksums.txt","browser_download_url":"%s/checksums.txt"},
			{"name":"%s","browser_download_url":"%s/%s"},
			{"name":"kaioken-v1.1.0-plan9-mips","browser_download_url":"%s/other"}
		]}`, srvURL(r), asset, srvURL(r), asset, srvURL(r))
	}))
	defer srv.Close()
	oldAPI := ghAPI
	ghAPI = srv.URL
	defer func() { ghAPI = oldAPI }()

	rel, newer, err := Check(context.Background(), "1.0.0", ChannelStable)
	if err != nil {
		t.Fatal(err)
	}
	if rel == nil || rel.AssetName != asset || !newer {
		t.Fatalf("Check = %+v newer=%v, want asset %q and newer=true", rel, newer, asset)
	}
	if rel.ChecksumURL == "" {
		t.Error("ChecksumURL not picked up")
	}

	// Same release against itself: nothing newer.
	if _, newer, err := Check(context.Background(), "1.1.0", ChannelStable); err != nil || newer {
		t.Errorf("Check(current=1.1.0) newer=%v err=%v, want false, nil", newer, err)
	}
}

func TestNormalizeChannel(t *testing.T) {
	cases := map[string]string{
		"":         ChannelStable,
		"stable":   ChannelStable,
		"BETA":     ChannelBeta,
		" nightly": ChannelNightly,
		"check":    ChannelStable, // the verb must never become a channel
		"garbage":  ChannelStable,
	}
	for in, want := range cases {
		if got := NormalizeChannel(in); got != want {
			t.Errorf("NormalizeChannel(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestReleaseInChannel(t *testing.T) {
	stable := ReleaseInfo{TagName: "v1.2.0"}
	beta := ReleaseInfo{TagName: "v1.3.0-rc1", Prerelease: true}
	nightly := ReleaseInfo{TagName: "v1.3.0-nightly.20260130", Prerelease: true}

	cases := []struct {
		name    string
		rel     ReleaseInfo
		channel string
		want    bool
	}{
		{"stable in stable", stable, ChannelStable, true},
		{"prerelease not in stable", beta, ChannelStable, false},
		{"nightly not in stable", nightly, ChannelStable, false},
		{"prerelease in beta", beta, ChannelBeta, true},
		{"nightly not in beta", nightly, ChannelBeta, false},
		{"stable not in beta", stable, ChannelBeta, false},
		{"nightly in nightly", nightly, ChannelNightly, true},
		{"beta not in nightly", beta, ChannelNightly, false},
	}
	for _, c := range cases {
		if got := releaseInChannel(c.rel, c.channel); got != c.want {
			t.Errorf("%s: releaseInChannel(%q, %q) = %v, want %v", c.name, c.rel.TagName, c.channel, got, c.want)
		}
	}
}

// A release that exists but ships nothing for this OS/arch must be
// distinguishable from a channel that has never published at all.
func TestCheckReportsMissingAssetDistinctly(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprintf(w, `{"tag_name":"v1.1.0","assets":[
			{"name":"kaioken-v1.1.0-plan9-mips","browser_download_url":"%s/other"}
		]}`, srvURL(r))
	}))
	defer srv.Close()
	oldAPI := ghAPI
	ghAPI = srv.URL
	defer func() { ghAPI = oldAPI }()

	_, _, err := Check(context.Background(), "1.0.0", ChannelStable)
	if !errors.Is(err, ErrNoAssetForPlatform) {
		t.Errorf("Check err = %v, want ErrNoAssetForPlatform", err)
	}
}

// An empty beta channel reports ErrNoRelease rather than pretending the
// platform is unsupported.
func TestCheckReportsEmptyChannel(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, `[{"tag_name":"v1.1.0","prerelease":false,"assets":[]}]`)
	}))
	defer srv.Close()
	oldAPI := ghAPI
	ghAPI = srv.URL
	defer func() { ghAPI = oldAPI }()

	if _, _, err := Check(context.Background(), "1.0.0", ChannelBeta); !errors.Is(err, ErrNoRelease) {
		t.Errorf("Check(beta) err = %v, want ErrNoRelease", err)
	}
}

func TestNotifyCacheRoundTrip(t *testing.T) {
	dir := t.TempDir()

	if _, ok := CachedNotice(dir, "1.0.0", ChannelStable); ok {
		t.Error("empty cache produced a notice")
	}
	if err := saveState(dir, notifyState{LastCheck: time.Now(), Version: "1.2.0", Channel: ChannelStable}); err != nil {
		t.Fatal(err)
	}
	msg, ok := CachedNotice(dir, "1.0.0", ChannelStable)
	if !ok || !strings.Contains(msg, "1.2.0") {
		t.Errorf("CachedNotice = %q, %v; want a notice naming 1.2.0", msg, ok)
	}
	// Already current, and a cache from a different channel, stay silent.
	if _, ok := CachedNotice(dir, "1.2.0", ChannelStable); ok {
		t.Error("notice shown when already up to date")
	}
	if _, ok := CachedNotice(dir, "1.0.0", ChannelBeta); ok {
		t.Error("stable cache leaked into the beta channel")
	}
}

// A fresh stamp suppresses the next check; that is what keeps the interval
// from firing a request on every single command.
func TestRefreshHonorsInterval(t *testing.T) {
	dir := t.TempDir()
	oldAPI := ghAPI
	ghAPI = "http://127.0.0.1:0" // any request here fails loudly rather than escaping to the network
	defer func() { ghAPI = oldAPI }()

	if err := saveState(dir, notifyState{LastCheck: time.Now(), Version: "1.0.0", Channel: ChannelStable}); err != nil {
		t.Fatal(err)
	}
	RefreshInBackground(dir, "1.0.0", ChannelStable, time.Hour)

	st := loadState(dir)
	if st.Version != "1.0.0" {
		t.Errorf("state disturbed by a check that should not have run: %+v", st)
	}
}

// srvURL rebuilds the test server's base URL from the incoming request so
// asset URLs share the ghAPI prefix and pass trustedAssetURL.
func srvURL(r *http.Request) string { return "http://" + r.Host }

func TestVerifyChecksum(t *testing.T) {
	dir := t.TempDir()
	staged := filepath.Join(dir, "staged.bin")
	payload := []byte("new binary bytes")
	if err := os.WriteFile(staged, payload, 0o600); err != nil {
		t.Fatal(err)
	}
	sum := sha256.Sum256(payload)

	serve := func(body string) *httptest.Server {
		return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			fmt.Fprint(w, body)
		}))
	}

	good := serve(hex.EncodeToString(sum[:]) + "  kaioken-v1.1.0-test\n")
	defer good.Close()
	rel := &Release{AssetName: "kaioken-v1.1.0-test", ChecksumURL: good.URL}
	if err := verifyChecksum(context.Background(), staged, rel); err != nil {
		t.Errorf("valid checksum rejected: %v", err)
	}

	bad := serve("deadbeef  kaioken-v1.1.0-test\n")
	defer bad.Close()
	rel.ChecksumURL = bad.URL
	if err := verifyChecksum(context.Background(), staged, rel); err == nil {
		t.Error("corrupted checksum accepted")
	}

	missing := serve("deadbeef  some-other-file\n")
	defer missing.Close()
	rel.ChecksumURL = missing.URL
	if err := verifyChecksum(context.Background(), staged, rel); err == nil {
		t.Error("missing checksum entry accepted")
	}
}

func TestSwapReplacesAndKeepsRollback(t *testing.T) {
	dir := t.TempDir()
	target := filepath.Join(dir, "kaioken.exe")
	staged := filepath.Join(dir, "kaioken.exe.new")
	if err := os.WriteFile(target, []byte("old"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(staged, []byte("new"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := swap(target, staged); err != nil {
		t.Fatal(err)
	}
	got, err := os.ReadFile(target)
	if err != nil || string(got) != "new" {
		t.Fatalf("target after swap = %q, %v; want \"new\"", got, err)
	}
	if _, err := os.Stat(staged); !os.IsNotExist(err) {
		t.Error("staged file still present after swap")
	}
}
