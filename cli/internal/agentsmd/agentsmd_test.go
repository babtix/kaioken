package agentsmd

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"kaioken/internal/config"
	"kaioken/internal/scan"
)

func TestMergeAppendsWhenTheDocumentHasNoMarkers(t *testing.T) {
	got := Merge("# AGENTS.md\n\nRun `make test`.", "SECTION")
	if !strings.HasPrefix(got, "# AGENTS.md") {
		t.Fatalf("prose was lost: %q", got)
	}
	if !strings.HasSuffix(got, "SECTION\n") {
		t.Fatalf("section was not appended: %q", got)
	}
}

// The whole point of the markers is that a maintainer can edit around the
// generated block and keep their edits across runs.
func TestMergeReplacesInPlaceAndKeepsSurroundingEdits(t *testing.T) {
	doc := "# AGENTS.md\n\nBefore.\n\n" + markerStart + "\n\nOLD\n\n" + markerEnd + "\n\nAfter — hand written.\n"
	got := Merge(doc, markerStart+"\n\nNEW\n\n"+markerEnd)

	if strings.Contains(got, "OLD") {
		t.Error("stale generated content survived the merge")
	}
	for _, want := range []string{"Before.", "NEW", "After — hand written."} {
		if !strings.Contains(got, want) {
			t.Errorf("merged document lost %q:\n%s", want, got)
		}
	}
	if n := strings.Count(got, markerStart); n != 1 {
		t.Errorf("expected exactly one generated block, got %d", n)
	}
}

// Merge must be idempotent: `kaioken wiki` and `kaioken skills` both refresh
// the block, and repeated runs must not stack copies of it.
func TestMergeIsIdempotent(t *testing.T) {
	section := markerStart + "\n\nSECTION\n\n" + markerEnd
	once := Merge("# AGENTS.md\n\nProse.", section)
	twice := Merge(once, section)
	if once != twice {
		t.Errorf("merge is not idempotent:\nfirst:\n%s\nsecond:\n%s", once, twice)
	}
}

func TestBodyStripsTheGeneratedSection(t *testing.T) {
	doc := "# AGENTS.md\n\nProse.\n\n" + markerStart + "\nGENERATED\n" + markerEnd + "\n\nMore prose.\n"
	body := Body(doc)
	if strings.Contains(body, "GENERATED") || strings.Contains(body, markerStart) {
		t.Errorf("generated content leaked into the body:\n%s", body)
	}
	if !strings.Contains(body, "Prose.") || !strings.Contains(body, "More prose.") {
		t.Errorf("body lost authored prose:\n%s", body)
	}
}

// A truncated marker block (a botched hand-edit) must not make Merge duplicate
// or swallow the document.
func TestMergeRecoversFromAnUnterminatedMarkerBlock(t *testing.T) {
	doc := "# AGENTS.md\n\nProse.\n\n" + markerStart + "\n\nhalf a section, no end marker\n"
	got := Merge(doc, markerStart+"\n\nNEW\n\n"+markerEnd)
	if !strings.Contains(got, "Prose.") {
		t.Errorf("authored prose was lost:\n%s", got)
	}
	if strings.Contains(got, "half a section") {
		t.Errorf("the broken block survived:\n%s", got)
	}
	if n := strings.Count(got, markerStart); n != 1 {
		t.Errorf("expected one marker block, got %d", n)
	}
}

func TestKnowledgeSectionIsEmptyWhenNothingIsGenerated(t *testing.T) {
	repo := t.TempDir()
	if got := KnowledgeSection(repo); got != "" {
		t.Errorf("a repo with no documentation advertised some:\n%s", got)
	}
}

func TestKnowledgeSectionListsWhatIsOnDisk(t *testing.T) {
	repo := t.TempDir()
	writeFile(t, filepath.Join(repo, config.Dir, "architecture.md"), "brief")
	writeFile(t, filepath.Join(repo, config.Dir, "skills", "add-a-cli-command", "SKILL.md"),
		"---\nname: add-a-cli-command\ndescription: How to add a command. Load when adding one.\n---\n\nbody")
	writeFile(t, filepath.Join(repo, config.Dir, "wiki", "Chat Agent", "Chat Agent.md"), "overview")
	writeFile(t, filepath.Join(repo, config.Dir, "wiki", "Chat Agent", "Tool System.md"), "chapter")
	writeFile(t, filepath.Join(repo, config.Dir, "knowledge", "cli", "api.md"), "card")

	got := KnowledgeSection(repo)
	for _, want := range []string{
		"architecture.md",
		"add-a-cli-command",
		"How to add a command.",
		"Chat Agent",
		"Tool System",
		"cli",
	} {
		if !strings.Contains(got, want) {
			t.Errorf("knowledge section is missing %q:\n%s", want, got)
		}
	}
	// The section's own overview page duplicates the section name, so it is not
	// listed as a separate document.
	if strings.Contains(got, "Chat Agent, ") || strings.Contains(got, ", Chat Agent") {
		t.Errorf("section overview page was listed as a chapter:\n%s", got)
	}
}

func TestRefreshKnowledgeIsANoOpWithoutAnAgentsFile(t *testing.T) {
	repo := t.TempDir()
	writeFile(t, filepath.Join(repo, config.Dir, "architecture.md"), "brief")
	changed, err := RefreshKnowledge(repo)
	if err != nil {
		t.Fatalf("RefreshKnowledge: %v", err)
	}
	if changed {
		t.Error("refresh reported a change with no AGENTS.md present")
	}
	if Exists(repo) {
		t.Error("refresh created an AGENTS.md it should not have")
	}
}

func TestRefreshKnowledgeUpdatesAnExistingFile(t *testing.T) {
	repo := t.TempDir()
	writeFile(t, Path(repo), "# AGENTS.md\n\nRun `make test`.\n")
	writeFile(t, filepath.Join(repo, config.Dir, "skills", "write-a-test", "SKILL.md"),
		"---\nname: write-a-test\ndescription: Testing here.\n---\n")

	changed, err := RefreshKnowledge(repo)
	if err != nil {
		t.Fatalf("RefreshKnowledge: %v", err)
	}
	if !changed {
		t.Fatal("refresh reported no change after a skill appeared")
	}
	doc := Load(repo)
	if !strings.Contains(doc, "write-a-test") {
		t.Errorf("the new skill was not advertised:\n%s", doc)
	}
	if !strings.Contains(doc, "Run `make test`.") {
		t.Errorf("authored prose was lost:\n%s", doc)
	}

	// Running it again with nothing new must not rewrite the file.
	again, err := RefreshKnowledge(repo)
	if err != nil {
		t.Fatalf("second RefreshKnowledge: %v", err)
	}
	if again {
		t.Error("refresh rewrote an already-current file")
	}
}

// Evidence collection decides what the model gets to see, so the ranking is
// worth pinning: instruction files and CI outrank a nested README.
func TestCollectPrefersExecutableSourcesOfTruth(t *testing.T) {
	repo := t.TempDir()
	files := map[string]string{
		"README.md":                  "readme",
		"Makefile":                   "test:\n\tgo test ./...",
		".github/workflows/ci.yml":   "name: ci",
		"CLAUDE.md":                  "existing instructions",
		"internal/agent/agent.go":    "package agent",
		"docs/notes.txt":             "irrelevant",
		"web/src/components/App.tsx": "irrelevant",
	}
	var res scan.Result
	for p, body := range files {
		writeFile(t, filepath.Join(repo, filepath.FromSlash(p)), body)
		res.Files = append(res.Files, scan.File{Path: p})
	}

	got := paths(collect(repo, &res))
	if len(got) == 0 {
		t.Fatal("collected nothing")
	}
	if got[0] != "CLAUDE.md" {
		t.Errorf("existing instructions should rank first, got %v", got)
	}
	for _, want := range []string{"Makefile", ".github/workflows/ci.yml", "README.md"} {
		if !contains(got, want) {
			t.Errorf("%s was not collected: %v", want, got)
		}
	}
	for _, unwanted := range []string{"internal/agent/agent.go", "docs/notes.txt", "web/src/components/App.tsx"} {
		if contains(got, unwanted) {
			t.Errorf("%s should not be evidence: %v", unwanted, got)
		}
	}
}

// Kaioken's own output must never be fed back in as evidence: it would make the
// model restate the wiki instead of writing instructions.
func TestCollectIgnoresGeneratedDocumentation(t *testing.T) {
	repo := t.TempDir()
	res := &scan.Result{Files: []scan.File{
		{Path: config.Dir + "/skills/write-a-test/SKILL.md"},
		{Path: config.Dir + "/architecture.md"},
	}}
	for _, f := range res.Files {
		writeFile(t, filepath.Join(repo, filepath.FromSlash(f.Path)), "generated")
	}
	if got := collect(repo, res); len(got) != 0 {
		t.Errorf("generated docs were bundled as evidence: %v", paths(got))
	}
}

func writeFile(t *testing.T, path, body string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(body), 0o644); err != nil {
		t.Fatal(err)
	}
}

func contains(list []string, want string) bool {
	for _, s := range list {
		if s == want {
			return true
		}
	}
	return false
}

// Hand-edited files on Windows routinely pick up a BOM and CRLF endings. Neither
// may hide a skill's description, which is the whole value of the entry.
func TestKnowledgeSectionHandlesBOMAndCRLF(t *testing.T) {
	repo := t.TempDir()
	writeFile(t, filepath.Join(repo, config.Dir, "skills", "write-a-test", "SKILL.md"),
		"\ufeff---\r\nname: write-a-test\r\ndescription: Testing conventions here.\r\n---\r\n\r\nbody")

	got := KnowledgeSection(repo)
	if !strings.Contains(got, "Testing conventions here.") {
		t.Errorf("a BOM/CRLF skill lost its description:\n%s", got)
	}
}

func TestMergeHandlesCRLFDocuments(t *testing.T) {
	doc := "# AGENTS.md\r\n\r\nProse.\r\n\r\n" + markerStart + "\r\nOLD\r\n" + markerEnd + "\r\n"
	got := Merge(doc, markerStart+"\n\nNEW\n\n"+markerEnd)
	if strings.Contains(got, "OLD") {
		t.Errorf("stale block survived in a CRLF document:\n%s", got)
	}
	if !strings.Contains(got, "Prose.") {
		t.Errorf("prose was lost from a CRLF document:\n%s", got)
	}
}
