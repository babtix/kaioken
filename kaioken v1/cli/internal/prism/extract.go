package prism

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"unicode/utf8"
)

// Extraction is deliberately a small allowlist rather than a "read it and
// hope" heuristic. Feeding a binary to the chunker produces chunks that embed
// to noise, retrieve unpredictably, and are indistinguishable from real
// content once they are in the index — a failure that surfaces months later as
// "search got worse" with nothing to point at. Refusing at import is cheap and
// the message tells the importer exactly what to do instead.

// textExtensions are the document formats ingestion accepts. Markdown leads
// because headings survive into chunk sections.
var textExtensions = map[string]bool{
	".md": true, ".markdown": true, ".mdx": true,
	".txt": true, ".text": true,
	".rst": true, ".org": true, ".adoc": true, ".asciidoc": true,
	".tex": true,
}

// codeExtensions are source files. They chunk acceptably — the paragraph and
// sentence boundaries the splitter looks for map onto blank lines and
// statement ends well enough — and being able to import a spec alongside the
// code it describes is most of the point of scoping by module.
var codeExtensions = map[string]bool{
	".go": true, ".py": true, ".js": true, ".jsx": true, ".ts": true, ".tsx": true,
	".java": true, ".kt": true, ".scala": true, ".rb": true, ".rs": true,
	".c": true, ".h": true, ".cc": true, ".cpp": true, ".hpp": true, ".cs": true,
	".php": true, ".swift": true, ".sh": true, ".bash": true, ".sql": true,
	".html": true, ".css": true, ".scss": true,
	".yaml": true, ".yml": true, ".toml": true, ".json": true, ".xml": true,
}

// maxDocumentBytes bounds one imported file. A document past this is almost
// always a mistake — a database dump, a bundled asset — and ingesting it would
// spend a very large number of embedding calls before anyone noticed.
const maxDocumentBytes = 32 << 20 // 32 MiB

// ErrUnsupported reports a file ingestion will not read. It carries the
// extension so a caller can offer something better than "failed".
type ErrUnsupported struct {
	Ext    string
	Reason string
}

func (e *ErrUnsupported) Error() string {
	if e.Reason != "" {
		return fmt.Sprintf("%s: %s", e.Ext, e.Reason)
	}
	return fmt.Sprintf("%s files are not supported — %s", e.Ext, supportedList())
}

// Supported reports whether ingestion can read this path, without opening it.
// Callers listing a directory use this to filter before importing.
func Supported(path string) bool {
	ext := strings.ToLower(filepath.Ext(path))
	return textExtensions[ext] || codeExtensions[ext]
}

// Extract reads a file as plain text.
//
// PDF is refused rather than half-supported: there is no PDF reader in this
// module (internal/pdf writes them), and guessing at one produces text with
// dropped ligatures and interleaved columns that reads fine to a checker and
// retrieves badly forever after.
func Extract(path string) (string, error) {
	ext := strings.ToLower(filepath.Ext(path))

	switch {
	case ext == ".pdf":
		return "", &ErrUnsupported{
			Ext:    ".pdf",
			Reason: "PDF ingestion is not implemented yet — convert to text or markdown first",
		}
	case !textExtensions[ext] && !codeExtensions[ext]:
		return "", &ErrUnsupported{Ext: extOrNone(ext)}
	}

	info, err := os.Stat(path)
	if err != nil {
		return "", err
	}
	if info.IsDir() {
		return "", fmt.Errorf("%s is a directory", path)
	}
	if info.Size() > maxDocumentBytes {
		return "", fmt.Errorf("%s is %d MiB — over the %d MiB import limit",
			filepath.Base(path), info.Size()>>20, maxDocumentBytes>>20)
	}

	raw, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}
	if !utf8.Valid(raw) {
		return "", fmt.Errorf("%s is not valid UTF-8 — convert it first", filepath.Base(path))
	}

	text := normalizeNewlines(string(raw))
	if strings.TrimSpace(text) == "" {
		return "", fmt.Errorf("%s has no text in it", filepath.Base(path))
	}
	return text, nil
}

// normalizeNewlines collapses CRLF and lone CR. The chunker looks for "\n\n"
// as a paragraph break, and on a CRLF file it would never find one — every
// document imported on Windows would split mid-sentence instead.
func normalizeNewlines(s string) string {
	if !strings.ContainsRune(s, '\r') {
		return s
	}
	s = strings.ReplaceAll(s, "\r\n", "\n")
	return strings.ReplaceAll(s, "\r", "\n")
}

func extOrNone(ext string) string {
	if ext == "" {
		return "files without an extension"
	}
	return ext
}

func supportedList() string {
	var exts []string
	for e, ok := range textExtensions {
		if ok {
			exts = append(exts, e)
		}
	}
	sort.Strings(exts)
	return "supported: " + strings.Join(exts, " ") + " and common source files"
}
