package mcp

import (
	"encoding/json"
	"sort"
)

// A hand-rolled JSON Schema builder. MCP only needs object schemas with flat
// scalar properties, so a full schema library would be dead weight — and the
// ordering guarantees here matter: clients cache tool definitions by hash, and
// map iteration would churn that hash on every restart.

type prop struct {
	Type        string   `json:"type"`
	Description string   `json:"description,omitempty"`
	Enum        []string `json:"enum,omitempty"`
	Default     any      `json:"default,omitempty"`
	Minimum     *int     `json:"minimum,omitempty"`
	Maximum     *int     `json:"maximum,omitempty"`
}

type schema struct {
	Type       string          `json:"type"`
	Properties map[string]prop `json:"properties"`
	Required   []string        `json:"required,omitempty"`
	// AdditionalProperties is pinned false so a model that invents an argument
	// gets told by its own client rather than having it silently dropped here.
	AdditionalProperties bool `json:"additionalProperties"`
}

// schemaBuilder accumulates properties in declaration order.
type schemaBuilder struct {
	props    map[string]prop
	required []string
}

func object() *schemaBuilder {
	return &schemaBuilder{props: map[string]prop{}}
}

func (b *schemaBuilder) str(name, desc string) *schemaBuilder {
	b.props[name] = prop{Type: "string", Description: desc}
	return b
}

func (b *schemaBuilder) enum(name, desc string, values ...string) *schemaBuilder {
	b.props[name] = prop{Type: "string", Description: desc, Enum: values}
	return b
}

func (b *schemaBuilder) integer(name, desc string, def, min, max int) *schemaBuilder {
	b.props[name] = prop{Type: "integer", Description: desc, Default: def, Minimum: &min, Maximum: &max}
	return b
}

func (b *schemaBuilder) boolean(name, desc string) *schemaBuilder {
	b.props[name] = prop{Type: "boolean", Description: desc}
	return b
}

// require marks names mandatory. Called after the properties are declared.
func (b *schemaBuilder) require(names ...string) *schemaBuilder {
	b.required = append(b.required, names...)
	return b
}

func (b *schemaBuilder) build() json.RawMessage {
	req := append([]string(nil), b.required...)
	sort.Strings(req)
	raw, err := json.Marshal(schema{
		Type:                 "object",
		Properties:           b.props,
		Required:             req,
		AdditionalProperties: false,
	})
	if err != nil {
		// Impossible for these value types; an empty object schema is a safe
		// fallback that still lets the tool be called.
		return json.RawMessage(`{"type":"object"}`)
	}
	return raw
}

// decodeArgs unmarshals tool arguments, treating an absent/null block as an
// empty object so a no-argument tool works whether the client sends {} or
// nothing at all.
func decodeArgs(raw json.RawMessage, into any) error {
	if len(raw) == 0 || string(raw) == "null" {
		raw = json.RawMessage(`{}`)
	}
	return json.Unmarshal(raw, into)
}
