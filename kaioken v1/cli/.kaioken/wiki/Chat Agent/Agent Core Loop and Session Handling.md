# Agent Core Loop and Session Handling

## Table of Contents
- [Agent Structure](#agent-structure)
- [The Run Method](#the-run-method)
- [Chat Session Management](#chat-session-management)
- [Initial LLM Interaction](#initial-llm-interaction)
- [Referenced Files](#referenced-files)

## Agent Structure

The `Agent` struct (defined in `cli/internal/agent/agent.go`) manages the interaction between the user, the LLM, and available tools. While the full struct definition isn't shown in the provided source, its fields can be inferred from method usage:

- `NoStream`: Boolean controlling whether LLM responses are streamed to the UI
- `Client`: LLM client instance (`*llm.Client`) used for chat completions
- `MaxSteps`: Maximum tool-call iterations before forcing a final answer
- `UI`: Terminal interface for displaying messages, tool calls, and results
- Implicit dependencies: Tool implementations (via `execTool` and `Tools()` method)

Additionally, the file contains the `SystemPrompt` function which builds the agent's system message for a given repository root. It takes the repository root and a boolean `allowRun` (to conditionally include the `run_command` tool) and returns a formatted string that instructs the LLM on its role, available tools, and guidelines.

The agent is instantiated by the TUI layer (`internal/tui/tui.go`) and configured with repository context, UI components, and LLM settings.

## The Run Method

The `Run` method drives the agent's core reasoning loop, implementing a ReAct-style (Reasoning and Acting) cycle. It processes conversation history until the LLM provides a final answer or resource limits are reached.

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

Key behaviors:
1. **Step limiting**: Defaults to 25 iterations if `MaxSteps` ≤ 0 (lines 52-55)
2. **Context checking**: Aborts on context cancellation or deadline (lines 58, 73)
3. **LLM interaction**: Delegates to `chat()` method for each reasoning step (line 61)
4. **History management**: Appends LLM responses and tool results to conversation history
5. **UI updates**: Streams assistant messages and displays tool execution via UI callbacks
6. **Tool handling**: Executes all requested tools in parallel before next LLM turn
7. **Termination conditions**:
   - Returns history when LLM provides final answer (no tool calls)
   - Returns error if step limit exceeded without final answer
   - Propagates context errors immediately

## Chat Session Management

The agent treats conversation history as the canonical session state:
- **Input**: Accepts existing `[]llm.Message` representing prior conversation
- **Mutation**: Appends new LLM assistant messages and tool results to history
- **Output**: Returns updated history for persistence by caller (TUI layer)
- **Tool results**: Formatted as `llm.Message` with `Role: "tool"` and matching `ToolCallID`

This design enables:
- Session persistence: TUI saves/restores history to `.kaioken/sessions/`
- Context retention: Full conversation available for LLM reasoning
- Turn isolation: Each `Run` call processes one user message cycle
- Error recovery: Failed steps don't corrupt existing history

## Initial LLM Interaction

The `chat()` method handles single LLM turns with optional streaming:

```go
func (a *Agent) chat(ctx context.Context, history []llm.Message, tools []llm.Tool) (llm.Message, error) {
	if a.NoStream {
		return a.Client.ChatWithTools(ctx, history, tools)
	}
	return a.Client.ChatWithToolsStream(ctx, history, tools, a.UI.AssistantDelta)
}
```

Behavioral details:
- **Non-streaming path**: Uses standard `ChatWithTools` when `NoStream` is true
- **Streaming path**: Uses `ChatWithToolsStream` with UI delta callback for real-time display
- **Tool exposure**: Current tool set passed to LLM for function calling
- **Context propagation**: Respects cancellation deadlines throughout LLM interaction
- **Error handling**: Returns LLM errors directly to `Run` loop for history preservation

The assistant delta callback (`a.UI.AssistantDelta`) enables:
- Token-by-token rendering in TUI
- Immediate user feedback during generation
- Interruption capability via context cancellation

## Tool Execution Flow

When the LLM requests tools:
1. `Run` displays tool name/arguments via `a.UI.Tool()`
2. `execTool()` executes the tool implementation (e.g., file read/edit)
3. Result classified as error if containing:
   - `"error:"` prefix
   - `"user declined"` prefix (approval rejection)
   - `"exited with error"` substring (command failure)
4. Tool result displayed via `a.UI.ToolResult()` with error flag
5. Result appended to history as tool message for LLM consumption

This creates the approval workflow:
- LLM proposes tool use → UI shows proposal → User approves/declines → Agent executes → Result fed back to LLM

## Dependencies and Collaboration

The agent collaborates with these components during operation:
- **LLM Client** (`internal/llm/openrouter.go`): Handles API calls, streaming, retries
- **UI Layer** (`internal/tui/tui.go`): Provides display callbacks and input handling
- **Tool implementations**: Embedded in `execTool()` and `Tools()` (not shown in source)
- **Context**: Manages operation lifecycle and cancellation

Data flow during a typical turn:
```
User Message → TUI → Agent.Run() 
    → Agent.chat() → LLM Client → LLM Response
    → (If tools) → Tool Execution → Tool Results
    → Updated History → TUI Display
```

## Referenced Files
- `cli/internal/agent/agent.go` (primary source)
- `internal/llm/openrouter.go` (LLM client interface)
- `internal/tui/tui.go` (UI layer - referenced but not detailed in scope)

<!-- kaioken:files internal/agent/agent.go -->
