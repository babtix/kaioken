// The wasm test fixture: a Kaioken wasm plugin implementing the one-shot
// stdio protocol. It is compiled by the ext tests with GOOS=wasip1
// GOARCH=wasm and never built for the host (testdata is invisible to the go
// tool).
package main

import (
	"encoding/json"
	"os"
	"strings"
	"time"
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
			{"name": "echo", "description": "Echo the text back.",
				"inputSchema": map[string]any{"type": "object", "properties": map[string]any{
					"text": map[string]any{"type": "string"}}}},
			{"name": "read_ws", "description": "Read /workspace/probe.txt."},
			{"name": "sleep", "description": "Sleeps before answering."},
			{"name": "huge", "description": "Returns a large payload."},
		}})
	case "call_tool":
		switch req.Name {
		case "echo":
			text, _ := req.Arguments["text"].(string)
			respond(map[string]any{"content": "echo: " + text})
		case "read_ws":
			// The sandbox proof: this only works when the host mounted the
			// workspace, which it only does with fs:read:workspace granted.
			data, err := os.ReadFile("/workspace/probe.txt")
			if err != nil {
				respond(map[string]any{"isError": true, "content": "read failed: " + err.Error()})
				return
			}
			respond(map[string]any{"content": strings.TrimSpace(string(data))})
		case "sleep":
			time.Sleep(5 * time.Second)
			respond(map[string]any{"content": "finally"})
		case "huge":
			respond(map[string]any{"content": strings.Repeat("A", 150_000)})
		default:
			respond(map[string]any{"isError": true, "content": "unknown tool " + req.Name})
		}
	default:
		respond(map[string]any{"isError": true, "content": "unknown method " + req.Method})
	}
}

func respond(v any) { _ = json.NewEncoder(os.Stdout).Encode(v) }
