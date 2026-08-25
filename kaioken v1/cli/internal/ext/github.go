package ext

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strings"
	"time"
)

// ghAPI is the GitHub API base URL; tests point it at an httptest server.
var ghAPI = "https://api.github.com"

// extHTTP is the client for every GitHub and registry call.
var extHTTP = &http.Client{Timeout: 60 * time.Second}

// Spec identifies an extension source: a GitHub repository, optionally
// pinned to a release version.
type Spec struct {
	Owner   string
	Name    string
	Version string // empty = latest release
}

// Slug is the "owner/name" form used in the lockfile and the registry.
func (s Spec) Slug() string { return s.Owner + "/" + s.Name }

// ParseSpec accepts the ways people write a GitHub repo — "owner/repo",
// "github.com/owner/repo", a full https URL, each with an optional "@1.2.0"
// pin — and normalises them.
func ParseSpec(raw string) (Spec, error) {
	s := strings.TrimSpace(raw)
	version := ""
	if at := strings.LastIndex(s, "@"); at > 0 {
		version = strings.TrimPrefix(s[at+1:], "v")
		s = s[:at]
		if _, err := parseSemver(version); err != nil {
			return Spec{}, fmt.Errorf("invalid extension source %q: %w", raw, err)
		}
	}
	s = strings.TrimPrefix(s, "https://")
	s = strings.TrimPrefix(s, "http://")
	s = strings.TrimPrefix(s, "github.com/")
	s = strings.TrimSuffix(s, ".git")
	s = strings.Trim(s, "/")
	parts := strings.Split(s, "/")
	if len(parts) != 2 || !repoSegment(parts[0]) || !repoSegment(parts[1]) {
		return Spec{}, fmt.Errorf("invalid extension source %q: want owner/repo, optionally @version", raw)
	}
	return Spec{Owner: parts[0], Name: parts[1], Version: version}, nil
}

// repoSegment reports whether s is a plausible GitHub owner or repo name.
// The segments end up inside API URLs, so anything outside GitHub's own
// character set is refused rather than escaped.
func repoSegment(s string) bool {
	if s == "" || s == "." || s == ".." {
		return false
	}
	for i := 0; i < len(s); i++ {
		c := s[i]
		switch {
		case c >= 'a' && c <= 'z', c >= 'A' && c <= 'Z', c >= '0' && c <= '9':
		case c == '-' || c == '_' || c == '.':
		default:
			return false
		}
	}
	return true
}

// release is the slice of GitHub's release API response the installer needs.
// The zipball is what gets installed: it always exists, so authors do not
// have to attach build artifacts to publish a declarative extension.
type release struct {
	TagName    string `json:"tag_name"`
	ZipballURL string `json:"zipball_url"`
}

// resolveRelease finds the release to install: the latest, or the tagged one
// when the spec pins a version ("v1.2.0" and "1.2.0" tags both work).
func resolveRelease(ctx context.Context, spec Spec) (release, error) {
	if spec.Version == "" {
		rel, err := fetchRelease(ctx, fmt.Sprintf("%s/repos/%s/releases/latest", ghAPI, spec.Slug()))
		if err != nil {
			return release{}, fmt.Errorf("%w — the extension author must publish a GitHub release", err)
		}
		return rel, nil
	}
	rel, err := fetchRelease(ctx, fmt.Sprintf("%s/repos/%s/releases/tags/v%s", ghAPI, spec.Slug(), spec.Version))
	if err == nil {
		return rel, nil
	}
	if rel, err2 := fetchRelease(ctx, fmt.Sprintf("%s/repos/%s/releases/tags/%s", ghAPI, spec.Slug(), spec.Version)); err2 == nil {
		return rel, nil
	}
	// Report the v-tag error: it is the conventional tag name.
	return release{}, err
}

func fetchRelease(ctx context.Context, url string) (release, error) {
	var rel release
	if err := ghJSON(ctx, url, &rel); err != nil {
		return release{}, err
	}
	if rel.ZipballURL == "" {
		return release{}, fmt.Errorf("release %s has no source archive", rel.TagName)
	}
	return rel, nil
}

// tagCommitSHA resolves the commit a tag points at, best-effort: tags are
// mutable on GitHub, so the lockfile records the SHA whenever it can get
// one. Failure returns "" rather than blocking an install.
func tagCommitSHA(ctx context.Context, spec Spec, tag string) string {
	var ref struct {
		Object struct {
			SHA string `json:"sha"`
		} `json:"object"`
	}
	url := fmt.Sprintf("%s/repos/%s/git/ref/tags/%s", ghAPI, spec.Slug(), tag)
	if err := ghJSON(ctx, url, &ref); err != nil {
		return ""
	}
	return ref.Object.SHA
}

// ghJSON GETs a GitHub API URL into out.
func ghJSON(ctx context.Context, url string, out any) error {
	resp, err := ghGet(ctx, url)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	switch resp.StatusCode {
	case http.StatusOK:
		return json.NewDecoder(resp.Body).Decode(out)
	case http.StatusNotFound:
		return fmt.Errorf("not found: %s", url)
	default:
		return fmt.Errorf("GET %s: %s", url, resp.Status)
	}
}

// ghGet issues a GitHub GET. GITHUB_TOKEN, when set, raises the
// unauthenticated rate limit (60 requests/hour otherwise).
func ghGet(ctx context.Context, url string) (*http.Response, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	if tok := os.Getenv("GITHUB_TOKEN"); tok != "" {
		req.Header.Set("Authorization", "Bearer "+tok)
	}
	return extHTTP.Do(req)
}
