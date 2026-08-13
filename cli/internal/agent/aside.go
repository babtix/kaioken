package agent

import "strings"

// Asides — the "by the way" channel.
//
// Three things can carry context to the model and they differ in reach. The
// config's steering notes are permanent and repo-wide: injected into every
// prompt, forever. A plain chat message is a request: the agent answers it,
// which costs a turn. Between them sits the thing a user actually wants when
// they type "oh, and the staging DB is down — no need to reply": conversation-
// scoped context, delivered once, answered never.
//
// An aside is just a user message, so nothing in the agent loop needs to know
// about it. What makes it an aside is the prefix: without it the model reads a
// bare user message as a request and replies to it, which is exactly the turn
// the user was trying not to spend.

// AsidePrefix marks a user message as context rather than a request. The
// desktop front-end matches on this literal to render asides differently, so
// changing it means changing ASIDE_PREFIX in desktop/src/lib/slash.ts too.
//
// Deliberately ASCII. It is never shown to the user — both front-ends strip
// it back off — so it buys nothing typographically, while a literal compared
// byte-for-byte across Go, JSON, a session file on disk and TypeScript is
// exactly where a stray codepage should not get a vote.
const AsidePrefix = "[aside: context only, no reply needed now]\n"

// Aside frames text as an aside, or returns "" when there is nothing to say.
func Aside(text string) string {
	text = strings.TrimSpace(text)
	if text == "" {
		return ""
	}
	return AsidePrefix + text
}

// AsideBody returns the user's own words from a framed aside, and whether the
// message was one. Front-ends use it to echo the aside without the framing.
func AsideBody(content string) (string, bool) {
	body, ok := strings.CutPrefix(content, AsidePrefix)
	return body, ok
}
