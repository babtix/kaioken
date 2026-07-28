package main

import (
	"strings"
	"testing"
)

func good() Entry {
	return Entry{
		ID: "alice.demo", Repo: "alice/kaioken-demo",
		Name: "Demo", Description: "Git helpers.", Author: "Alice",
	}
}

func TestCheckEntriesCleanIndex(t *testing.T) {
	wasm := good()
	wasm.ID, wasm.Repo = "bob.wasm", "bob/kaioken-wasm"
	wasm.Type = "wasm"
	wasm.Tags = []string{"tools", "sandbox"}
	wasm.Permissions = []string{"fs:read:workspace"}
	wasm.Homepage = "https://example.com"

	if p := CheckEntries([]Entry{good(), wasm}); len(p) != 0 {
		t.Errorf("clean index reported problems: %v", p)
	}
}

func TestCheckEntriesStructuralRules(t *testing.T) {
	cases := []struct {
		name  string
		mut   func(*Entry)
		wants string
	}{
		{"bad id", func(e *Entry) { e.ID = "Alice.Demo" }, "owner.name"},
		{"single segment id", func(e *Entry) { e.ID = "demo" }, "owner.name"},
		{"bad repo", func(e *Entry) { e.Repo = "alice" }, "owner/name"},
		{"empty name", func(e *Entry) { e.Name = " " }, "name is empty"},
		{"empty description", func(e *Entry) { e.Description = "" }, "description is empty"},
		{"unknown type", func(e *Entry) { e.Type = "native" }, `unknown type "native"`},
		{"too many tags", func(e *Entry) { e.Tags = []string{"a", "b", "c", "d", "e", "f"} }, "at most 5 tags"},
		{"bad tag", func(e *Entry) { e.Tags = []string{"Not-Kebab"} }, "kebab-case"},
		{"permissions on declarative", func(e *Entry) { e.Permissions = []string{"fs:read:workspace"} }, "wasm extensions only"},
		{"unknown permission", func(e *Entry) { e.Type = "wasm"; e.Permissions = []string{"net:example.com"} }, `unknown permission "net:example.com"`},
		{"http homepage", func(e *Entry) { e.Homepage = "http://example.com" }, "https://"},
		{"unknown flag", func(e *Entry) { e.Flags = []string{"sketchy"} }, `unknown flag "sketchy"`},
	}
	for _, tc := range cases {
		e := good()
		tc.mut(&e)
		p := CheckEntries([]Entry{e})
		if len(p) == 0 {
			t.Errorf("%s: no problem reported", tc.name)
			continue
		}
		if !strings.Contains(strings.Join(p, "\n"), tc.wants) {
			t.Errorf("%s: problems %v do not mention %q", tc.name, p, tc.wants)
		}
	}
}

func TestCheckEntriesDuplicates(t *testing.T) {
	a := good()
	b := good() // same id and repo
	b.Name = "Demo Again"
	p := CheckEntries([]Entry{a, b})
	joined := strings.Join(p, "\n")
	if !strings.Contains(joined, "duplicate id") || !strings.Contains(joined, "duplicate repo") {
		t.Errorf("duplicates not reported: %v", p)
	}
}

func TestKnownFlagsStillAccepted(t *testing.T) {
	e := good()
	e.Flags = []string{"malicious", "deprecated"}
	if p := CheckEntries([]Entry{e}); len(p) != 0 {
		t.Errorf("known flags reported: %v", p)
	}
}
