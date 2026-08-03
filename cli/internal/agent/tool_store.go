package agent

// Tool output bounding.
//
// A tool result is the one part of the conversation neither the user nor the
// model controls the size of. A `go test ./...` on a broken build, a search
// that matches a minified bundle, a curl of a JSON API — any of them can be
// megabytes, and every byte lands in the context window and stays there.
//
// So results are bounded before the model sees them: complete lines are kept
// up to a line cap *and* a byte cap, whichever binds first, and the full text
// is spilled to .kaioken/tool-output/ with a pointer the model can follow.
// The algorithm is pi's truncateHead/truncateTail and opencode's
// Truncate.output — accumulate lines while tracking bytes, stop at the first
// line that would breach either cap.
//
// Direction matters. A file read wants its head; a command wants its tail,
// because a build that printed 10k lines and then failed put the reason in
// the last twenty.

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
	"unicode/utf8"
)

const (
	DefaultMaxLines = 1500
	DefaultMaxBytes = 64 * 1024 // 64 KB
	RetentionPeriod = 7 * 24 * time.Hour
)

// Direction selects which end of an over-long output survives.
type Direction int

const (
	// Head keeps the beginning — the natural choice for file and directory
	// reads, where the top of the file is what orients the reader.
	Head Direction = iota
	// Tail keeps the end — the natural choice for command output, where the
	// failure that matters is the last thing printed.
	Tail
)

// BoundOptions allows configuring custom thresholds for tool output bounding.
// Passing it at all takes Direction as given — the per-tool default only
// applies when opts is nil, so a caller that wants a tail bound must say so.
type BoundOptions struct {
	MaxLines  int
	MaxBytes  int
	Direction Direction
}

// BoundResult represents the outcome of bounding a tool's raw output.
type BoundResult struct {
	BoundedText  string
	WasTruncated bool
	SpilledPath  string
	TotalLines   int
	TotalBytes   int
	// KeptLines and KeptBytes describe what survived, so a caller can report
	// the reduction rather than re-measuring it.
	KeptLines int
	KeptBytes int
}

// boundDirection picks the surviving end for a tool. Only command-shaped
// output is tail-bounded; everything else reads top-down.
func boundDirection(toolName string) Direction {
	if toolName == "run_command" {
		return Tail
	}
	return Head
}

// BoundOutput evaluates a tool's output against line and byte limits. If
// either is exceeded it spills the full text to
// .kaioken/tool-output/<tool>_<callID>.txt and returns a bounded excerpt that
// names the spill file, so the model can go get the rest with search or a
// targeted read instead of being handed all of it.
func BoundOutput(repoRoot string, toolCallID string, toolName string, rawOutput string, opts *BoundOptions) (BoundResult, error) {
	maxLines, maxBytes := DefaultMaxLines, DefaultMaxBytes
	direction := boundDirection(toolName)
	if opts != nil {
		if opts.MaxLines > 0 {
			maxLines = opts.MaxLines
		}
		if opts.MaxBytes > 0 {
			maxBytes = opts.MaxBytes
		}
		direction = opts.Direction
	}

	totalBytes := len(rawOutput)
	lines := strings.Split(rawOutput, "\n")
	totalLines := len(lines)

	if totalLines <= maxLines && totalBytes <= maxBytes {
		return BoundResult{
			BoundedText: rawOutput,
			TotalLines:  totalLines,
			TotalBytes:  totalBytes,
			KeptLines:   totalLines,
			KeptBytes:   totalBytes,
		}, nil
	}

	kept, keptBytes, hitBytes := keepLines(lines, maxLines, maxBytes, direction)

	// Spill the full text first: the excerpt has to be able to name the file.
	spilledPath, err := spillToolOutput(repoRoot, toolCallID, toolName, rawOutput)
	if err != nil {
		// A failed spill is not a failed tool call. Bound anyway and say so —
		// losing the overflow beats handing the model megabytes.
		spilledPath = ""
	}

	droppedUnit, dropped := "lines", totalLines-len(kept)
	if hitBytes {
		droppedUnit, dropped = "bytes", totalBytes-keptBytes
	}
	notice := fmt.Sprintf("\n… [%d %s truncated: %d lines / %d bytes total.",
		dropped, droppedUnit, totalLines, totalBytes)
	if spilledPath != "" {
		notice += " Full output saved to " + spillRef(repoRoot, spilledPath) +
			" — read it with read_file (which takes offset/limit) or search it, rather than re-running the tool."
	} else {
		notice += " The rest could not be saved to disk; narrow the command or query to see it."
	}
	notice += "]\n"

	excerpt := strings.Join(kept, "\n")
	boundedText := excerpt + notice
	if direction == Tail {
		boundedText = notice + excerpt
	}

	return BoundResult{
		BoundedText:  boundedText,
		WasTruncated: true,
		SpilledPath:  spilledPath,
		TotalLines:   totalLines,
		TotalBytes:   totalBytes,
		KeptLines:    len(kept),
		KeptBytes:    keptBytes,
	}, nil
}

// keepLines collects whole lines from one end while respecting both caps. It
// returns the kept lines in original order, the bytes they occupy, and whether
// the byte cap (rather than the line cap) is what stopped it.
//
// A single line longer than the whole byte budget is cut on a UTF-8 boundary
// rather than dropped: one 4 MB line of minified JS must not come back as an
// empty excerpt, and it must not come back whole either.
func keepLines(lines []string, maxLines, maxBytes int, direction Direction) (kept []string, keptBytes int, hitBytes bool) {
	add := func(line string) bool {
		size := len(line)
		if len(kept) > 0 {
			size++ // the newline joining it to what is already kept
		}
		if keptBytes+size > maxBytes {
			hitBytes = true
			if len(kept) == 0 {
				cut := clipToBytes(line, maxBytes, direction)
				kept, keptBytes = []string{cut}, len(cut)
			}
			return false
		}
		kept = append(kept, line)
		keptBytes += size
		return true
	}

	if direction == Tail {
		for i := len(lines) - 1; i >= 0 && len(kept) < maxLines; i-- {
			if !add(lines[i]) {
				break
			}
		}
		for i, j := 0, len(kept)-1; i < j; i, j = i+1, j-1 {
			kept[i], kept[j] = kept[j], kept[i]
		}
		return kept, keptBytes, hitBytes
	}
	for i := 0; i < len(lines) && len(kept) < maxLines; i++ {
		if !add(lines[i]) {
			break
		}
	}
	return kept, keptBytes, hitBytes
}

// clipToBytes cuts an over-long single line to at most maxBytes, from the head
// or the tail, never splitting a multi-byte rune.
func clipToBytes(line string, maxBytes int, direction Direction) string {
	if len(line) <= maxBytes || maxBytes <= 0 {
		return line
	}
	if direction == Tail {
		start := len(line) - maxBytes
		for start < len(line) && !utf8.RuneStart(line[start]) {
			start++
		}
		return line[start:]
	}
	end := maxBytes
	for end > 0 && !utf8.RuneStart(line[end]) {
		end--
	}
	return line[:end]
}

// spillRef renders a spill path the way the model should refer to it: repo
// relative with forward slashes, since that is what every other tool takes.
func spillRef(repoRoot, spilledPath string) string {
	if repoRoot == "" {
		return spilledPath
	}
	rel, err := filepath.Rel(repoRoot, spilledPath)
	if err != nil {
		return spilledPath
	}
	return filepath.ToSlash(rel)
}

// safeFileComponent reduces a provider-supplied tool call ID or tool name to
// something safe to concatenate into a filename. Call IDs cross the wire from
// the model, so treating them as path components would let a crafted id write
// outside the spill directory; extension tool names carry separators of their
// own that no filesystem accepts.
func safeFileComponent(s string) string {
	var b strings.Builder
	for _, r := range s {
		switch {
		case r >= 'a' && r <= 'z', r >= 'A' && r <= 'Z', r >= '0' && r <= '9', r == '-', r == '_':
			b.WriteRune(r)
		default:
			b.WriteByte('_')
		}
	}
	out := b.String()
	if len(out) > 64 {
		out = out[:64]
	}
	return out
}

func spillToolOutput(repoRoot string, toolCallID string, toolName string, rawOutput string) (string, error) {
	if repoRoot == "" {
		return "", fmt.Errorf("empty repo root")
	}
	dir := filepath.Join(repoRoot, ".kaioken", "tool-output")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", err
	}

	cleanID := safeFileComponent(toolCallID)
	if cleanID == "" {
		cleanID = fmt.Sprintf("call_%d", time.Now().UnixNano())
	}
	name := safeFileComponent(toolName)
	if name == "" {
		name = "tool"
	}
	fullPath := filepath.Join(dir, name+"_"+cleanID+".txt")

	if err := os.WriteFile(fullPath, []byte(rawOutput), 0o644); err != nil {
		return "", err
	}

	// Async cleanup of old tool outputs
	go cleanupOldToolOutputs(dir)

	return fullPath, nil
}

func cleanupOldToolOutputs(dir string) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return
	}
	cutoff := time.Now().Add(-RetentionPeriod)
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		info, err := entry.Info()
		if err != nil {
			continue
		}
		if info.ModTime().Before(cutoff) {
			_ = os.Remove(filepath.Join(dir, entry.Name()))
		}
	}
}
