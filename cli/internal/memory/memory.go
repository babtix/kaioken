package memory

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"kaioken/internal/config"
)

// File names for the two memory channels. The project file lives inside the
// repo's .kaioken/ so it is committed and shared with the team; the user file
// lives in the per-user Kaioken home so it is personal and never committed.
const (
	ProjectFile = "MEMORY.md"
	UserFile    = "USER.md"
)

// MaxMemoryBytes caps what a memory file may contribute to the system prompt.
// ~3200 bytes is roughly 800 tokens — the size at which a hard cap stops being
// a suggestion and starts forcing the agent to merge or evict rather than
// append. Every request pays for this, so it is small on purpose.
const MaxMemoryBytes = 3200

// MaxMemoryFileBytes is the hard cap on the on-disk memory file. It is larger
// than the prompt cap on purpose: the file may hold a little more than the
// prompt injects, so the prompt can truncate with a marker rather than the file
// being silently equal to the limit. An append that would exceed it is refused.
const MaxMemoryFileBytes = 4800

// ProjectPath is the agent-written memory file for a repo.
func ProjectPath(repo string) string {
	return filepath.Join(repo, config.Dir, ProjectFile)
}

// UserPath is the personal, cross-repo memory file.
func UserPath() string {
	return filepath.Join(config.GlobalDir(), UserFile)
}

// LoadProject reads the repo's memory, returning "" when there is none. A
// memory file is optional, so an absent one is not an error.
func LoadProject(repo string) string {
	raw, err := os.ReadFile(ProjectPath(repo))
	if err != nil {
		return ""
	}
	return strings.TrimSpace(strings.ReplaceAll(string(raw), "\r\n", "\n"))
}

// LoadUser reads the personal memory, returning "" when there is none.
func LoadUser() string {
	raw, err := os.ReadFile(UserPath())
	if err != nil {
		return ""
	}
	return strings.TrimSpace(strings.ReplaceAll(string(raw), "\r\n", "\n"))
}

// RenderProject returns the system-prompt section for project memory, or "" if
// the repo has none. It is a context source: empty means skip entirely.
func RenderProject(repo string) string {
	text := LoadProject(repo)
	if text == "" {
		return ""
	}
	if len(text) > MaxMemoryBytes {
		text = text[:MaxMemoryBytes] + "\n… [memory truncated — open " + ProjectFile + " for the rest]"
	}
	return "Project memory — facts the agent recorded about this repository from\n" +
		"past sessions. They are committed alongside the code; treat them as a\n" +
		"starting point, not authority (the code still wins):\n\n" + text
}

// RenderUser returns the system-prompt section for personal memory, or "".
func RenderUser() string {
	text := LoadUser()
	if text == "" {
		return ""
	}
	if len(text) > MaxMemoryBytes {
		text = text[:MaxMemoryBytes] + "\n… [user memory truncated]"
	}
	return "Personal memory — your cross-repo preferences the agent recorded. They\n" +
		"outrank the project memory above but not standing config notes:\n\n" + text
}

// RememberResult describes what a Remember call did.
type RememberResult struct {
	Path    string // the file that changed
	Changed bool   // whether disk was written
	Bytes   int    // size of the resulting memory
}

// Remember records a fact in the project memory. With rewrite=false it appends
// the fact as a dated bullet; with rewrite=true it replaces the whole file with
// the given content (the agent performing a merge/evict).
//
// A naive append past the cap is refused — the agent is told the memory is full
// and must rewrite. That refusal is the feature: it is what stops memory from
// growing unbounded and forces consolidation at the limit rather than in a
// later pass nobody runs. The caller gates user approval; this function only
// touches disk when AllowWrite is true, so a dry-run preview is possible.
func Remember(repo, fact string, rewrite, allowWrite bool) (RememberResult, error) {
	return rememberAt(ProjectPath(repo), LoadProject(repo), fact, rewrite, allowWrite)
}

// RememberUser records a fact in the personal, cross-repo memory at
// ~/.kaioken/USER.md. It writes to a trusted fixed path (not an agent-supplied
// one), so it is safe despite living outside the repo. Same cap and refusal
// semantics as the project channel.
func RememberUser(fact string, rewrite, allowWrite bool) (RememberResult, error) {
	return rememberAt(UserPath(), LoadUser(), fact, rewrite, allowWrite)
}

// rememberAt is the shared core: append or rewrite at a fixed path, enforcing
// the cap and the refusal-on-append-past-cap invariant.
func rememberAt(path, existing, fact string, rewrite, allowWrite bool) (RememberResult, error) {
	fact = strings.TrimSpace(fact)
	if fact == "" {
		return RememberResult{}, fmt.Errorf("nothing to remember")
	}
	var content string
	if rewrite {
		content = fact
	} else {
		content = appendFact(existing, fact)
		if len(content) > MaxMemoryFileBytes {
			// Refuse the append: tell the agent to consolidate. Return the
			// would-be size so the caller can surface a useful message.
			return RememberResult{Path: path, Bytes: len(content)}, ErrMemoryFull
		}
	}
	if len(content) > MaxMemoryFileBytes {
		content = content[:MaxMemoryFileBytes]
	}
	if !allowWrite {
		return RememberResult{Path: path, Bytes: len(content)}, nil
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return RememberResult{}, err
	}
	if err := os.WriteFile(path, []byte(content+"\n"), 0o644); err != nil {
		return RememberResult{}, err
	}
	return RememberResult{Path: path, Changed: true, Bytes: len(content)}, nil
}

// ErrMemoryFull signals that an append would exceed the cap. It is a sentinel,
// not an opaque failure: callers turn it into actionable guidance.
var ErrMemoryFull = fmt.Errorf("memory is at the cap; rewrite it with remember(rewrite=true) to merge or evict")

// appendFact adds a dated bullet to the existing memory, starting the file with
// a short header on first use so a reader knows what they are looking at.
func appendFact(existing, fact string) string {
	header := "# Project memory\n\nFacts the agent recorded about this repository. Edit freely; delete what is wrong.\n"
	var b strings.Builder
	if existing == "" {
		b.WriteString(header)
	} else {
		b.WriteString(existing)
		if !strings.HasSuffix(existing, "\n") {
			b.WriteByte('\n')
		}
	}
	b.WriteString("\n- ")
	b.WriteString(time.Now().UTC().Format("2006-01-02"))
	b.WriteString(" ")
	b.WriteString(fact)
	b.WriteByte('\n')
	return strings.TrimRight(b.String(), "\n")
}
