package tui

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	tea "github.com/charmbracelet/bubbletea"
	"gopkg.in/yaml.v3"

	"kaioken/internal/config"
	"kaioken/internal/ext"
)

// The command must be wired into dispatch and offered by the palette.
func TestExtIsDispatchedAndListed(t *testing.T) {
	// Point the per-user dir at a sandbox so the test never sees (or
	// touches) real installed extensions.
	t.Setenv(config.HomeEnv, t.TempDir())

	m := newTestModel(t)
	updated, _ := m.dispatch("/ext")
	joined := strings.Join(updated.(Model).lines, "\n")
	if strings.Contains(joined, "unknown command") {
		t.Fatal("/ext is not handled by dispatch")
	}
	if !strings.Contains(joined, "no extensions installed") {
		t.Errorf("dispatch did not render the extension list:\n%s", joined)
	}

	if _, ok := lookupCommand("ext"); !ok {
		t.Error("/ext missing from the command registry")
	}
	// Aliases resolve too.
	if c, ok := lookupCommand("extensions"); !ok || c.name != "ext" {
		t.Error("alias 'extensions' should resolve to /ext")
	}
}

// Argument errors are reported inline rather than silently ignored.
func TestExtSubcommandValidation(t *testing.T) {
	t.Setenv(config.HomeEnv, t.TempDir())

	m := newTestModel(t)
	updated, _ := m.dispatch("/ext install")
	joined := strings.Join(updated.(Model).lines, "\n")
	if !strings.Contains(joined, "usage: /ext install") {
		t.Errorf("missing-argument install should print usage:\n%s", joined)
	}

	updated, _ = m.dispatch("/ext frobnicate")
	joined = strings.Join(updated.(Model).lines, "\n")
	if !strings.Contains(joined, "unknown ext subcommand") {
		t.Errorf("unknown subcommand should be called out:\n%s", joined)
	}

	// Removing something that is not installed fails cleanly.
	updated, _ = m.dispatch("/ext remove alice.demo")
	joined = strings.Join(updated.(Model).lines, "\n")
	if !strings.Contains(joined, "not installed") {
		t.Errorf("removing a missing extension should say so:\n%s", joined)
	}
}

// Trusting an mcp extension is two-step: the first invocation only shows
// what would run; nothing is trusted (or launched) without an explicit yes.
func TestExtTrustIsTwoStep(t *testing.T) {
	t.Setenv(config.HomeEnv, t.TempDir())

	// Seed an installed, untrusted mcp extension by hand.
	const id, ver = "alice.demo", "1.0.0"
	man := &ext.Manifest{
		ID: id, Name: "Demo", Version: ver, Type: ext.TypeMCP,
		MCP: &ext.MCPConfig{Command: "not-a-real-command", Args: []string{"--serve"}},
	}
	raw, err := yaml.Marshal(man)
	if err != nil {
		t.Fatal(err)
	}
	dir := ext.InstallDir(id, ver)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, ext.ManifestName), raw, 0o644); err != nil {
		t.Fatal(err)
	}
	lock := &ext.Lock{Extensions: []ext.Installed{{ID: id, Version: ver, Repo: "alice/kaioken-demo", Enabled: true}}}
	if err := lock.Save(); err != nil {
		t.Fatal(err)
	}

	m := newTestModel(t)
	updated, _ := m.dispatch("/ext trust " + id)
	joined := strings.Join(updated.(Model).lines, "\n")
	for _, want := range []string{"UNSANDBOXED", "not-a-real-command --serve", "/ext trust " + id + " yes"} {
		if !strings.Contains(joined, want) {
			t.Errorf("trust preview missing %q:\n%s", want, joined)
		}
	}
	lock, err = ext.LoadLock()
	if err != nil {
		t.Fatal(err)
	}
	if lock.Find(id).Trusted() {
		t.Fatal("the preview step must not grant trust")
	}

	// The list shows the untrusted state so it cannot be forgotten.
	updated, _ = m.dispatch("/ext")
	if joined := strings.Join(updated.(Model).lines, "\n"); !strings.Contains(joined, "UNTRUSTED") {
		t.Errorf("list should flag the untrusted mcp extension:\n%s", joined)
	}
}

// The wasm trust preview names the module and its permissions rather than a
// command line, and still requires the explicit yes.
func TestExtTrustWasmPreviewShowsPermissions(t *testing.T) {
	t.Setenv(config.HomeEnv, t.TempDir())

	const id, ver = "alice.wasm", "1.0.0"
	man := &ext.Manifest{
		ID: id, Name: "Wasm Demo", Version: ver, Type: ext.TypeWasm,
		Wasm:        &ext.WasmConfig{Entry: "dist/plugin.wasm"},
		Permissions: []string{ext.PermFSReadWorkspace},
	}
	raw, err := yaml.Marshal(man)
	if err != nil {
		t.Fatal(err)
	}
	dir := ext.InstallDir(id, ver)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, ext.ManifestName), raw, 0o644); err != nil {
		t.Fatal(err)
	}
	lock := &ext.Lock{Extensions: []ext.Installed{{ID: id, Version: ver, Repo: "alice/kaioken-wasm", Enabled: true}}}
	if err := lock.Save(); err != nil {
		t.Fatal(err)
	}

	m := newTestModel(t)
	updated, _ := m.dispatch("/ext trust " + id)
	joined := strings.Join(updated.(Model).lines, "\n")
	for _, want := range []string{"SANDBOXED", "dist/plugin.wasm", ext.PermFSReadWorkspace, "/ext trust " + id + " yes"} {
		if !strings.Contains(joined, want) {
			t.Errorf("wasm trust preview missing %q:\n%s", want, joined)
		}
	}
	lock, err = ext.LoadLock()
	if err != nil {
		t.Fatal(err)
	}
	if lock.Find(id).Trusted() {
		t.Fatal("the preview step must not grant trust")
	}
}

// The browse picker is fed by the registry-fetch message (the same synthetic
// technique the model-picker test uses): malicious entries never reach the
// list, and esc returns to chat without installing anything.
func TestExtBrowsePickerOpensAndFilters(t *testing.T) {
	t.Setenv(config.HomeEnv, t.TempDir())
	m := newTestModel(t)

	updated, _ := m.Update(extRegistryFetchedMsg{entries: []ext.RegistryEntry{
		{ID: "alice.good", Repo: "alice/kaioken-good", Description: "a fine extension", Type: "wasm"},
		{ID: "eve.bad", Repo: "eve/kaioken-bad", Description: "nope", Flags: []string{"malicious"}},
	}})
	m = updated.(Model)
	if m.mode != modePicker {
		t.Fatal("registry entries should open the picker")
	}
	items := m.list.Items()
	if len(items) != 1 {
		t.Fatalf("picker holds %d items — the malicious entry must be filtered out", len(items))
	}
	if it, ok := items[0].(extItem); !ok || it.id != "alice.good" || it.repo != "alice/kaioken-good" {
		t.Errorf("unexpected picker item: %+v", items[0])
	}
	// The capability tier shows before install — that is what the user is
	// consenting to browse toward.
	if desc := items[0].(extItem).Description(); !strings.Contains(desc, "[wasm]") {
		t.Errorf("picker description should carry the tier, got %q", desc)
	}

	// esc leaves the picker without installing.
	m = send(t, m, tea.KeyMsg{Type: tea.KeyEsc})
	if m.mode == modePicker {
		t.Error("esc should close the browse picker")
	}

	// A fetch error stays in chat and points at the direct-install fallback.
	updated, _ = m.Update(extRegistryFetchedMsg{err: os.ErrDeadlineExceeded})
	m = updated.(Model)
	if m.mode == modePicker {
		t.Error("a failed fetch must not open the picker")
	}
	joined := strings.Join(m.lines, "\n")
	if !strings.Contains(joined, "direct install still works") {
		t.Errorf("fetch failure should mention the fallback:\n%s", joined)
	}

	// An empty registry says so instead of opening an empty picker.
	updated, _ = m.Update(extRegistryFetchedMsg{})
	m = updated.(Model)
	if m.mode == modePicker {
		t.Error("an empty registry must not open the picker")
	}
}
