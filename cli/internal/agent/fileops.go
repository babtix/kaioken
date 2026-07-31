package agent

// Cumulative file tracking for compaction.
//
// A summary that says what happened but not where it happened strands the
// next turn: the model knows a bug was fixed but re-searches the repo for
// the file it was fixed in. So every compaction carries two lists — files
// read, files modified — extracted from the tool calls themselves rather
// than trusted to the summarizer, and merged with the lists of any earlier
// summary in range, so repeated compactions accumulate instead of forgetting.

import (
	"encoding/json"
	"sort"
	"strings"

	"kaioken/internal/llm"
)

// File-block markers inside a compaction summary. Deliberately the same tags
// pi uses, so exported transcripts read the same way.
const (
	readFilesOpen  = "<read-files>"
	readFilesClose = "</read-files>"
	modFilesOpen   = "<modified-files>"
	modFilesClose  = "</modified-files>"
)

// fileOps collects the read and modified file paths across a conversation
// span: tool calls contribute directly, and earlier compaction summaries
// contribute the lists they already carried.
func fileOps(conv []llm.Message) (reads, mods []string) {
	readSet, modSet := map[string]bool{}, map[string]bool{}
	for _, msg := range conv {
		if msg.Role == "system" && strings.HasPrefix(msg.Content, SummaryPrefix) {
			for _, p := range parseBlock(msg.Content, readFilesOpen, readFilesClose) {
				readSet[p] = true
			}
			for _, p := range parseBlock(msg.Content, modFilesOpen, modFilesClose) {
				modSet[p] = true
			}
			continue
		}
		if msg.Role != "assistant" {
			continue
		}
		for _, tc := range msg.ToolCalls {
			path := pathArg(tc.Function.Arguments)
			if path == "" {
				continue
			}
			switch tc.Function.Name {
			case "read_file":
				readSet[path] = true
			case "write_file", "edit_file":
				modSet[path] = true
			}
		}
	}
	return sortedKeys(readSet), sortedKeys(modSet)
}

// withFileBlocks appends the tracked file lists to a summary. Any blocks the
// summarizer produced despite instructions are stripped first, so the
// deterministic lists are the only ones in the text.
func withFileBlocks(summary string, reads, mods []string) string {
	summary = stripBlock(summary, readFilesOpen, readFilesClose)
	summary = stripBlock(summary, modFilesOpen, modFilesClose)
	summary = strings.TrimRight(summary, "\n ")
	if len(reads) > 0 {
		summary += "\n\n" + readFilesOpen + "\n" + strings.Join(reads, "\n") + "\n" + readFilesClose
	}
	if len(mods) > 0 {
		summary += "\n\n" + modFilesOpen + "\n" + strings.Join(mods, "\n") + "\n" + modFilesClose
	}
	return summary
}

// pathArg extracts the "path" argument from a tool call's JSON arguments.
func pathArg(argsJSON string) string {
	var p struct {
		Path string `json:"path"`
	}
	if json.Unmarshal([]byte(argsJSON), &p) != nil {
		return ""
	}
	return strings.TrimSpace(p.Path)
}

// parseBlock returns the non-empty lines between open and close, or nil.
func parseBlock(s, open, close string) []string {
	start := strings.Index(s, open)
	if start < 0 {
		return nil
	}
	rest := s[start+len(open):]
	end := strings.Index(rest, close)
	if end < 0 {
		return nil
	}
	var out []string
	for _, line := range strings.Split(rest[:end], "\n") {
		if line = strings.TrimSpace(line); line != "" {
			out = append(out, line)
		}
	}
	return out
}

// stripBlock removes an open…close block (including the tags) from s.
func stripBlock(s, open, close string) string {
	start := strings.Index(s, open)
	if start < 0 {
		return s
	}
	rest := s[start+len(open):]
	end := strings.Index(rest, close)
	if end < 0 {
		return s
	}
	return s[:start] + rest[end+len(close):]
}

func sortedKeys(m map[string]bool) []string {
	if len(m) == 0 {
		return nil
	}
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	sort.Strings(out)
	return out
}
