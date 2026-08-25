# LLM Interaction and Tool Invocation

## Table of Contents
- [System Prompt Construction](#system-prompt-construction)
- [LLM Communication](#llm-communication)
- [Tool Call Processing](#tool-call-processing)

## System Prompt Construction

The agent's system message is built by the `SystemPrompt` function. It informs the LLM of the repository root and the available tools.

`cli/internal/agent/agent.go:12-31`

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

## LLM Communication

The agent communicates with the LLM via the `chat` method. This method sends the conversation history and available tools to the LLM and returns the model's response.

The method supports both streaming and non-streaming modes, controlled by the `NoStream` field of the agent.

`cli/internal/agent/agent.go:35-40`

```go
func (a *Agent) chat(ctx context.Context, history []llm.Message, tools []llm.Tool) (llm.Message, error) {
	if a.NoStream {
		return a.Client.ChatWithTools(ctx, history, tools)
	}
	return a.Client.ChatWithToolsStream(ctx, history, tools, a.UI.AssistantDelta)
}
```

In non-streaming mode, it calls `Client.ChatWithTools` which returns the complete message.
In streaming mode, it calls `Client.ChatWithToolsStream` which streams the response to the UI via `a.UI.AssistantDelta` and returns the assembled message.

## Tool Call Processing

The agent's main loop is in the `Run` method. It repeatedly calls the LLM (via `chat`) until the model returns a message without tool calls (a final answer) or the step limit is reached.

For each tool call in the model's response, the agent:
1. Notifies the UI of the tool invocation.
2. Executes the tool via the `execTool` method.
3. Determines if the result indicates an error (by checking for prefixes `"error:"`, `"user declined"`, or containing `"exited with error"`).
4. Notifies the UI of the tool result and whether it was an error.
5. Appends a tool message to the conversation history for the LLM to consume.

`cli/internal/agent/agent.go:45-89`

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

The `execTool` method (not detailed in the provided structure block) is responsible for mapping the tool name to the corresponding function implementation (e.g., `read_file`, `edit_file`, `run_command`) and executing it with the provided arguments. The result is returned as a string for processing in the loop above.

## Referenced Files
- cli/internal/agent/agent.go

<!-- kaioken:files internal/agent/agent.go -->
