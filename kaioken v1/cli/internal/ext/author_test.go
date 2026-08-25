package ext

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"kaioken/internal/config"
)

// writeExtTree lays out an extension working tree for author-tool tests.
func writeExtTree(t *testing.T, files map[string]string) string {
	t.Helper()
	dir := t.TempDir()
	for rel, body := range files {
		p := filepath.Join(dir, filepath.FromSlash(rel))
		if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(p, []byte(body), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	return dir
}

const devManifest = "id: alice.dev\nname: Dev Demo\nversion: 0.1.0\nrepo: alice/kaioken-dev\n"

const devSkill = "---\nname: hello\ndescription: Say hello properly.\n---\n\n# Hello\n\nGreet with context.\n"

func TestValidateDirCleanTree(t *testing.T) {
	dir := writeExtTree(t, map[string]string{
		"extension.yaml":        devManifest,
		"skills/hello/SKILL.md": devSkill,
	})
	rep, err := ValidateDir(dir)
	if err != nil {
		t.Fatal(err)
	}
	if rep.Manifest.ID != "alice.dev" || len(rep.Skills) != 1 {
		t.Errorf("report = %+v", rep)
	}
	if len(rep.Warnings) != 0 {
		t.Errorf("clean tree produced warnings: %v", rep.Warnings)
	}
}

func TestValidateDirErrorsAndWarnings(t *testing.T) {
	// No manifest at all: a hard error.
	if _, err := ValidateDir(t.TempDir()); err == nil || !strings.Contains(err.Error(), ManifestName) {
		t.Errorf("missing manifest: %v", err)
	}

	// Declarative with nothing to contribute, a skill without description,
	// and a directory without SKILL.md: all warnings, not errors.
	dir := writeExtTree(t, map[string]string{
		"extension.yaml":           devManifest,
		"skills/bare/SKILL.md":     "---\nname: bare\n---\n\n# Bare\n",
		"skills/empty-dir/notes":   "not a skill",
		"skills/broken/SKILL.md":   "---\nname: [broken\n---\nbody",
	})
	rep, err := ValidateDir(dir)
	if err != nil {
		t.Fatal(err)
	}
	joined := strings.Join(rep.Warnings, "\n")
	for _, want := range []string{"no description", "has no SKILL.md", "does not parse"} {
		if !strings.Contains(joined, want) {
			t.Errorf("warnings missing %q:\n%s", want, joined)
		}
	}

	// A wasm manifest whose module was never built: warning.
	dir = writeExtTree(t, map[string]string{
		"extension.yaml": "id: alice.dev\nname: Dev\nversion: 0.1.0\ntype: wasm\nwasm:\n  entry: dist/plugin.wasm\n",
	})
	rep, err = ValidateDir(dir)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(strings.Join(rep.Warnings, "\n"), "does not exist") {
		t.Errorf("missing wasm entry should warn: %v", rep.Warnings)
	}
}

func TestInstallDevLifecycle(t *testing.T) {
	t.Setenv(config.HomeEnv, t.TempDir())
	dir := writeExtTree(t, map[string]string{
		"extension.yaml":        devManifest,
		"skills/hello/SKILL.md": devSkill,
		".git/config":           "should not be copied",
	})

	res, err := InstallDev(dir)
	if err != nil {
		t.Fatal(err)
	}
	if res.Entry.Repo != "local" || res.Entry.Tag != "dev" {
		t.Errorf("dev entry = %+v", res.Entry)
	}
	if len(res.Skills) != 1 || res.Skills[0].Name != "hello" {
		t.Errorf("dev install skills = %+v", res.Skills)
	}
	if _, err := os.Stat(filepath.Join(InstallDir("alice.dev", "0.1.0"), ".git")); !os.IsNotExist(err) {
		t.Error("VCS internals must not be copied into the install")
	}
	if cs := Contributions(); len(cs) != 1 || cs[0].ExtID != "alice.dev" {
		t.Errorf("contributions = %+v", cs)
	}

	// Editing the source and re-running dev refreshes the install.
	if err := os.WriteFile(filepath.Join(dir, "skills", "hello", "SKILL.md"),
		[]byte("---\nname: hello\ndescription: Greet twice as hard.\n---\n\nbody\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	res, err = InstallDev(dir)
	if err != nil {
		t.Fatal(err)
	}
	if res.Skills[0].Description != "Greet twice as hard." {
		t.Errorf("re-dev did not refresh: %+v", res.Skills)
	}

	// Update must not touch the network for it: no fake hub is configured
	// here, so any GitHub call would fail loudly instead of being skipped.
	results, err := Update(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if len(results) != 1 || !results[0].Local || results[0].Err != nil {
		t.Errorf("update on a dev install = %+v", results)
	}
}

func TestInstallDevExecutableNeedsTrust(t *testing.T) {
	t.Setenv(config.HomeEnv, t.TempDir())
	dir := writeExtTree(t, map[string]string{
		"extension.yaml": "id: alice.dev\nname: Dev\nversion: 0.1.0\ntype: mcp\nmcp:\n  command: not-a-real-command\n",
	})
	res, err := InstallDev(dir)
	if err != nil {
		t.Fatal(err)
	}
	if !res.NeedsTrust {
		t.Error("an executable dev install must still require trust")
	}
	if res.Entry.TrustedVersion != "" {
		t.Error("a dev install must never arrive trusted")
	}
}
