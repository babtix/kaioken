package agent

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

const (
	DefaultMaxLines = 1500
	DefaultMaxBytes = 64 * 1024 // 64 KB
	RetentionPeriod = 7 * 24 * time.Hour
)

// BoundOptions allows configuring custom thresholds for tool output bounding.
type BoundOptions struct {
	MaxLines int
	MaxBytes int
}

// BoundResult represents the outcome of bounding a tool's raw output.
type BoundResult struct {
	BoundedText string
	WasTruncated bool
	SpilledPath  string
	TotalLines   int
	TotalBytes   int
}

// BoundOutput evaluates a tool's output against line and byte limits.
// If limits are exceeded, it produces a head-and-tail summary for model context
// and spills the full un-truncated output to .kaioken/tool-output/<toolCallID>.txt.
func BoundOutput(repoRoot string, toolCallID string, toolName string, rawOutput string, opts *BoundOptions) (BoundResult, error) {
	maxLines := DefaultMaxLines
	maxBytes := DefaultMaxBytes
	if opts != nil {
		if opts.MaxLines > 0 {
			maxLines = opts.MaxLines
		}
		if opts.MaxBytes > 0 {
			maxBytes = opts.MaxBytes
		}
	}

	totalBytes := len(rawOutput)
	lines := strings.Split(rawOutput, "\n")
	totalLines := len(lines)

	if totalLines <= maxLines && totalBytes <= maxBytes {
		return BoundResult{
			BoundedText:  rawOutput,
			WasTruncated: false,
			SpilledPath:  "",
			TotalLines:   totalLines,
			TotalBytes:   totalBytes,
		}, nil
	}

	// Output exceeds limits - spill full raw output to disk first.
	spilledPath, err := spillToolOutput(repoRoot, toolCallID, toolName, rawOutput)
	if err != nil {
		// Log error but proceed with truncated inline representation
		spilledPath = ""
	}

	// Create head and tail truncation for LLM context
	headCount := maxLines / 2
	tailCount := maxLines / 2
	if headCount > totalLines/2 {
		headCount = totalLines / 2
		tailCount = totalLines - headCount
	}

	headLines := lines[:headCount]
	tailLines := lines[totalLines-tailCount:]

	relPath := spilledPath
	if repoRoot != "" && strings.HasPrefix(spilledPath, repoRoot) {
		relPath, _ = filepath.Rel(repoRoot, spilledPath)
	}

	summaryNotice := fmt.Sprintf(
		"\n\n[Tool Output Truncated: %d lines / %d bytes total. Showing first %d lines and last %d lines. Full un-truncated output saved to %s]\n\n",
		totalLines, totalBytes, headCount, tailCount, relPath,
	)

	boundedText := strings.Join(headLines, "\n") + summaryNotice + strings.Join(tailLines, "\n")

	return BoundResult{
		BoundedText:  boundedText,
		WasTruncated: true,
		SpilledPath:  spilledPath,
		TotalLines:   totalLines,
		TotalBytes:   totalBytes,
	}, nil
}

func spillToolOutput(repoRoot string, toolCallID string, toolName string, rawOutput string) (string, error) {
	if repoRoot == "" {
		return "", fmt.Errorf("empty repo root")
	}
	dir := filepath.Join(repoRoot, ".kaioken", "tool-output")
	if err := os.MkdirAll(dir, 0755); err != nil {
		return "", err
	}

	cleanID := toolCallID
	if cleanID == "" {
		cleanID = fmt.Sprintf("call_%d", time.Now().UnixNano())
	}
	filename := fmt.Sprintf("%s_%s.txt", toolName, cleanID)
	fullPath := filepath.Join(dir, filename)

	if err := os.WriteFile(fullPath, []byte(rawOutput), 0644); err != nil {
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
