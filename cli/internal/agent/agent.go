package agent

import (
	"context"
	"fmt"
	"strings"

	"kaioken/internal/llm"
)

// SystemPrompt builds the agent's system message for a given repo root.
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

// chat runs one model turn, streaming prose to the UI unless streaming is
// disabled. Either way the caller gets the complete assembled message.
func (a *Agent) chat(ctx context.Context, history []llm.Message, tools []llm.Tool) (llm.Message, error) {
	if a.NoStream {
		return a.Client.ChatWithTools(ctx, history, tools)
	}
	return a.Client.ChatWithToolsStream(ctx, history, tools, a.UI.AssistantDelta)
}

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
				ToolCallID: tc.ID,
				Name:       tc.Function.Name,
				Content:    result,
			})
		}
	}
	return history, fmt.Errorf("stopped after %d steps without a final answer", steps)
}
