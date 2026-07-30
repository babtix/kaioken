package mcp

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"kaioken/internal/config"
	"kaioken/internal/skills"
	"kaioken/internal/wiki"
)

// Resources are the "attach this to the conversation" half of MCP: a user
// picks a document in their client and it lands in context whole. Tools are
// for the model to reach for; resources are for the human to hand over.

func (s *Server) registerResources() {
	s.templates = []ResourceTemplate{
		{
			URITemplate: "wiki://{path}",
			Name:        "Wiki document",
			Description: "A generated wiki chapter, by its wiki-relative path.",
			MIMEType:    "text/markdown",
		},
		{
			URITemplate: "skill://{name}",
			Name:        "Skill",
			Description: "One task skill for this repository.",
			MIMEType:    "text/markdown",
		},
		{
			URITemplate: "card://{module}/{card}",
			Name:        "Knowledge card",
			Description: "A generated knowledge card for one module.",
			MIMEType:    "text/markdown",
		},
		{
			URITemplate: "repo://{path}",
			Name:        "Source file",
			Description: "A file from the repository working tree.",
			MIMEType:    "text/plain",
		},
	}
}

// listResources enumerates what is worth showing in a client's resource
// picker: every wiki document and every skill. repo:// is deliberately left to
// the template — listing a whole source tree would bury the knowledge base
// under thousands of entries, which is exactly what this server exists to
// avoid.
func (s *Server) listResources() []Resource {
	out := []Resource{
		{
			URI:         "config://workspace",
			Name:        "Workspace config",
			Description: "Kaioken's configuration for this repository.",
			MIMEType:    "application/yaml",
		},
	}

	wikiDir := wiki.WikiDir(s.repo)
	_ = filepath.WalkDir(wikiDir, func(path string, d os.DirEntry, err error) error {
		if err != nil || d.IsDir() || !strings.HasSuffix(d.Name(), ".md") {
			return nil
		}
		rel, rerr := filepath.Rel(wikiDir, path)
		if rerr != nil {
			return nil
		}
		rel = filepath.ToSlash(rel)
		raw, _ := os.ReadFile(path)
		out = append(out, Resource{
			URI:         "wiki://" + rel,
			Name:        firstHeading(string(raw), rel),
			Description: "Wiki: " + rel,
			MIMEType:    "text/markdown",
		})
		return nil
	})

	if all, err := skills.List(s.repo); err == nil {
		for _, sk := range all {
			out = append(out, Resource{
				URI:         "skill://" + sk.Name,
				Name:        sk.Name,
				Description: sk.Description,
				MIMEType:    "text/markdown",
			})
		}
	}

	sort.Slice(out, func(i, j int) bool { return out[i].URI < out[j].URI })
	return out
}

func (s *Server) readResource(_ context.Context, raw json.RawMessage) (any, *rpcError) {
	var p readResourceParams
	if err := decodeArgs(raw, &p); err != nil {
		return nil, errf(codeInvalidParams, "bad resources/read params: %v", err)
	}
	uri := strings.TrimSpace(p.URI)
	if uri == "" {
		return nil, errf(codeInvalidParams, "uri is required")
	}

	scheme, rest, ok := strings.Cut(uri, "://")
	if !ok {
		return nil, errf(codeInvalidParams, "malformed resource uri %q", uri)
	}

	var (
		path string
		mime = "text/markdown"
	)
	switch scheme {
	case "wiki":
		full, err := safeJoin(wiki.WikiDir(s.repo), rest)
		if err != nil {
			return nil, errf(codeInvalidParams, "%v", err)
		}
		if !strings.HasSuffix(full, ".md") {
			full += ".md"
		}
		path = full

	case "skill":
		path = skills.Path(s.repo, skills.Slug(rest))

	case "card":
		full, err := safeJoin(filepath.Join(s.repo, config.Dir, "knowledge"), rest)
		if err != nil {
			return nil, errf(codeInvalidParams, "%v", err)
		}
		if !strings.HasSuffix(full, ".md") {
			full += ".md"
		}
		path = full

	case "repo":
		full, err := safeJoin(s.repo, rest)
		if err != nil {
			return nil, errf(codeInvalidParams, "%v", err)
		}
		path = full
		mime = mimeForPath(full)

	case "config":
		path = config.Path(s.repo)
		mime = "application/yaml"

	default:
		return nil, errf(codeInvalidParams,
			"unknown resource scheme %q — use wiki://, skill://, card://, repo:// or config://workspace", scheme)
	}

	if !fileExists(path) {
		return nil, errf(codeInvalidParams, "no resource at %s", uri)
	}
	body, err := os.ReadFile(path)
	if err != nil {
		return nil, errf(codeInternalError, "reading %s: %v", uri, err)
	}
	// A resource is inlined into a conversation whole, so an enormous file is
	// a context-budget problem rather than a correctness one — truncate with a
	// visible marker instead of failing.
	text := string(body)
	if len(text) > maxResourceBytes {
		text = text[:maxResourceBytes] + fmt.Sprintf(
			"\n\n… truncated at %d bytes; read the rest with repo:// range reads or the file directly.",
			maxResourceBytes)
	}

	return readResourceResult{Contents: []resourceContents{{
		URI: uri, MIMEType: mime, Text: text,
	}}}, nil
}

// maxResourceBytes caps one inlined resource (1 MB).
const maxResourceBytes = 1 << 20

func mimeForPath(path string) string {
	switch strings.ToLower(filepath.Ext(path)) {
	case ".md", ".markdown":
		return "text/markdown"
	case ".json":
		return "application/json"
	case ".yaml", ".yml":
		return "application/yaml"
	case ".html", ".htm":
		return "text/html"
	case ".css":
		return "text/css"
	case ".js", ".mjs", ".ts", ".tsx", ".jsx":
		return "text/javascript"
	default:
		return "text/plain"
	}
}
