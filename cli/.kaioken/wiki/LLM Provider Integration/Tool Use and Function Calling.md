# Tool Use and Function Calling

## Table of Contents
- [Overview](#overview)
- [Tool Definitions](#tool-definitions)
- [Request Structure](#request-structure)
- [Response Structure](#response-structure)
- [ChatWithTools Method](#chatwithtools-method)
- [Error Handling](#error-handling)
- [Referenced Files](#referenced-files)

## Overview

Kaioken uses the OpenAI-compatible tool calling API to enable LLMs to invoke functions like `read_file`, `edit_file`, and `run_command`. The `ChatWithTools` method in the LLM client handles a single turn of conversation that may include tool calls. The agent defines available tools, passes them to the LLM, processes any requested tool executions (with user approval for state-changing tools), and feeds results back into the conversation.

## Tool Definitions

Tools are defined by the agent and passed to the LLM as a slice of `Tool` values. Each tool consists of a name, description, and JSON schema for its parameters.

### Tool Type

`internal/llm/openrouter.go:353-356`
```go
// Tool is a function the model may call.
type Tool struct {
	Type     string      `json:"type"`
	Function FunctionDef `json:"function"`
}
```
The `Type` field must be `"function"` for function calling.

### FunctionDef Type

`internal/llm/openrouter.go:359-363`
```go
// FunctionDef describes a tool for the model.
type FunctionDef struct {
	Name        string          `json:"name"`
	Description string          `json:"description"`
	Parameters  json.RawMessage `json:"parameters"`
}
```
- `Name`: Identifier used in tool calls (e.g., `"read_file"`)
- `Description`: Human-readable explanation for the LLM
- `Parameters`: JSON Schema object defining expected arguments

## Request Structure

When invoking `ChatWithTools`, the agent provides conversation history (`[]Message`) and available tools (`[]Tool`). The method constructs an internal `toolChatRequest` to send to the provider.

### toolChatRequest

`internal/llm/openrouter.go:365-373`
```go
type toolChatRequest struct {
	Model         string         `json:"model"`
	Messages      []Message      `json:"messages"`
	Tools         []Tool         `json:"tools,omitempty"`
	ToolChoice    string         `json:"tool_choice,omitempty"`
	Temperature   float64        `json:"temperature"`
	Stream        bool           `json:"stream,omitempty"`
	StreamOptions *streamOptions `json:"stream_options,omitempty"`
}`
```
Key fields:
- `Model`: LLM identifier (e.g., `"openrouter/anthropic/claude-3-opus"`)
- `Messages`: Conversation history (system, user, assistant, and tool messages)
- `Tools`: Available tool definitions
- `ToolChoice`: Set to `"auto"` when tools are present (lets LLM decide tool usage)
- `Temperature`: Fixed at `0.3` for balanced determinism and creativity
- `Stream`: Always `false` (non-streaming mode)

## Response Structure

Provider responses are parsed into `toolChatResponse`. The returned `Message` may contain text content, tool calls, or both.

### toolChatResponse

`internal/llm/openrouter.go:375-384`
```go
type toolChatResponse struct {
	Choices []struct {
		Message      Message `json:"message"`
		FinishReason string  `json:"finish_reason"`
	} `json:"choices"`
	Usage *usage `json:"usage"`
	Error *struct {
		Message string `json:"message"`
	} `json:"error"`
}`
```
The `Message` in `Choices[0]` contains:
- `Role`: Set to `"assistant"` by the client
- `Content`: Assistant's text response (if any)
- `ToolCalls`: Slice of requested tool invocations (if any)

### ToolCall Type

`internal/llm/openrouter.go:340-344`
```go
// ToolCall is a function invocation requested by the model.
type ToolCall struct {
	ID       string       `json:"id"`
	Type     string       `json:"type"`
	Function FunctionCall `json:"function"`
}`
```
- `ID`: Unique identifier for the tool call
- `Type`: Always `"function"`
- `Function`: Contains tool name and arguments

### FunctionCall Type

`internal/llm/openrouter.go:347-350`
```go
// FunctionCall carries the tool name and its JSON-encoded arguments.
type FunctionCall struct {
	Name      string `json:"name"`
	Arguments string `json:"arguments"`
}`
```
- `Name`: Matches a defined tool's `FunctionDef.Name`
- `Arguments`: JSON-encoded object matching the tool's parameter schema

## ChatWithTools Method

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

### Execution Flow
1. **Request Building**:
   - Sets `Model` from client configuration
   - Uses provided `messages` and `tools`
   - Sets `Temperature` to `0.3`
   - Adds `ToolChoice: "auto"` when tools are present
2. **HTTP Request**:
   - Serializes request to JSON
   - Sends via `c.rawChat` (handles retries, backoffs, NVIDIA fallbacks)
3. **Response Processing**:
   - Deserializes JSON into `toolChatResponse`
   - Checks for provider-level errors
   - Records token usage via `c.recordUsage`
   - Validates at least one choice exists
   - Sets message role to `"assistant"` and returns

### Key Behaviors
- **Tool Choice**: When `tools` is non-empty, `ToolChoice` is set to `"auto"` (provider decides whether to invoke tools)
- **Non-Streaming**: Always uses non-streaming mode (`Stream: false`)
- **Usage Tracking**: Records prompt/completion tokens from `cr.Usage`
- **Error Propagation**: Returns first encountered error (marshaling, HTTP, unmarshaling, provider error, or empty choices)

## Error Handling

The method returns errors for:
- **Request Serialization**: `json.Marshal` failure
- **Communication**: Failures in `c.rawChat` (after retries/backoffs)
- **Response Parsing**: `json.Unmarshal` failure
- **Provider Errors**: Non-2xx HTTP status or error object in response
- **Empty Response**: Zero choices in provider response

The `c.rawChat` method implements:
- Exponential backoff for 429/5xx errors
- Special handling for affordable token errors (402)
- NVIDIA-specific 404 fallback logic
- Context cancellation checks

## Referenced Files
- internal/llm/openrouter.go

<!-- kaioken:files internal/llm/openrouter.go -->
