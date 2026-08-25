// Package search indexes everything Kaioken generates about a repository —
// wiki chapters, knowledge cards, skills — and ranks it against a query.
//
// Ranking is hybrid by design. BM25 always runs: it needs no model, no
// network and no API key, so search works in a fresh clone and on a plane.
// When an embedding endpoint is configured the same query also runs against
// stored vectors and the two rankings are fused, which is what makes "how do
// we avoid rate limits" find a chapter that only ever says "backoff".
package search

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"kaioken/internal/config"
	"kaioken/internal/skills"
	"kaioken/internal/wiki"
)

// Kind labels where a chunk came from, so callers can filter and so results
// can say what they are.
type Kind string

const (
	KindWiki  Kind = "wiki"
	KindCard  Kind = "card"
	KindSkill Kind = "skill"
)

// Doc is one indexed source file.
type Doc struct {
	// Path is the identifier a caller uses to open the document again:
	// wiki-relative for wiki docs, "<module>/<card>.md" for cards, the skill
	// name for skills.
	Path string `json:"path"`
	// Kind says which store it belongs to.
	Kind Kind `json:"kind"`
	// Section is the top-level grouping — wiki section id, module id, or empty.
	Section string `json:"section"`
	// Title is the document's own heading.
	Title string `json:"title"`
	// Hash is the content hash, used to skip re-embedding unchanged text.
	Hash string `json:"hash"`
}

// Chunk is one retrievable passage. Documents are split so a hit points at
// the paragraph that answers the question rather than a 400-line chapter.
type Chunk struct {
	DocID int `json:"doc"`
	// Heading is the nearest enclosing markdown heading, which doubles as the
	// snippet's caption and as extra text to match on.
	Heading string `json:"heading"`
	// Line is the 1-based line in the source document where the chunk starts.
	Line int    `json:"line"`
	Text string `json:"text"`
	// Hash keys the embedding cache.
	Hash string `json:"hash"`

	// tokens is the analysed form, kept out of the persisted JSON because it
	// is cheap to recompute and would triple the index size.
	tokens []string
}

// collect walks the generated stores and returns the corpus. Missing stores
// are not an error: a repo with a wiki but no skills indexes fine.
func collect(repo string) ([]Doc, []Chunk, error) {
	var docs []Doc
	var chunks []Chunk

	add := func(d Doc, body string) {
		id := len(docs)
		docs = append(docs, d)
		for _, c := range splitChunks(body) {
			c.DocID = id
			c.Hash = hashString(c.Heading + "\n" + c.Text)
			chunks = append(chunks, c)
		}
	}

	// Wiki chapters.
	wikiDir := wiki.WikiDir(repo)
	_ = filepath.WalkDir(wikiDir, func(path string, d os.DirEntry, err error) error {
		if err != nil || d.IsDir() || !strings.HasSuffix(d.Name(), ".md") {
			return nil
		}
		if skipWikiFile(d.Name()) {
			return nil
		}
		raw, rerr := os.ReadFile(path)
		if rerr != nil {
			return nil
		}
		rel, _ := filepath.Rel(wikiDir, path)
		rel = filepath.ToSlash(rel)
		section := ""
		if i := strings.Index(rel, "/"); i > 0 {
			section = rel[:i]
		}
		add(Doc{
			Path:    rel,
			Kind:    KindWiki,
			Section: section,
			Title:   firstHeading(string(raw), rel),
			Hash:    hashBytes(raw),
		}, string(raw))
		return nil
	})

	// Knowledge cards, one directory per module.
	cardsDir := filepath.Join(repo, config.Dir, "knowledge")
	_ = filepath.WalkDir(cardsDir, func(path string, d os.DirEntry, err error) error {
		if err != nil || d.IsDir() || !strings.HasSuffix(d.Name(), ".md") {
			return nil
		}
		raw, rerr := os.ReadFile(path)
		if rerr != nil {
			return nil
		}
		rel, _ := filepath.Rel(cardsDir, path)
		rel = filepath.ToSlash(rel)
		module := rel
		if i := strings.LastIndex(rel, "/"); i > 0 {
			module = rel[:i]
		}
		add(Doc{
			Path:    rel,
			Kind:    KindCard,
			Section: module,
			Title:   firstHeading(string(raw), rel),
			Hash:    hashBytes(raw),
		}, string(raw))
		return nil
	})

	// Skills. The description carries the triggering weight for agents, so it
	// is prepended to the body rather than left in frontmatter the index would
	// never see.
	if all, err := skills.List(repo); err == nil {
		for _, sk := range all {
			body := sk.Description + "\n\n" + sk.Body
			add(Doc{
				Path:    sk.Name,
				Kind:    KindSkill,
				Section: sk.Origin,
				Title:   sk.Name,
				Hash:    hashString(body),
			}, body)
		}
	}

	if len(docs) == 0 {
		return nil, nil, nil
	}
	return docs, chunks, nil
}

// skipWikiFile drops generated bookkeeping from the corpus. The wiki
// CHANGELOG is a running list of changed file paths: it shares vocabulary with
// every query in the repo and answers none of them, so leaving it in means the
// top hit for half of all searches is a diff listing.
func skipWikiFile(name string) bool {
	return strings.EqualFold(name, "CHANGELOG.md")
}

// chunkTarget is the size a passage aims for, in characters. Big enough to
// carry an argument, small enough that a hit is worth reading whole.
const chunkTarget = 1400

// splitChunks cuts markdown at heading boundaries, then splits any section
// that is still oversized at paragraph boundaries. Code fences are never cut
// mid-block: a half-fence is worse than a long chunk.
func splitChunks(body string) []Chunk {
	lines := strings.Split(body, "\n")

	var out []Chunk
	var buf []string
	heading := ""
	start := 1
	fenced := false

	flush := func(endLine int) {
		text := strings.TrimSpace(strings.Join(buf, "\n"))
		buf = buf[:0]
		if text == "" || isNavigation(heading, text) {
			start = endLine
			return
		}
		for _, piece := range splitOversized(text) {
			out = append(out, Chunk{Heading: heading, Line: start, Text: piece})
		}
		start = endLine
	}

	for i, line := range lines {
		trimmed := strings.TrimSpace(line)
		if strings.HasPrefix(trimmed, "```") {
			fenced = !fenced
		}
		if !fenced && strings.HasPrefix(line, "#") && strings.Contains(line, " ") {
			flush(i + 1)
			heading = strings.TrimSpace(strings.TrimLeft(line, "#"))
			start = i + 1
		}
		buf = append(buf, line)
		if !fenced && len(strings.Join(buf, "\n")) > chunkTarget*2 {
			flush(i + 2)
		}
	}
	flush(len(lines))
	return out
}

// isNavigation spots a chunk that is a table of contents or a bare link list.
// Such a chunk names every topic in the document and explains none of them, so
// it out-ranks the passage that holds the actual answer on any query about
// that document's subject matter.
func isNavigation(heading, text string) bool {
	if strings.Contains(strings.ToLower(heading), "table of contents") {
		return true
	}
	lines := strings.Split(text, "\n")
	listy, meaningful := 0, 0
	for _, line := range lines {
		t := strings.TrimSpace(line)
		if t == "" || strings.HasPrefix(t, "#") {
			continue
		}
		meaningful++
		isBullet := strings.HasPrefix(t, "-") || strings.HasPrefix(t, "*") || startsWithNumber(t)
		if isBullet && strings.Contains(t, "](") {
			listy++
		}
	}
	return meaningful >= 4 && listy*10 >= meaningful*8
}

func startsWithNumber(s string) bool {
	return len(s) > 1 && s[0] >= '0' && s[0] <= '9'
}

// splitOversized breaks a too-long section on blank lines, keeping each piece
// near chunkTarget.
func splitOversized(text string) []string {
	if len(text) <= chunkTarget*2 {
		return []string{text}
	}
	paras := strings.Split(text, "\n\n")
	var out []string
	var cur strings.Builder
	for _, p := range paras {
		if cur.Len() > 0 && cur.Len()+len(p) > chunkTarget {
			out = append(out, strings.TrimSpace(cur.String()))
			cur.Reset()
		}
		if cur.Len() > 0 {
			cur.WriteString("\n\n")
		}
		cur.WriteString(p)
	}
	if s := strings.TrimSpace(cur.String()); s != "" {
		out = append(out, s)
	}
	return out
}

func firstHeading(text, fallback string) string {
	for _, line := range strings.Split(text, "\n") {
		if strings.HasPrefix(line, "# ") {
			return strings.TrimSpace(line[2:])
		}
	}
	base := filepath.Base(fallback)
	return strings.TrimSuffix(base, ".md")
}

func hashBytes(b []byte) string {
	sum := sha256.Sum256(b)
	return hex.EncodeToString(sum[:12])
}

func hashString(s string) string { return hashBytes([]byte(s)) }

// corpusFingerprint identifies a corpus state cheaply, so an unchanged repo
// reuses its index without re-reading every file's content.
func corpusFingerprint(repo string) string {
	h := sha256.New()
	roots := []string{
		wiki.WikiDir(repo),
		filepath.Join(repo, config.Dir, "knowledge"),
		skills.Dir(repo),
	}
	var entries []string
	for _, root := range roots {
		_ = filepath.WalkDir(root, func(path string, d os.DirEntry, err error) error {
			if err != nil || d.IsDir() || !strings.HasSuffix(d.Name(), ".md") {
				return nil
			}
			info, ierr := d.Info()
			if ierr != nil {
				return nil
			}
			entries = append(entries, fmt.Sprintf("%s|%d|%d", path, info.Size(), info.ModTime().UnixNano()))
			return nil
		})
	}
	sort.Strings(entries)
	for _, e := range entries {
		h.Write([]byte(e))
		h.Write([]byte{0})
	}
	return hex.EncodeToString(h.Sum(nil)[:12])
}
