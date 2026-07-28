package main

import (
	"encoding/json"
	"fmt"
	"os"
	"strings"
)

// Entry is one index listing. Schema v2: type, tags, permissions and
// homepage are optional so every v1 index stays valid — an absent type
// means declarative, the code-free tier.
type Entry struct {
	ID          string `json:"id"`
	Repo        string `json:"repo"`
	Name        string `json:"name"`
	Description string `json:"description"`
	Author      string `json:"author"`
	// Type is the capability tier: declarative (default), mcp or wasm.
	// Listing it here lets users see the trust tier before installing.
	Type string `json:"type,omitempty"`
	// Tags power discovery filtering; at most 5, lowercase kebab-case.
	Tags []string `json:"tags,omitempty"`
	// Permissions mirrors a wasm extension's declared capability set so
	// the listing can never understate what trusting would grant.
	Permissions []string `json:"permissions,omitempty"`
	Homepage    string   `json:"homepage,omitempty"`
	// Flags carries moderation state; "malicious" is the kill switch the
	// Kaioken client enforces on install, update and browse.
	Flags []string `json:"flags,omitempty"`
}

var knownFlags = map[string]bool{"malicious": true, "deprecated": true}

var knownTypes = map[string]bool{"declarative": true, "mcp": true, "wasm": true}

// knownPermissions must match the set the Kaioken host can actually grant
// (cli/internal/ext). A listing asking for anything else is refused here for
// the same reason the installer refuses it: never silently ungranted.
var knownPermissions = map[string]bool{"fs:read:workspace": true}

const maxTags = 5

// LoadIndex reads and parses the index file.
func LoadIndex(path string) ([]Entry, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("reading %s: %w", path, err)
	}
	var entries []Entry
	if err := json.Unmarshal(raw, &entries); err != nil {
		return nil, fmt.Errorf("%s is not a valid JSON array: %w", path, err)
	}
	return entries, nil
}

// CheckEntries runs every offline structural rule and returns one message
// per problem. An empty slice means the index is structurally valid.
func CheckEntries(entries []Entry) []string {
	var problems []string
	bad := func(i int, e Entry, format string, args ...any) {
		problems = append(problems, fmt.Sprintf("entry %d (%s): %s", i, e.ID, fmt.Sprintf(format, args...)))
	}

	seenID := map[string]int{}
	seenRepo := map[string]int{}
	for i, e := range entries {
		if !validID(e.ID) {
			bad(i, e, "id must be owner.name in lowercase kebab-case")
		}
		if prev, dup := seenID[e.ID]; dup {
			bad(i, e, "duplicate id of entry %d", prev)
		}
		seenID[e.ID] = i
		if !validRepo(e.Repo) {
			bad(i, e, "repo must be owner/name")
		}
		if prev, dup := seenRepo[strings.ToLower(e.Repo)]; dup {
			bad(i, e, "duplicate repo of entry %d", prev)
		}
		seenRepo[strings.ToLower(e.Repo)] = i
		if strings.TrimSpace(e.Name) == "" {
			bad(i, e, "name is empty")
		}
		if strings.TrimSpace(e.Description) == "" {
			bad(i, e, "description is empty")
		}
		if e.Type != "" && !knownTypes[e.Type] {
			bad(i, e, "unknown type %q (declarative, mcp or wasm)", e.Type)
		}
		if len(e.Tags) > maxTags {
			bad(i, e, "at most %d tags", maxTags)
		}
		for _, tag := range e.Tags {
			if !kebab(tag) {
				bad(i, e, "tag %q must be lowercase kebab-case", tag)
			}
		}
		if len(e.Permissions) > 0 && e.Type != "wasm" {
			bad(i, e, "permissions apply to wasm extensions only")
		}
		for _, p := range e.Permissions {
			if !knownPermissions[p] {
				bad(i, e, "unknown permission %q", p)
			}
		}
		if e.Homepage != "" && !strings.HasPrefix(e.Homepage, "https://") {
			bad(i, e, "homepage must be an https:// URL")
		}
		for _, f := range e.Flags {
			if !knownFlags[strings.ToLower(f)] {
				bad(i, e, "unknown flag %q", f)
			}
		}
	}
	return problems
}

func validID(id string) bool {
	segs := strings.Split(id, ".")
	if len(segs) != 2 {
		return false
	}
	for _, s := range segs {
		if !kebab(s) {
			return false
		}
	}
	return true
}

func kebab(s string) bool {
	if s == "" || s[0] == '-' || s[len(s)-1] == '-' {
		return false
	}
	for i := 0; i < len(s); i++ {
		c := s[i]
		if (c < 'a' || c > 'z') && (c < '0' || c > '9') && c != '-' {
			return false
		}
	}
	return true
}

func validRepo(repo string) bool {
	parts := strings.Split(repo, "/")
	if len(parts) != 2 {
		return false
	}
	for _, p := range parts {
		if p == "" || p == "." || p == ".." {
			return false
		}
		for i := 0; i < len(p); i++ {
			c := p[i]
			switch {
			case c >= 'a' && c <= 'z', c >= 'A' && c <= 'Z', c >= '0' && c <= '9':
			case c == '-' || c == '_' || c == '.':
			default:
				return false
			}
		}
	}
	return true
}
