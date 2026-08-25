package codemap

import (
	"strings"
	"testing"
)

func names(fm *FileMap) []string {
	var out []string
	for _, s := range fm.Symbols {
		out = append(out, s.Name)
	}
	return out
}

func has(fm *FileMap, name string) bool {
	_, ok := fm.Lookup(name)
	return ok
}

const goSource = `package widget

import (
	"fmt"
	"strings"
)

// Widget is a thing.
type Widget struct {
	Name string
	size int
}

type Renderer interface {
	Render() string
}

const MaxWidgets = 10

var registry map[string]*Widget

// New builds a Widget.
func New(name string) *Widget {
	return &Widget{Name: name}
}

func (w *Widget) Render() string {
	return fmt.Sprintf("%s", strings.ToUpper(w.Name))
}

func (w *Widget) resize(n int) {
	w.size = n
}

func unexported() {}
`

func TestParseGo(t *testing.T) {
	fm := Parse("internal/widget/widget.go", goSource)

	if fm.Lang != "go" || !fm.Analyzed {
		t.Fatalf("lang = %q analyzed = %v", fm.Lang, fm.Analyzed)
	}
	if fm.Package != "widget" {
		t.Errorf("package = %q, want widget", fm.Package)
	}
	if len(fm.Imports) != 2 {
		t.Errorf("imports = %v, want fmt and strings", fm.Imports)
	}

	for _, want := range []string{"Widget", "Renderer", "MaxWidgets", "registry", "New", "Render", "resize", "unexported"} {
		if !has(fm, want) {
			t.Errorf("missing symbol %q (got %v)", want, names(fm))
		}
	}

	// Kinds must be right — verification and bundling both branch on them.
	if s, _ := fm.Lookup("Widget"); s.Kind != KindType {
		t.Errorf("Widget kind = %q, want type", s.Kind)
	}
	if s, _ := fm.Lookup("Renderer"); s.Kind != KindInterface {
		t.Errorf("Renderer kind = %q, want interface", s.Kind)
	}
	if s, _ := fm.Lookup("MaxWidgets"); s.Kind != KindConst {
		t.Errorf("MaxWidgets kind = %q, want const", s.Kind)
	}
	if s, _ := fm.Lookup("Render"); s.Kind != KindMethod || s.Receiver != "*Widget" {
		t.Errorf("Render = %+v, want a method on *Widget", s)
	}

	// Go export rules.
	if s, _ := fm.Lookup("New"); !s.Exported {
		t.Error("New should be exported")
	}
	if s, _ := fm.Lookup("unexported"); s.Exported {
		t.Error("unexported should not be exported")
	}

	// Line ranges must bracket the real declaration, since anchors cite them.
	s, _ := fm.Lookup("New")
	start, end := s.Span()
	if !strings.Contains(lineAt(goSource, start), "func New(") {
		t.Errorf("New starts at line %d: %q", start, lineAt(goSource, start))
	}
	if end <= start {
		t.Errorf("New span = %d-%d, want a multi-line body", start, end)
	}
	if s.Doc == "" || !strings.Contains(s.Doc, "builds a Widget") {
		t.Errorf("doc comment not captured: %q", s.Doc)
	}
}

// A file that does not parse must still yield symbols via the fallback, not
// silently produce an empty skeleton.
func TestParseGoFallsBackOnSyntaxError(t *testing.T) {
	broken := "package x\n\nfunc Good() {\n\treturn\n}\n\nfunc Broken( {\n"
	fm := Parse("broken.go", broken)
	if !fm.Analyzed {
		t.Fatal("expected the fallback parser to run")
	}
	if !has(fm, "Good") {
		t.Errorf("fallback lost declarations: %v", names(fm))
	}
}

const pySource = `import os
from typing import List

CONSTANT = 5

class Service:
    """A service."""

    def __init__(self, name):
        self.name = name

    def handle(self, req):
        return self.name

    def _private(self):
        pass

class Other(Service):
    def handle(self, req):
        return None

def module_level(a, b):
    return a + b

async def fetch(url):
    return url
`

func TestParsePython(t *testing.T) {
	fm := Parse("app/service.py", pySource)

	if fm.Lang != "python" {
		t.Fatalf("lang = %q", fm.Lang)
	}
	for _, want := range []string{"Service", "Other", "handle", "module_level", "fetch", "_private"} {
		if !has(fm, want) {
			t.Errorf("missing %q (got %v)", want, names(fm))
		}
	}
	if s, _ := fm.Lookup("Service"); s.Kind != KindClass {
		t.Errorf("Service kind = %q, want class", s.Kind)
	}
	// A def inside a class is a method, and records its class.
	if s, _ := fm.Lookup("handle"); s.Kind != KindMethod || s.Receiver != "Service" {
		t.Errorf("handle = %+v, want a method on Service", s)
	}
	if s, _ := fm.Lookup("module_level"); s.Kind != KindFunc || s.Receiver != "" {
		t.Errorf("module_level = %+v, want a plain function", s)
	}
	// Leading underscore means private in Python.
	if s, _ := fm.Lookup("_private"); s.Exported {
		t.Error("_private should not be exported")
	}
	if s, _ := fm.Lookup("fetch"); !s.Exported {
		t.Error("fetch should be exported")
	}

	// Indentation-derived body extent: the class must span past its methods.
	svc, _ := fm.Lookup("Service")
	start, end := svc.Span()
	if end <= start+3 {
		t.Errorf("Service span = %d-%d, too short to cover its methods", start, end)
	}
}

const tsSource = `import { useState } from "react";
import type { Props } from "./types";

export type Config = {
  url: string;
};

export interface Client {
  fetch(): Promise<void>;
}

export class ApiClient implements Client {
  private token: string;

  constructor(token: string) {
    this.token = token;
  }

  async fetch(): Promise<void> {
    return;
  }
}

export function helper(a: number): number {
  return a * 2;
}

export const arrowFn = async (x: string) => {
  return x;
};

function internalOnly() {}
`

func TestParseTypeScript(t *testing.T) {
	fm := Parse("src/api/client.ts", tsSource)

	if fm.Lang != "typescript" {
		t.Fatalf("lang = %q", fm.Lang)
	}
	for _, want := range []string{"Config", "Client", "ApiClient", "helper", "arrowFn", "internalOnly"} {
		if !has(fm, want) {
			t.Errorf("missing %q (got %v)", want, names(fm))
		}
	}
	if s, _ := fm.Lookup("ApiClient"); s.Kind != KindClass {
		t.Errorf("ApiClient kind = %q, want class", s.Kind)
	}
	if s, _ := fm.Lookup("Client"); s.Kind != KindInterface {
		t.Errorf("Client kind = %q, want interface", s.Kind)
	}
	if s, _ := fm.Lookup("helper"); !s.Exported {
		t.Error("an exported function should be marked exported")
	}
	if len(fm.Imports) == 0 {
		t.Error("imports not captured")
	}
}

// Control-flow keywords must never be mistaken for method declarations — a
// bogus symbol would make grounding verification accept a hallucination.
func TestParseCLikeIgnoresControlFlow(t *testing.T) {
	src := `export class T {
  run() {
    if (x) {
      return 1;
    }
    for (const a of b) {
      doThing();
    }
    while (true) {
      break;
    }
  }
}
`
	fm := Parse("t.ts", src)
	for _, bad := range []string{"if", "for", "while", "switch", "catch", "return"} {
		if has(fm, bad) {
			t.Errorf("control-flow keyword %q captured as a symbol: %v", bad, names(fm))
		}
	}
	if !has(fm, "run") {
		t.Errorf("real method lost: %v", names(fm))
	}
}

// Non-code files should report cleanly as unanalyzed, not as failures.
func TestParseUnsupportedLanguage(t *testing.T) {
	fm := Parse("config/settings.yaml", "key: value\nother: 2\n")
	if fm.Analyzed {
		t.Error("yaml should not be reported as analyzed")
	}
	if len(fm.Symbols) != 0 {
		t.Errorf("expected no symbols, got %v", names(fm))
	}
	// The skeleton should still name the file, so it appears in listings.
	if !strings.Contains(fm.Skeleton(), "config/settings.yaml") {
		t.Error("skeleton should still identify the file")
	}
}

func TestSkeletonIncludesAnchors(t *testing.T) {
	fm := Parse("internal/widget/widget.go", goSource)
	sk := fm.Skeleton()

	if !strings.Contains(sk, "package widget") {
		t.Error("skeleton missing package")
	}
	if !strings.Contains(sk, "imports:") {
		t.Error("skeleton missing imports")
	}
	if !strings.Contains(sk, "func New(name string) *Widget") {
		t.Errorf("skeleton missing a real signature:\n%s", sk)
	}
	// Every symbol line carries an L<start>-<end> anchor.
	if !strings.Contains(sk, "  L") {
		t.Errorf("skeleton missing line anchors:\n%s", sk)
	}
}

func TestExportedFilter(t *testing.T) {
	fm := Parse("w.go", goSource)
	for _, s := range fm.Exported() {
		if !s.Exported {
			t.Errorf("Exported() returned an unexported symbol %q", s.Name)
		}
	}
	if len(fm.Exported()) == 0 || len(fm.Exported()) >= len(fm.Symbols) {
		t.Errorf("Exported() = %d of %d symbols, expected a strict subset",
			len(fm.Exported()), len(fm.Symbols))
	}
}

// lineAt returns the 1-indexed line n of s.
func lineAt(s string, n int) string {
	lines := strings.Split(s, "\n")
	if n < 1 || n > len(lines) {
		return ""
	}
	return lines[n-1]
}
