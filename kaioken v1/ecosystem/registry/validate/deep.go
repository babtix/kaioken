package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sort"
	"strings"
	"time"
)

// Deep validation: fetch each listed repository's latest release and check
// that the extension.yaml it ships agrees with the index entry. This is what
// CI runs on pull requests, so a listing cannot claim to be a harmless
// declarative extension while the release declares an mcp server, and a wasm
// listing cannot understate its permissions.

// DeepConfig points the deep check at GitHub; tests point it at a fake.
type DeepConfig struct {
	Token   string
	APIBase string // default https://api.github.com
	RawBase string // default https://raw.githubusercontent.com
	Client  *http.Client
}

func (c DeepConfig) apiBase() string {
	if c.APIBase != "" {
		return c.APIBase
	}
	return "https://api.github.com"
}

func (c DeepConfig) rawBase() string {
	if c.RawBase != "" {
		return c.RawBase
	}
	return "https://raw.githubusercontent.com"
}

func (c DeepConfig) client() *http.Client {
	if c.Client != nil {
		return c.Client
	}
	return &http.Client{Timeout: 30 * time.Second}
}

// DeepCheck returns one message per problem. A failure on one entry never
// stops the others: every entry gets its own verdict.
func DeepCheck(entries []Entry, cfg DeepConfig) []string {
	var problems []string
	for i, e := range entries {
		// A malicious-flagged entry is kept only as a kill switch; its
		// repo may be gone, and nothing about it needs to stay accurate.
		if hasFlag(e, "malicious") {
			continue
		}
		if !validRepo(e.Repo) {
			continue // already reported structurally
		}
		for _, p := range deepCheckEntry(e, cfg) {
			problems = append(problems, fmt.Sprintf("entry %d (%s): %s", i, e.ID, p))
		}
	}
	return problems
}

func hasFlag(e Entry, flag string) bool {
	for _, f := range e.Flags {
		if strings.EqualFold(f, flag) {
			return true
		}
	}
	return false
}

func deepCheckEntry(e Entry, cfg DeepConfig) []string {
	tag, err := latestReleaseTag(e.Repo, cfg)
	if err != nil {
		return []string{err.Error()}
	}
	raw, err := fetchRaw(fmt.Sprintf("%s/%s/%s/extension.yaml", cfg.rawBase(), e.Repo, tag), cfg)
	if err != nil {
		return []string{fmt.Sprintf("release %s has no readable extension.yaml: %v", tag, err)}
	}
	man := extractManifestFields(string(raw))

	var problems []string
	if man.ID != e.ID {
		problems = append(problems, fmt.Sprintf("manifest id %q does not match the listing", man.ID))
	}
	manType := man.Type
	if manType == "" {
		manType = "declarative"
	}
	entryType := e.Type
	if entryType == "" {
		entryType = "declarative"
	}
	if manType != entryType {
		problems = append(problems, fmt.Sprintf("manifest type %q does not match listed type %q", manType, entryType))
	}
	if manType == "wasm" && !sameSet(man.Permissions, e.Permissions) {
		problems = append(problems, fmt.Sprintf("manifest permissions %v do not match listed permissions %v", man.Permissions, e.Permissions))
	}
	return problems
}

// latestReleaseTag resolves the repo's latest release via the GitHub API.
func latestReleaseTag(repo string, cfg DeepConfig) (string, error) {
	req, err := http.NewRequest(http.MethodGet, cfg.apiBase()+"/repos/"+repo+"/releases/latest", nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	if cfg.Token != "" {
		req.Header.Set("Authorization", "Bearer "+cfg.Token)
	}
	resp, err := cfg.client().Do(req)
	if err != nil {
		return "", fmt.Errorf("could not reach GitHub for %s: %v", repo, err)
	}
	defer resp.Body.Close()
	switch resp.StatusCode {
	case http.StatusOK:
	case http.StatusNotFound:
		return "", fmt.Errorf("%s has no published release", repo)
	default:
		return "", fmt.Errorf("GitHub returned %s for %s", resp.Status, repo)
	}
	var rel struct {
		TagName string `json:"tag_name"`
	}
	if err := json.NewDecoder(io.LimitReader(resp.Body, 1<<20)).Decode(&rel); err != nil || rel.TagName == "" {
		return "", fmt.Errorf("unreadable release data for %s", repo)
	}
	return rel.TagName, nil
}

func fetchRaw(url string, cfg DeepConfig) ([]byte, error) {
	req, err := http.NewRequest(http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	if cfg.Token != "" {
		req.Header.Set("Authorization", "Bearer "+cfg.Token)
	}
	resp, err := cfg.client().Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("%s", resp.Status)
	}
	return io.ReadAll(io.LimitReader(resp.Body, 1<<20))
}

// manifestFields is the subset of extension.yaml the deep check compares.
type manifestFields struct {
	ID          string
	Type        string
	Permissions []string
}

// extractManifestFields pulls id, type and permissions out of a manifest
// without a YAML dependency (this module stays standalone). It understands
// the documented flat format — `key: value` scalars, a block or inline list
// for permissions — which is what `kaioken ext validate` accepts. Anything
// it cannot read surfaces as a mismatch a human reviews.
func extractManifestFields(src string) manifestFields {
	var m manifestFields
	inPermissions := false
	for _, line := range strings.Split(src, "\n") {
		trimmed := strings.TrimRight(line, "\r")
		if inPermissions {
			t := strings.TrimSpace(trimmed)
			if strings.HasPrefix(t, "- ") || t == "-" {
				m.Permissions = append(m.Permissions, unquote(strings.TrimSpace(strings.TrimPrefix(t, "-"))))
				continue
			}
			inPermissions = false
		}
		if strings.HasPrefix(trimmed, " ") || strings.HasPrefix(trimmed, "\t") || strings.HasPrefix(strings.TrimSpace(trimmed), "#") {
			continue // nested keys and comments are irrelevant here
		}
		key, val, ok := strings.Cut(trimmed, ":")
		if !ok {
			continue
		}
		val = strings.TrimSpace(stripComment(val))
		switch strings.TrimSpace(key) {
		case "id":
			m.ID = unquote(val)
		case "type":
			m.Type = unquote(val)
		case "permissions":
			if strings.HasPrefix(val, "[") && strings.HasSuffix(val, "]") {
				for _, p := range strings.Split(strings.Trim(val, "[]"), ",") {
					if p = strings.TrimSpace(p); p != "" {
						m.Permissions = append(m.Permissions, unquote(p))
					}
				}
			} else if val == "" {
				inPermissions = true
			}
		}
	}
	return m
}

// stripComment drops a trailing ` # comment` from an unquoted scalar.
func stripComment(s string) string {
	if strings.HasPrefix(strings.TrimSpace(s), `"`) || strings.HasPrefix(strings.TrimSpace(s), `'`) {
		return s
	}
	if i := strings.Index(s, " #"); i >= 0 {
		return s[:i]
	}
	return s
}

func unquote(s string) string {
	if len(s) >= 2 && (s[0] == '"' && s[len(s)-1] == '"' || s[0] == '\'' && s[len(s)-1] == '\'') {
		return s[1 : len(s)-1]
	}
	return s
}

func sameSet(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	as, bs := append([]string(nil), a...), append([]string(nil), b...)
	sort.Strings(as)
	sort.Strings(bs)
	for i := range as {
		if as[i] != bs[i] {
			return false
		}
	}
	return true
}
