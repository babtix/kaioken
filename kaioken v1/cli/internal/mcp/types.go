// Package mcp serves Kaioken's knowledge engine over the Model Context
// Protocol, so any MCP-capable client — Claude Desktop, Claude Code, Cursor,
// Continue — can read the generated wiki, load skills, inspect module
// freshness and run research without going through Kaioken's own UI.
//
// The mirror image of internal/ext, which *consumes* MCP servers. This one is
// the server: same JSON-RPC 2.0 framing, opposite direction.
package mcp

import (
	"encoding/json"
	"fmt"
)

// ProtocolVersion is the MCP revision this server speaks. Kept in lockstep
// with internal/ext's client so a Kaioken-to-Kaioken hop can't skew.
const ProtocolVersion = "2024-11-05"

// JSON-RPC 2.0 error codes. The first four are from the spec; the rest are
// the implementation-defined range MCP servers use for their own failures.
const (
	codeParseError     = -32700
	codeInvalidRequest = -32600
	codeMethodNotFound = -32601
	codeInvalidParams  = -32602
	codeInternalError  = -32603
	// codeUnauthorized is returned when a request carries no valid token on a
	// transport that requires one.
	codeUnauthorized = -32001
)

// rpcError is a JSON-RPC error object.
type rpcError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
	Data    any    `json:"data,omitempty"`
}

func (e *rpcError) Error() string { return e.Message }

func errf(code int, format string, args ...any) *rpcError {
	return &rpcError{Code: code, Message: fmt.Sprintf(format, args...)}
}

// request is an inbound JSON-RPC frame. ID is kept raw because the spec
// allows a string or a number and the response must echo it back unchanged;
// a nil ID means notification, which gets no reply.
type request struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id,omitempty"`
	Method  string          `json:"method"`
	Params  json.RawMessage `json:"params,omitempty"`
}

// isNotification reports whether the frame expects no response. JSON "null"
// counts as absent, matching what clients send for notifications.
func (r *request) isNotification() bool {
	return len(r.ID) == 0 || string(r.ID) == "null"
}

// response is an outbound JSON-RPC frame. Exactly one of Result/Error is set.
type response struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id"`
	Result  any             `json:"result,omitempty"`
	Error   *rpcError       `json:"error,omitempty"`
}

func result(id json.RawMessage, v any) *response {
	return &response{JSONRPC: "2.0", ID: id, Result: v}
}

func failure(id json.RawMessage, e *rpcError) *response {
	if len(id) == 0 {
		id = json.RawMessage("null")
	}
	return &response{JSONRPC: "2.0", ID: id, Error: e}
}

// --- MCP handshake ---

type initializeResult struct {
	ProtocolVersion string       `json:"protocolVersion"`
	Capabilities    capabilities `json:"capabilities"`
	ServerInfo      serverInfo   `json:"serverInfo"`
	// Instructions is shown to the model as guidance on when to reach for
	// this server. It is the single highest-leverage string here: a client
	// with a dozen servers attached decides from it whether Kaioken is worth
	// calling at all.
	Instructions string `json:"instructions,omitempty"`
}

type capabilities struct {
	Tools     *listCapability `json:"tools,omitempty"`
	Resources *listCapability `json:"resources,omitempty"`
	Prompts   *listCapability `json:"prompts,omitempty"`
}

// listCapability advertises whether a collection can change at runtime.
// Kaioken's tool set is static; its resources are files on disk that come and
// go as the wiki regenerates, but nothing pushes notifications yet.
type listCapability struct {
	ListChanged bool `json:"listChanged"`
	Subscribe   bool `json:"subscribe,omitempty"`
}

type serverInfo struct {
	Name    string `json:"name"`
	Version string `json:"version"`
}

// --- Tools ---

// Tool is one callable exposed to the model. Schema is the JSON Schema for
// arguments, built with the helpers in schema.go.
type Tool struct {
	Name        string          `json:"name"`
	Description string          `json:"description"`
	InputSchema json.RawMessage `json:"inputSchema"`

	// Handler runs the call. Returning an error yields an MCP tool error
	// (isError: true) rather than a protocol-level failure, because a model
	// recovers from the former and a client gives up on the latter.
	Handler func(ctx callContext, args json.RawMessage) (*ToolResult, error) `json:"-"`
}

// ToolResult is what a tool call returns. Text is the model-facing payload;
// Structured, when set, is also emitted as structuredContent for clients that
// can consume typed output.
type ToolResult struct {
	Content []content `json:"content"`
	IsError bool      `json:"isError,omitempty"`

	Structured any `json:"structuredContent,omitempty"`
}

type content struct {
	Type     string `json:"type"`
	Text     string `json:"text,omitempty"`
	URI      string `json:"uri,omitempty"`
	MIMEType string `json:"mimeType,omitempty"`
}

func textResult(s string) *ToolResult {
	return &ToolResult{Content: []content{{Type: "text", Text: s}}}
}

// jsonResult sends a human-readable rendering as text and the same data as
// structured content. Clients that only render text still get something
// useful; ones that parse structuredContent get the typed shape.
func jsonResult(text string, structured any) *ToolResult {
	return &ToolResult{
		Content:    []content{{Type: "text", Text: text}},
		Structured: structured,
	}
}

type toolsListResult struct {
	Tools []Tool `json:"tools"`
}

type callToolParams struct {
	Name      string          `json:"name"`
	Arguments json.RawMessage `json:"arguments"`
}

// --- Resources ---

// Resource is a readable document addressed by URI.
type Resource struct {
	URI         string `json:"uri"`
	Name        string `json:"name"`
	Description string `json:"description,omitempty"`
	MIMEType    string `json:"mimeType,omitempty"`
}

// ResourceTemplate advertises a URI pattern whose instances are not worth
// enumerating — repo:// covers every file in the tree.
type ResourceTemplate struct {
	URITemplate string `json:"uriTemplate"`
	Name        string `json:"name"`
	Description string `json:"description,omitempty"`
	MIMEType    string `json:"mimeType,omitempty"`
}

type resourcesListResult struct {
	Resources []Resource `json:"resources"`
}

type resourceTemplatesListResult struct {
	ResourceTemplates []ResourceTemplate `json:"resourceTemplates"`
}

type readResourceParams struct {
	URI string `json:"uri"`
}

type resourceContents struct {
	URI      string `json:"uri"`
	MIMEType string `json:"mimeType,omitempty"`
	Text     string `json:"text,omitempty"`
}

type readResourceResult struct {
	Contents []resourceContents `json:"contents"`
}

// --- Prompts ---

// Prompt is a reusable instruction template the user picks from a client's
// prompt menu (slash commands in Claude Desktop, for instance).
type Prompt struct {
	Name        string           `json:"name"`
	Description string           `json:"description,omitempty"`
	Arguments   []promptArgument `json:"arguments,omitempty"`

	Handler func(ctx callContext, args map[string]string) (*promptResult, error) `json:"-"`
}

type promptArgument struct {
	Name        string `json:"name"`
	Description string `json:"description,omitempty"`
	Required    bool   `json:"required,omitempty"`
}

type promptsListResult struct {
	Prompts []Prompt `json:"prompts"`
}

type getPromptParams struct {
	Name      string            `json:"name"`
	Arguments map[string]string `json:"arguments,omitempty"`
}

type promptResult struct {
	Description string          `json:"description,omitempty"`
	Messages    []promptMessage `json:"messages"`
}

type promptMessage struct {
	Role    string  `json:"role"`
	Content content `json:"content"`
}
