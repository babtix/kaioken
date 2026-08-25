package onboard

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"kaioken/internal/config"
)

// seedOnboardRepo lays down wiki chapters, a knowledge card and a skill —
// enough to exercise every generated section.
func seedOnboardRepo(t *testing.T) string {
	t.Helper()
	repo := t.TempDir()
	files := map[string]string{
		".kaioken/config.yaml":                                    "version: 1\nmodel: m\n",
		".kaioken/wiki/README.md":                                 "# Wiki\n\nThis repo does things.\n",
		".kaioken/wiki/Getting Started/Installation.md":           "# Installation\n",
		".kaioken/wiki/Architecture Overview/Components.md":       "# Components\n",
		".kaioken/knowledge/core/overview.md":                     "The core module handles requests. It also does more.\n",
		".kaioken/skills/build-it/SKILL.md":                       "---\nname: build-it\ndescription: Build the thing.\n---\n\nSteps here.\n",
		"src/app.go":                                              "package src\n",
	}
	for rel, body := range files {
		p := filepath.Join(repo, filepath.FromSlash(rel))
		if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(p, []byte(body), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	return repo
}

func TestGenerate(t *testing.T) {
	repo := seedOnboardRepo(t)
	cfg, err := config.Load(repo)
	if err != nil {
		t.Fatal(err)
	}

	doc, err := Generate(repo, cfg)
	if err != nil {
		t.Fatalf("Generate: %v", err)
	}

	for _, want := range []string{
		"# Onboarding —",
		"This repo does things.",          // wiki README intro
		"## Read these first",
		"Getting Started — Installation",  // chapter link
		"Architecture Overview — Components",
		"## Module map",
		"**core** — The core module handles requests.", // first sentence only
		"## Stack",
		"## Task guides",
		"`build-it` — Build the thing.",
		"## Getting help",
	} {
		if !strings.Contains(doc, want) {
			t.Errorf("onboarding doc missing %q\n---\n%s", want, doc)
		}
	}
	// The card's second sentence must not leak into the module map.
	if strings.Contains(doc, "It also does more") {
		t.Error("module map must carry only the first sentence")
	}
}

// An empty repo still produces a guide — with placeholders where knowledge is
// missing — rather than an error.
func TestGenerateEmptyKnowledge(t *testing.T) {
	repo := t.TempDir()
	if err := os.WriteFile(filepath.Join(repo, "app.go"), []byte("package main\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	doc, err := Generate(repo, config.Default())
	if err != nil {
		t.Fatalf("Generate: %v", err)
	}
	for _, want := range []string{"## Read these first", "No wiki chapters yet", "No knowledge cards yet"} {
		if !strings.Contains(doc, want) {
			t.Errorf("empty-repo doc missing %q", want)
		}
	}
}

func TestFirstSentence(t *testing.T) {
	cases := map[string]string{
		"One. Two.":            "One.",
		"One. Two":             "One.",
		"Single sentence only": "Single sentence only",
		"First line\nsecond":   "First line",
	}
	for in, want := range cases {
		if got := firstSentence(in); got != want {
			t.Errorf("firstSentence(%q) = %q, want %q", in, got, want)
		}
	}
}
