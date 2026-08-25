package wiki

import (
	"net/url"
	"os"
	"path"
	"path/filepath"
	"regexp"
	"sort"
	"strings"

	"kaioken/internal/codemap"
)

// A generated wiki is already a graph — it just has no picture of itself.
// Three relationships are recoverable from what the pipeline already writes to
// disk, with no extra model calls and no new state file:
//
//	contains — a section directory's lead document to its siblings, which is
//	           what gives the drawing its clusters.
//	links    — one document to another, from the relative .md links in prose.
//	source   — a document to the repository files it was generated from, read
//	           back out of the provenance footer stamped by stampProvenance.
//
// BuildGraph is the single entry point; the daemon and `kaioken serve` both
// render its output, so the shape lives here rather than in either transport.

// Node kinds.
const (
	NodeDoc     = "doc"
	NodeFile    = "file"
	NodeSection = "section"
)

// Edge kinds.
const (
	EdgeContains = "contains"
	EdgeLinks    = "links"
	EdgeSource   = "source"
)

// GraphNode is one vertex: a wiki document, a repository file it cites, or —
// only when a section directory has no lead document — the section itself.
type GraphNode struct {
	ID    string `json:"id"`
	Kind  string `json:"kind"`
	Label string `json:"label"`

	// Rel is the wiki-relative path of a doc node, e.g. "Chat Agent/Chat Agent.md".
	Rel string `json:"rel,omitempty"`
	// Path is the repo-relative path of a file node.
	Path string `json:"path,omitempty"`

	Section      string `json:"section,omitempty"`
	Lang         string `json:"lang,omitempty"`
	Words        int    `json:"words,omitempty"`
	IsSectionDoc bool   `json:"is_section_doc,omitempty"`
	// Missing marks a cited file that is no longer in the working tree, so the
	// UI can dim it instead of offering to open something that is not there.
	Missing bool `json:"missing,omitempty"`
}

// GraphEdge is one directed relationship. Source and Target are node IDs.
type GraphEdge struct {
	Source string `json:"source"`
	Target string `json:"target"`
	Kind   string `json:"kind"`
}

// GraphStats is the summary a UI shows without walking the arrays.
type GraphStats struct {
	Docs     int `json:"docs"`
	Files    int `json:"files"`
	Sections int `json:"sections"`
	Edges    int `json:"edges"`
}

// Graph is the whole picture.
type Graph struct {
	Root  string      `json:"root"`
	Nodes []GraphNode `json:"nodes"`
	Edges []GraphEdge `json:"edges"`
	Stats GraphStats  `json:"stats"`
}

// docID and fileID namespace the two node families, so a document and a source
// file that happen to share a path can never collide.
func docID(rel string) string  { return NodeDoc + ":" + rel }
func fileID(p string) string   { return NodeFile + ":" + p }
func sectionID(s string) string { return NodeSection + ":" + s }

// BuildGraph reads a repository's generated wiki and returns its graph. A
// repository with no wiki yields an empty graph rather than an error — the
// callers all want to render an empty state, not a failure.
func BuildGraph(repo string) (*Graph, error) {
	root := WikiDir(repo)
	docs, err := collectDocs(root)
	if err != nil {
		if os.IsNotExist(err) {
			return &Graph{Root: root, Nodes: []GraphNode{}, Edges: []GraphEdge{}}, nil
		}
		return nil, err
	}

	g := &Graph{Root: root, Nodes: []GraphNode{}, Edges: []GraphEdge{}}

	// Index by wiki-relative path, so link resolution can ask "does this
	// document actually exist" before drawing an edge to it.
	byRel := make(map[string]*wikiDoc, len(docs))
	for i := range docs {
		byRel[docs[i].rel] = &docs[i]
	}

	// Document nodes.
	for _, d := range docs {
		g.Nodes = append(g.Nodes, GraphNode{
			ID: docID(d.rel), Kind: NodeDoc, Label: d.title, Rel: d.rel,
			Section: d.section, Words: d.words, IsSectionDoc: d.isSectionDoc,
		})
	}

	edges := newEdgeSet()

	// contains: every section's lead document to its siblings. The lead is the
	// document whose title matches its directory — the same rule the wiki tree
	// endpoint uses for is_section_doc.
	for _, sec := range sectionNames(docs) {
		hub := docID(sec + "/" + sec + ".md")
		if _, ok := byRel[sec+"/"+sec+".md"]; !ok {
			// No lead document: stand a section node in for it rather than
			// leaving the chapter as a handful of unconnected dots.
			hub = sectionID(sec)
			g.Nodes = append(g.Nodes, GraphNode{
				ID: hub, Kind: NodeSection, Label: sec, Section: sec,
			})
			g.Stats.Sections++
		}
		for _, d := range docs {
			if d.section != sec || docID(d.rel) == hub {
				continue
			}
			edges.add(hub, docID(d.rel), EdgeContains)
		}
	}

	// links: relative .md links in the prose, resolved the way the readers do.
	for _, d := range docs {
		for _, href := range markdownLinks(d.body) {
			target := resolveWikiRef(href, d.rel)
			if target == "" || target == d.rel {
				continue
			}
			if _, ok := byRel[target]; !ok {
				continue // a link the model invented, or one to a deleted page
			}
			edges.add(docID(d.rel), docID(target), EdgeLinks)
		}
	}

	// source: the provenance footer, which is exactly the file list the
	// document was generated from.
	files := map[string]bool{} // repo-relative path -> missing
	for _, d := range docs {
		for _, p := range ReadProvenance(d.body) {
			p = filepath.ToSlash(strings.TrimSpace(p))
			if p == "" || strings.Contains(p, "..") || strings.HasPrefix(p, "/") {
				continue
			}
			if _, seen := files[p]; !seen {
				_, statErr := os.Stat(filepath.Join(repo, filepath.FromSlash(p)))
				files[p] = statErr != nil
			}
			edges.add(docID(d.rel), fileID(p), EdgeSource)
		}
	}

	for p, missing := range files {
		g.Nodes = append(g.Nodes, GraphNode{
			ID: fileID(p), Kind: NodeFile, Label: path.Base(p), Path: p,
			Lang: codemap.Lang(p), Missing: missing,
		})
	}

	g.Edges = edges.sorted()
	g.Stats.Docs = len(docs)
	g.Stats.Files = len(files)
	g.Stats.Edges = len(g.Edges)

	// Both transports serve this payload for the same repository, so the
	// ordering has to be total, not incidental map order.
	sort.Slice(g.Nodes, func(i, j int) bool {
		if g.Nodes[i].Kind != g.Nodes[j].Kind {
			return g.Nodes[i].Kind < g.Nodes[j].Kind
		}
		return g.Nodes[i].ID < g.Nodes[j].ID
	})

	return g, nil
}

// wikiDoc is one markdown document, read once and reused for every pass.
type wikiDoc struct {
	rel          string // wiki-relative, slash-separated
	title        string
	section      string // "" for documents at the wiki root (README, CHANGELOG)
	body         string
	words        int
	isSectionDoc bool
}

func collectDocs(root string) ([]wikiDoc, error) {
	if _, err := os.Stat(root); err != nil {
		return nil, err
	}
	var docs []wikiDoc
	err := filepath.WalkDir(root, func(p string, d os.DirEntry, err error) error {
		if err != nil || d.IsDir() || !strings.HasSuffix(d.Name(), ".md") {
			return nil
		}
		raw, rerr := os.ReadFile(p)
		if rerr != nil {
			return nil
		}
		rel, rerr := filepath.Rel(root, p)
		if rerr != nil {
			return nil
		}
		rel = filepath.ToSlash(rel)
		title := strings.TrimSuffix(d.Name(), ".md")
		section := ""
		if dir := path.Dir(rel); dir != "." {
			section = dir
		}
		docs = append(docs, wikiDoc{
			rel: rel, title: title, section: section, body: string(raw),
			words: len(strings.Fields(string(raw))), isSectionDoc: section != "" && title == section,
		})
		return nil
	})
	if err != nil {
		return nil, err
	}
	sort.Slice(docs, func(i, j int) bool { return docs[i].rel < docs[j].rel })
	return docs, nil
}

// sectionNames returns every section directory that holds at least one
// document, in a stable order.
func sectionNames(docs []wikiDoc) []string {
	seen := map[string]bool{}
	var out []string
	for _, d := range docs {
		if d.section == "" || seen[d.section] {
			continue
		}
		seen[d.section] = true
		out = append(out, d.section)
	}
	sort.Strings(out)
	return out
}

// linkRe matches an inline markdown link's target, with the optional title
// dropped: [text](target "title").
var linkRe = regexp.MustCompile(`\[[^\]]*\]\(\s*([^)\s]+)`)

// markdownLinks returns every inline link target outside fenced code. The
// fences matter: these documents are full of mermaid diagrams whose node
// syntax — cmd[cli/cmd/kaioken/main.go] — is one bracket away from a link.
func markdownLinks(body string) []string {
	var out []string
	inFence := false
	for _, line := range strings.Split(body, "\n") {
		if strings.HasPrefix(strings.TrimSpace(line), "```") {
			inFence = !inFence
			continue
		}
		if inFence {
			continue
		}
		for _, m := range linkRe.FindAllStringSubmatch(line, -1) {
			out = append(out, m[1])
		}
	}
	return out
}

// resolveWikiRef turns a relative link found in fromRel into a wiki-relative
// document path, or "" when it is not one. It mirrors resolveWikiLink in the
// desktop reader (desktop/src/components/common/Markdown.tsx) so a link that
// the graph draws is a link that clicking actually follows — except that a
// "../" walking off the wiki root is rejected here rather than clamped.
func resolveWikiRef(href, fromRel string) string {
	href = strings.TrimSpace(href)
	if href == "" || strings.HasPrefix(href, "#") || strings.HasPrefix(href, "/") {
		return ""
	}
	if strings.Contains(href, "://") || strings.HasPrefix(href, "mailto:") {
		return ""
	}
	// Drop any fragment: "Doc.md#section" points at the same document.
	if i := strings.IndexByte(href, '#'); i != -1 {
		href = href[:i]
	}
	if decoded, err := url.PathUnescape(href); err == nil {
		href = decoded
	}
	if !strings.HasSuffix(strings.ToLower(href), ".md") {
		return ""
	}

	var out []string
	if dir := path.Dir(fromRel); dir != "." && dir != "/" {
		out = strings.Split(dir, "/")
	}
	for _, part := range strings.Split(strings.ReplaceAll(href, `\`, "/"), "/") {
		switch part {
		case "", ".":
			continue
		case "..":
			if len(out) == 0 {
				return "" // escapes the wiki root
			}
			out = out[:len(out)-1]
		default:
			out = append(out, part)
		}
	}
	return strings.Join(out, "/")
}

// edgeSet dedupes while preserving a deterministic final order — a document
// that links to the same page three times is one edge, not three.
type edgeSet struct {
	seen map[GraphEdge]bool
}

func newEdgeSet() *edgeSet { return &edgeSet{seen: map[GraphEdge]bool{}} }

func (e *edgeSet) add(source, target, kind string) {
	e.seen[GraphEdge{Source: source, Target: target, Kind: kind}] = true
}

func (e *edgeSet) sorted() []GraphEdge {
	out := make([]GraphEdge, 0, len(e.seen))
	for edge := range e.seen {
		out = append(out, edge)
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Kind != out[j].Kind {
			return out[i].Kind < out[j].Kind
		}
		if out[i].Source != out[j].Source {
			return out[i].Source < out[j].Source
		}
		return out[i].Target < out[j].Target
	})
	return out
}
