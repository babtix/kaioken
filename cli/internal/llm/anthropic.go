package llm

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sort"
	"strings"
)

// Anthropic's native Messages API.
//
// Unlike every other provider in this package, Anthropic has no
// OpenAI-compatible /chat/completions endpoint: the request and response
// bodies are shaped differently — a top-level `system` field instead of a
// system-role message, content as an array of typed blocks instead of a
// plain string, tool results are a block type rather than a "tool" role —
// and auth rides on `x-api-key` rather than `Authorization: Bearer`. This
// file is the translation layer between Kaioken's OpenAI-shaped Message/Tool
// types and Anthropic's schema, so the rest of the client — retries, token
// budgeting, usage tracking, SSE plumbing aside — stays provider-agnostic.

const anthropicVersion = "2023-06-01"

type anthropicRequest struct {
	Model       string             `json:"model"`
	MaxTokens   int                `json:"max_tokens"`
	System      any                `json:"system,omitempty"`
	Messages    []anthropicMessage `json:"messages"`
	Tools       []anthropicTool    `json:"tools,omitempty"`
	Temperature float64            `json:"temperature,omitempty"`
	Stream      bool               `json:"stream,omitempty"`
}

type anthropicMessage struct {
	Role    string                  `json:"role"`
	Content []anthropicContentBlock `json:"content"`
}

// anthropicContentBlock covers every block type this client needs to send or
// parse: "text", "tool_use" (an assistant-issued call), and "tool_result"
// (this client reporting a tool's output back).
type anthropicContentBlock struct {
	Type      string          `json:"type"`
	Text      string          `json:"text,omitempty"`
	ID        string          `json:"id,omitempty"`
	Name      string          `json:"name,omitempty"`
	Input     json.RawMessage `json:"input,omitempty"`
	ToolUseID string          `json:"tool_use_id,omitempty"`
	Content   string          `json:"content,omitempty"`
	// CacheControl marks a prompt-cache breakpoint: everything up to this
	// block is cached by the provider and billed at the cache-read rate on
	// the next request that shares the prefix.
	CacheControl json.RawMessage `json:"cache_control,omitempty"`
}

// cacheEphemeral is the only cache_control Anthropic currently accepts.
var cacheEphemeral = json.RawMessage(`{"type":"ephemeral"}`)

// anthropicSystem renders the folded system prompt as a cacheable block.
// The system prompt is the largest stable prefix a session has — knowledge
// cards, skills, project instructions — so caching it pays for itself on
// the second turn.
func anthropicSystem(system string) any {
	if system == "" {
		return nil
	}
	return []anthropicContentBlock{{Type: "text", Text: system, CacheControl: cacheEphemeral}}
}

// applyCacheBreakpoints marks the final block of the last two non-assistant
// messages. Together with the system breakpoint that caches the whole
// conversation prefix: turn N reads the cache written at turn N-1 and
// extends it by one turn's worth of writes.
func applyCacheBreakpoints(msgs []anthropicMessage) {
	marked := 0
	for i := len(msgs) - 1; i >= 0 && marked < 2; i-- {
		if msgs[i].Role != "user" || len(msgs[i].Content) == 0 {
			continue
		}
		msgs[i].Content[len(msgs[i].Content)-1].CacheControl = cacheEphemeral
		marked++
	}
}

type anthropicTool struct {
	Name        string          `json:"name"`
	Description string          `json:"description,omitempty"`
	InputSchema json.RawMessage `json:"input_schema"`
}

type anthropicResponse struct {
	Content    []anthropicContentBlock `json:"content"`
	StopReason string                  `json:"stop_reason"`
	Usage      struct {
		InputTokens              int `json:"input_tokens"`
		OutputTokens             int `json:"output_tokens"`
		CacheCreationInputTokens int `json:"cache_creation_input_tokens"`
		CacheReadInputTokens     int `json:"cache_read_input_tokens"`
	} `json:"usage"`
	Error *struct {
		Type    string `json:"type"`
		Message string `json:"message"`
	} `json:"error"`
}

// toAnthropicMessages converts Kaioken's flat OpenAI-shaped history into
// Anthropic's schema. Every "system"-role message — the initial system
// prompt, and any mid-conversation reminder or mode-switch marker
// (agent/reminders.go, agent/compact.go) — is folded into the single
// top-level `system` string, in order, since Anthropic's messages array only
// accepts "user"/"assistant" roles and 400s on anything else. That trades a
// little recency (a reminder no longer sits right against the prompt it
// governs) for correctness: the request has to be valid before it can be
// current.
func toAnthropicMessages(messages []Message) (string, []anthropicMessage) {
	var system []string
	var out []anthropicMessage
	for _, m := range messages {
		switch m.Role {
		case "system":
			if m.Content != "" {
				system = append(system, m.Content)
			}
		case "tool":
			out = append(out, anthropicMessage{
				Role: "user",
				Content: []anthropicContentBlock{{
					Type:      "tool_result",
					ToolUseID: m.ToolCallID,
					Content:   m.Content,
				}},
			})
		case "assistant":
			var blocks []anthropicContentBlock
			if m.Content != "" {
				blocks = append(blocks, anthropicContentBlock{Type: "text", Text: m.Content})
			}
			for _, tc := range m.ToolCalls {
				blocks = append(blocks, anthropicContentBlock{
					Type:  "tool_use",
					ID:    tc.ID,
					Name:  tc.Function.Name,
					Input: validJSONOrEmptyObject(tc.Function.Arguments),
				})
			}
			if len(blocks) == 0 {
				continue // an empty assistant turn carries nothing Anthropic accepts
			}
			out = append(out, anthropicMessage{Role: "assistant", Content: blocks})
		default: // "user"
			out = append(out, anthropicMessage{
				Role:    "user",
				Content: []anthropicContentBlock{{Type: "text", Text: m.Content}},
			})
		}
	}
	return strings.Join(system, "\n\n"), out
}

func validJSONOrEmptyObject(s string) json.RawMessage {
	if s != "" && json.Valid([]byte(s)) {
		return json.RawMessage(s)
	}
	return json.RawMessage("{}")
}

func toAnthropicTools(tools []Tool) []anthropicTool {
	if len(tools) == 0 {
		return nil
	}
	out := make([]anthropicTool, 0, len(tools))
	for _, t := range tools {
		schema := t.Function.Parameters
		if len(schema) == 0 {
			schema = json.RawMessage(`{"type":"object","properties":{}}`)
		}
		out = append(out, anthropicTool{
			Name:        t.Function.Name,
			Description: t.Function.Description,
			InputSchema: schema,
		})
	}
	return out
}

// fromAnthropicResponse assembles a plain assistant Message from the typed
// content blocks Anthropic returns — text concatenated in order, tool calls
// collected separately the way Kaioken's ChatWithTools callers expect.
func fromAnthropicResponse(blocks []anthropicContentBlock) Message {
	var text strings.Builder
	var calls []ToolCall
	for _, b := range blocks {
		switch b.Type {
		case "text":
			text.WriteString(b.Text)
		case "tool_use":
			args := b.Input
			if len(args) == 0 {
				args = json.RawMessage("{}")
			}
			calls = append(calls, ToolCall{
				ID:   b.ID,
				Type: "function",
				Function: FunctionCall{
					Name:      b.Name,
					Arguments: string(args),
				},
			})
		}
	}
	return Message{Role: "assistant", Content: text.String(), ToolCalls: calls}
}

func (c *Client) anthropicChat(ctx context.Context, system, user string) (string, error) {
	msg, err := c.anthropicSend(ctx, system, []anthropicMessage{
		{Role: "user", Content: []anthropicContentBlock{{Type: "text", Text: user}}},
	}, nil)
	if err != nil {
		return "", err
	}
	return msg.Content, nil
}

func (c *Client) anthropicChatWithTools(ctx context.Context, messages []Message, tools []Tool) (Message, error) {
	system, msgs := toAnthropicMessages(messages)
	applyCacheBreakpoints(msgs)
	return c.anthropicSend(ctx, system, msgs, toAnthropicTools(tools))
}

func (c *Client) anthropicSend(ctx context.Context, system string, messages []anthropicMessage, tools []anthropicTool) (Message, error) {
	body, err := json.Marshal(anthropicRequest{
		Model:       c.Model,
		System:      anthropicSystem(system),
		Messages:    messages,
		Tools:       tools,
		Temperature: 0.3,
	})
	if err != nil {
		return Message{}, err
	}
	raw, err := c.rawChat(ctx, body)
	if err != nil {
		return Message{}, err
	}
	var ar anthropicResponse
	if err := json.Unmarshal(raw, &ar); err != nil {
		return Message{}, fmt.Errorf("decoding response: %w", err)
	}
	if ar.Error != nil {
		return Message{}, fmt.Errorf("provider error: %s", ar.Error.Message)
	}
	c.recordUsage(&usage{
		PromptTokens:     ar.Usage.InputTokens,
		CompletionTokens: ar.Usage.OutputTokens,
		cacheRead:        ar.Usage.CacheReadInputTokens,
		cacheWrite:       ar.Usage.CacheCreationInputTokens,
	})
	return fromAnthropicResponse(ar.Content), nil
}

// anthropicStreamBody builds the streaming request body for ChatWithToolsStream.
func anthropicStreamBody(model string, messages []Message, tools []Tool) ([]byte, error) {
	system, msgs := toAnthropicMessages(messages)
	applyCacheBreakpoints(msgs)
	return json.Marshal(anthropicRequest{
		Model:       model,
		System:      anthropicSystem(system),
		Messages:    msgs,
		Tools:       toAnthropicTools(tools),
		Temperature: 0.3,
		Stream:      true,
	})
}

// anthropicSSEEvent covers the union of fields used across Anthropic's
// streaming event types (message_start, content_block_start,
// content_block_delta, message_delta, error); unused fields stay zero for any
// given event.
type anthropicSSEEvent struct {
	Type    string `json:"type"`
	Index   int    `json:"index"`
	Message *struct {
		Usage struct {
			InputTokens              int `json:"input_tokens"`
			CacheCreationInputTokens int `json:"cache_creation_input_tokens"`
			CacheReadInputTokens     int `json:"cache_read_input_tokens"`
		} `json:"usage"`
	} `json:"message"`
	ContentBlock *anthropicContentBlock `json:"content_block"`
	Delta        *struct {
		Type        string `json:"type"`
		Text        string `json:"text"`
		PartialJSON string `json:"partial_json"`
	} `json:"delta"`
	Usage *struct {
		OutputTokens int `json:"output_tokens"`
	} `json:"usage"`
	Error *struct {
		Message string `json:"message"`
	} `json:"error"`
}

// anthropicBlock accumulates one content block across the delta events that
// build it up, index by index — text arrives as UTF-8 fragments, a tool
// call's input arrives as fragments of a JSON string that only parses once
// complete.
type anthropicBlock struct {
	typ        string
	id, name   string
	text       strings.Builder
	partialArg strings.Builder
}

// parseAnthropicSSE consumes an Anthropic Messages-API event stream into one
// Message, the streaming counterpart of fromAnthropicResponse. The bool
// reports whether a failure is safe to retry, which stops being true the
// moment any text has been handed to onDelta — mirrors parseSSE's contract
// so stream() does not need to know which protocol it is driving.
func parseAnthropicSSE(ctx context.Context, r io.Reader, onDelta func(string), record func(*usage)) (Message, bool, error) {
	reader := bufio.NewReaderSize(r, 64*1024)
	blocks := map[int]*anthropicBlock{}
	var order []int
	var emitted bool
	var inputTokens, outputTokens, cacheReadToks, cacheWriteToks int

	for {
		if ctx.Err() != nil {
			return Message{}, false, ctx.Err()
		}
		line, readErr := reader.ReadString('\n')

		if payload, ok := strings.CutPrefix(strings.TrimRight(line, "\r\n"), "data:"); ok {
			payload = strings.TrimSpace(payload)
			var ev anthropicSSEEvent
			if payload != "" && json.Unmarshal([]byte(payload), &ev) == nil {
				switch ev.Type {
				case "message_start":
					if ev.Message != nil {
						inputTokens = ev.Message.Usage.InputTokens
						cacheReadToks = ev.Message.Usage.CacheReadInputTokens
						cacheWriteToks = ev.Message.Usage.CacheCreationInputTokens
					}
				case "content_block_start":
					if ev.ContentBlock != nil {
						b := &anthropicBlock{typ: ev.ContentBlock.Type, id: ev.ContentBlock.ID, name: ev.ContentBlock.Name}
						b.text.WriteString(ev.ContentBlock.Text)
						blocks[ev.Index] = b
						order = append(order, ev.Index)
					}
				case "content_block_delta":
					if b, ok := blocks[ev.Index]; ok && ev.Delta != nil {
						switch ev.Delta.Type {
						case "text_delta":
							b.text.WriteString(ev.Delta.Text)
							if ev.Delta.Text != "" && onDelta != nil {
								onDelta(ev.Delta.Text)
								emitted = true
							}
						case "input_json_delta":
							b.partialArg.WriteString(ev.Delta.PartialJSON)
						}
					}
				case "message_delta":
					if ev.Usage != nil {
						outputTokens = ev.Usage.OutputTokens
					}
				case "error":
					if ev.Error != nil {
						return Message{}, !emitted, fmt.Errorf("provider error: %s", ev.Error.Message)
					}
				}
			}
		}

		if readErr != nil {
			if readErr == io.EOF {
				break
			}
			return Message{}, !emitted, readErr
		}
	}

	if record != nil {
		record(&usage{
			PromptTokens:     inputTokens,
			CompletionTokens: outputTokens,
			cacheRead:        cacheReadToks,
			cacheWrite:       cacheWriteToks,
		})
	}

	sort.Ints(order)
	msg := Message{Role: "assistant"}
	var text strings.Builder
	for _, idx := range order {
		b := blocks[idx]
		switch b.typ {
		case "text":
			text.WriteString(b.text.String())
		case "tool_use":
			msg.ToolCalls = append(msg.ToolCalls, ToolCall{
				ID:       b.id,
				Type:     "function",
				Function: FunctionCall{Name: b.name, Arguments: string(validJSONOrEmptyObject(b.partialArg.String()))},
			})
		}
	}
	msg.Content = text.String()
	return msg, false, nil
}

func (c *Client) anthropicListModels(ctx context.Context, filter string) ([]ModelInfo, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.BaseURL+"/models", nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("x-api-key", c.APIKey)
	req.Header.Set("anthropic-version", anthropicVersion)
	resp, err := c.HTTP.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	var payload struct {
		Data []struct {
			ID          string `json:"id"`
			DisplayName string `json:"display_name"`
		} `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return nil, err
	}
	var out []ModelInfo
	f := strings.ToLower(filter)
	for _, m := range payload.Data {
		if filter != "" && !strings.Contains(strings.ToLower(m.ID), f) && !strings.Contains(strings.ToLower(m.DisplayName), f) {
			continue
		}
		out = append(out, ModelInfo{ID: m.ID, Name: m.DisplayName})
	}
	return out, nil
}
