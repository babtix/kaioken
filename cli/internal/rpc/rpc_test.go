package rpc

import (
	"bufio"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"kaioken/internal/config"
	"kaioken/internal/llm"
)

// scriptedLLM serves canned assistant messages in order.
type scriptedLLM struct {
	mu      sync.Mutex
	replies []map[string]any
}

func (s *scriptedLLM) server(t *testing.T) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Stream bool `json:"stream"`
		}
		_ = json.NewDecoder(r.Body).Decode(&req)

		s.mu.Lock()
		var reply map[string]any
		if len(s.replies) > 0 {
			reply = s.replies[0]
			s.replies = s.replies[1:]
		} else {
			reply = map[string]any{"role": "assistant", "content": "out of script"}
		}
		s.mu.Unlock()

		if !req.Stream {
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(map[string]any{
				"choices": []any{map[string]any{"message": reply}},
			})
			return
		}

		// SSE: replay the canned message as delta frames, the shape the
		// streaming client actually parses.
		w.Header().Set("Content-Type", "text/event-stream")
		flusher, _ := w.(http.Flusher)
		writeFrame := func(delta map[string]any, finish string) {
			choice := map[string]any{"delta": delta}
			if finish != "" {
				choice["finish_reason"] = finish
			}
			raw, _ := json.Marshal(map[string]any{"choices": []any{choice}})
			_, _ = w.Write([]byte("data: " + string(raw) + "\n\n"))
			if flusher != nil {
				flusher.Flush()
			}
		}
		if content, _ := reply["content"].(string); content != "" {
			writeFrame(map[string]any{"content": content}, "")
		}
		if calls, ok := reply["tool_calls"].([]any); ok {
			for i, c := range calls {
				call := c.(map[string]any)
				writeFrame(map[string]any{"tool_calls": []any{map[string]any{
					"index":    i,
					"id":       call["id"],
					"type":     "function",
					"function": call["function"],
				}}}, "")
			}
			writeFrame(map[string]any{}, "tool_calls")
		} else {
			writeFrame(map[string]any{}, "stop")
		}
		_, _ = w.Write([]byte("data: [DONE]\n\n"))
	}))
}

// rpcHarness runs Serve over in-memory pipes and gives the test a typed way
// to send requests and read frames.
type rpcHarness struct {
	t      *testing.T
	toSrv  io.WriteCloser
	frames <-chan map[string]any
	done   <-chan error
}

func newHarness(t *testing.T, repo, baseURL string) *rpcHarness {
	t.Helper()
	client, err := llm.NewForProvider("openai", baseURL, "test-model", "test-key")
	if err != nil {
		t.Fatal(err)
	}
	cfg := config.Default()

	inR, inW := io.Pipe()
	outR, outW := io.Pipe()

	done := make(chan error, 1)
	go func() {
		done <- Serve(t.Context(), repo, cfg, client, inR, outW)
		_ = outW.Close()
	}()

	frames := make(chan map[string]any, 64)
	go func() {
		sc := bufio.NewScanner(outR)
		sc.Buffer(make([]byte, 0, 64*1024), 16*1024*1024)
		for sc.Scan() {
			var m map[string]any
			if json.Unmarshal(sc.Bytes(), &m) == nil {
				frames <- m
			}
		}
		close(frames)
	}()

	return &rpcHarness{t: t, toSrv: inW, frames: frames, done: done}
}

func (h *rpcHarness) send(id int, method string, params map[string]any) {
	h.t.Helper()
	req := map[string]any{"jsonrpc": "2.0", "id": id, "method": method}
	if params != nil {
		req["params"] = params
	}
	raw, _ := json.Marshal(req)
	if _, err := h.toSrv.Write(append(raw, '\n')); err != nil {
		h.t.Fatal(err)
	}
}

// waitFor reads frames until pred matches or the timeout passes.
func (h *rpcHarness) waitFor(pred func(map[string]any) bool) map[string]any {
	h.t.Helper()
	deadline := time.After(15 * time.Second)
	for {
		select {
		case m, ok := <-h.frames:
			if !ok {
				h.t.Fatal("rpc output closed before the expected frame arrived")
			}
			if pred(m) {
				return m
			}
		case <-deadline:
			h.t.Fatal("timed out waiting for a frame")
		}
	}
}

func isResponse(id int) func(map[string]any) bool {
	return func(m map[string]any) bool {
		v, ok := m["id"].(float64)
		return ok && int(v) == id
	}
}

func isEvent(kind string) func(map[string]any) bool {
	return func(m map[string]any) bool {
		if m["method"] != "event" {
			return false
		}
		params, _ := m["params"].(map[string]any)
		return params != nil && params["kind"] == kind
	}
}

func TestRPCPromptToCompletion(t *testing.T) {
	script := &scriptedLLM{replies: []map[string]any{
		{"role": "assistant", "content": "hello from the agent"},
	}}
	srv := script.server(t)
	defer srv.Close()

	h := newHarness(t, t.TempDir(), srv.URL)

	h.send(1, "agent.state", nil)
	state := h.waitFor(isResponse(1))
	result := state["result"].(map[string]any)
	if result["busy"] != false {
		t.Errorf("fresh server reports busy: %v", result)
	}

	h.send(2, "agent.prompt", map[string]any{"text": "say hello"})
	h.waitFor(isResponse(2))
	end := h.waitFor(isEvent("agent_end"))
	params := end["params"].(map[string]any)
	if params["error"] != nil {
		t.Errorf("agent_end carries error: %v", params["error"])
	}
	if _, err := h.toSrv.Write([]byte("\n")); err != nil {
		t.Fatal(err)
	}
	_ = h.toSrv.Close()
}

func TestRPCApprovalDenied(t *testing.T) {
	script := &scriptedLLM{replies: []map[string]any{
		{
			"role":    "assistant",
			"content": "",
			"tool_calls": []any{map[string]any{
				"id":   "call_1",
				"type": "function",
				"function": map[string]any{
					"name":      "write_file",
					"arguments": `{"path":"x.txt","content":"data"}`,
				},
			}},
		},
		{"role": "assistant", "content": "understood, not writing"},
	}}
	srv := script.server(t)
	defer srv.Close()

	h := newHarness(t, t.TempDir(), srv.URL)

	h.send(1, "agent.prompt", map[string]any{"text": "write x.txt"})
	h.waitFor(isResponse(1))

	req := h.waitFor(isEvent("approval_required"))
	params := req["params"].(map[string]any)
	approvalID, _ := params["approval_id"].(string)
	if approvalID == "" {
		t.Fatal("approval_required without approval_id")
	}

	h.send(2, "agent.approve", map[string]any{"approval_id": approvalID, "approved": false})
	h.waitFor(isResponse(2))

	resolved := h.waitFor(isEvent("approval_resolved"))
	if resolved["params"].(map[string]any)["approved"] == true {
		t.Error("approval should have been denied")
	}

	toolEnd := h.waitFor(isEvent("tool_end"))
	resultText, _ := toolEnd["params"].(map[string]any)["result"].(string)
	if !strings.Contains(resultText, "declined") {
		t.Errorf("tool result should say declined, got %q", resultText)
	}
	h.waitFor(isEvent("agent_end"))
	_ = h.toSrv.Close()
}

func TestRPCUnknownMethod(t *testing.T) {
	script := &scriptedLLM{}
	srv := script.server(t)
	defer srv.Close()

	h := newHarness(t, t.TempDir(), srv.URL)
	h.send(1, "nope.nothing", nil)
	resp := h.waitFor(isResponse(1))
	if resp["error"] == nil {
		t.Fatalf("expected an error response, got %v", resp)
	}
	_ = h.toSrv.Close()
}
