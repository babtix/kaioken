# Chat Agent

## Table of Contents
- [Introduction](#introduction)
- [Agent Architecture](#agent-architecture)
- [Tool System](#tool-system)
- [Approval Workflow](#approval-workflow)
- [Knowledge Integration](#knowledge-integration)
- [The Agent Loop](#the-agent-loop)
- [Referenced Files](#referenced-files)

## Introduction
The chat agent is Kaioken's interactive coding assistant that processes user messages, invokes LLMs with tools, and manages approvals for repository changes. It enables users to converse with LLMs to perform coding tasks like editing files and running commands, with changes shown as diffs for user approval. The agent leverages generated wiki knowledge through the `read_knowledge` tool and incorporates it into its system prompt for context-aware assistance.

## Agent Architecture
The chat agent is implemented in `internal/agent/` and consists of three primary files:
- `agent.go`: Defines the `Agent` struct and its core loop (`Run` method)
- `tools.go`: Implements all available tools (file operations, search, command execution) and approval mechanisms
- `knowledge.go`: Provides access to generated documentation via the `read_knowledge` tool

The `Agent` struct holds configuration for a run:
```go
type Agent struct {
	Client      *llm.Client
	Root        string // absolute repo root; all file ops are confined here
	UI          UI
	AutoApprove bool // when true, repo-changing actions skip the prompt
	MaxSteps    int
	AllowRun    bool // whether run_command is offered
	NoStream    bool // buffer the whole reply instead of streaming it
}
```
`internal/agent/agent.go:57-65`

The agent interacts with the front-end through the `UI` interface, which handles streaming output, tool execution prompts, and user approvals:
```go
type UI interface {
	// AssistantDelta receives assistant prose as it streams in. It is called
	// from the network goroutine and must not block. Assistant is still called
	// with the complete text afterwards, so a front-end may render deltas as a
	// provisional live region and replace it on completion.
	AssistantDelta(text string)
	Assistant(text string)                      // the complete model prose
	Tool(name, args string)                     // a tool is about to run
	ToolResult(name, result string, isErr bool) // tool finished
	Info(text string)                           // status/notes
	Approve(req ApprovalRequest) bool           // BLOCKS for user y/n
	RecordUndo(e UndoEntry)                     // a write/edit was applied
}
```
`internal/agent/tools.go:42-54`

## Tool System
The agent offers tools to the LLM through the `Tools()` method, which returns a slice of `llm.Tool` schemas. Available tools include:

| Tool Name | Description | Requires Approval |
|-----------|-------------|-------------------|
| `read_file` | Read a UTF-8 text file from the repository | No |
| `list_files` | List immediate entries of a directory | No |
| `search` | Case-insensitive substring search across text files | No |
| `read_knowledge` | Read Kaioken's generated documentation | No |
| `write_file` | Create or overwrite a file | Yes |
| `edit_file` | Replace first exact occurrence of old_string with new_string | Yes |
| `run_command` | Run a shell command in repo root (when `AllowRun` is true) | Yes |

Tool schemas are defined in `tools.go`:
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
	}
	if a.AllowRun {
		tools = append(tools, llm.Tool{Type: "function", Function: llm.FunctionDef{
			Name:        "run_command",
			Description: "Run a shell command in the repo root and return its output. Requires user approval.",
			Parameters: raw(`{"type":"object","properties":{
				"command":{"type":"string","description":"the command line to execute"}},
				"required":["command"]}`),
		}})
	}
	return tools
}
```
`internal/agent/tools.go:68-127`

Tool execution is handled by `execTool`, which unmarshals arguments and dispatches to the appropriate implementation:
```go
func (a *Agent) execTool(ctx context.Context, tc llm.ToolCall) string {
	var args map[string]any
	if err := json.Unmarshal([]byte(tc.Function.Arguments), &args); err != nil {
		return "error: could not parse tool arguments: " + err.Error()
	}
	getStr := func(k string) string {
		if v, ok := args[k].(string); ok {
			return v
		}
		return ""
	}

	switch tc.Function.Name {
	case "read_file":
		return a.readFile(getStr("path"))
	case "list_files":
		p := getStr("path")
		if p == "" {
			p = "."
		}
		return a.listFiles(p)
	case "search":
		return a.search(getStr("query"))
	case "read_knowledge":
		return a.readKnowledge(getStr("doc"))
	case "write_file":
		return a.writeFile(getStr("path"), getStr("content"))
	case "edit_file":
		return a.editFile(getStr("path"), getStr("old_string"), getStr("new_string"))
	case "run_command":
		return a.runCommand(ctx, getStr("command"))
	default:
		return "error: unknown tool " + tc.Function.Name
	}
}
```
`internal/agent/tools.go:133-167`

Each tool implementation includes safety checks:
- `resolve` ensures file operations stay within the repository root
- `readFile`/`writeFile` truncate large files at 100KB (`maxReadBytes`)
- `editFile` validates that `old_string` appears exactly once
- `search` skips common directories (`.git`, `node_modules`, etc.) and limits results to 100 matches
- `runCommand` uses platform-appropriate shell (PowerShell on Windows, sh elsewhere) and truncates output at 100KB

## Approval Workflow
State-changing tools (`write_file`, `edit_file`, `run_command`) require user approval unless `AutoApprove` is enabled. The approval process:

1. When the LLM requests a state-changing tool, the agent calls `approve`:
```go
func (a *Agent) approve(action, target, preview string) bool {
	if a.AutoApprove {
		return true
	}
	return a.UI.Approve(ApprovalRequest{Action: action, Target: target, Preview: preview})
}
```
`internal/agent/tools.go:363-368`

2. The `UI.Approve` method (implemented in the TUI) presents a prompt to the user showing:
   - Action type (`write`, `edit`, or `run`)
   - Target (file path or command)
   - Preview (diff for file operations, command text for `run_command`)

3. If approved, the agent executes the tool and records an `UndoEntry` for potential rollback:
```go
// In writeFile:
if !a.approve("write", path, preview) {
	return "user declined to write " + path
}
// ... after writing file ...
a.UI.RecordUndo(UndoEntry{Path: path, HadPrevious: existed, PreviousContent: string(existingBytes)})
```
`internal/agent/tools.go:223-271`

```go
// In editFile:
if !a.approve("edit", path, preview) {
	return "user declined to edit " + path
}
// ... after editing file ...
a.UI.RecordUndo(UndoEntry{Path: path, HadPrevious: true, PreviousContent: content})
```
`internal/agent/tools.go:294-321`

The `UndoEntry` captures a file's state before modification:
```go
type UndoEntry struct {
	Path            string
	HadPrevious     bool // false means the file did not exist before (new file)
	PreviousContent string
}
```
`internal/agent/tools.go:34-38`

The TUI provides an `/undo` command to revert changes using the `Restore` function:
```go
// Restore reverts a file to the state captured in an UndoEntry: the previous
// content, or deletion if the entry marks the file as newly created. It is
// exported so a front-end can implement /undo without instantiating an Agent.
func Restore(root string, e UndoEntry) error {
	abs := filepath.Join(root, filepath.FromSlash(e.Path))
	if e.HadPrevious {
		return os.WriteFile(abs, []byte(e.PreviousContent), 0o644)
	}
	return os.Remove(abs)
}
```
`internal/agent/tools.go:326-332`

## Knowledge Integration
The agent integrates generated wiki knowledge through two mechanisms:

### System Prompt Enhancement
The agent's system prompt includes a summary of available generated documentation via `knowledgeSummary`:
```go
func SystemPrompt(root string, allowRun bool) string {
	var b strings.Builder
	b.WriteString("You are Kaioken, an AI coding assistant embedded in a terminal, working inside the ")
	b.WriteString("repository at:\n  " + root + "\n\n")
	b.WriteString("You help the user understand and modify this codebase. You have tools:\n")
	b.WriteString("- read_file, list_files, search: inspect the repo. Use them liberally before answering.\n")
	b.WriteString("- read_knowledge: open Kaioken's generated docs for this repo; call it with no\n")
	b.WriteString("  argument to see what exists.\n")
	b.WriteString("- write_file, edit_file: change files. Prefer edit_file for small changes; use a unique old_string.\n")
	if allowRun {
		b.WriteString("- run_command: run shell commands (build, test, git) in the repo root.\n")
	}
	b.WriteString(knowledgeSummary(root))
	b.WriteString("\nGuidelines:\n")
	b.WriteString("- Every file change and command runs only after the user approves it, so propose concrete edits.\n")
	b.WriteString("- Ground answers in the actual files — read before you claim. Never invent file contents.\n")
	b.WriteString("- Keep prose concise. When you finish a task, briefly say what you changed.\n")
	b.WriteString("- Make minimal, targeted edits that match the surrounding code style.\n")
	return b.String()
}
```
`internal/agent/agent.go:12-31`

The `knowledgeSummary` function formats the catalog of generated documentation:
```go
func knowledgeSummary(root string) string {
	entries := knowledgeCatalog(root)
	if len(entries) == 0 {
		return ""
	}
	var b strings.Builder
	b.WriteString("\nGenerated documentation is available for this repository. Prefer it over\n")
	b.WriteString("re-reading source when you need orientation — it is faster and already\n")
	b.WriteString("summarised. When a listed SKILL matches the task you were asked to do,\n")
	b.WriteString("open it FIRST: it states how that task is performed in this codebase.\n")
	b.WriteString("Use read_knowledge to open any of these:\n")
	shown := entries
	if len(shown) > catalogMaxEntries {
		shown = shown[:catalogMaxEntries]
	}
	for _, e := range shown {
		fmt.Fprintf(&b, "- %s — %s\n", e.Path, e.Label)
	}
	if len(entries) > len(shown) {
		fmt.Fprintf(&b, "- … and %d more (read_knowledge with no argument lists everything)\n",
			len(entries)-len(shown))
	}
	b.WriteString("Source files remain the ground truth: if the docs and the code disagree,\n")
	b.WriteString("the code wins — say so rather than repeating a stale doc.\n")
	return b.String()
}
```
`internal/agent/knowledge.go:141-166`

### read_knowledge Tool
The `read_knowledge` tool allows the LLM to access generated documentation:
```go
func (a *Agent) readKnowledge(doc string) string {
	doc = strings.TrimSpace(doc)
	if doc == "" {
		entries := knowledgeCatalog(a.Root)
		if len(entries) == 0 {
			return "no generated documentation yet — the user can create it with /wiki or /generate"
		}
		var b strings.Builder
		b.WriteString("Available documentation:\n")
		for _, e := range entries {
			fmt.Fprintf(&b, "- %s — %s\n", e.Path, e.Label)
		}
		return b.String()
	}

	rel := strings.Trim(filepath.ToSlash(doc), "/")
	if !strings.HasPrefix(rel, config.Dir+"/") && rel != config.Dir {
		// Accept a bare name like "wiki/Architecture" too.
		rel = config.Dir + "/" + rel
	}
	abs, err := a.resolve(rel)
	if err != nil {
		return "error: " + err.Error()
	}

	info, err := os.Stat(abs)
	if err != nil {
		return "error: no such document " + rel + " (read_knowledge with no argument lists what exists)"
	}
	if !info.IsDir() {
		return readCapped(abs)
	}

	// A directory: concatenate its markdown, which is how both cards and wiki
	// chapters are meant to be read.
	files, err := os.ReadDir(abs)
	if err != nil {
		return "error: " + err.Error()
	}
	var b strings.Builder
	for _, f := range files {
		if f.IsDir() || !strings.HasSuffix(f.Name(), ".md") {
			continue
		}
		if b.Len() > knowledgeMaxBytes {
			b.WriteString("\n… [remaining documents omitted for length; open them individually]\n")
			break
		}
		fmt.Fprintf(&b, "===== %s/%s =====\n", rel, f.Name())
		b.WriteString(readCapped(filepath.Join(abs, f.Name())))
		b.WriteString("\n\n")
	}
	if b.Len() == 0 {
		return "error: " + rel + " contains no markdown documents"
	}
	return b.String()
}
```
`internal/agent/knowledge.go:171-227`

The tool respects the `.kaioken/` directory boundary and caps individual document reads at 60KB (`knowledgeMaxBytes`). When called without arguments, it lists all available documentation. When given a document path, it returns the content (or concatenated contents for directories).

## The Agent Loop
The agent's main execution loop is in the `Run` method:
```go
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
				ToolCallID: tc.ID,
				Name:       tc.Function.Name,
				Content:    result,
			})
		}
	}
	return history, fmt.Errorf("stopped after %d steps without a final answer", steps)
}
```
`internal/agent/agent.go:45-89`

The loop:
1. Calls `chat` to get a response from the LLM (with streaming unless `NoStream` is set)
2. Appends the LLM's message to history
3. If the message contains text, sends it to the UI via `Assistant`
4. If the message contains tool calls:
   - Notifies UI via `Tool`
   - Executes each tool via `execTool`
   - Determines if result is an error (based on string prefixes)
   - Notifies UI via `ToolResult`
   - Appends tool result message to history
5. Exits when LLM returns a message with no tool calls (final answer) or after `MaxSteps` iterations

The `chat` method handles LLM communication:
```go
func (a *Agent) chat(ctx context.Context, history []llm.Message, tools []llm.Tool) (llm.Message, error) {
	if a.NoStream {
		return a.Client.ChatWithTools(ctx, history, tools)
	}
	return a.Client.ChatWithToolsStream(ctx, history, tools, a.UI.AssistantDelta)
}
```
`internal/agent/agent.go:35-40`

When streaming is enabled, assistant prose is delivered incrementally to the UI via `AssistantDelta`, with the complete message sent via `Assistant` upon completion.

## Referenced Files
- internal/agent/agent.go
- internal/agent/knowledge.go
- internal/agent/tools.go
- internal/llm/openrouter.go (referenced but not detailed in this chapter)
- internal/tui/tui.go (referenced but not detailed in this chapter)

<!-- kaioken:files internal/agent/agent.go,internal/agent/tools.go,internal/agent/knowledge.go,internal/tui/commands.go,internal/tui/explain.go -->
