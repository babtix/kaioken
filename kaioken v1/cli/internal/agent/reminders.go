package agent

import (
	"strings"

	"kaioken/internal/llm"
)

// Reminders.
//
// A constraint stated once, at the top of a long conversation, is a constraint
// the model will eventually stop honoring. Not because it disagrees — because
// forty tool results have gone by since it read the sentence, and the system
// prompt is now the furthest thing from the question it is answering.
//
// So the important constraints are not stated once. They are recomputed before
// every turn and attached to the newest user message, where they sit directly
// against the prompt they govern. Nothing accumulates: the previous turn's
// reminders are stripped first, so the conversation carries exactly one copy,
// always current, no matter how many times the mode has changed.
//
// This is also where transitions get named. A mode switch is not just a new
// set of rules, it is the end of the old ones, and telling the model it has
// *stopped* planning is what actually gets it to start building.

// Reminder markers. The open tag is the strip target, so it must appear in
// every reminder block and nowhere else.
const (
	reminderOpen  = "<system-reminder>"
	reminderClose = "</system-reminder>"
)

// planReminder is attached on every plan- or explore-mode turn. It restates a
// prohibition the system prompt already carries, because this is the rule that
// erodes first: the model reads several files, forms an opinion, and reaches
// for edit_file as if the mode were advice rather than a wall.
const planReminder = `Plan mode is active. You are in a read-only phase: no file edits, no shell
commands, no changes of any kind — including via run_command. This holds even if the user
asks you directly to make the change; tell them to switch with /mode build instead. You may
read, search, delegate read-only sub-agents, and write out what you would do.`

const exploreReminder = `Explore mode is active. You are read-only: no file edits, no shell
commands. Your job is to find things and explain them. Report concrete paths and line numbers
so the user can act on what you found.`

const reviewReminder = `Review mode is active. You are read-only: no file edits, no shell
commands. Focus on code review, security audits, diff analysis, and identifying regressions.`

const prismReminder = `PRISM mode is active. Precision Retrieval with Intelligent Source Matching is engaged:
you are in a grounded knowledge retrieval phase. Answer the user's questions grounded in the
imported PRISM document context. Cite sources and indicate relevant module references.`

// buildSwitchReminder fires once the mode has returned to build after a
// stretch of planning. Without it a model that spent ten turns forbidden from
// editing keeps producing plans, having learned the shape of the conversation
// better than the single line announcing the switch.
const buildSwitchReminder = `Your mode has changed from plan to build. You are no longer
read-only: file edits and shell commands are available again, subject to the user's approval.
The planning phase is over — carry out the plan you produced rather than restating it.`

// generalReminder is attached in general mode, where the distinguishing rule
// is not what is forbidden but that nothing is automatic.
const generalReminder = `General mode is active. Every repo-changing action prompts the user
for approval, even when auto-approve is on. Explain what a change does before proposing it.`

// ApplyReminders returns a conversation with the current turn's reminders
// attached to the last user message, replacing any reminders left from an
// earlier turn.
//
// It never appends a message: reminders ride along with the prompt rather than
// arriving as separate turns, so a long session does not accumulate a stack of
// stale system notes between the user and the answer.
func ApplyReminders(conv []llm.Message, mode Mode) []llm.Message {
	last := lastUserIndex(conv)
	if last < 0 {
		return conv
	}

	// Strip stale blocks from every user message, not just the newest one:
	// steering moves the last-user position mid-run, so the previous holder
	// of the reminder is no longer where lastUserIndex points.
	//
	// Copy before the first mutation: the caller's slice is the live
	// conversation, and the session may be persisting it concurrently.
	out := conv
	copied := false
	ensure := func() {
		if !copied {
			c := make([]llm.Message, len(conv))
			copy(c, conv)
			out = c
			copied = true
		}
	}
	for i := 0; i <= last; i++ {
		if conv[i].Role != "user" {
			continue
		}
		if base := stripReminders(conv[i].Content); base != conv[i].Content {
			ensure()
			out[i].Content = base
		}
	}
	if text := reminderFor(conv, mode); text != "" {
		ensure()
		out[last].Content = out[last].Content + "\n\n" + reminderOpen + "\n" + text + "\n" + reminderClose
	}
	return out
}

// reminderFor picks the reminder text for the turn about to run. At most one
// applies: a mode either constrains the agent or announces that it has stopped
// constraining it, never both.
func reminderFor(conv []llm.Message, mode Mode) string {
	switch mode {
	case ModePlan:
		return planReminder
	case ModeExplore:
		return exploreReminder
	case ModeReview:
		return reviewReminder
	case ModePrism:
		return prismReminder
	case ModeGeneral:
		return generalReminder
	}
	// Build mode says nothing, unless this is the turn where planning ended.
	if wasRestricted(conv) {
		return buildSwitchReminder
	}
	return ""
}

// wasRestricted reports whether the conversation shows an earlier read-only
// phase, by finding a mode-switch marker naming plan or explore. The marker is
// matched structurally rather than by searching the prose for "plan", so a
// future context update that merely mentions the word cannot be mistaken for
// one. It works on a session reloaded from disk, since the markers are part of
// the saved transcript.
func wasRestricted(conv []llm.Message) bool {
	for _, msg := range conv {
		if msg.Role != "system" {
			continue
		}
		switch modeFromSwitch(msg.Content) {
		case ModePlan, ModeExplore, ModeReview, ModePrism:
			return true
		}
	}
	return false
}

// Markers for mid-conversation system messages. They are declared here because
// reminders read them back; front-ends write them through the constructors
// below rather than formatting the strings themselves.
const (
	contextUpdatePrefix = "--- context update:"
	modeSwitchPrefix    = "--- context update: agent mode is now "
	contextUpdateSuffix = " ---"
)

// ContextUpdate formats a mid-conversation system message announcing a state
// change, so every front-end writes the marker reminders look for.
func ContextUpdate(text string) llm.Message {
	return llm.Message{Role: "system", Content: contextUpdatePrefix + " " + text + contextUpdateSuffix}
}

// ModeSwitch announces a change of mode in a form later turns can parse back.
func ModeSwitch(mode Mode, guidance string) llm.Message {
	text := modeSwitchPrefix + string(mode)
	if guidance != "" {
		text += ": " + guidance
	}
	return llm.Message{Role: "system", Content: text + contextUpdateSuffix}
}

// lastModeSwitch returns the newest mode-switch marker in a conversation.
// Compaction uses it to carry that state across the boundary it creates.
func lastModeSwitch(conv []llm.Message) (llm.Message, bool) {
	for i := len(conv) - 1; i >= 0; i-- {
		if conv[i].Role == "system" && modeFromSwitch(conv[i].Content) != "" {
			return conv[i], true
		}
	}
	return llm.Message{}, false
}

// modeFromSwitch extracts the mode from a mode-switch marker, returning "" for
// any other message.
func modeFromSwitch(content string) Mode {
	if !strings.HasPrefix(content, modeSwitchPrefix) {
		return ""
	}
	rest := content[len(modeSwitchPrefix):]
	// The mode runs to the guidance separator, or to the marker's end.
	if i := strings.IndexAny(rest, ": "); i >= 0 {
		rest = rest[:i]
	}
	return Mode(rest)
}

// lastUserIndex finds the newest user message, which is the prompt the
// upcoming turn answers.
func lastUserIndex(conv []llm.Message) int {
	for i := len(conv) - 1; i >= 0; i-- {
		if conv[i].Role == "user" {
			return i
		}
	}
	return -1
}

// stripReminders removes every reminder block from a message, returning the
// user's own text. An unterminated block — which should not happen, but would
// otherwise poison the message forever — is dropped through to the end.
func stripReminders(s string) string {
	for {
		start := strings.Index(s, reminderOpen)
		if start < 0 {
			return strings.TrimRight(s, "\n ")
		}
		end := strings.Index(s[start:], reminderClose)
		if end < 0 {
			return strings.TrimRight(s[:start], "\n ")
		}
		s = s[:start] + s[start+end+len(reminderClose):]
	}
}
