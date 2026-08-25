package scan

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"kaioken/internal/config"
)

// mkTree writes a file map under dir, creating parents as needed.
func mkTree(t *testing.T, dir string, files map[string]string) {
	t.Helper()
	for rel, body := range files {
		p := filepath.Join(dir, filepath.FromSlash(rel))
		if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(p, []byte(body), 0o644); err != nil {
			t.Fatal(err)
		}
	}
}

func flaggedAt(res *Result, path string) []Flag {
	var out []Flag
	for _, f := range res.Flags {
		if f.Path == path {
			out = append(out, f)
		}
	}
	return out
}

func hasKind(flags []Flag, kind string) bool {
	for _, f := range flags {
		if f.Kind == kind {
			return true
		}
	}
	return false
}

func TestScanRiskFlags(t *testing.T) {
	repo := t.TempDir()
	mkTree(t, repo, map[string]string{
		// One fixture per kind. *.min.js and lockfiles are excluded by the
		// default scope, so the generated fixture is a .pb.go instead.
		"cfg/secrets.yaml": "aws_key: AKIAABCDEFGHIJKLMNOP\n",
		"deploy/.env":      "SOME=var\n",
		"gen/api.pb.go":    "package gen\n",
		// A plain source file must stay unflagged.
		"src/main.go": "package main\n",
	})

	cfg := config.Default()
	res, err := Repo(repo, cfg)
	if err != nil {
		t.Fatal(err)
	}

	if !hasKind(flaggedAt(res, "cfg/secrets.yaml"), FlagSecret) {
		t.Error("secrets.yaml not flagged as secret")
	}
	if !hasKind(flaggedAt(res, "deploy/.env"), FlagCredentials) {
		t.Error(".env not flagged as credentials-file")
	}
	if !hasKind(flaggedAt(res, "gen/api.pb.go"), FlagGenerated) {
		t.Error("api.pb.go not flagged as generated")
	}
	if got := flaggedAt(res, "src/main.go"); len(got) != 0 {
		t.Errorf("plain source flagged: %v", got)
	}
}

func TestDetectRiskContentVariants(t *testing.T) {
	cases := []struct {
		name    string
		base    string
		content string
		kind    string
	}{
		{"private key", "id_rsa.txt", "-----BEGIN OPENSSH PRIVATE KEY-----\nabc\n", FlagSecret},
		{"github token", "ci.sh", "token=ghp_0123456789ABCDEFGHIJKLMNOPQRSTUVWXyz\n", FlagSecret},
		{"pem by extension", "server.pem", "nothing secret here\n", FlagCredentials},
		{"lockfile", "package-lock.json", "{}\n", FlagGenerated},
		{"source map", "app.js.map", "{}\n", FlagGenerated},
		{"minified js", "app.min.js", "var x=1;\n", FlagGenerated},
		{"protobuf output", "api.pb.go", "package gen\n", FlagGenerated},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			flags := detectRisk(tc.base, tc.base, []byte(tc.content))
			if !hasKind(flags, tc.kind) {
				t.Errorf("detectRisk(%s) = %v, want kind %s", tc.base, flags, tc.kind)
			}
		})
	}
}

// The secret scanner must not look past the inspection cap — a key buried
// below it is out of scope, and neither is the scan time worth it.
func TestDetectRiskRespectsCap(t *testing.T) {
	padded := strings.Repeat("x", riskInspectBytes+1024)
	content := padded + "AKIAABCDEFGHIJKLMNOP"
	if got := detectRisk("big.txt", "big.txt", []byte(content)); hasKind(got, FlagSecret) {
		t.Error("secret beyond the inspection cap must not be reported")
	}
}

func TestSaveLoadFlagsRoundTrip(t *testing.T) {
	repo := t.TempDir()
	res := &Result{Flags: []Flag{
		{Path: "a.env", Kind: FlagCredentials, Detail: "filename looks like credentials"},
	}}
	if err := res.SaveFlags(repo); err != nil {
		t.Fatal(err)
	}
	got := LoadFlags(repo)
	if len(got) != 1 || got[0].Path != "a.env" || got[0].Kind != FlagCredentials {
		t.Errorf("round trip = %v", got)
	}

	// No file yet means no flags, not an error.
	if got := LoadFlags(t.TempDir()); got != nil {
		t.Errorf("missing risk.json should load as nil, got %v", got)
	}
}
