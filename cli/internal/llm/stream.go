package llm

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"sort"
	"strings"
	"time"
)

// errStreamUnsupported marks a gateway that rejected the streaming request
// outright, so the caller can retry without `stream: true`.
var errStreamUnsupported = errors.New("provider rejected a streaming request")

// streamOptions asks the provider to send a final usage frame, which the
// non-streaming path gets for free but a stream otherwise omits.
type streamOptions struct {
	IncludeUsage bool `json:"include_usage"`
}

// streamChunk is one SSE frame from an OpenAI-compatible completions stream.
type streamChunk struct {
	Choices []struct {
		Delta struct {
			Content   string          `json:"content"`
			ToolCalls []toolCallDelta `json:"tool_calls"`
		} `json:"delta"`
		FinishReason string `json:"finish_reason"`
	} `json:"choices"`
	Usage *usage `json:"usage"`
	Error *struct {
		Message string `json:"message"`
	} `json:"error"`
}

// toolCallDelta is a partial tool call. The id and function name arrive once;
// the arguments stream in as fragments that must be concatenated per index.
type toolCallDelta struct {
	Index    int    `json:"index"`
	ID       string `json:"id"`
	Type     string `json:"type"`
	Function struct {
		Name      string `json:"name"`
		Arguments string `json:"arguments"`
	} `json:"function"`
}

// ChatStream sends a system+user prompt and streams the reply, invoking
// onDelta for each chunk of prose. It returns the assembled text.
func (c *Client) ChatStream(ctx context.Context, system, user string, onDelta func(string)) (string, error) {
	msg, err := c.ChatWithToolsStream(ctx, []Message{
		{Role: "system", Content: system},
		{Role: "user", Content: user},
	}, nil, onDelta)
	if err != nil {
		return "", err
	}
	return msg.Content, nil
}

// ChatWithToolsStream runs one turn of a tool-calling conversation, invoking
// onDelta as assistant prose arrives. Tool calls are assembled from their
// fragments and returned whole — they are only useful complete. A provider
// that cannot stream transparently falls back to the buffered path.
func (c *Client) ChatWithToolsStream(ctx context.Context, messages []Message, tools []Tool,
	onDelta func(string)) (Message, error) {

	var body []byte
	var err error
	if c.Protocol == protocolAnthropic {
		body, err = anthropicStreamBody(c.Model, messages, tools)
	} else {
		reqBody := toolChatRequest{
			Model:         c.Model,
			Messages:      messages,
			Tools:         tools,
			Temperature:   0.3,
			Stream:        true,
			StreamOptions: &streamOptions{IncludeUsage: true},
		}
		if len(tools) > 0 {
			reqBody.ToolChoice = "auto"
		}
		body, err = json.Marshal(reqBody)
	}
	if err != nil {
		return Message{}, err
	}

	msg, err := c.stream(ctx, body, onDelta)
	if err != nil && errors.Is(err, errStreamUnsupported) {
		return c.ChatWithTools(ctx, messages, tools)
	}
	return msg, err
}

// stream retries the request on 429/5xx, but only while nothing has been shown
// to the user yet — replaying a partially-emitted stream would duplicate text.
func (c *Client) stream(ctx context.Context, body []byte, onDelta func(string)) (Message, error) {
	ceiling := c.tokenCeiling()
	body = withMaxTokens(body, ceiling)
	if c.wantsCostAccounting() {
		body = withUsageAccounting(body)
	}

	var lastErr error
	shrunk := false
	// See rawChat: the ladder is only the fallback for failures that arrive
	// without a stated delay.
	next := fallbackBackoffs[0]
	for i := 0; i < len(fallbackBackoffs); i++ {
		if next > 0 {
			select {
			case <-time.After(next):
			case <-ctx.Done():
				return Message{}, ctx.Err()
			}
		}
		msg, retryable, wait, err := c.doStream(ctx, body, onDelta)
		if err == nil {
			return msg, nil
		}
		lastErr = err
		// See rawChat: a 402 names the ceiling it would accept, so retry with
		// that instead of backing off. A refused request emitted nothing, so
		// there is no partial stream to duplicate.
		if n, ok := affordableTokens(err); ok && !shrunk {
			shrunk = true
			c.learnCeiling(n)
			ceiling = n
			body = withMaxTokens(body, n)
			next = 0
			i--
			continue
		}
		if wait > 0 {
			next = wait
		} else if i+1 < len(fallbackBackoffs) {
			next = fallbackBackoffs[i+1]
		}
		if !retryable {
			return Message{}, creditError(err, ceiling)
		}
	}
	return Message{}, creditError(fmt.Errorf("giving up after retries: %w", lastErr), ceiling)
}

// doStream sends one streaming request. Like doPost it reports whether a
// failure is retryable and, when the provider stated one, how long to wait.
func (c *Client) doStream(ctx context.Context, body []byte, onDelta func(string)) (Message, bool, time.Duration, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		c.chatURL(), bytes.NewReader(body))
	if err != nil {
		return Message{}, false, 0, err
	}
	c.setHeaders(req)
	req.Header.Set("Accept", "text/event-stream")

	resp, err := c.HTTP.Do(req)
	if err != nil {
		return Message{}, true, 0, err
	}
	defer resp.Body.Close()

	switch {
	case resp.StatusCode == http.StatusTooManyRequests || resp.StatusCode >= 500:
		raw, _ := io.ReadAll(io.LimitReader(resp.Body, 2000))
		wait, _ := retryAfter(resp.Header)
		return Message{}, true, wait, fmt.Errorf("provider HTTP %d: %s", resp.StatusCode, truncate(string(raw), 300))
	case resp.StatusCode == http.StatusBadRequest, resp.StatusCode == http.StatusNotFound,
		resp.StatusCode == http.StatusUnprocessableEntity:
		// The shapes a gateway uses to say it does not understand `stream`.
		raw, _ := io.ReadAll(io.LimitReader(resp.Body, 4000))
		e := fmt.Errorf("provider HTTP %d: %s", resp.StatusCode, truncate(string(raw), 300))
		// NVIDIA's "Function … Not found for account" 404 is not a streaming
		// rejection — run the generic↔model-specific URL fallback before
		// giving up on streaming entirely.
		if c.nvidia404(e) {
			return c.doStream(ctx, body, onDelta)
		}
		if strings.Contains(e.Error(), "Not found for account") {
			return Message{}, false, 0, fmt.Errorf("%s%s", e.Error(), nvidiaAccountHint)
		}
		return Message{}, false, 0, fmt.Errorf("%w (%v)", errStreamUnsupported, e)
	case resp.StatusCode != http.StatusOK:
		raw, _ := io.ReadAll(io.LimitReader(resp.Body, 4000))
		return Message{}, false, 0, fmt.Errorf("provider HTTP %d: %s", resp.StatusCode, truncate(string(raw), 400))
	}

	if c.Protocol == protocolAnthropic {
		msg, retryable, err := parseAnthropicSSE(ctx, resp.Body, onDelta, c.recordUsage)
		return msg, retryable, 0, err
	}
	msg, retryable, err := parseSSE(ctx, resp.Body, onDelta, c.recordUsage)
	return msg, retryable, 0, err
}

// parseSSE consumes an OpenAI-compatible event stream into one Message. The
// bool reports whether a failure is safe to retry, which stops being true the
// moment any text has been handed to onDelta.
func parseSSE(ctx context.Context, r io.Reader, onDelta func(string), record func(*usage)) (Message, bool, error) {
	reader := bufio.NewReaderSize(r, 64*1024)
	var (
		content strings.Builder
		calls   = map[int]*ToolCall{}
		order   []int
		emitted bool
	)

	for {
		if ctx.Err() != nil {
			return Message{}, false, ctx.Err()
		}
		line, readErr := reader.ReadString('\n')

		if payload, ok := strings.CutPrefix(strings.TrimRight(line, "\r\n"), "data:"); ok {
			payload = strings.TrimSpace(payload)
			if payload == "[DONE]" {
				break
			}
			var chunk streamChunk
			if json.Unmarshal([]byte(payload), &chunk) != nil {
				continue // keep-alive or a frame shape we don't model
			}
			if chunk.Error != nil {
				return Message{}, false, fmt.Errorf("provider error: %s", chunk.Error.Message)
			}
			if record != nil {
				record(chunk.Usage)
			}
			for _, ch := range chunk.Choices {
				if ch.Delta.Content != "" {
					content.WriteString(ch.Delta.Content)
					if onDelta != nil {
						onDelta(ch.Delta.Content)
						emitted = true
					}
				}
				for _, d := range ch.Delta.ToolCalls {
					tc, ok := calls[d.Index]
					if !ok {
						tc = &ToolCall{Type: "function"}
						calls[d.Index] = tc
						order = append(order, d.Index)
					}
					if d.ID != "" {
						tc.ID = d.ID
					}
					if d.Type != "" {
						tc.Type = d.Type
					}
					if d.Function.Name != "" {
						tc.Function.Name = d.Function.Name
					}
					tc.Function.Arguments += d.Function.Arguments
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

	msg := Message{Role: "assistant", Content: content.String()}
	sort.Ints(order)
	for _, idx := range order {
		msg.ToolCalls = append(msg.ToolCalls, *calls[idx])
	}
	return msg, false, nil
}
