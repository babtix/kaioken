# LLM Provider Integration

## Table of Contents
- [Provider Configuration](#provider-configuration)
- [Client Structure](#client-structure)
- [Non-Streaming Chat](#non-streaming-chat)
- [Streaming Responses](#streaming-responses)
- [Tool Use](#tool-use)
- [Token Budget Management](#token-budget-management)
- [Retry Logic and Error Handling](#retry-logic-and-error-handling)
- [Agent Integration](#agent-integration)
- [Referenced Files](#referenced-files)

## Provider Configuration

Kaioken supports multiple LLM providers through a unified OpenAI-compatible interface. The `Providers` map in `internal/llm/openrouter.go` defines endpoint configurations for each provider.

`internal/llm/openrouter.go:21-46`
```go
// Providers is the built-in registry the TUI/CLI can switch between. All use
// the same OpenAI-compatible /chat/completions and /models shapes.
var Providers = map[string]Provider{
	"openrouter":  {"https://openrouter.ai/api/v1", "OPENROUTER_API_KEY"},
	"openai":      {"https://api.openai.com/v1", "OPENAI_API_KEY"},
	"groq":        {"https://api.groq.com/openai/v1", "GROQ_API_KEY"},
	"together":    {"https://api.together.xyz/v1", "TOGETHER_API_KEY"},
	"deepseek":    {"https://api.deepseek.com/v1", "DEEPSEEK_API_KEY"},
	"mistral":     {"https://api.mistral.ai/v1", "MISTRAL_API_KEY"},
	"ollama":      {"http://localhost:11434/v1", "OLLAMA_API_KEY"},
	"fireworks":   {"https://api.fireworks.ai/inference/v1", "FIREWORKS_API_KEY"},
	"perplexity":  {"https://api.perplexity.ai", "PERPLEXITY_API_KEY"},
	"xai":         {"https://api.x.ai/v1", "XAI_API_KEY"},
	"cerebras":    {"https://api.cerebras.ai/v1", "CEREBRAS_API_KEY"},
	"sambanova":   {"https://api.sambanova.ai/v1", "SAMBANOVA_API_KEY"},
	"huggingface": {"https://api-inference.huggingface.co/v1", "HF_TOKEN"},
	"cohere":      {"https://api.cohere.com/compatibility/v1", "COHERE_API_KEY"},
	"anyscale":    {"https://api.endpoints.anyscale.com/v1", "ANYSCALE_API_KEY"},
	"nvidia":      {"https://integrate.api.nvidia.com/v1", "NVIDIA_API_KEY"},
	"anthropic":   {"https://api.anthropic.com/v1", "ANTHROPIC_API_KEY"},
}
```

Clients are created via `NewForProvider` which resolves the base URL and API key environment variable. The function falls back to OpenRouter defaults if the provider is unknown.

`internal/llm/openrouter.go:50-70`
```go
// NewForProvider builds a client for a named provider. baseURLOverride wins
// over the provider default; apiKey must be non-empty.
func NewForProvider(provName, baseURLOverride, model, apiKey string) (*Client, error) {
	base := baseURLOverride
	keyEnv := "OPENROUTER_API_KEY"
	if p, ok := Providers[provName]; ok {
		if base == "" {
			base = p.BaseURL
		}
		keyEnv = p.KeyEnv
	} else if base == "" {
		base = defaultBaseURL
	}
	if apiKey == "" {
		return nil, fmt.Errorf("no API key — set %s or provide one with /key", keyEnv)
	}
	return &Client{
		APIKey:  apiKey,
		BaseURL: base,
		Model:   model,
		HTTP:    &http.Client{Timeout: 300 * time.Second},
	}, nil
}
```

A convenience function `New` builds a client from the `OPENROUTER_API_KEY` environment variable.

`internal/llm/openrouter.go:125-136`
```go
// New builds a client from the environment; model comes from config.
func New(model string) (*Client, error) {
	key := os.Getenv("OPENROUTER_API_KEY")
	if key == "" {
		return nil, fmt.Errorf("OPENROUTER_API_KEY is not set")
	}
	return &Client{
		APIKey:  key,
		BaseURL: defaultBaseURL,
		Model:   model,
		HTTP:    &http.Client{Timeout: 300 * time.Second},
	}, nil
}
```

## Client Structure

The `Client` struct holds connection state, configuration, and usage statistics.

`internal/llm/openrouter.go:73-96`
```go
// Client talks to the OpenRouter API.
type Client struct {
	APIKey  string
	BaseURL string
	Model   string
	HTTP    *http.Client

	// MaxTokens caps the reply length on every request. Zero means "let the
	// provider decide", which is how this used to behave — but OpenRouter
	// reserves credits for the full ceiling up front, so an unset cap makes a
	// large-context model unaffordable on a small balance even when the actual
	// reply would be short. See budget.go.
	MaxTokens int

	usageMu      sync.Mutex
	calls        int
	promptToks   int
	completeToks int

	budgetMu  sync.Mutex
	budgetCap int // ceiling learned from a 402; 0 until the provider tells us

	nvidiaModelURL      bool // currently using the model-specific invoke URL
	nvidiaTriedFallback bool // model-specific URL already attempted; no ping-pong
}
```

Key fields:
- `MaxTokens`: Explicit token ceiling for requests (managed by budget system)
- `budgetCap`: Learned affordability limit from 402 errors
- `nvidiaModelURL`/`nvidiaTriedFallback`: State for NVIDIA-specific endpoint fallback

## Non-Streaming Chat

The basic `Chat` method sends a system/user prompt and returns the assistant's response.

`internal/llm/openrouter.go:164-192`
```go
// Chat sends a system+user prompt and returns the assistant text.
func (c *Client) Chat(ctx context.Context, system, user string) (string, error) {
	body, err := json.Marshal(chatRequest{
		Model: c.Model,
		Messages: []message{
			{Role: "system", Content: system},
			{Role: "user", Content: user},
		},
		Temperature: 0.2,
	})
	if err != nil {
		return "", err
	}
	raw, err := c.rawChat(ctx, body)
	if err != nil {
		return "", err
	}
	var cr chatResponse
	if err := json.Unmarshal(raw, &cr); err != nil {
		return "", fmt.Errorf("decoding response: %w", err)
	}
	if cr.Error != nil {
		return "", fmt.Errorf("provider error: %s", cr.Error.Message)
	}
	c.recordUsage(cr.Usage)
	if len(cr.Choices) == 0 {
		return "", fmt.Errorf("provider returned no choices")
	}
	return cr.Choices[0].Message.Content, nil
}
```

The `rawChat` method handles the HTTP request with retry logic and token budgeting.

`internal/llm/openrouter.go:196-232`
```go
// rawChat POSTs a chat body and returns the raw response, retrying on
// 429/5xx with exponential backoff.
func (c *Client) rawChat(ctx context.Context, body []byte) ([]byte, error) {
	ceiling := c.tokenCeiling()
	body = withMaxTokens(body, ceiling)

	backoffs := []time.Duration{0, 3 * time.Second, 10 * time.Second, 25 * time.Second}
	var lastErr error
	shrunk := false
	for i := 0; i < len(backoffs); i++ {
		if backoffs[i] > 0 {
			select {
			case <-time.After(backoffs[i]):
			case <-ctx.Done():
				return nil, ctx.Err()
			}
		}
		raw, retryable, err := c.doPost(ctx, body)
		if err == nil {
			return raw, nil
		}
		lastErr = err
		// A refusal on price is not a transient failure: the provider told us
		// exactly what it will accept, so take that and go again immediately
		// rather than backing off into the same wall.
		if n, ok := affordableTokens(err); ok && !shrunk {
			shrunk = true
			c.learnCeiling(n)
			ceiling = n
			body = withMaxTokens(body, n)
			i-- // this attempt did not consume a backoff slot
			continue
		}
		if !retryable {
			return nil, creditError(err, ceiling)
		}
	}
	return nil, creditError(fmt.Errorf("giving up after retries: %w", lastErr), ceiling)
}
```

## Streaming Responses

Streaming is implemented via Server-Sent Events (SSE). The `ChatStream` method processes deltas through a callback.

`internal/llm/stream.go:56-65`
```go
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
```

The core streaming logic lives in `stream` and `doStream`, which handle retries and SSE parsing.

`internal/llm/stream.go:99-135`
```go
// stream retries the request on 429/5xx, but only while nothing has been shown
// to the user yet — replaying a partially-emitted stream would duplicate text.
func (c *Client) stream(ctx context.Context, body []byte, onDelta func(string)) (Message, error) {
	ceiling := c.tokenCeiling()
	body = withMaxTokens(body, ceiling)

	backoffs := []time.Duration{0, 3 * time.Second, 10 * time.Second, 25 * time.Second}
	var lastErr error
	shrunk := false
	for i := 0; i < len(backoffs); i++ {
		if backoffs[i] > 0 {
			select {
			case <-time.After(backoffs[i]):
			case <-ctx.Done():
				return Message{}, ctx.Err()
			}
		}
		msg, retryable, err := c.doStream(ctx, body, onDelta)
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
			i--
			continue
		}
		if !retryable {
			return Message{}, creditError(err, ceiling)
		}
	}
	return Message{}, creditError(fmt.Errorf("giving up after retries: %w", lastErr), ceiling)
}
```

`internal/llm/stream.go:137-177`
```go
func (c *Client) doStream(ctx context.Context, body []byte, onDelta func(string)) (Message, bool, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		c.chatURL(), bytes.NewReader(body))
	if err != nil {
		return Message{}, false, err
	}
	c.setHeaders(req)
	req.Header.Set("Accept", "text/event-stream")

	resp, err := c.HTTP.Do(req)
	if err != nil {
		return Message{}, true, err
	}
	defer resp.Body.Close()

	switch {
	case resp.StatusCode == http.StatusTooManyRequests || resp.StatusCode >= 500:
		raw, _ := io.ReadAll(io.LimitReader(resp.Body, 2000))
		return Message{}, true, fmt.Errorf("provider HTTP %d: %s", resp.StatusCode, truncate(string(raw), 300))
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
			return Message{}, false, fmt.Errorf("%s%s", e.Error(), nvidiaAccountHint)
		}
		return Message{}, false, fmt.Errorf("%w (%v)", errStreamUnsupported, e)
	case resp.StatusCode != http.StatusOK:
		raw, _ := io.ReadAll(io.LimitReader(resp.Body, 4000))
		return Message{}, false, fmt.Errorf("provider HTTP %d: %s", resp.StatusCode, truncate(string(raw), 400))
	}

	return parseSSE(ctx, resp.Body, onDelta, c.recordUsage)
}
```

The `parseSSE` function processes the event stream, assembling content and tool calls.

`internal/llm/stream.go:182-255`
```go
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
```

## Tool Use

Tool calling follows the OpenAI-compatible format. The `ChatWithTools` method handles non-streaming tool conversations.

`internal/llm/openrouter.go:388-420`
```go
// ChatWithTools runs one non-streaming turn of a tool-calling conversation.
// The returned Message may contain assistant text, tool calls, or both.
func (c *Client) ChatWithTools(ctx context.Context, messages []Message, tools []Tool) (Message, error) {
	reqBody := toolChatRequest{
		Model:       c.Model,
		Messages:    messages,
		Tools:       tools,
		Temperature: 0.3,
	}
	if len(tools) > 0 {
		reqBody.ToolChoice = "auto"
	}
	body, err := json.Marshal(reqBody)
	if err != nil {
		return Message{}, err
	}
	raw, err := c.rawChat(ctx, body)
	if err != nil {
		return Message{}, err
	}
	var cr toolChatResponse
	if err := json.Unmarshal(raw, &cr); err != nil {
		return Message{}, fmt.Errorf("decoding response: %w", err)
	}
	if cr.Error != nil {
		return Message{}, fmt.Errorf("provider error: %s", cr.Error.Message)
	}
	c.recordUsage(cr.Usage)
	if len(cr.Choices) == 0 {
		return Message{}, fmt.Errorf("provider returned no choices")
	}
	msg := cr.Choices[0].Message
	msg.Role = "assistant"
	return msg, nil
}
```

The streaming equivalent `ChatWithToolsStream` assembles tool calls from delta fragments.

`internal/llm/stream.go:71-95`
```go
// ChatWithToolsStream runs one turn of a tool-calling conversation, invoking
// onDelta as assistant prose arrives. Tool calls are assembled from their
// fragments and returned whole — they are only useful complete. A provider
// that cannot stream transparently falls back to the buffered path.
func (c *Client) ChatWithToolsStream(ctx context.Context, messages []Message, tools []Tool,
	onDelta func(string)) (Message, error) {

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
	body, err := json.Marshal(reqBody)
	if err != nil {
		return Message{}, err
	}

	msg, err := c.stream(ctx, body, onDelta)
	if err != nil && errors.Is(err, errStreamUnsupported) {
		return c.ChatWithTools(ctx, messages, tools)
	}
	return msg, err
}
```

Tool definitions are structured as follows:

`internal/llm/openrouter.go:353-363`
```go
// Tool is a function the model may call.
type Tool struct {
	Type     string      `json:"type"`
	Function FunctionDef `json:"function"`
}

// FunctionDef describes a tool for the model.
type FunctionDef struct {
	Name        string          `json:"name"`
	Description string          `json:"description"`
	Parameters  json.RawMessage `json:"parameters"`
}
```

## Token Budget Management

Token budgeting prevents credit exhaustion by dynamically adjusting `max_tokens` based on provider feedback.

`internal/llm/budget.go:27-32`
```go
// DefaultMaxTokens is the reply ceiling used when nothing else is configured.
// Generous enough for a long wiki chapter, small enough to stay affordable on
// a modest balance.
const DefaultMaxTokens = 8192

// minTokenCeiling is the floor below which a request is not worth sending: a
// reply that short cannot carry a useful chapter, and the real problem is an
// empty account.
const minTokenCeiling = 512
```

The `tokenCeiling` method returns the effective token limit for requests.

`internal/llm/budget.go:36-48`
```go
// tokenCeiling is the cap to send on the next request: whatever was
// configured, lowered to anything the provider has told us it will accept.
func (c *Client) tokenCeiling() int {
	c.budgetMu.Lock()
	defer c.budgetMu.Unlock()

	want := c.MaxTokens
	if want <= 0 {
		want = DefaultMaxTokens
	}
	if c.budgetCap > 0 && c.budgetCap < want {
		return c.budgetCap
	}
	return want
}
```

When a 402 error occurs, `learnCeiling` records the provider's stated affordability limit.

`internal/llm/budget.go:53-59`
```go
// learnCeiling records an affordability limit reported by the provider so the
// remaining calls in a run do not each have to rediscover it. It only ever
// ratchets downward.
func (c *Client) learnCeiling(n int) {
	c.budgetMu.Lock()
	defer c.budgetMu.Unlock()
	if n > 0 && (c.budgetCap == 0 || n < c.budgetCap) {
		c.budgetCap = n
	}
}
```

The `affordableTokens` function extracts the limit from 402 error messages.

`internal/llm/budget.go:68-90`
```go
// affordableRe matches the ceiling out of OpenRouter's 402 body, e.g.
// "You requested up to 32768 tokens, but can only afford 10757".
var affordableRe = regexp.MustCompile(`can only afford (\d+)`)

// affordableTokens reports the ceiling a 402 says the account can cover.
// The response embeds earlier attempts under "previous_errors", each with its
// own number, so the smallest one is the only safe choice.
func affordableTokens(err error) (int, bool) {
	if err == nil {
		return 0, false
	}
	s := err.Error()
	if !strings.Contains(s, "402") {
		return 0, false
	}
	best := 0
	for _, m := range affordableRe.FindAllStringSubmatch(s, -1) {
		n, convErr := strconv.Atoi(m[1])
		if convErr != nil || n <= 0 {
			continue
		}
		if best == 0 || n < best {
			best = n
		}
	}
	if best < minTokenCeiling {
		return 0, false
	}
	return best, true
}
```

The `withMaxTokens` function injects the token limit into request bodies.

`internal/llm/budget.go:96-110`
```go
// withMaxTokens rewrites a marshalled request body to carry a max_tokens cap.
// It works on the raw JSON so both the plain and tool-calling request shapes go
// through one path; a body that cannot be parsed is passed through untouched
// rather than failing the call.
func withMaxTokens(body []byte, n int) []byte {
	if n <= 0 {
		return body
	}
	var m map[string]json.RawMessage
	if err := json.Unmarshal(body, &m); err != nil {
		return body
	}
	m["max_tokens"] = json.RawMessage(strconv.Itoa(n))
	out, err := json.Marshal(m)
	if err != nil {
		return body
	}
	return out
}
```

## Retry Logic and Error Handling

Retry logic uses exponential backoff with special handling for 402 (credit) errors and NVIDIA-specific issues.

The retry loop in `rawChat` and `stream`:
- Uses backoffs: `[0, 3s, 10s, 25s]`
- On 402 errors: immediately retries with reduced `max_tokens` (no backoff)
- On 429/5xx: applies backoff
- Gives up after exhausting backoffs

NVIDIA-specific handling addresses routing issues:

`internal/llm/openrouter.go:263-284`
```go
// nvidia404 drives a two-step fallback for NVIDIA's generic router. When the
// generic endpoint (/v1/chat/completions + model in body) refuses a model with
// "Function '<uuid>': Not found for account" — the well-known symptom of the
// account missing the Public API Endpoints permission — the client retries via
// the model-specific invoke URL (/v1/chat/completions/{model}), which routes
// through a different path that sometimes still works. If that URL does not
// exist for the model (plain "404 page not found"), the client reverts to the
// generic endpoint so the real, actionable error surfaces with its hint.
// Returns true when the caller should retry the request.
func (c *Client) nvidia404(err error) bool {
	if err == nil || !strings.Contains(c.BaseURL, "integrate.api.nvidia.com") {
		return false
	}
	msg := err.Error()
	if !strings.Contains(msg, "404") {
		return false
	}
	switch {
	case !c.nvidiaModelURL && strings.Contains(msg, "Not found for account") && !c.nvidiaTriedFallback:
		// Generic router refused — try the model-specific invoke URL once.
		c.nvidiaModelURL = true
		c.nvidiaTriedFallback = true
		return true
	case c.nvidiaModelURL && !strings.Contains(msg, "Not found for account"):
		// The model-specific URL does not exist for this model — revert so
		// the genuine account error (and its hint) is what the user sees.
		c.nvidiaModelURL = false
		return true
	}
	return false
}
```

Credit errors are formatted for user action:

`internal/llm/budget.go:115-128`
```go
// creditError turns a 402 into something a user can act on. The raw body is a
// wall of nested JSON listing every upstream provider that declined, which
// tells the reader nothing they can use.
func creditError(err error, ceiling int) error {
	if err == nil {
		return nil
	}
	if !strings.Contains(err.Error(), "402") {
		return err
	}
	msg := fmt.Sprintf("out of credits: the account cannot cover a %d-token reply", ceiling)
	if n, ok := affordableTokens(err); ok {
		msg += fmt.Sprintf(" (it can afford about %d)", n)
	}
	return fmt.Errorf("%s — add credits at openrouter.ai/settings/credits, "+
		"or lower max_tokens in .kaioken/config.yaml", msg)
}
```

## Agent Integration

The agent uses the LLM client through its `chat` method, which selects streaming or non-streaming based on configuration.

`internal/agent/agent.go:35-40`
```go
// chat runs one model turn, streaming prose to the UI unless streaming is
// disabled. Either way the caller gets the complete assembled message.
func (a *Agent) chat(ctx context.Context, history []llm.Message, tools []llm.Tool) (llm.Message, error) {
	if a.NoStream {
		return a.Client.ChatWithTools(ctx, history, tools)
	}
	return a.Client.ChatWithToolsStream(ctx, history, tools, a.UI.AssistantDelta)
}
```

The agent's `Run` method executes the tool-calling loop:

`internal/agent/agent.go:45-89`
```go
// Run drives the tool-calling loop until the model returns a message with no
// tool calls (a final answer), the step budget is exhausted, or ctx is
// cancelled. It returns the updated conversation history.
func (a *Agent) Run(ctx context.Context, history []llm.Message) ([]llm.Message, error) {
	steps := a.MaxSteps
	if steps <= 0 {
		steps = 25
	}
	tools := a.Tools()

	for i := 0; i < steps; i++ {
		if ctx.Err() != nil {
			return history, ctx.Err()
		}
		msg, err := a.chat(ctx, history, tools)
		if err != nil {
			return history, err
		}
		history = append(history, msg)

		if text := strings.TrimSpace(msg.Content); text != "" {
			a.UI.Assistant(msg.Content)
		}

		if len(msg.ToolCalls) == 0 {
			return history, nil // final answer
		}

		for _, tc := range msg.ToolCalls {
			if ctx.Err() != nil {
				return history, ctx.Err()
			}
			a.UI.Tool(tc.Function.Name, tc.Function.Arguments)
			result := a.execTool(ctx, tc)
			isErr := strings.HasPrefix(result, "error:") ||
				strings.HasPrefix(result, "user declined") ||
				strings.Contains(result, "exited with error")
			a.UI.ToolResult(tc.Function.Name, result, isErr)
			history = append(history, llm.Message{
				Role:       "tool",
				ToolCallID: tc

<!-- kaioken:files internal/llm/openrouter.go,internal/llm/budget.go,internal/llm/stream.go,internal/agent/agent.go -->
