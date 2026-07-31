package agent

import (
	"context"
	"strings"
	"sync"

	"kaioken/internal/agent/events"
	"kaioken/internal/llm"
)

// Tool execution.
//
// A model turn often requests several tools at once, and most of them are
// pure reads — a batch of read_file calls while it orients itself. Running
// those one after another serializes disk and nothing else. So execution
// groups each turn's calls: consecutive read-only calls run concurrently,
// everything that can touch the repo, prompt for approval, or talk to a
// plugin runs alone, in order.
//
// Two hook points wrap every call. tool_call fires before anything runs and
// may veto the call or rewrite its arguments; tool_result fires after and
// may rewrite what the model reads back. UI methods stay on the agent's
// goroutine throughout — parallel workers only compute results, they never
// render them.

// parallelSafe reports whether a tool may run concurrently with others in
// its batch. Only pure reads qualify: they take no approval prompt, mutate
// nothing, and share no state beyond the filesystem they read.
func parallelSafe(name string) bool {
	switch name {
	case "read_file", "list_files", "search", "read_knowledge", "recall":
		return true
	}
	return false
}

// isErrResult classifies a tool result string the way the transcript
// renderer does: tools report failure as text, not Go errors.
func isErrResult(result string) bool {
	return strings.HasPrefix(result, "error:") ||
		strings.HasPrefix(result, "user declined") ||
		strings.Contains(result, "exited with error")
}

// toolMessage wraps a result for the conversation.
func toolMessage(tc llm.ToolCall, result string) llm.Message {
	return llm.Message{
		Role:       "tool",
		ToolCallID: tc.ID,
		Name:       tc.Function.Name,
		Content:    result,
	}
}

// runToolCalls executes one turn's tool batch and appends the results to
// history in call order — the order the model asked for them, whatever
// order they finished in.
func (a *Agent) runToolCalls(ctx context.Context, history []llm.Message, calls []llm.ToolCall, step int) []llm.Message {
	for i := 0; i < len(calls); {
		if ctx.Err() != nil {
			return history
		}
		// Collect the run of consecutive read-only calls starting here.
		j := i
		for j < len(calls) && parallelSafe(calls[j].Function.Name) {
			j++
		}
		if j-i >= 2 {
			history = append(history, a.execBatchParallel(ctx, calls[i:j], step)...)
			i = j
			continue
		}
		// A lone read gains nothing from a goroutine; everything else must
		// be alone anyway.
		history = append(history, a.execOne(ctx, calls[i], step))
		i++
	}
	return history
}

// execOne runs a single tool call on the agent's goroutine: hook, announce,
// execute, hook, report.
func (a *Agent) execOne(ctx context.Context, tc llm.ToolCall, step int) llm.Message {
	bus := a.bus()
	tc, blockReason := a.applyCallHook(tc, step)
	if blockReason != "" {
		result := "error: " + blockReason
		a.UI.Tool(tc.Function.Name, tc.Function.Arguments)
		a.UI.ToolResult(tc.Function.Name, result, true)
		return toolMessage(tc, result)
	}

	a.UI.Tool(tc.Function.Name, tc.Function.Arguments)
	bus.Emit(&events.Event{Type: events.ToolExecutionStart, Step: step, Depth: a.Depth,
		ToolName: tc.Function.Name, ToolCallID: tc.ID, ToolArgs: tc.Function.Arguments})

	result := a.filterResult(tc, a.execTool(ctx, tc), step)
	isErr := isErrResult(result)

	bus.Emit(&events.Event{Type: events.ToolExecutionEnd, Step: step, Depth: a.Depth,
		ToolName: tc.Function.Name, ToolCallID: tc.ID, Result: result, IsError: isErr})
	a.UI.ToolResult(tc.Function.Name, result, isErr)
	return toolMessage(tc, result)
}

// execBatchParallel runs two or more read-only calls concurrently. Hooks and
// announcements happen before launch and results are reported in call order
// after the batch drains, all on the agent's goroutine — the workers touch
// nothing but their own result slot.
func (a *Agent) execBatchParallel(ctx context.Context, calls []llm.ToolCall, step int) []llm.Message {
	bus := a.bus()
	n := len(calls)
	prepared := make([]llm.ToolCall, n)
	results := make([]string, n)
	launch := make([]bool, n)

	for i := range calls {
		tc, blockReason := a.applyCallHook(calls[i], step)
		prepared[i] = tc
		if blockReason != "" {
			results[i] = "error: " + blockReason
			a.UI.Tool(tc.Function.Name, tc.Function.Arguments)
			continue
		}
		launch[i] = true
		a.UI.Tool(tc.Function.Name, tc.Function.Arguments)
		bus.Emit(&events.Event{Type: events.ToolExecutionStart, Step: step, Depth: a.Depth,
			ToolName: tc.Function.Name, ToolCallID: tc.ID, ToolArgs: tc.Function.Arguments})
	}

	var wg sync.WaitGroup
	for i := range prepared {
		if !launch[i] {
			continue
		}
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			results[i] = a.execTool(ctx, prepared[i])
		}(i)
	}
	wg.Wait()

	out := make([]llm.Message, n)
	for i := range prepared {
		result := a.filterResult(prepared[i], results[i], step)
		isErr := isErrResult(result)
		if launch[i] {
			bus.Emit(&events.Event{Type: events.ToolExecutionEnd, Step: step, Depth: a.Depth,
				ToolName: prepared[i].Function.Name, ToolCallID: prepared[i].ID,
				Result: result, IsError: isErr})
		}
		a.UI.ToolResult(prepared[i].Function.Name, result, isErr)
		out[i] = toolMessage(prepared[i], result)
	}
	return out
}

// applyCallHook passes a call through the tool_call hook. It returns the
// (possibly rewritten) call, and a non-empty reason when a handler vetoed it.
func (a *Agent) applyCallHook(tc llm.ToolCall, step int) (llm.ToolCall, string) {
	bus := a.bus()
	if !bus.HasHandlers(events.ToolCall) {
		return tc, ""
	}
	ev := &events.Event{Type: events.ToolCall, Step: step, Depth: a.Depth,
		ToolName: tc.Function.Name, ToolCallID: tc.ID, ToolArgs: tc.Function.Arguments}
	bus.Emit(ev)
	if ev.Block {
		reason := strings.TrimSpace(ev.BlockReason)
		if reason == "" {
			reason = "a hook blocked this tool call"
		}
		return tc, reason
	}
	tc.Function.Arguments = ev.ToolArgs
	return tc, ""
}

// filterResult passes a result through the tool_result hook, which may
// rewrite what the model reads back.
func (a *Agent) filterResult(tc llm.ToolCall, result string, step int) string {
	bus := a.bus()
	if !bus.HasHandlers(events.ToolResult) {
		return result
	}
	ev := &events.Event{Type: events.ToolResult, Step: step, Depth: a.Depth,
		ToolName: tc.Function.Name, ToolCallID: tc.ID,
		ToolArgs: tc.Function.Arguments, Result: result}
	bus.Emit(ev)
	return ev.Result
}

// liveWriter accumulates a command's output while forwarding each chunk to
// the bus as a tool_execution_update, so a front-end can show a long build
// scrolling instead of a frozen spinner.
type liveWriter struct {
	buf  strings.Builder
	emit func(chunk string)
}

func (w *liveWriter) Write(p []byte) (int, error) {
	w.buf.Write(p)
	if w.emit != nil {
		w.emit(string(p))
	}
	return len(p), nil
}

func (w *liveWriter) String() string { return w.buf.String() }
