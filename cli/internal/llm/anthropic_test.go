package llm

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func newAnthropicTestClient(t *testing.T, h http.HandlerFunc) *Client {
	t.Helper()
	srv := httptest.NewServer(h)
	t.Cleanup(srv.Close)
	return &Client{
		APIKey: "test-key", BaseURL: srv.URL, Model: "claude-x",
		Protocol: protocolAnthropic,
		HTTP:     &http.Client{Timeout: 10 * time.Second},
	}
}

// System messages anywhere in the history — the initial prompt, plus a
// mid-conversation reminder or mode-switch marker like agent/reminders.go
// injects — must fold into the single top-level `system` string rather than
// appear in the messages array, which Anthropic 400s on for any role other
// than user/assistant.
func TestToAnthropicMessagesFoldsSystemMessages(t *testing.T) {
	conv := []Message{
		{Role: "system", Content: "identity prompt"},
		{Role: "user", Content: "hello"},
		{Role: "assistant", Content: "hi there"},
		{Role: "system", Content: "--- context update: agent mode is now build ---"},
		{Role: "user", Content: "do the thing"},
	}
	system, msgs := toAnthropicMessages(conv)
	if !strings.Contains(system, "identity prompt") || !strings.Contains(system, "context update") {
		t.Errorf("system = %q, want both system messages folded in", system)
	}
	for _, m := range msgs {
		if m.Role != "user" && m.Role != "assistant" {
			t.Errorf("message with role %q leaked into the array", m.Role)
		}
	}
	if len(msgs) != 3 {
		t.Fatalf("messages = %d, want 3 (user, assistant, user)", len(msgs))
	}
}

// A tool-role message (Kaioken's shape for a tool's result) becomes a "user"
// message carrying a tool_result block, since Anthropic has no "tool" role.
func TestToAnthropicMessagesConvertsToolResults(t *testing.T) {
	conv := []Message{
		{Role: "assistant", ToolCalls: []ToolCall{{ID: "call_1", Type: "function",
			Function: FunctionCall{Name: "read_file", Arguments: `{"path":"a.go"}`}}}},
		{Role: "tool", ToolCallID: "call_1", Name: "read_file", Content: "file contents"},
	}
	_, msgs := toAnthropicMessages(conv)
	if len(msgs) != 2 {
		t.Fatalf("messages = %d, want 2", len(msgs))
	}
	assistant := msgs[0]
	if len(assistant.Content) != 1 || assistant.Content[0].Type != "tool_use" || assistant.Content[0].Name != "read_file" {
		t.Errorf("assistant block = %+v, want one tool_use block", assistant.Content)
	}
	toolResult := msgs[1]
	if toolResult.Role != "user" {
		t.Errorf("tool result role = %q, want user", toolResult.Role)
	}
	if len(toolResult.Content) != 1 || toolResult.Content[0].Type != "tool_result" ||
		toolResult.Content[0].ToolUseID != "call_1" || toolResult.Content[0].Content != "file contents" {
		t.Errorf("tool result block = %+v", toolResult.Content)
	}
}

// The response side: text and tool_use blocks recombine into the Message
// shape every other provider already produces.
func TestFromAnthropicResponse(t *testing.T) {
	msg := fromAnthropicResponse([]anthropicContentBlock{
		{Type: "text", Text: "let me check "},
		{Type: "text", Text: "that file"},
		{Type: "tool_use", ID: "toolu_1", Name: "read_file", Input: json.RawMessage(`{"path":"a.go"}`)},
	})
	if msg.Role != "assistant" || msg.Content != "let me check that file" {
		t.Errorf("content = %q", msg.Content)
	}
	if len(msg.ToolCalls) != 1 || msg.ToolCalls[0].Function.Name != "read_file" ||
		msg.ToolCalls[0].Function.Arguments != `{"path":"a.go"}` {
		t.Errorf("tool calls = %+v", msg.ToolCalls)
	}
}

// End-to-end: the client must hit /messages with x-api-key + anthropic-version
// (not Authorization: Bearer), and decode Anthropic's response shape.
func TestAnthropicChatWithToolsEndToEnd(t *testing.T) {
	var gotPath string
	var gotHeaders http.Header
	var gotBody anthropicRequest
	c := newAnthropicTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		gotHeaders = r.Header
		json.NewDecoder(r.Body).Decode(&gotBody)
		w.Write([]byte(`{"content":[{"type":"text","text":"ok"}],"usage":{"input_tokens":5,"output_tokens":2}}`))
	})

	msg, err := c.ChatWithTools(context.Background(), []Message{
		{Role: "system", Content: "sys"},
		{Role: "user", Content: "hi"},
	}, nil)
	if err != nil {
		t.Fatal(err)
	}
	if gotPath != "/messages" {
		t.Errorf("path = %q, want /messages", gotPath)
	}
	if gotHeaders.Get("x-api-key") != "test-key" {
		t.Errorf("x-api-key = %q", gotHeaders.Get("x-api-key"))
	}
	if gotHeaders.Get("anthropic-version") == "" {
		t.Error("missing anthropic-version header")
	}
	if gotHeaders.Get("Authorization") != "" {
		t.Error("must not send Authorization: Bearer for Anthropic")
	}
	// The system prompt is sent as a cacheable block array: its text must
	// survive, and the block must carry the ephemeral cache breakpoint.
	sysBlocks, ok := gotBody.System.([]any)
	if !ok || len(sysBlocks) != 1 {
		t.Fatalf("system = %#v, want one cacheable block", gotBody.System)
	}
	sysBlock, _ := sysBlocks[0].(map[string]any)
	if sysBlock["text"] != "sys" {
		t.Errorf("system text = %v, want %q", sysBlock["text"], "sys")
	}
	if cc, _ := sysBlock["cache_control"].(map[string]any); cc["type"] != "ephemeral" {
		t.Errorf("system cache_control = %v, want ephemeral", sysBlock["cache_control"])
	}
	if msg.Content != "ok" {
		t.Errorf("content = %q", msg.Content)
	}
	calls, prompt, complete := c.Usage()
	if calls != 1 || prompt != 5 || complete != 2 {
		t.Errorf("usage = (%d,%d,%d), want (1,5,2)", calls, prompt, complete)
	}
}

// A provider-stated error must surface with its message, matching how the
// OpenAI-shaped path already reports errors.
func TestAnthropicChatSurfacesProviderError(t *testing.T) {
	c := newAnthropicTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`{"type":"error","error":{"type":"invalid_request_error","message":"model not found"}}`))
	})
	_, err := c.Chat(context.Background(), "sys", "hi")
	if err == nil || !strings.Contains(err.Error(), "model not found") {
		t.Errorf("err = %v, want it to carry the provider message", err)
	}
}

// Streaming must parse Anthropic's event shape (message_start /
// content_block_start / content_block_delta / message_delta), deliver text
// deltas as they arrive, and assemble a tool_use block from its
// input_json_delta fragments.
func TestParseAnthropicSSE(t *testing.T) {
	const stream = `event: message_start
data: {"type":"message_start","message":{"usage":{"input_tokens":11}}}

event: content_block_start
data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":", world"}}

event: content_block_stop
data: {"type":"content_block_stop","index":0}

event: content_block_start
data: {"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"toolu_1","name":"read_file"}}

event: content_block_delta
data: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"{\"path\":"}}

event: content_block_delta
data: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"\"a.go\"}"}}

event: content_block_stop
data: {"type":"content_block_stop","index":1}

event: message_delta
data: {"type":"message_delta","delta":{"stop_reason":"tool_use"},"usage":{"output_tokens":7}}

event: message_stop
data: {"type":"message_stop"}

`
	var deltas []string
	var recorded *usage
	msg, retryable, err := parseAnthropicSSE(context.Background(), strings.NewReader(stream),
		func(s string) { deltas = append(deltas, s) },
		func(u *usage) { recorded = u })
	if err != nil {
		t.Fatal(err)
	}
	if retryable {
		t.Error("a fully parsed stream must not be reported retryable")
	}
	if msg.Content != "Hello, world" {
		t.Errorf("content = %q", msg.Content)
	}
	if strings.Join(deltas, "") != "Hello, world" {
		t.Errorf("deltas = %v", deltas)
	}
	if len(msg.ToolCalls) != 1 || msg.ToolCalls[0].Function.Name != "read_file" ||
		msg.ToolCalls[0].Function.Arguments != `{"path":"a.go"}` {
		t.Errorf("tool calls = %+v", msg.ToolCalls)
	}
	if recorded == nil || recorded.PromptTokens != 11 || recorded.CompletionTokens != 7 {
		t.Errorf("usage = %+v", recorded)
	}
}

// NewForProvider must select Anthropic's auth header/protocol, and must
// refuse to build a client for an account-scoped provider (Azure, Cloudflare
// Workers AI) until a base URL override supplies the missing endpoint.
func TestNewForProviderAccountScoped(t *testing.T) {
	c, err := NewForProvider("anthropic", "", "claude-x", "key")
	if err != nil {
		t.Fatal(err)
	}
	if c.AuthHeader != "x-api-key" || c.Protocol != protocolAnthropic {
		t.Errorf("client = %+v, want anthropic auth header/protocol", c)
	}

	if _, err := NewForProvider("azure", "", "gpt-4o", "key"); err == nil {
		t.Error("azure with no base_url override must fail rather than build a broken client")
	}
	c, err = NewForProvider("azure", "https://my-resource.openai.azure.com/openai/v1", "gpt-4o", "key")
	if err != nil {
		t.Fatal(err)
	}
	if c.AuthHeader != "api-key" || c.BaseURL != "https://my-resource.openai.azure.com/openai/v1" {
		t.Errorf("client = %+v, want api-key header and the override base URL", c)
	}
}
