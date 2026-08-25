package memory

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"kaioken/internal/llm"
	"kaioken/internal/session"
)

// A session digest is the high-signal distillation of a conversation: what was
// wanted, what was touched, how it ended, and what to watch for next time. It
// is written next to the transcript at session close and scanned by the recall
// tool — full transcripts are read only on demand, so recall stays cheap
// without an index or a new dependency.

// Digest is one session's summary.
type Digest struct {
	SessionID string   `yaml:"session_id"`
	Title     string   `yaml:"title"`
	Date      string   `yaml:"date"`
	Goal      string   `yaml:"goal"`
	Files     []string `yaml:"files,omitempty"`
	Outcome   string   `yaml:"outcome"`
	Gotchas   []string `yaml:"gotchas,omitempty"`
}

// digestSystem instructs the model to distill a session. It is fed the
// transcript of ACTIONS, not raw file contents — memory writes derive from the
// agent's conclusions about its own work, never verbatim from tool output, so a
// prompt-injected README cannot become a permanent instruction.
const digestSystem = `Distill the following coding-assistant session into a compact digest a later
session could use to recall what happened. Be factual and terse.

Return ONLY YAML with these fields:
session_id: <echo the id>
title: <short title>
date: <echo the iso date>
goal: <one sentence: what the user wanted>
files: [<repo-relative paths the agent edited, deduped>]
outcome: <one of: success, failure, partial>
gotchas: [<short bullets: traps hit, corrections made, things to do differently>]

No prose, no markdown, no commentary. If a field has no content, omit it.`

// digestPath is the sidecar path for a session's digest.
func digestPath(repo, sid string) string {
	return filepath.Join(session.Dir(repo), sid+".digest.md")
}

// WriteDigest summarizes a session and writes the digest sidecar. It is a
// single model call; a failure is returned but never blocks a session close —
// the caller decides whether to surface it. A session too short to summarize
// produces no file.
func WriteDigest(ctx context.Context, client *llm.Client, repo string, sess *session.Session) (*Digest, error) {
	if sess == nil || len(sess.Messages) < 3 {
		return nil, nil
	}
	d, err := summarizeSession(ctx, client, sess)
	if err != nil {
		return nil, err
	}
	if d == nil {
		return nil, nil
	}
	if err := os.MkdirAll(session.Dir(repo), 0o755); err != nil {
		return nil, err
	}
	if err := os.WriteFile(digestPath(repo, sess.ID), []byte(renderDigest(d)), 0o644); err != nil {
		return nil, err
	}
	return d, nil
}

// summarizeSession calls the model once to produce a digest from the transcript.
// Tool results are previewed rather than included in full: their bulk is what
// made the session long, and the digest only needs what was consulted.
func summarizeSession(ctx context.Context, client *llm.Client, sess *session.Session) (*Digest, error) {
	var b strings.Builder
	fmt.Fprintf(&b, "session_id: %s\n", sess.ID)
	fmt.Fprintf(&b, "title: %s\n", sess.Title)
	fmt.Fprintf(&b, "date: %s\n\n", sess.Updated.Format(time.RFC3339))
	b.WriteString("Transcript (tool results previewed):\n\n")
	for _, msg := range sess.Messages {
		switch msg.Role {
		case "user":
			b.WriteString("User: " + clip(msg.Content, 500) + "\n")
		case "assistant":
			if strings.TrimSpace(msg.Content) != "" {
				b.WriteString("Assistant: " + clip(msg.Content, 500) + "\n")
			}
			for _, tc := range msg.ToolCalls {
				b.WriteString("Assistant used " + tc.Function.Name + "(" + clip(tc.Function.Arguments, 200) + ")\n")
			}
		case "tool":
			b.WriteString("Tool [" + msg.Name + "]: " + clip(msg.Content, 200) + "\n")
		}
	}
	out, err := client.Chat(ctx, digestSystem, b.String())
	if err != nil {
		return nil, err
	}
	return parseDigest(unfence(out), sess.ID)
}

// Recall scans session digests for ones matching the query, returning the top-N
// by a cheap relevance score. No index, no SQL: a few hundred digests scan in
// milliseconds, and the moment that stops being true is the moment to revisit.
func Recall(repo, query string, limit int) ([]Digest, error) {
	query = strings.ToLower(strings.TrimSpace(query))
	if query == "" {
		return listDigests(repo, limit)
	}
	entries, err := os.ReadDir(session.Dir(repo))
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}
	type scored struct {
		d *Digest
		s int
	}
	var hits []scored
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".digest.md") {
			continue
		}
		raw, err := os.ReadFile(filepath.Join(session.Dir(repo), e.Name()))
		if err != nil {
			continue
		}
		text := string(raw)
		d, err := parseDigest(text, strings.TrimSuffix(e.Name(), ".digest.md"))
		if err != nil || d == nil {
			continue
		}
		s := score(text, query)
		if s > 0 {
			hits = append(hits, scored{d, s})
		}
	}
	sort.Slice(hits, func(i, j int) bool { return hits[i].s > hits[j].s })
	if limit > 0 && len(hits) > limit {
		hits = hits[:limit]
	}
	out := make([]Digest, 0, len(hits))
	for _, h := range hits {
		out = append(out, *h.d)
	}
	return out, nil
}

// listDigests returns the most recent digests regardless of query.
func listDigests(repo string, limit int) ([]Digest, error) {
	entries, err := os.ReadDir(session.Dir(repo))
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}
	var out []Digest
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".digest.md") {
			continue
		}
		raw, err := os.ReadFile(filepath.Join(session.Dir(repo), e.Name()))
		if err != nil {
			continue
		}
		d, err := parseDigest(string(raw), strings.TrimSuffix(e.Name(), ".digest.md"))
		if err != nil || d == nil {
			continue
		}
		out = append(out, *d)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Date > out[j].Date })
	if limit > 0 && len(out) > limit {
		out = out[:limit]
	}
	return out, nil
}

// score is a cheap substring-frequency relevance rank. Good enough to pick
// top-K from a digest catalog without an embedding dependency.
func score(text, query string) int {
	low := strings.ToLower(text)
	n := 0
	for _, term := range strings.Fields(query) {
		if len(term) < 2 {
			continue
		}
		n += strings.Count(low, term)
	}
	return n
}

// renderDigest writes a digest as human-readable markdown with a YAML block,
// so the sidecar is reviewable in an editor and still machine-parseable.
func renderDigest(d *Digest) string {
	var b strings.Builder
	b.WriteString("# Session digest\n\n")
	b.WriteString("```yaml\n")
	fmt.Fprintf(&b, "session_id: %s\n", d.SessionID)
	fmt.Fprintf(&b, "title: %q\n", d.Title)
	fmt.Fprintf(&b, "date: %s\n", d.Date)
	fmt.Fprintf(&b, "goal: %q\n", d.Goal)
	fmt.Fprintf(&b, "outcome: %s\n", d.Outcome)
	if len(d.Files) > 0 {
		b.WriteString("files:\n")
		for _, f := range d.Files {
			fmt.Fprintf(&b, "  - %s\n", f)
		}
	}
	if len(d.Gotchas) > 0 {
		b.WriteString("gotchas:\n")
		for _, g := range d.Gotchas {
			fmt.Fprintf(&b, "  - %q\n", g)
		}
	}
	b.WriteString("```\n")
	return b.String()
}

// parseDigest reads a digest sidecar, tolerating the YAML block whether or not
// it is fenced. id is a fallback when the file omits session_id.
func parseDigest(text, id string) (*Digest, error) {
	text = strings.ReplaceAll(text, "\r\n", "\n")
	body := text
	if i := strings.Index(text, "```yaml"); i >= 0 {
		rest := text[i+len("```yaml"):]
		if j := strings.Index(rest, "```"); j >= 0 {
			body = rest[:j]
		}
	} else if i := strings.Index(text, "```"); i >= 0 {
		rest := text[i+3:]
		if j := strings.Index(rest, "```"); j >= 0 {
			body = rest[:j]
		}
	}
	d := &Digest{SessionID: id}
	for _, line := range strings.Split(body, "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		key, val, ok := strings.Cut(line, ":")
		if !ok {
			continue
		}
		key = strings.TrimSpace(key)
		val = strings.TrimSpace(val)
		val = strings.Trim(val, `"'`)
		switch key {
		case "session_id":
			if val != "" {
				d.SessionID = val
			}
		case "title":
			d.Title = val
		case "date":
			d.Date = val
		case "goal":
			d.Goal = val
		case "outcome":
			d.Outcome = val
		case "files":
			// list items follow as "  - path"; collected below
		case "gotchas":
			// list items follow as "  - text"; collected below
		case "-":
			// not reached: handled by indentation below
		}
	}
	// Collect YAML list entries by re-scanning for indented bullets under a key.
	d.Files, d.Gotchas = collectLists(body)
	if d.Title == "" {
		d.Title = id
	}
	return d, nil
}

// collectLists pulls "- item" sequences under `files:` and `gotchas:`.
func collectLists(body string) (files, gotchas []string) {
	lines := strings.Split(body, "\n")
	cur := ""
	for _, line := range lines {
		trim := strings.TrimSpace(line)
		if strings.HasPrefix(trim, "- ") {
			val := strings.Trim(strings.TrimSpace(trim[2:]), `"'`)
			switch cur {
			case "files":
				files = append(files, val)
			case "gotchas":
				gotchas = append(gotchas, val)
			}
			continue
		}
		if key, _, ok := strings.Cut(trim, ":"); ok && !strings.HasPrefix(line, " ") {
			switch strings.TrimSpace(key) {
			case "files":
				cur = "files"
			case "gotchas":
				cur = "gotchas"
			default:
				cur = ""
			}
		}
	}
	return files, gotchas
}

func clip(s string, n int) string {
	s = strings.ReplaceAll(s, "\n", " ")
	if len(s) > n {
		return s[:n] + "…"
	}
	return s
}

// unfence strips a markdown fence some models wrap whole documents in.
func unfence(doc string) string {
	doc = strings.TrimSpace(doc)
	for _, tag := range []string{"```yaml", "```yml", "```"} {
		if strings.HasPrefix(doc, tag) {
			doc = strings.TrimPrefix(doc, tag)
			doc = strings.TrimSuffix(strings.TrimSpace(doc), "```")
			break
		}
	}
	return strings.TrimSpace(doc)
}
