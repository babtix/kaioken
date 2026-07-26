// Package llm is a minimal OpenRouter chat-completions client with retries
// and strict-JSON response extraction.
package llm

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"
)

const defaultBaseURL = "https://openrouter.ai/api/v1"

// Provider describes a chat-completions endpoint. Most speak the
// OpenAI-compatible /chat/completions and /models shapes (the zero value of
// AuthHeader/Protocol); a few need a different auth header or wire protocol,
// named explicitly below.
type Provider struct {
	BaseURL string
	KeyEnv  string

	// AuthHeader, when set, carries the raw API key under this header name
	// instead of the default "Authorization: Bearer <key>". Anthropic wants
	// "x-api-key"; Azure OpenAI wants "api-key".
	AuthHeader string

	// Protocol selects the wire format. "" means OpenAI-compatible
	// chat-completions (the default); "anthropic" means Anthropic's native
	// Messages API, which has a different request/response shape entirely
	// (see anthropic.go).
	Protocol string

	// RequiresBaseURL marks a provider whose endpoint is account-scoped and
	// has no public default — Azure's resource URL, Cloudflare's account ID.
	// NewForProvider refuses to build a client until a base URL override is
	// supplied, rather than silently sending requests to a relative path.
	RequiresBaseURL bool
}

const protocolAnthropic = "anthropic"

// Providers is the built-in registry the TUI/CLI can switch between.
var Providers = map[string]Provider{
	"openrouter":  {BaseURL: "https://openrouter.ai/api/v1", KeyEnv: "OPENROUTER_API_KEY"},
	"openai":      {BaseURL: "https://api.openai.com/v1", KeyEnv: "OPENAI_API_KEY"},
	"groq":        {BaseURL: "https://api.groq.com/openai/v1", KeyEnv: "GROQ_API_KEY"},
	"together":    {BaseURL: "https://api.together.xyz/v1", KeyEnv: "TOGETHER_API_KEY"},
	"deepseek":    {BaseURL: "https://api.deepseek.com/v1", KeyEnv: "DEEPSEEK_API_KEY"},
	"mistral":     {BaseURL: "https://api.mistral.ai/v1", KeyEnv: "MISTRAL_API_KEY"},
	"ollama":      {BaseURL: "http://localhost:11434/v1", KeyEnv: "OLLAMA_API_KEY"},
	"fireworks":   {BaseURL: "https://api.fireworks.ai/inference/v1", KeyEnv: "FIREWORKS_API_KEY"},
	"perplexity":  {BaseURL: "https://api.perplexity.ai", KeyEnv: "PERPLEXITY_API_KEY"},
	"xai":         {BaseURL: "https://api.x.ai/v1", KeyEnv: "XAI_API_KEY"},
	"cerebras":    {BaseURL: "https://api.cerebras.ai/v1", KeyEnv: "CEREBRAS_API_KEY"},
	"sambanova":   {BaseURL: "https://api.sambanova.ai/v1", KeyEnv: "SAMBANOVA_API_KEY"},
	"huggingface": {BaseURL: "https://api-inference.huggingface.co/v1", KeyEnv: "HF_TOKEN"},
	"cohere":      {BaseURL: "https://api.cohere.com/compatibility/v1", KeyEnv: "COHERE_API_KEY"},
	"anyscale":    {BaseURL: "https://api.endpoints.anyscale.com/v1", KeyEnv: "ANYSCALE_API_KEY"},
	"nvidia":      {BaseURL: "https://integrate.api.nvidia.com/v1", KeyEnv: "NVIDIA_API_KEY"},
	"deepinfra":   {BaseURL: "https://api.deepinfra.com/v1/openai", KeyEnv: "DEEPINFRA_API_KEY"},
	"baseten":     {BaseURL: "https://inference.baseten.co/v1", KeyEnv: "BASETEN_API_KEY"},

	// Google's Gemini models via its own OpenAI-compatibility endpoint —
	// same bearer auth and /chat/completions shape as everything above, so
	// no special protocol is needed to reach it.
	"google": {BaseURL: "https://generativelanguage.googleapis.com/v1beta/openai", KeyEnv: "GEMINI_API_KEY"},

	// Anthropic has no OpenAI-compatible endpoint: a distinct auth header
	// and the native Messages API (anthropic.go handles the translation).
	"anthropic": {
		BaseURL:    "https://api.anthropic.com/v1",
		KeyEnv:     "ANTHROPIC_API_KEY",
		AuthHeader: "x-api-key",
		Protocol:   protocolAnthropic,
	},

	// Azure OpenAI: the endpoint is a customer-specific resource URL
	// (https://<resource>.openai.azure.com/openai/v1), so there is no public
	// default — set base_url in workspace config to the resource URL.
	"azure": {KeyEnv: "AZURE_OPENAI_API_KEY", AuthHeader: "api-key", RequiresBaseURL: true},

	// Cloudflare Workers AI: the endpoint embeds the Cloudflare account ID
	// (https://api.cloudflare.com/client/v4/accounts/<id>/ai/v1), so it is
	// account-scoped the same way Azure is.
	"cloudflare-workers-ai": {KeyEnv: "CLOUDFLARE_API_KEY", RequiresBaseURL: true},
}

// NewForProvider builds a client for a named provider. baseURLOverride wins
// over the provider default; apiKey must be non-empty.
func NewForProvider(provName, baseURLOverride, model, apiKey string) (*Client, error) {
	base := baseURLOverride
	keyEnv := "OPENROUTER_API_KEY"
	var authHeader, protocol string
	if p, ok := Providers[provName]; ok {
		if base == "" {
			base = p.BaseURL
		}
		keyEnv = p.KeyEnv
		authHeader = p.AuthHeader
		protocol = p.Protocol
		if base == "" {
			return nil, fmt.Errorf("%s has no default endpoint — set base_url in the workspace config "+
				"(e.g. the Azure resource URL, or the Cloudflare account URL)", provName)
		}
	} else if base == "" {
		base = defaultBaseURL
	}
	if apiKey == "" {
		return nil, fmt.Errorf("no API key — set %s or provide one with /key", keyEnv)
	}
	return &Client{
		APIKey:     apiKey,
		BaseURL:    base,
		Model:      model,
		AuthHeader: authHeader,
		Protocol:   protocol,
		HTTP:       &http.Client{Timeout: 300 * time.Second},
	}, nil
}

// Client talks to the OpenRouter API.
type Client struct {
	APIKey  string
	BaseURL string
	Model   string
	HTTP    *http.Client

	// AuthHeader, when non-empty, is the header the raw APIKey is sent under
	// instead of "Authorization: Bearer <key>". See Provider.AuthHeader.
	AuthHeader string

	// Protocol selects the wire format for this client. See Provider.Protocol.
	Protocol string

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

// usage mirrors the OpenAI-compatible "usage" object returned alongside a
// chat completion.
type usage struct {
	PromptTokens     int `json:"prompt_tokens"`
	CompletionTokens int `json:"completion_tokens"`
}

func (c *Client) recordUsage(u *usage) {
	if u == nil {
		return
	}
	c.usageMu.Lock()
	c.calls++
	c.promptToks += u.PromptTokens
	c.completeToks += u.CompletionTokens
	c.usageMu.Unlock()
}

// Usage returns cumulative call/token counts for this client instance. It
// resets whenever a new Client is built (e.g. on /model or /provider switch).
func (c *Client) Usage() (calls, promptTokens, completionTokens int) {
	c.usageMu.Lock()
	defer c.usageMu.Unlock()
	return c.calls, c.promptToks, c.completeToks
}

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

type chatRequest struct {
	Model    string    `json:"model"`
	Messages []message `json:"messages"`
	// Temperature kept low: knowledge cards should be factual, not creative.
	Temperature float64 `json:"temperature"`
}

type message struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type chatResponse struct {
	Choices []struct {
		Message struct {
			Content string `json:"content"`
		} `json:"message"`
	} `json:"choices"`
	Usage *usage `json:"usage"`
	Error *struct {
		Message string `json:"message"`
		Code    any    `json:"code"`
	} `json:"error"`
}

// Chat sends a system+user prompt and returns the assistant text.
func (c *Client) Chat(ctx context.Context, system, user string) (string, error) {
	if c.Protocol == protocolAnthropic {
		return c.anthropicChat(ctx, system, user)
	}
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

// rawChat POSTs a chat body and returns the raw response, retrying on
// 429/5xx with exponential backoff.
func (c *Client) rawChat(ctx context.Context, body []byte) ([]byte, error) {
	ceiling := c.tokenCeiling()
	body = withMaxTokens(body, ceiling)

	var lastErr error
	shrunk := false
	// next is how long to wait before the upcoming attempt: the fallback
	// schedule by default, overridden whenever a provider states its own.
	next := fallbackBackoffs[0]
	for i := 0; i < len(fallbackBackoffs); i++ {
		if next > 0 {
			select {
			case <-time.After(next):
			case <-ctx.Done():
				return nil, ctx.Err()
			}
		}
		raw, retryable, wait, err := c.doPost(ctx, body)
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
			next = 0 // the resend is corrective, not a retry — do not sleep
			i--      // and it does not consume a backoff slot
			continue
		}
		// Otherwise prefer what the provider asked for, falling back to the
		// ladder only when it said nothing.
		if wait > 0 {
			next = wait
		} else if i+1 < len(fallbackBackoffs) {
			next = fallbackBackoffs[i+1]
		}
		if !retryable {
			return nil, creditError(err, ceiling)
		}
	}
	return nil, creditError(fmt.Errorf("giving up after retries: %w", lastErr), ceiling)
}

// setHeaders applies the auth and attribution headers every request needs.
func (c *Client) setHeaders(req *http.Request) {
	if c.Protocol == protocolAnthropic {
		req.Header.Set("x-api-key", c.APIKey)
		req.Header.Set("anthropic-version", anthropicVersion)
		req.Header.Set("Content-Type", "application/json")
		return
	}
	if c.AuthHeader != "" {
		req.Header.Set(c.AuthHeader, c.APIKey)
	} else {
		req.Header.Set("Authorization", "Bearer "+c.APIKey)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("HTTP-Referer", "https://github.com/local/kaioken")
	req.Header.Set("X-Title", "kaioken")
}

// chatURL returns the completions endpoint. NVIDIA's generic router
// (/v1/chat/completions + model in body) fails with "Function … Not found
// for account" on accounts whose Public API Endpoints permission is not
// enabled; the model-specific invoke URL (/v1/chat/completions/{model})
// routes through a different path that often still works.
func (c *Client) chatURL() string {
	if c.Protocol == protocolAnthropic {
		return c.BaseURL + "/messages"
	}
	if c.nvidiaModelURL {
		return c.BaseURL + "/chat/completions/" + c.Model
	}
	return c.BaseURL + "/chat/completions"
}

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

// nvidiaAccountHint is appended to a persistent NVIDIA 404 so the user knows
// the likely cause and remedy instead of staring at a raw gateway payload.
const nvidiaAccountHint = "\n→ NVIDIA rejected the model for this account. This usually means the " +
	"'Public API Endpoints' permission is not enabled for your NVIDIA " +
	"organization (common on new Personal accounts). Fix: log in at " +
	"build.nvidia.com → account/org settings → enable Public API Endpoints, " +
	"or generate a fresh API key after enabling. Alternatively, switch " +
	"providers (/provider) to openrouter with the same model name."

// doPost sends one request. Alongside the body it reports whether the failure
// is worth retrying and, when the provider stated one, how long to wait first.
func (c *Client) doPost(ctx context.Context, body []byte) (raw []byte, retryable bool, wait time.Duration, err error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		c.chatURL(), bytes.NewReader(body))
	if err != nil {
		return nil, false, 0, err
	}
	c.setHeaders(req)

	resp, err := c.HTTP.Do(req)
	if err != nil {
		return nil, true, 0, err
	}
	defer resp.Body.Close()
	raw, err = io.ReadAll(resp.Body)
	if err != nil {
		return nil, true, 0, err
	}
	if resp.StatusCode == http.StatusTooManyRequests || resp.StatusCode >= 500 {
		// A 429 is where Retry-After actually appears; 5xx occasionally
		// carries one too, and honoring it costs nothing when it does not.
		wait, _ = retryAfter(resp.Header)
		return nil, true, wait, fmt.Errorf("provider HTTP %d: %s", resp.StatusCode, truncate(string(raw), 300))
	}
	if resp.StatusCode != http.StatusOK {
		e := fmt.Errorf("provider HTTP %d: %s", resp.StatusCode, truncate(string(raw), 400))
		if c.nvidia404(e) {
			return c.doPost(ctx, body)
		}
		if strings.Contains(e.Error(), "Not found for account") {
			return nil, false, 0, fmt.Errorf("%s%s", e.Error(), nvidiaAccountHint)
		}
		return nil, false, 0, e
	}
	return raw, false, 0, nil
}

// ---- tool-calling chat (OpenAI-compatible) ----

// Message is one conversation turn in the tool-calling API.
type Message struct {
	Role       string     `json:"role"`
	Content    string     `json:"content"`
	ToolCalls  []ToolCall `json:"tool_calls,omitempty"`
	ToolCallID string     `json:"tool_call_id,omitempty"`
	Name       string     `json:"name,omitempty"`
}

// ToolCall is a function invocation requested by the model.
type ToolCall struct {
	ID       string       `json:"id"`
	Type     string       `json:"type"`
	Function FunctionCall `json:"function"`
}

// FunctionCall carries the tool name and its JSON-encoded arguments.
type FunctionCall struct {
	Name      string `json:"name"`
	Arguments string `json:"arguments"`
}

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

type toolChatRequest struct {
	Model         string         `json:"model"`
	Messages      []Message      `json:"messages"`
	Tools         []Tool         `json:"tools,omitempty"`
	ToolChoice    string         `json:"tool_choice,omitempty"`
	Temperature   float64        `json:"temperature"`
	Stream        bool           `json:"stream,omitempty"`
	StreamOptions *streamOptions `json:"stream_options,omitempty"`
}

type toolChatResponse struct {
	Choices []struct {
		Message      Message `json:"message"`
		FinishReason string  `json:"finish_reason"`
	} `json:"choices"`
	Usage *usage `json:"usage"`
	Error *struct {
		Message string `json:"message"`
	} `json:"error"`
}

// ChatWithTools runs one non-streaming turn of a tool-calling conversation.
// The returned Message may contain assistant text, tool calls, or both.
func (c *Client) ChatWithTools(ctx context.Context, messages []Message, tools []Tool) (Message, error) {
	if c.Protocol == protocolAnthropic {
		return c.anthropicChatWithTools(ctx, messages, tools)
	}
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

// ChatJSON calls Chat and unmarshals the reply into out, tolerating markdown
// code fences, prose around the JSON object, and common relaxed-JSON habits
// (bare keys, trailing commas). A reply that still cannot be parsed earns the
// model one chance to fix its own output before the call fails.
func (c *Client) ChatJSON(ctx context.Context, system, user string, out any) error {
	text, err := c.Chat(ctx, system, user)
	if err != nil {
		return err
	}
	parseErr := decodeJSONReply(text, out)
	if parseErr == nil {
		return nil
	}
	// One repair round: hand the model its broken output and the parser's
	// complaint. Cheaper than failing the whole pipeline step, and models
	// that drift into relaxed JSON usually correct themselves at once.
	fix, chatErr := c.Chat(ctx, jsonFixSystem,
		"Parse error: "+firstLine(parseErr.Error())+
			"\n\nYour previous reply:\n"+truncate(text, 8000))
	if chatErr == nil && decodeJSONReply(fix, out) == nil {
		return nil
	}
	return parseErr
}

// jsonFixSystem steers the one-shot repair round after a JSON parse failure.
const jsonFixSystem = `You emit JSON for a program to parse, but your last reply was not valid
strict JSON. Reply again with ONLY the corrected JSON object: double-quote
every key and every string value, no comments, no ellipsis (…) or other
placeholders, no trailing commas, and no text before or after the object.
Never abbreviate — emit every entry in full.`

func firstLine(s string) string {
	if i := strings.IndexByte(s, '\n'); i >= 0 {
		return s[:i]
	}
	return s
}

// decodeJSONReply extracts the JSON object from a model reply and unmarshals
// it into out — first strictly, then with relaxed-JSON repair.
func decodeJSONReply(text string, out any) error {
	jsonText, err := ExtractJSON(text)
	if err != nil {
		return fmt.Errorf("%w\nmodel output was:\n%s", err, truncate(text, 1200))
	}
	strictErr := json.Unmarshal([]byte(jsonText), out)
	if strictErr == nil {
		return nil
	}
	if json.Unmarshal([]byte(repairJSON(jsonText)), out) == nil {
		return nil
	}
	return fmt.Errorf("model returned invalid JSON: %w\noutput was:\n%s",
		strictErr, truncate(jsonText, 1200))
}

// repairJSON makes a best effort to turn relaxed, model-flavoured JSON into
// strict JSON: it double-quotes bare object keys and drops trailing commas.
// Text inside string literals is never touched.
func repairJSON(s string) string {
	var b strings.Builder
	b.Grow(len(s))
	inStr, escaped := false, false
	for i := 0; i < len(s); i++ {
		ch := s[i]
		if inStr {
			b.WriteByte(ch)
			switch {
			case escaped:
				escaped = false
			case ch == '\\':
				escaped = true
			case ch == '"':
				inStr = false
			}
			continue
		}
		switch {
		case ch == '"':
			inStr = true
			b.WriteByte(ch)
		case ch == ',':
			// Drop a comma whose next meaningful character closes a scope.
			j := i + 1
			for j < len(s) && isJSONSpace(s[j]) {
				j++
			}
			if j < len(s) && (s[j] == '}' || s[j] == ']') {
				continue
			}
			b.WriteByte(ch)
		case isBareKeyStart(ch):
			j := i
			for j < len(s) && isBareKeyChar(s[j]) {
				j++
			}
			word := s[i:j]
			k := j
			for k < len(s) && isJSONSpace(s[k]) {
				k++
			}
			if k < len(s) && s[k] == ':' {
				b.WriteByte('"')
				b.WriteString(word)
				b.WriteByte('"')
			} else {
				b.WriteString(word) // true / false / null — leave as is
			}
			i = j - 1
		default:
			b.WriteByte(ch)
		}
	}
	return b.String()
}

func isJSONSpace(c byte) bool { return c == ' ' || c == '\t' || c == '\n' || c == '\r' }

func isBareKeyStart(c byte) bool {
	return c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z' || c == '_' || c == '$'
}

func isBareKeyChar(c byte) bool {
	return isBareKeyStart(c) || c >= '0' && c <= '9' || c == '-' || c == '.'
}

// ExtractJSON pulls the first top-level JSON object out of an LLM reply.
func ExtractJSON(s string) (string, error) {
	start := strings.IndexByte(s, '{')
	end := strings.LastIndexByte(s, '}')
	if start == -1 || end == -1 || end < start {
		return "", fmt.Errorf("no JSON object found in model output")
	}
	return s[start : end+1], nil
}

// ModelInfo is one entry from the public models listing.
type ModelInfo struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

// ListModels fetches the OpenRouter model catalog, optionally filtered by a
// case-insensitive substring.
func (c *Client) ListModels(ctx context.Context, filter string) ([]ModelInfo, error) {
	if c.Protocol == protocolAnthropic {
		return c.anthropicListModels(ctx, filter)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.BaseURL+"/models", nil)
	if err != nil {
		return nil, err
	}
	if c.AuthHeader != "" {
		req.Header.Set(c.AuthHeader, c.APIKey)
	} else {
		req.Header.Set("Authorization", "Bearer "+c.APIKey)
	}
	resp, err := c.HTTP.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	var payload struct {
		Data []ModelInfo `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return nil, err
	}
	if filter == "" {
		return payload.Data, nil
	}
	var filtered []ModelInfo
	f := strings.ToLower(filter)
	for _, m := range payload.Data {
		if strings.Contains(strings.ToLower(m.ID), f) || strings.Contains(strings.ToLower(m.Name), f) {
			filtered = append(filtered, m)
		}
	}
	return filtered, nil
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}
