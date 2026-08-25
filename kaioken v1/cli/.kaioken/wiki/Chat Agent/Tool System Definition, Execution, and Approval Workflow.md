# Tool System: Definition, Execution, and Approval Workflow

The chat agent in Kaioken provides tools that enable LLMs to interact with the repository. Tools are categorized as read-only (safe) or state-changing (requiring approval). This document details the available tools, their execution flow, and the approval mechanism for state-changing operations.

## Table of Contents
- [Tool Definition](#tool-definition)
- [Tool Execution Flow](#tool-execution-flow)
- [Approval Workflow](#approval-workflow)
- [Tool Details](#tool-details)
  - [read_file](#read_file)
  - [edit_file](#edit_file)
  - [write_file](#write_file)
  - [run_command](#run_command)
  - [Other Tools](#other-tools)
- [Data Flow and Components](#data-flow-and-components)
- [Referenced Files](#referenced-files)

## Tool Definition

The agent exposes tools via the `Tools()` method, returning a slice of `llm.Tool` schemas. Each tool defines its name, description, and JSON schema parameters.

`cli/internal/agent/tools.go:68-127`
```go
func (a *Agent) Tools() []llm.Tool {
	tools := []llm.Tool{
		{Type: "function", Function: llm.FunctionDef{
			Name:        "read_file",
			Description: "Read a UTF-8 text file from the repository. Returns its contents.",
			Parameters: raw(`{"type":"object","properties":{
				"path":{"type":"string","description":"repo-relative file path"}},
				"required":["path"]}`),
		}},
		{Type: "function", Function: llm.FunctionDef{
			Name:        "list_files",
			Description: "List the immediate entries of a directory in the repository.",
			Parameters: raw(`{"type":"object","properties":{
				"path":{"type":"string","description":"repo-relative directory path, default '.'"}}}`),
		}},
		{Type: "function", Function: llm.FunctionDef{
			Name:        "search",
			Description: "Case-insensitive substring search across text files. Returns path:line matches.",
			Parameters: raw(`{"type":"object","properties":{
				"query":{"type":"string","description":"text to search for"}},
				"required":["query"]}`),
		}},
		{Type: "function", Function: llm.FunctionDef{
			Name: "read_knowledge",
			Description: "Read Kaioken's generated documentation for this repo (knowledge cards " +
				"and wiki chapters). Call with no argument to list what exists. Faster than " +
				"reading source when you need orientation on a subsystem.",
			Parameters: raw(`{"type":"object","properties":{
				"doc":{"type":"string","description":"a path from the catalog, e.g. '.kaioken/wiki/Architecture'; omit to list everything"}}}`),
		}},
		{Type: "function", Function: llm.FunctionDef{
			Name:        "write_file",
			Description: "Create or overwrite a file with the given content. Requires user approval.",
			Parameters: raw(`{"type":"object","properties":{
				"path":{"type":"string"},
				"content":{"type":"string"}},
				"required":["path","content"]}`),
		}},
		{Type: "function", Function: llm.FunctionDef{
			Name: "edit_file",
			Description: "Replace the first exact occurrence of old_string with new_string in a file. " +
				"old_string must match uniquely. Requires user approval.",
			Parameters: raw(`{"type":"object","properties":{
				"path":{"type":"string"},
				"old_string":{"type":"string"},
				"new_string":{"type":"string"}},
				"required":["path","old_string","new_string"]}`),
		}},

<!-- kaioken:files internal/agent/tools.go -->
