// An example Kaioken wasm plugin. Build it for the sandbox with:
//
//	GOOS=wasip1 GOARCH=wasm go build -o dist/plugin.wasm .
//
// It implements the one-shot stdio protocol Kaioken's wasm tier speaks: read
// one JSON request from stdin, write one JSON response to stdout, exit. Each
// tool call instantiates the module fresh, so there is no state to manage.
//
// The sandbox is structural: no network, no environment, and no filesystem
// beyond what a granted permission mounts. This plugin declares
// fs:read:workspace, so the host mounts the user's repo read-only at
// /workspace — and nothing else is reachable.
package main

import (
	"encoding/json"
	"os"
	"path"
	"strings"
)

type request struct {
	Method    string         `json:"method"`
	Name      string         `json:"name"`
	Arguments map[string]any `json:"arguments"`
	Workspace string         `json:"workspace"`
}

func main() {
	var req request
	if err := json.NewDecoder(os.Stdin).Decode(&req); err != nil {
		respond(map[string]any{"isError": true, "content": "bad request: " + err.Error()})
		return
	}

	switch req.Method {
	case "list_tools":
		respond(map[string]any{"tools": []map[string]any{
			{
				"name":        "word_count",
				"description": "Count words, lines and characters in the given text.",
				"inputSchema": map[string]any{
					"type":       "object",
					"properties": map[string]any{"text": map[string]any{"type": "string"}},
					"required":   []string{"text"},
				},
			},
			{
				"name":        "read_workspace_file",
				"description": "Read a UTF-8 text file from the workspace (requires fs:read:workspace).",
				"inputSchema": map[string]any{
					"type":       "object",
					"properties": map[string]any{"path": map[string]any{"type": "string", "description": "path relative to the repo root"}},
					"required":   []string{"path"},
				},
			},
		}})
	case "call_tool":
		callTool(req)
	default:
		respond(map[string]any{"isError": true, "content": "unknown method: " + req.Method})
	}
}

func callTool(req request) {
	switch req.Name {
	case "word_count":
		text, _ := req.Arguments["text"].(string)
		respond(map[string]any{"content": countReport(text)})
	case "read_workspace_file":
		readWorkspaceFile(req)
	default:
		respond(map[string]any{"isError": true, "content": "unknown tool: " + req.Name})
	}
}

func countReport(text string) string {
	lines := 0
	if text != "" {
		lines = strings.Count(text, "\n") + 1
	}
	return jsonString(map[string]int{
		"words": len(strings.Fields(text)),
		"lines": lines,
		"chars": len([]rune(text)),
	})
}

func readWorkspaceFile(req request) {
	rel, _ := req.Arguments["path"].(string)
	rel = strings.TrimSpace(rel)
	if rel == "" {
		respond(map[string]any{"isError": true, "content": "path is required"})
		return
	}
	// The host mounts the workspace at /workspace when fs:read:workspace is
	// granted. Clean and contain the path so a caller cannot escape it with
	// ".." — belt-and-braces on top of the sandbox's own read-only mount.
	clean := path.Clean("/" + strings.ReplaceAll(rel, "\\", "/"))
	full := path.Join("/workspace", clean)
	if full != "/workspace" && !strings.HasPrefix(full, "/workspace/") {
		respond(map[string]any{"isError": true, "content": "path escapes the workspace"})
		return
	}
	data, err := os.ReadFile(full)
	if err != nil {
		// Without the permission there is no /workspace at all, so this is
		// also what the user sees if they installed the plugin untrusted.
		respond(map[string]any{"isError": true, "content": "read failed: " + err.Error()})
		return
	}
	respond(map[string]any{"content": string(data)})
}

func jsonString(v any) string {
	b, _ := json.Marshal(v)
	return string(b)
}

func respond(v any) { _ = json.NewEncoder(os.Stdout).Encode(v) }
