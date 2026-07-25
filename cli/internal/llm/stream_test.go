package llm

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

// sse builds an event stream body from frame payloads.
func sse(frames ...string) string {
	var b strings.Builder
	for _, f := range frames {
		b.WriteString("data: " + f + "\n\n")
	}
	b.WriteString("data: [DONE]\n\n")
	return b.String()
}

func TestParseSSEContent(t *testing.T) {
	body := sse(
		`{"choices":[{"delta":{"content":"Hello"}}]}`,
		`{"choices":[{"delta":{"content":", "}}]}`,
		`{"choices":[{"delta":{"content":"world"}}]}`,
	)
	var got []string
	msg, _, err := parseSSE(context.Background(), strings.NewReader(body),
		func(s string) { got = append(got, s) }, nil)
	if err != nil {
		t.Fatal(err)
	}
	if msg.Content != "Hello, world" {
		t.Errorf("content = %q, want %q", msg.Content, "Hello, world")
	}
	if strings.Join(got, "|") != "Hello|, |world" {
		t.Errorf("deltas = %v, want three separate chunks", got)
	}
	if msg.Role != "assistant" {
		t.Errorf("role = %q, want assistant", msg.Role)
	}
}

// Tool call arguments arrive as fragments that must be concatenated by index,
// with the id and name appearing only in the first frame.
func TestParseSSEToolCallFragments(t *testing.T) {
	body := sse(
		`{"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","type":"function","function":{"name":"read_file","arguments":"{\"pa"}}]}}]}`,
		`{"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"th\":\"m"}}]}}]}`,
		`{"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"ain.go\"}"}}]}}]}`,
	)
	msg, _, err := parseSSE(context.Background(), strings.NewReader(body), nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(msg.ToolCalls) != 1 {
		t.Fatalf("expected 1 tool call, got %d", len(msg.ToolCalls))
	}
	tc := msg.ToolCalls[0]
	if tc.ID != "call_1" || tc.Function.Name != "read_file" {
		t.Errorf("tool call identity lost: %+v", tc)
	}
	if tc.Function.Arguments != `{"path":"main.go"}` {
		t.Errorf("arguments = %q, want reassembled JSON", tc.Function.Arguments)
	}
	// The reassembled arguments must actually parse — that is what the agent does.
	var args map[string]any
	if err := json.Unmarshal([]byte(tc.Function.Arguments), &args); err != nil {
		t.Errorf("reassembled arguments are not valid JSON: %v", err)
	}
}

// Parallel tool calls stream interleaved and must stay separated by index and
// be returned in index order.
func TestParseSSEParallelToolCalls(t *testing.T) {
	body := sse(
		`{"choices":[{"delta":{"tool_calls":[{"index":1,"id":"b","function":{"name":"two","arguments":"{\"x\""}}]}}]}`,
		`{"choices":[{"delta":{"tool_calls":[{"index":0,"id":"a","function":{"name":"one","arguments":"{\"y\""}}]}}]}`,
		`{"choices":[{"delta":{"tool_calls":[{"index":1,"function":{"arguments":":2}"}}]}}]}`,
		`{"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":":1}"}}]}}]}`,
	)
	msg, _, err := parseSSE(context.Background(), strings.NewReader(body), nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(msg.ToolCalls) != 2 {
		t.Fatalf("expected 2 tool calls, got %d", len(msg.ToolCalls))
	}
	if msg.ToolCalls[0].ID != "a" || msg.ToolCalls[1].ID != "b" {
		t.Errorf("tool calls out of index order: %q, %q", msg.ToolCalls[0].ID, msg.ToolCalls[1].ID)
	}
	if msg.ToolCalls[0].Function.Arguments != `{"y":1}` {
		t.Errorf("call a args = %q", msg.ToolCalls[0].Function.Arguments)
	}
	if msg.ToolCalls[1].Function.Arguments != `{"x":2}` {
		t.Errorf("call b args = %q", msg.ToolCalls[1].Function.Arguments)
	}
}

func TestParseSSEUsageAndNoise(t *testing.T) {
	body := ": keep-alive comment\n\n" +
		"data: {\"choices\":[{\"delta\":{\"content\":\"hi\"}}]}\n\n" +
		"\n" +
		"data: {\"choices\":[],\"usage\":{\"prompt_tokens\":11,\"completion_tokens\":5}}\n\n" +
		"data: [DONE]\n\n"

	var u usage
	msg, _, err := parseSSE(context.Background(), strings.NewReader(body), nil,
		func(got *usage) {
			if got != nil {
				u = *got
			}
		})
	if err != nil {
		t.Fatal(err)
	}
	if msg.Content != "hi" {
		t.Errorf("content = %q", msg.Content)
	}
	if u.PromptTokens != 11 || u.CompletionTokens != 5 {
		t.Errorf("usage = %+v, want 11/5", u)
	}
}

func TestParseSSEProviderError(t *testing.T) {
	body := sse(`{"error":{"message":"rate limited by upstream"}}`)
	_, retryable, err := parseSSE(context.Background(), strings.NewReader(body), nil, nil)
	if err == nil {
		t.Fatal("expected an error")
	}
	if !strings.Contains(err.Error(), "rate limited by upstream") {
		t.Errorf("error should carry the provider message, got %v", err)
	}
	if retryable {
		t.Error("a provider error frame should not be reported as retryable")
	}
}

// A stream that dies after emitting text must NOT be retried — replaying it
// would show the user the same tokens twice.
func TestParseSSENotRetryableAfterEmitting(t *testing.T) {
	pr, pw := io.Pipe()
	go func() {
		pw.Write([]byte("data: {\"choices\":[{\"delta\":{\"content\":\"partial\"}}]}\n\n"))
		pw.CloseWithError(io.ErrUnexpectedEOF)
	}()
	var seen string
	_, retryable, err := parseSSE(context.Background(), pr, func(s string) { seen += s }, nil)
	if err == nil {
		t.Fatal("expected the read error to surface")
	}
	if seen != "partial" {
		t.Errorf("delta not delivered before failure: %q", seen)
	}
	if retryable {
		t.Error("must not retry once tokens have been shown to the user")
	}
}

func newTestClient(t *testing.T, h http.HandlerFunc) *Client {
	t.Helper()
	srv := httptest.NewServer(h)
	t.Cleanup(srv.Close)
	return &Client{
		APIKey: "test", BaseURL: srv.URL, Model: "test/model",
		HTTP: &http.Client{Timeout: 10 * time.Second},
	}
}

func TestChatWithToolsStreamEndToEnd(t *testing.T) {
	c := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		var req toolChatRequest
		json.NewDecoder(r.Body).Decode(&req)
		if !req.Stream {
			t.Error("expected stream:true on the request")
		}
		w.Header().Set("Content-Type", "text/event-stream")
		io.WriteString(w, sse(
			`{"choices":[{"delta":{"content":"one "}}]}`,
			`{"choices":[{"delta":{"content":"two"}}]}`,
			`{"usage":{"prompt_tokens":7,"completion_tokens":3}}`,
		))
	})

	var chunks int
	msg, err := c.ChatWithToolsStream(context.Background(),
		[]Message{{Role: "user", Content: "hi"}}, nil, func(string) { chunks++ })
	if err != nil {
		t.Fatal(err)
	}
	if msg.Content != "one two" {
		t.Errorf("content = %q", msg.Content)
	}
	if chunks != 2 {
		t.Errorf("onDelta called %d times, want 2", chunks)
	}
	if calls, pt, ct := c.Usage(); calls != 1 || pt != 7 || ct != 3 {
		t.Errorf("usage = (%d, %d, %d), want (1, 7, 3)", calls, pt, ct)
	}
}

// A gateway that rejects `stream` must transparently fall back to the
// buffered endpoint rather than failing the turn.
func TestChatWithToolsStreamFallsBack(t *testing.T) {
	var sawStream, sawBuffered bool
	c := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		if strings.Contains(string(body), `"stream":true`) {
			sawStream = true
			w.WriteHeader(http.StatusBadRequest)
			io.WriteString(w, `{"error":{"message":"stream not supported"}}`)
			return
		}
		sawBuffered = true
		io.WriteString(w, `{"choices":[{"message":{"role":"assistant","content":"buffered reply"}}]}`)
	})

	msg, err := c.ChatWithToolsStream(context.Background(),
		[]Message{{Role: "user", Content: "hi"}}, nil, func(string) {})
	if err != nil {
		t.Fatal(err)
	}
	if !sawStream || !sawBuffered {
		t.Errorf("expected a streaming attempt then a buffered retry (stream=%v buffered=%v)", sawStream, sawBuffered)
	}
	if msg.Content != "buffered reply" {
		t.Errorf("content = %q, want the buffered reply", msg.Content)
	}
}

func TestChatStreamCancellation(t *testing.T) {
	c := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		flusher, _ := w.(http.Flusher)
		for i := 0; i < 100; i++ {
			io.WriteString(w, "data: {\"choices\":[{\"delta\":{\"content\":\"x\"}}]}\n\n")
			if flusher != nil {
				flusher.Flush()
			}
			time.Sleep(20 * time.Millisecond)
		}
	})

	ctx, cancel := context.WithCancel(context.Background())
	_, err := c.ChatStream(ctx, "sys", "user", func(string) { cancel() })
	if err == nil {
		t.Fatal("expected cancellation to surface as an error")
	}
}
