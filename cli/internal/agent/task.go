package agent

import (
	"context"
	"fmt"
	"strings"

	"kaioken/internal/llm"
)

// Sub-agent delegation.
//
// The expensive resource in a long coding session is not tokens spent but
// context occupied. An investigation like "which package owns session
// persistence, and what does it write?" costs a dozen reads and searches, and
// every one of those results stays in the transcript forever even though only
// the two-sentence conclusion mattered.
//
// The task tool moves that cost somewhere disposable. It runs a second agent
// with a fresh conversation, lets it burn as many reads as it needs, and hands
// the parent only the final answer. The searching is still done — it is just
// not remembered.

// subAgentSteps caps a delegated investigation. It is deliberately lower than
// the parent's budget: a sub-agent that has not concluded in this many steps
// is lost, and its partial findings are better returned than iterated on.
const subAgentSteps = 15

// maxSubAgentDepth is how deep delegation may nest. One level is the useful
// case; deeper nesting multiplies cost without adding reach, and an agent that
// can delegate to itself indefinitely will eventually try to.
const maxSubAgentDepth = 1

// taskDescription is the tool's advertised contract. It is written to steer
// the model toward the case that actually pays — open-ended search whose
// intermediate results are noise — and away from the case that does not,
// where a single read_file is both cheaper and more precise.
const taskDescription = `Delegate a focused, read-only investigation to a sub-agent that works in its ` +
	`own separate context and returns only its conclusion.

Use this when answering would take many exploratory reads and searches whose intermediate ` +
	`output you do not need to keep — "where is X implemented", "how does subsystem Y fit ` +
	`together", "which files would Z touch". The sub-agent's file reads never enter this ` +
	`conversation, so a broad search costs you one paragraph instead of twenty file dumps.

Do not use it when you already know the path to read, when you need the file's exact ` +
	`contents to edit it, or for anything that changes the repository — the sub-agent is ` +
	`strictly read-only.

The sub-agent cannot see this conversation. Write the prompt so it stands alone: state what ` +
	`to find, any paths worth starting from, and what the answer should contain.

The user only sees a preview of what comes back, not the whole report — so when the findings ` +
	`answer their question, say the answer yourself rather than assuming they read it.`

// subAgentPrompt is the sub-agent's system message. It is intentionally not
// SystemPrompt: a delegated agent has no user to converse with, one job, and
// exactly one useful output shape — the report its final message carries.
func subAgentPrompt(root, objective string) string {
	var b strings.Builder
	b.WriteString("You are a Kaioken sub-agent: a read-only investigator working inside the ")
	b.WriteString("repository at:\n  " + root + "\n\n")
	b.WriteString("A parent agent delegated one task to you. It cannot see your work — only ")
	b.WriteString("your final message — so that message must stand on its own.\n\n")
	b.WriteString("Your task:\n" + objective + "\n\n")
	b.WriteString("Tools: read_file, list_files, search, read_knowledge. You cannot write files ")
	b.WriteString("or run commands; do not propose to.\n\n")
	b.WriteString(knowledgeSummary(root))
	b.WriteString("\nHow to work:\n")
	b.WriteString("- Search and read until you can answer from the actual files. Never guess at contents.\n")
	b.WriteString("- Then stop and report. Do not keep exploring past the point where the task is answered.\n")
	b.WriteString("- Cite concrete paths (and line numbers where they help) so the parent can act without re-deriving them.\n")
	b.WriteString("- Report what you found, including dead ends: \"no caller outside package X\" is a real answer.\n")
	b.WriteString("- Be dense. This report is the entire value of the work — no preamble, no restating the task.\n")
	return b.String()
}

// taskTool is the schema advertised to the model.
func taskTool() llm.Tool {
	return llm.Tool{Type: "function", Function: llm.FunctionDef{
		Name:        "task",
		Description: taskDescription,
		Parameters: raw(`{"type":"object","properties":{
			"description":{"type":"string","description":"a 3-6 word label for this investigation, shown to the user"},
			"prompt":{"type":"string","description":"the full, self-contained instruction for the sub-agent"},
			"mode":{"type":"string","enum":["explore","plan"],"description":"explore (default) searches and explains; plan additionally drafts the change as text"}},
			"required":["description","prompt"]}`),
	}}
}

// runTask executes one delegated investigation and returns its report. Errors
// come back as text: a sub-agent that failed halfway still leaves the parent
// better off knowing what it managed to establish than seeing the turn abort.
func (a *Agent) runTask(ctx context.Context, description, prompt, modeArg string) string {
	if strings.TrimSpace(prompt) == "" {
		return "error: task requires a prompt describing what to investigate"
	}
	if a.Depth >= maxSubAgentDepth {
		return "error: sub-agents cannot delegate further — do this investigation directly"
	}

	mode := ModeExplore
	if strings.TrimSpace(strings.ToLower(modeArg)) == string(ModePlan) {
		mode = ModePlan
	}

	label := strings.TrimSpace(description)
	if label == "" {
		label = "investigating"
	}
	a.UI.Info(fmt.Sprintf("↳ sub-agent (%s): %s", mode, label))

	sub := &Agent{
		Client:   a.routedClient("task"),
		Root:     a.Root,
		UI:       subUI{parent: a.UI},
		MaxSteps: subAgentSteps,
		Mode:     mode,
		Depth:    a.Depth + 1,
		// The same client bills both agents, so the same guard watches both:
		// a delegated investigation must not out-spend the session's budget.
		Budget: a.Budget,
		// The parent's bus observes the delegate too; subscribers separate the
		// streams by Event.Depth.
		Events: a.bus(),
		// A sub-agent never streams: its prose would interleave with the
		// parent's in the front-end's live region, and nobody is reading it
		// token by token anyway.
		NoStream: true,
		// AllowRun stays false and AutoApprove stays irrelevant — explore and
		// plan withhold every repo-changing tool, so nothing can prompt.
	}

	history := []llm.Message{
		{Role: "system", Content: subAgentPrompt(a.Root, prompt)},
		{Role: "user", Content: prompt},
	}

	result, err := sub.Run(ctx, history)
	report := lastAssistantText(result)

	switch {
	case ctx.Err() != nil:
		return "sub-agent cancelled" + withFindings(report)
	case err != nil && report == "":
		return "error: sub-agent failed: " + err.Error()
	case err != nil:
		// Ran out of steps but said something useful on the way. The partial
		// report is worth more than the error, so lead with it.
		return report + "\n\n[sub-agent stopped early: " + err.Error() + "]"
	case report == "":
		return "sub-agent returned no findings"
	}

	a.UI.Info(fmt.Sprintf("↳ sub-agent done (%s): %d tokens of exploration reduced to %d",
		label, llm.EstimateTokens(result), llm.EstimateTextTokens(report)))
	return wrapReport(label, report)
}

// wrapReport delimits a sub-agent's findings. Without a boundary the report
// arrives as an unmarked wall of prose that reads exactly like the parent's
// own reasoning, and a model that loses track of which is which starts
// presenting a delegate's guesses as things it verified itself.
func wrapReport(label, report string) string {
	return "<task_result agent=\"" + label + "\">\n" + report + "\n</task_result>"
}

// withFindings appends a partial report to a status line, or nothing when the
// sub-agent never produced prose.
func withFindings(report string) string {
	if report == "" {
		return ""
	}
	return " — partial findings:\n" + report
}

// lastAssistantText returns the final piece of assistant prose in a history,
// which is the sub-agent's report. Trailing messages that only carry tool
// calls are skipped: the model's last *words* are what was asked for.
func lastAssistantText(history []llm.Message) string {
	for i := len(history) - 1; i >= 0; i-- {
		if history[i].Role != "assistant" {
			continue
		}
		if text := strings.TrimSpace(history[i].Content); text != "" {
			return text
		}
	}
	return ""
}

// subUI adapts a parent UI for a sub-agent. The sub-agent's transcript is not
// the user's conversation, so it is reported as progress rather than replayed:
// the user sees that work is happening and roughly what kind, without a second
// stream of tool calls competing with the one they asked for.
type subUI struct{ parent UI }

// AssistantDelta and Assistant are dropped. The report reaches the user through
// the parent agent's next message, which is where it belongs in the transcript.
func (s subUI) AssistantDelta(string) {}
func (s subUI) Assistant(string)      {}

func (s subUI) Tool(name, args string) {
	if summary := firstArg(args); summary != "" {
		s.parent.Info("  ↳ " + name + " " + summary)
		return
	}
	s.parent.Info("  ↳ " + name)
}

// ToolResult is reported only when it failed. A sub-agent's successful reads
// are exactly the noise this whole mechanism exists to keep out of view.
func (s subUI) ToolResult(name, result string, isErr bool) {
	if isErr {
		s.parent.Info("  ↳ " + name + " failed: " + clipLine(result, 120))
	}
}

func (s subUI) Info(text string) { s.parent.Info("  ↳ " + text) }

// Approve refuses. A read-only sub-agent has no tool that can reach this, so
// arriving here means a permission check was missed upstream — deny rather
// than interrupt the user for something they did not initiate.
func (s subUI) Approve(ApprovalRequest) bool { return false }

// RecordUndo is dropped: a sub-agent writes nothing, so there is nothing to
// undo, and forwarding would corrupt the parent's undo stack.
func (s subUI) RecordUndo(UndoEntry) {}

// firstArg pulls a short, human-meaningful value out of a tool's JSON
// arguments for the progress line — the path, query, or doc being looked at.
func firstArg(args string) string {
	for _, key := range []string{`"path":"`, `"query":"`, `"doc":"`} {
		i := strings.Index(args, key)
		if i < 0 {
			continue
		}
		rest := args[i+len(key):]
		if j := strings.IndexByte(rest, '"'); j >= 0 {
			return clipLine(rest[:j], 60)
		}
	}
	return ""
}

func clipLine(s string, n int) string {
	s = strings.TrimSpace(strings.ReplaceAll(s, "\n", " "))
	if len(s) <= n {
		return s
	}
	r := []rune(s)
	if len(r) > n {
		r = r[:n]
	}
	return string(r) + "…"
}
