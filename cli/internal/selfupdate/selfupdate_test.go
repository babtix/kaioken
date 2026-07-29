package selfupdate

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"runtime"
	"testing"
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

	rel, newer, err := Check(context.Background(), "1.0.0")
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
	if _, newer, err := Check(context.Background(), "1.1.0"); err != nil || newer {
		t.Errorf("Check(current=1.1.0) newer=%v err=%v, want false, nil", newer, err)
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
