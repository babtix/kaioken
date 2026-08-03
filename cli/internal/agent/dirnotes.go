package agent

// Directory-scoped instructions.
//
// A repository's conventions are not uniform. The generated client in
// api/gen/ must not be hand-edited; the migrations directory has an ordering
// rule; one package still targets an old runtime. Kaioken reads the root
// AGENTS.md into every prompt, which covers repo-wide rules and nothing else —
// so in a monorepo the per-package rules never reach the model at all, and
// putting them all in the root file would mean paying for every rule on every
// turn regardless of what is being touched.
//
// So they arrive with the file instead. When a read succeeds, the directories
// between that file and the repo root are checked for their own AGENTS.md, and
// any found are appended to the tool result as a system reminder. The model
// learns the rule at the moment it is looking at the code the rule governs.
//
// Ported from opencode's Instruction.resolve (session/instruction.ts), which
// walks the same path and dedupes the same three ways: against the file
// already in the system prompt, against notes already delivered, and against
// the file being read itself.

import (
	"os"
	"path/filepath"
	"strings"
	"sync"
)

// The names checked in each directory are instructionFiles from knowledge.go —
// deliberately the same list the root-level loader uses, so a repo does not
// have to learn two conventions depending on how deep the file sits. The first
// match in a directory wins; a directory carrying two should not pay twice.

// maxDirNoteBytes caps one directory's note. A nested AGENTS.md is meant to be
// a handful of rules; anything larger is a document that belongs behind
// read_knowledge, and injecting it unasked would cost more context than the
// read that triggered it.
const maxDirNoteBytes = 4_000

// DirNotes remembers which directory-scoped instruction files have already
// been delivered, so a package's rules are stated once rather than on every
// read of every file in it. It is shared across turns like BudgetGuard,
// because the Agent value is rebuilt for each one. A nil DirNotes delivers
// nothing, which is what sub-agents and tests get.
type DirNotes struct {
	mu   sync.Mutex
	seen map[string]bool
}

// NewDirNotes returns a tracker with nothing delivered yet.
func NewDirNotes() *DirNotes { return &DirNotes{seen: map[string]bool{}} }

// claim records a path as delivered and reports whether this call was the
// first to do so.
func (d *DirNotes) claim(path string) bool {
	if d == nil {
		return false
	}
	d.mu.Lock()
	defer d.mu.Unlock()
	if d.seen == nil {
		d.seen = map[string]bool{}
	}
	if d.seen[path] {
		return false
	}
	d.seen[path] = true
	return true
}

// forFile returns the instruction notes that apply to a file being read and
// have not been delivered yet, rendered as a system reminder block. It returns
// "" when there is nothing new to say, which is the common case.
//
// The walk stops at the repo root: the root's own AGENTS.md is already in the
// system prompt on every turn, and repeating it here would be pure cost.
func (a *Agent) dirNotesFor(absFile string) string {
	if a.Notes == nil {
		return ""
	}
	root, err := filepath.Abs(a.Root)
	if err != nil {
		return ""
	}
	dir := filepath.Dir(absFile)

	// Collect from the file outward, then reverse: the outermost rule is the
	// most general, and general-before-specific is how the prompt reads
	// everywhere else.
	var found []string
	for cur := dir; strings.HasPrefix(cur, root) && cur != root; cur = filepath.Dir(cur) {
		note, path := readInstructionFile(cur)
		if note == "" || path == absFile {
			continue // a file may not instruct about itself
		}
		if !a.Notes.claim(path) {
			continue
		}
		rel, err := filepath.Rel(root, path)
		if err != nil {
			rel = path
		}
		found = append(found, "Instructions from "+filepath.ToSlash(rel)+":\n"+note)
		if parent := filepath.Dir(cur); parent == cur {
			break // defensive: filepath.Dir is a fixed point at the volume root
		}
	}
	if len(found) == 0 {
		return ""
	}
	for i, j := 0, len(found)-1; i < j; i, j = i+1, j-1 {
		found[i], found[j] = found[j], found[i]
	}
	return "\n\n<system-reminder>\n" + strings.Join(found, "\n\n") +
		"\n\nThese apply to the file you just read. They come from the repository and " +
		"outrank general guidance.\n</system-reminder>"
}

// readInstructionFile returns the first instruction file's trimmed contents in
// a directory, and its absolute path. Unreadable and empty files are skipped.
func readInstructionFile(dir string) (string, string) {
	for _, name := range instructionFiles {
		p := filepath.Join(dir, name)
		data, err := os.ReadFile(p)
		if err != nil {
			continue
		}
		text := strings.TrimSpace(string(data))
		if text == "" {
			continue
		}
		if len(text) > maxDirNoteBytes {
			text = text[:maxDirNoteBytes] + "\n… [truncated]"
		}
		return text, p
	}
	return "", ""
}
