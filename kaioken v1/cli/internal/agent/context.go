package agent

import (
	"strings"

	"kaioken/internal/memory"
)

// System context assembly.
//
// The system prompt is not one string with a few conditionals in it — it is a
// list of contributors, each answering a different question about the run. Who
// the agent is and where it works. What tools exist right now. What the mode
// permits. What this particular model needs told to it. What the repository's
// generated documentation covers. What the user has standing instructions
// about.
//
// Keeping them separate is what makes them composable: a source can be added
// without touching the others, one can be empty on a given run without leaving
// a hole in the prose, and it is obvious at a glance what is in the prompt.

// PromptInput is everything the sources may draw on to build a system prompt.
type PromptInput struct {
	// Root is the absolute repository root.
	Root string
	// Mode is the permission preset for the run.
	Mode Mode
	// Model is the model id, used to tailor guidance to a family's quirks.
	Model string
	// AllowRun mirrors Agent.AllowRun: whether run_command is offered at all,
	// before the mode's own permissions are applied.
	AllowRun bool
	// Notes are the user's standing steering instructions from config.
	Notes []string
}

// contextSource contributes one section of the system prompt. Returning an
// empty string means the source has nothing to say on this run and is skipped
// entirely — no heading, no blank line.
type contextSource struct {
	name   string
	render func(PromptInput) string
}

// contextSources are rendered in order. The order is the argument: identity
// establishes where the agent is, capabilities tell it what it can do, then
// the narrowing constraints — mode, model, knowledge — and finally the user's
// own instructions, last because the most specific guidance should be the
// freshest thing read before the conversation starts. Memory comes after
// project instructions (both are repo-level facts) and before notes: the
// user's standing notes outrank what the agent once wrote down.
var contextSources = []contextSource{
	{"identity", renderIdentity},
	{"tools", renderTools},
	{"mode", renderMode},
	{"model", renderModel},
	{"knowledge", renderKnowledge},
	{"guidelines", renderGuidelines},
	{"project", renderProjectInstructions},
	{"memory", renderMemory},
	{"notes", renderNotes},
}

// SystemPrompt builds the agent's system message by rendering every context
// source that has something to contribute.
func SystemPrompt(in PromptInput) string {
	var parts []string
	for _, src := range contextSources {
		if section := strings.TrimRight(src.render(in), "\n"); section != "" {
			parts = append(parts, section)
		}
	}
	return strings.Join(parts, "\n\n") + "\n"
}

// RenderContextMap returns a map of source name -> rendered content string.
func RenderContextMap(in PromptInput) map[string]string {
	res := make(map[string]string)
	for _, src := range contextSources {
		if section := strings.TrimRight(src.render(in), "\n"); section != "" {
			res[src.name] = section
		}
	}
	return res
}

// InitializeEpoch creates a new ContextEpoch with current prompt inputs and returns the epoch and baseline system prompt.
func InitializeEpoch(in PromptInput) (*ContextEpoch, string) {
	sources := RenderContextMap(in)
	baseline := SystemPrompt(in)
	snapshots := make(map[string]string)
	for k, v := range sources {
		snapshots[k] = hashString(v)
	}
	epoch := NewContextEpoch(baseline, snapshots)
	return epoch, baseline
}


func renderIdentity(in PromptInput) string {
	return "You are Kaioken, an AI coding assistant embedded in a terminal, working inside the " +
		"repository at:\n  " + in.Root
}

func renderTools(in PromptInput) string {
	perms := PermissionsFor(in.Mode)
	var b strings.Builder
	b.WriteString("You help the user understand and modify this codebase. You have tools:\n")
	b.WriteString("- read_file, list_files, search: inspect the repo. Use them liberally before answering.\n")
	b.WriteString("- read_knowledge: open Kaioken's generated docs for this repo; call it with no\n")
	b.WriteString("  argument to see what exists.\n")
	if perms.CanWrite {
		b.WriteString("- write_file, edit_file: change files. Prefer edit_file for small changes; use a unique old_string.\n")
	}
	if in.AllowRun && perms.CanRun {
		b.WriteString("- run_command: run shell commands (build, test, git) in the repo root.\n")
	}
	b.WriteString("- task: hand an open-ended search to a read-only sub-agent that works in its own\n")
	b.WriteString("  context and reports back a conclusion. Reach for it when finding the answer would\n")
	b.WriteString("  take many reads whose contents you do not need to keep.\n")
	b.WriteString("- todo: keep a visible checklist for multi-step work, so the user can see the plan\n")
	b.WriteString("  and what is left. Use it once a task has several distinct steps, not for one-offs.")
	return b.String()
}

func renderMode(in PromptInput) string { return in.Mode.PromptGuidance() }

func renderModel(in PromptInput) string { return modelGuidance(in.Model) }

func renderKnowledge(in PromptInput) string { return knowledgeSummary(in.Root) }

func renderGuidelines(PromptInput) string {
	return "Guidelines:\n" +
		"- Every file change and command runs only after the user approves it, so propose concrete edits.\n" +
		"- Ground answers in the actual files — read before you claim. Never invent file contents.\n" +
		"- Keep prose concise. When you finish a task, briefly say what you changed.\n" +
		"- Make minimal, targeted edits that match the surrounding code style."
}

// renderProjectInstructions injects the repository's own AGENTS.md (or CLAUDE.md,
// for repos set up by another runtime). `kaioken init` writes that file, but it
// is not Kaioken's — it is the cross-runtime convention for "what an agent must
// know before editing here", so the agent reads whichever one the repo has
// rather than requiring its own.
func renderProjectInstructions(in PromptInput) string {
	doc, name := projectInstructions(in.Root)
	if doc == "" {
		return ""
	}
	return "Instructions from this repository's " + name + ". They describe how work is " +
		"actually done here and outrank the general guidance above:\n\n" + doc
}

// renderMemory injects the agent's recorded memory: project facts committed in
// .kaioken/MEMORY.md, then personal cross-repo preferences in ~/.kaioken/USER.md.
// It is the L1 prompt-memory layer — a hard-capped, agent-written channel that
// is distinct from the human-written AGENTS.md above and the user's standing
// notes below. Empty files contribute nothing.
func renderMemory(in PromptInput) string {
	proj := memory.RenderProject(in.Root)
	user := memory.RenderUser()
	switch {
	case proj == "" && user == "":
		return ""
	case user == "":
		return proj
	case proj == "":
		return user
	default:
		return proj + "\n\n" + user
	}
}

// renderNotes injects the user's standing instructions from config. These are
// the human-in-the-loop channel — conventions the code does not state, and
// "do not do X" guardrails — so they are reproduced verbatim rather than
// summarised, and they come last so they are the final word.
func renderNotes(in PromptInput) string {
	var kept []string
	for _, n := range in.Notes {
		if n = strings.TrimSpace(n); n != "" {
			kept = append(kept, "- "+n)
		}
	}
	if len(kept) == 0 {
		return ""
	}
	return "Standing instructions from this repository's configuration. They come from the " +
		"user and outrank the general guidance above:\n" + strings.Join(kept, "\n")
}
