import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { KAIOKEN_DIR } from "@kaioken/scan";
import { listSessions, loadSession, type SavedSession } from "@kaioken/session";
import type { Flags } from "../main.js";
import { resolveModelClient } from "../model.js";
import { recentMessages, renderTranscript } from "../session-text.js";

/**
 * `kaioken handoff [session]` — the briefing that lets someone else pick this
 * work up.
 *
 * A session is a long, mostly redundant document: the interesting part is the
 * few decisions inside it and the threads still hanging. So the briefing is
 * four sections written from the conversation's tail, and the collapsed
 * transcript is appended underneath — the summary for the person, the
 * transcript for the moment they do not believe it.
 *
 * With no argument it briefs the most recently updated session, which in
 * practice is the one the shell just saved before calling this.
 */
export async function runHandoff(flags: Flags): Promise<number> {
	const root = resolve(flags.root);

	const session = await pickSession(root, flags.session ?? flags.positional[0]);
	if (!session) {
		process.stderr.write(
			`kaioken handoff: no saved session found in ${KAIOKEN_DIR}/sessions — have a conversation first\n`,
		);
		return 1;
	}
	const messages = Array.isArray(session.messages) ? session.messages : [];
	if (messages.length === 0) {
		process.stderr.write(`kaioken handoff: session ${session.id} has no messages to brief\n`);
		return 1;
	}

	const resolved = await resolveModelClient(flags);
	if (!resolved.ok) {
		process.stderr.write(`kaioken handoff: ${resolved.reason}\n`);
		return 1;
	}

	const tail = recentMessages(session, BRIEF_MESSAGES);
	let brief: string;
	try {
		brief = (
			await resolved.client.complete({
				system: BRIEF_SYSTEM,
				prompt: [
					`Session title: ${session.title}`,
					`Model: ${session.model}`,
					`Turns: ${session.turns}`,
					"",
					`Transcript (most recent ${tail.length} of ${messages.length} messages):`,
					"",
					renderTranscript(tail),
				].join("\n"),
				purpose: "handoff briefing",
			})
		).trim();
	} catch (error) {
		process.stderr.write(`kaioken handoff: ${error instanceof Error ? error.message : String(error)}\n`);
		return 1;
	}

	const document = [
		`# Handoff — ${session.title}`,
		"",
		`Session \`${session.id}\` · ${session.turns} turn(s) · ${session.model}`,
		`Written ${new Date().toISOString()}`,
		"",
		brief,
		"",
		"---",
		"",
		"## Transcript",
		"",
		// The whole conversation, not the tail: the briefing above was written
		// from the recent part, and the reader who wants to check it needs the
		// earlier part most.
		renderTranscript(messages),
		"",
	].join("\n");

	const dir = join(root, KAIOKEN_DIR, "handoffs");
	await mkdir(dir, { recursive: true });
	const path = join(dir, `${session.id}.md`);
	await writeFile(path, document, "utf8");

	if (flags.json) {
		process.stdout.write(`${JSON.stringify({ path, session: session.id, brief }, null, 2)}\n`);
		return 0;
	}

	process.stdout.write(`${brief}\n\n`);
	process.stdout.write(`written to ${path}\n`);
	return 0;
}

/**
 * How much of the conversation the summariser reads.
 *
 * The tail is what matters for continuation: a 400-turn session still briefs
 * from its recent messages, and paying to re-read the first 360 would buy a
 * worse summary, not a better one.
 */
const BRIEF_MESSAGES = 40;

const BRIEF_SYSTEM = `You distill a coding-agent session into a handoff briefing so someone else can
continue the work without reading the transcript.

Write exactly these four markdown sections, in order, each a short bulleted list:

## Goal
What the session set out to accomplish.

## Decisions
Choices already made, with a word on why when the transcript says so.

## State
What is done, what is in progress, and the state of the working tree as far as the
transcript shows.

## Open threads
Unfinished work, unanswered questions, and anything the next person should verify.

Rules: report only what the transcript shows. Never invent file names, outcomes or
decisions. If a section has nothing to report, write "- none recorded".`;

/** The named session, or the most recently updated one. */
export async function pickSession(root: string, id?: string): Promise<SavedSession | null> {
	if (id?.trim()) return loadSession(root, id.trim());
	const [latest] = await listSessions(root);
	return latest ? loadSession(root, latest.id) : null;
}
