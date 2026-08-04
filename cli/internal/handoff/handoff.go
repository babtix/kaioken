// Package handoff turns a saved session into a continuation briefing: what
// the session was trying to do, what was decided, what is still open, and the
// transcript it came from. The point is letting someone else — a teammate or
// a fresh agent — pick the work up without replaying the whole conversation.
package handoff

import (
	"context"
	"fmt"
	"strings"

	"kaioken/internal/llm"
	"kaioken/internal/session"
)

// briefMessages caps how much of the conversation the summarizer reads. The
// tail is what matters for continuation; a 400-turn session still briefs
// from its recent 40 messages.
const briefMessages = 40

const briefSystem = `You distill a coding-agent session into a handoff briefing so someone else can
continue the work without reading the transcript.

Write exactly these four markdown sections, in order, each a short bulleted list:

## Goal
What the session set out to accomplish.

## Decisions
Choices already made, with a word on why when the transcript says so.

## State
What is done, what is in progress, and the current state of the working tree as far
as the transcript shows.

## Open threads
Unfinished work, unanswered questions, and anything the next person should verify.

Rules: report only what the transcript shows. Never invent file names, outcomes or
decisions. If a section has nothing to report, write "- none recorded".`

// Brief distills sess into the continuation briefing via one LLM call over
// the last messages.
func Brief(ctx context.Context, client *llm.Client, sess *session.Session) (string, error) {
	if sess == nil || len(sess.Messages) == 0 {
		return "", fmt.Errorf("the session has no messages to brief")
	}
	msgs := sess.Messages
	if len(msgs) > briefMessages {
		msgs = msgs[len(msgs)-briefMessages:]
	}

	var user strings.Builder
	fmt.Fprintf(&user, "Session title: %s\n\nTranscript (most recent %d messages):\n\n",
		sess.Title, len(msgs))
	user.WriteString(transcript(msgs))

	out, err := client.Chat(ctx, briefSystem, user.String())
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(out), nil
}

// Transcript renders the whole session as markdown, for the appendix of the
// handoff document.
func Transcript(sess *session.Session) string {
	return transcript(sess.Messages)
}

// transcript renders messages as markdown. Tool calls and their results
// collapse to one line each: the briefing needs the shape of the work, not
// every byte it produced.
func transcript(msgs []llm.Message) string {
	var b strings.Builder
	for _, m := range msgs {
		switch {
		case m.Role == "tool":
			name := m.Name
			if name == "" {
				name = "tool"
			}
			fmt.Fprintf(&b, "- *%s result* (%d chars)\n", name, len(m.Content))
		case len(m.ToolCalls) > 0:
			names := make([]string, 0, len(m.ToolCalls))
			for _, tc := range m.ToolCalls {
				names = append(names, tc.Function.Name)
			}
			if text := strings.TrimSpace(m.Content); text != "" {
				fmt.Fprintf(&b, "**assistant**: %s\n", clip(text, 200))
			}
			fmt.Fprintf(&b, "- *calls*: %s\n", strings.Join(names, ", "))
		case m.Role == "system":
			// System prompts are boilerplate; they add nothing to a handoff.
			continue
		default:
			text := strings.TrimSpace(m.Content)
			if text == "" {
				continue
			}
			fmt.Fprintf(&b, "**%s**: %s\n\n", m.Role, clip(text, 800))
		}
	}
	return b.String()
}

// clip shortens long text for the briefing, on a rune boundary.
func clip(s string, n int) string {
	s = strings.Join(strings.Fields(s), " ")
	if r := []rune(s); len(r) > n {
		return string(r[:n]) + "…"
	}
	return s
}
