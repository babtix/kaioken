package agent

import (
	"encoding/json"
	"fmt"
	"strings"

	"kaioken/internal/llm"
)

// The todo list.
//
// On a task with six steps, the failure is rarely any single step — it is
// step four being quietly dropped because the model finished step three and
// the conversation moved on. A visible checklist fixes that from both ends: it
// gives the model somewhere to record intent that survives its own verbosity,
// and it gives the user a way to see what was promised and what is left.
//
// The list is deliberately stateless. Every call carries the whole list, and
// the tool just renders it and hands it back. Nothing is stored on the agent
// or in a file, which means there is no way for the displayed list and the
// model's idea of the list to disagree — a class of bug that is invisible
// until the user is looking at a checklist the model stopped believing in.

// Todo statuses.
const (
	todoPending    = "pending"
	todoInProgress = "in_progress"
	todoDone       = "completed"
)

// maxTodoItems bounds a list. A model that emits fifty checklist items has
// misunderstood the tool — this is for the shape of a task, not its every
// keystroke — and the display would bury the conversation either way.
const maxTodoItems = 20

// todoItem is one entry in the checklist.
type todoItem struct {
	Content string `json:"content"`
	Status  string `json:"status"`
}

// todoTool is the schema advertised to the model.
func todoTool() llm.Tool {
	return llm.Tool{Type: "function", Function: llm.FunctionDef{
		Name: "todo",
		Description: "Record or update a checklist for the current task, shown to the user. " +
			"Send the COMPLETE list every time — it replaces the previous one, so omitting an " +
			"item deletes it.\n\n" +
			"Use it when a task has several distinct steps: write the list before starting, mark " +
			"exactly one item in_progress as you begin it, and mark it completed the moment it is " +
			"done rather than in a batch at the end. The user reads this to know where you are.\n\n" +
			"Do not use it for single-step work, or to narrate things you have already finished — " +
			"a checklist written after the fact is noise.",
		Parameters: raw(`{"type":"object","properties":{
			"items":{"type":"array","description":"the complete checklist, in order",
				"items":{"type":"object","properties":{
					"content":{"type":"string","description":"the step, as a short imperative phrase"},
					"status":{"type":"string","enum":["pending","in_progress","completed"]}},
				"required":["content","status"]}}},
			"required":["items"]}`),
	}}
}

// updateTodos validates a checklist, shows it to the user, and echoes back a
// rendering for the model. The echo is not redundant: it is what puts the
// current list in the transcript, so a model reading its own history several
// turns later still knows what it committed to.
func (a *Agent) updateTodos(rawArgs string) string {
	var args struct {
		Items []todoItem `json:"items"`
	}
	if err := json.Unmarshal([]byte(rawArgs), &args); err != nil {
		return "error: could not parse todo items: " + err.Error()
	}
	if len(args.Items) == 0 {
		return "error: todo requires at least one item — send the complete list"
	}
	if len(args.Items) > maxTodoItems {
		return fmt.Sprintf("error: %d items is too many (max %d) — track the shape of the task, not every keystroke",
			len(args.Items), maxTodoItems)
	}

	inProgress := 0
	for i, item := range args.Items {
		if strings.TrimSpace(item.Content) == "" {
			return fmt.Sprintf("error: item %d has empty content", i+1)
		}
		switch item.Status {
		case todoPending, todoDone:
		case todoInProgress:
			inProgress++
		default:
			return fmt.Sprintf("error: item %d has status %q; use pending, in_progress, or completed",
				i+1, item.Status)
		}
	}
	// More than one item in flight means the model is not tracking a sequence,
	// it is marking everything it intends to touch. That reads to the user as
	// no progress information at all.
	if inProgress > 1 {
		return fmt.Sprintf("error: %d items are in_progress; exactly one may be at a time", inProgress)
	}

	a.UI.Info(renderTodos(args.Items))
	return summarizeTodos(args.Items)
}

// renderTodos draws the checklist for the terminal. Status is carried by the
// glyph rather than by a word, so the shape of the list — how much is struck
// through, where the arrow sits — reads at a glance without being parsed.
func renderTodos(items []todoItem) string {
	var b strings.Builder
	b.WriteString("todo:")
	for _, item := range items {
		glyph := "○"
		switch item.Status {
		case todoInProgress:
			glyph = "◐"
		case todoDone:
			glyph = "●"
		}
		b.WriteString("\n  " + glyph + " " + item.Content)
	}
	return b.String()
}

// summarizeTodos is the model's copy: the list plus a count, so the next turn
// can see at a glance whether anything is outstanding.
func summarizeTodos(items []todoItem) string {
	done := 0
	var b strings.Builder
	for _, item := range items {
		if item.Status == todoDone {
			done++
		}
		b.WriteString("- [" + item.Status + "] " + item.Content + "\n")
	}
	return fmt.Sprintf("checklist updated (%d/%d complete):\n%s", done, len(items), b.String())
}
