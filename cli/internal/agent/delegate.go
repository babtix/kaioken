package agent

import (
	"context"
	"fmt"
	"strings"

	"kaioken/internal/gitx"
	"kaioken/internal/llm"
)

// Writable delegation.
//
// The task tool delegates investigations — read-only, cheap to trust. This
// one delegates implementation: a second agent that can write files and run
// commands, confined to a throwaway git worktree. Every write still asks the
// user (approvals forward to the parent conversation), and the finished work
// comes back as a single diff the user accepts or discards. Nothing reaches
// the real working tree without an explicit yes.

// delegateSteps caps a delegated implementation. Generous enough for a real
// task, small enough that a wandering delegate stops while its worktree is
// still reviewable.
const delegateSteps = 40

// delegatePreviewBytes caps the diff shown in the apply-approval prompt.
const delegatePreviewBytes = 4096

const delegateDescription = `Delegate an implementation task to a writable sub-agent that works in an ` +
	`isolated git worktree of this repository.

The sub-agent can read, write and run inside its worktree; the user approves every ` +
	`state-changing action it takes, just as they would yours. When it finishes, its ` +
	`changes come back as a single diff which the user accepts or discards — rejected ` +
	`work is destroyed without touching the real working tree.

Use this for self-contained tasks that do not need this conversation's context: ` +
	`"add table-driven tests to package X", "refactor Y to use Z". The prompt must ` +
	`stand alone — the sub-agent cannot see this conversation. Do not delegate work ` +
	`that depends on edits already in flight here: the worktree branches from the ` +
	`last commit, not from uncommitted changes.

Keep the scope tight; one delegate, one task.`

// delegateTool is the schema advertised to the model.
func delegateTool() llm.Tool {
	return llm.Tool{Type: "function", Function: llm.FunctionDef{
		Name:        "delegate",
		Description: delegateDescription,
		Parameters: raw(`{"type":"object","properties":{
			"description":{"type":"string","description":"a 3-6 word label for this task, shown to the user"},
			"prompt":{"type":"string","description":"the full, self-contained implementation task for the sub-agent"}},
			"required":["description","prompt"]}`),
	}}
}

// delegatePrompt is the sub-agent's system message. Unlike the read-only
// investigator, this agent has real tools and a real worktree — the prompt
// must keep it inside both.
func delegatePrompt(worktree, objective string) string {
	var b strings.Builder
	b.WriteString("You are a Kaioken delegate: an implementation agent working in an isolated ")
	b.WriteString("git worktree at:\n  " + worktree + "\n\n")
	b.WriteString("A parent agent delegated one task to you. It cannot see your work — only ")
	b.WriteString("your final message — so that message must stand on its own.\n\n")
	b.WriteString("Your task:\n" + objective + "\n\n")
	b.WriteString("How to work:\n")
	b.WriteString("- You are inside a throwaway checkout. Write files and run commands freely; the\n")
	b.WriteString("  user still approves each state-changing action before it happens.\n")
	b.WriteString("- Stay on task: change only what it asks for, and verify with the repo's own\n")
	b.WriteString("  build/test commands when they are quick to run.\n")
	b.WriteString("- Do not commit; your changes are collected as a diff automatically.\n")
	b.WriteString("- Finish with a dense report: what you changed and why, what you verified, and\n")
	b.WriteString("  anything the parent must still do (a commit message suggestion is welcome).\n")
	return b.String()
}

// delegateUI adapts the parent UI for a writable sub-agent. Unlike the
// read-only subUI, approvals forward: the user decides on each write and
// command, namespaced so the origin is obvious.
type delegateUI struct{ parent UI }

func (d delegateUI) AssistantDelta(string) {}
func (d delegateUI) Assistant(string)      {}

func (d delegateUI) Tool(name, args string) {
	if summary := firstArg(args); summary != "" {
		d.parent.Info("  ↳ delegate: " + name + " " + summary)
		return
	}
	d.parent.Info("  ↳ delegate: " + name)
}

func (d delegateUI) ToolResult(name, result string, isErr bool) {
	if isErr {
		d.parent.Info("  ↳ delegate: " + name + " failed: " + clipLine(result, 120))
	}
}

func (d delegateUI) Info(text string) { d.parent.Info("  ↳ delegate: " + text) }

// Approve forwards to the user with the delegate's origin made explicit.
func (d delegateUI) Approve(req ApprovalRequest) bool {
	req.Target = "delegate: " + req.Target
	return d.parent.Approve(req)
}

// RecordUndo is dropped: undo for delegated work is refusing the final diff.
// Forwarding entries would corrupt the parent's undo stack with paths inside
// a worktree that no longer exists.
func (d delegateUI) RecordUndo(UndoEntry) {}

// runDelegate executes one delegated implementation and returns its report.
// The worktree is always cleaned up, accepted or not.
func (a *Agent) runDelegate(ctx context.Context, description, prompt string) string {
	if strings.TrimSpace(prompt) == "" {
		return "error: delegate requires a prompt describing the task"
	}
	if !gitx.IsRepo(a.Root) {
		return "error: delegate needs the repository to be a git work tree"
	}

	label := strings.TrimSpace(description)
	if label == "" {
		label = "implementing"
	}

	// First gate: spawning a writable agent is itself a state-changing act.
	if !a.UI.Approve(ApprovalRequest{
		Action:    "run",
		Target:    "spawn writable delegate in an isolated worktree",
		Preview:   prompt,
		Canonical: "delegate: " + label,
	}) {
		return "the user declined to spawn the delegate — do the task directly instead"
	}

	dir, err := gitx.WorktreeAdd(ctx, a.Root, "HEAD")
	if err != nil {
		return "error: could not create the delegate worktree: " + err.Error()
	}
	defer gitx.WorktreeRemove(context.Background(), a.Root, dir)
	a.UI.Info(fmt.Sprintf("↳ delegate (%s): working in %s", label, dir))

	sub := &Agent{
		Client:   a.routedClient("task"),
		Root:     dir,
		UI:       delegateUI{parent: a.UI},
		MaxSteps: delegateSteps,
		Mode:     ModeBuild,
		AllowRun: true,
		Depth:    a.Depth + 1,
		// Same client bills both agents, so the same guard watches both.
		Budget: a.Budget,
		Events: a.bus(),
		// No Config on purpose: the delegate is one level down and its work
		// is already routed through the "task" role above.
		NoStream: true,
	}
	history := []llm.Message{
		{Role: "system", Content: delegatePrompt(dir, prompt)},
		{Role: "user", Content: prompt},
	}
	result, err := sub.Run(ctx, history)
	report := lastAssistantText(result)
	if report == "" {
		report = "(the delegate finished without a report)"
	}
	if err != nil {
		report += "\n\n[delegate stopped early: " + err.Error() + "]"
	}

	patch, perr := gitx.WorktreePatch(ctx, dir)
	if perr != nil {
		return report + "\n\n[could not collect the delegate's diff: " + perr.Error() + "]"
	}
	if strings.TrimSpace(patch) == "" {
		return wrapReport(label, report) + "\n\nThe delegate made no file changes."
	}

	// Second gate: the finished work lands only with an explicit yes.
	preview := patch
	if len(preview) > delegatePreviewBytes {
		preview = preview[:delegatePreviewBytes] + "\n… [diff truncated for preview]"
	}
	if !a.UI.Approve(ApprovalRequest{
		Action:    "edit",
		Target:    fmt.Sprintf("apply the delegate's changes (%d bytes)", len(patch)),
		Preview:   preview,
		Canonical: "delegate: apply diff",
	}) {
		return wrapReport(label, report) + "\n\nThe user declined the diff — the changes were discarded."
	}
	if aerr := gitx.Apply(ctx, a.Root, patch); aerr != nil {
		return wrapReport(label, report) + "\n\n[applying the diff failed: " + aerr.Error() +
			" — the worktree is being removed; the changes are lost]"
	}

	paths := patchFiles(patch)
	summary := fmt.Sprintf("\n\nApplied the delegate's diff to the working tree (%d file(s): %s).",
		len(paths), strings.Join(paths, ", "))
	return wrapReport(label, report) + summary
}

// patchFiles lists the paths a unified diff touches, in appearance order.
func patchFiles(patch string) []string {
	seen := map[string]bool{}
	var out []string
	for _, line := range strings.Split(patch, "\n") {
		if !strings.HasPrefix(line, "+++ b/") {
			continue
		}
		p := strings.TrimPrefix(line, "+++ b/")
		if p == "/dev/null" || seen[p] {
			continue
		}
		seen[p] = true
		out = append(out, p)
	}
	return out
}
