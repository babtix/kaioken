package wiki

import (
	"strings"

	"kaioken/internal/scan"
)

// Every generated document ends with a machine-readable record of the source
// files it was written from. The incremental update pass uses it to decide
// which documents a change invalidates — far more reliable than scanning the
// prose for file paths, which depends on the model writing a tidy "Referenced
// Files" section.

const (
	provenancePrefix = "<!-- kaioken:files "
	provenanceSuffix = " -->"
)

// stampProvenance appends (or replaces) the provenance footer on a document.
func stampProvenance(doc string, paths []string) string {
	doc = stripProvenance(doc)
	if len(paths) == 0 {
		return strings.TrimRight(doc, "\n") + "\n"
	}
	return strings.TrimRight(doc, "\n") + "\n\n" +
		provenancePrefix + strings.Join(dedupe(paths), ",") + provenanceSuffix + "\n"
}

// filePaths pulls the repo-relative paths out of scanned files.
func filePaths(files []scan.File) []string {
	paths := make([]string, 0, len(files))
	for _, f := range files {
		paths = append(paths, f.Path)
	}
	return paths
}

// livePaths drops paths that no longer exist in the repository, so a deleted
// file does not linger in a document's provenance forever.
func livePaths(res *scan.Result, paths []string) []string {
	present := make(map[string]bool, len(res.Files))
	for _, f := range res.Files {
		present[f.Path] = true
	}
	out := make([]string, 0, len(paths))
	for _, p := range paths {
		if present[p] {
			out = append(out, p)
		}
	}
	return out
}

func dedupe(in []string) []string {
	seen := make(map[string]bool, len(in))
	out := make([]string, 0, len(in))
	for _, s := range in {
		if s != "" && !seen[s] {
			seen[s] = true
			out = append(out, s)
		}
	}
	return out
}

// stripProvenance removes any existing footer so revisions do not accumulate.
func stripProvenance(doc string) string {
	idx := strings.LastIndex(doc, provenancePrefix)
	if idx == -1 {
		return doc
	}
	end := strings.Index(doc[idx:], provenanceSuffix)
	if end == -1 {
		return doc
	}
	return doc[:idx] + doc[idx+end+len(provenanceSuffix):]
}

// parseProvenance returns the source files a document was generated from, or
// nil for documents written before stamping existed.
func parseProvenance(doc string) []string {
	idx := strings.LastIndex(doc, provenancePrefix)
	if idx == -1 {
		return nil
	}
	rest := doc[idx+len(provenancePrefix):]
	end := strings.Index(rest, provenanceSuffix)
	if end == -1 {
		return nil
	}
	var out []string
	for _, p := range strings.Split(rest[:end], ",") {
		if p = strings.TrimSpace(p); p != "" {
			out = append(out, p)
		}
	}
	return out
}

// ReadProvenance is the exported form of parseProvenance for the daemon's
// document endpoint. Returns nil when the document has no provenance footer.
func ReadProvenance(markdown string) []string {
	return parseProvenance(markdown)
}
