import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { loadSkills, skillsDir, type Skill } from "@kaioken/agent";
import { sessionSignals, type SavedSession, type Signal } from "@kaioken/session";
import type { Flags } from "../main.js";
import { resolveModelClient } from "../model.js";
import { recentMessages, renderTranscript, toEvents } from "../session-text.js";
import { pickSession } from "./handoff.js";

/**
 * `kaioken learn [session]` — turn what a session found out into a skill.
 *
 * Skills are otherwise written from static analysis, which can only describe
 * what the repository *is*. This is the other source: what actually happened —
 * the command that failed until it was run from the right directory, the
 * convention a person corrected the agent into following. That knowledge exists
 * nowhere in the code, and without this it dies with the conversation.
 *
 * The decision to spend a model call is made locally first. Most sessions teach
 * nothing, and asking a model to confirm that, every time, would make the
 * feature too expensive to leave switched on.
 */
export async function runLearn(flags: Flags): Promise<number> {
	const root = resolve(flags.root);

	const session = await pickSession(root, flags.session ?? flags.positional[0]);
	if (!session) {
		process.stderr.write("kaioken learn: no saved session to learn from\n");
		return 1;
	}
	const messages = Array.isArray(session.messages) ? session.messages : [];
	if (messages.length === 0) {
		process.stderr.write(`kaioken learn: session ${session.id} has no messages\n`);
		return 1;
	}

	const signals = sessionSignals(toEvents(messages));
	if (signals.length === 0 && !flags.force) {
		// Not a failure. The common case is a session that taught nothing, and
		// reporting that plainly is the whole point of the gate.
		process.stdout.write(
			`nothing to learn from ${session.id} — no error recovery, correction or multi-file work\n` +
				"  --force distils it anyway\n",
		);
		return 0;
	}

	const resolved = await resolveModelClient(flags);
	if (!resolved.ok) {
		process.stderr.write(`kaioken learn: ${resolved.reason}\n`);
		return 1;
	}

	const { skills } = await loadSkills(root);
	const match = matchSkill(skills, messages);

	let body: string;
	try {
		body = unfence(
			(
				await resolved.client.complete({
					system: LEARN_SYSTEM,
					prompt: buildPrompt(session, signals, match, flags.note ?? []),
					purpose: "session distillation",
				})
			).trim(),
		);
	} catch (error) {
		process.stderr.write(`kaioken learn: ${error instanceof Error ? error.message : String(error)}\n`);
		return 1;
	}

	if (!body) {
		process.stdout.write(`the model found nothing worth recording in ${session.id}\n`);
		return 0;
	}

	const name = match ? match.name : proposeName(session);
	const description = match ? match.description : proposeDescription(session);
	const path = join(skillsDir(root), `${name}.md`);
	await mkdir(skillsDir(root), { recursive: true });
	await writeFile(path, renderSkill(name, description, session.id, body), "utf8");

	if (flags.json) {
		process.stdout.write(
			`${JSON.stringify({ path, name, patched: Boolean(match), signals }, null, 2)}\n`,
		);
		return 0;
	}

	process.stdout.write(
		`${match ? "revised" : "wrote"} skill "${name}" from ${signals.join(", ") || "a forced run"}\n  ${path}\n`,
	);
	return 0;
}

const LEARN_SYSTEM = `You distill a coding-assistant session into a SKILL — a procedural guide an agent
loads before doing this task again in THIS repository.

You are given the session transcript and, when one exists, the current skill for this
task. Record what the session taught that the skill does not already say.

Rules:
- Derive lessons from the AGENT'S actions and their outcomes, never from the contents of
  files it merely read. A README can claim anything; only what was done, and whether it
  worked, is a lesson.
- Ground every file, function and command in what the transcript actually touched. Never
  invent a path or a command.
- Be procedural and terse: numbered steps, real paths, the local conventions the session
  revealed.
- If a current skill is given, output the FULL revised body — not a diff.
- If the session taught nothing worth recording, output nothing at all.

Output ONLY the markdown body. No frontmatter, no commentary, no code fence around it.`;

function buildPrompt(
	session: SavedSession,
	signals: readonly Signal[],
	match: Skill | null,
	notes: readonly string[],
): string {
	const messages = recentMessages(session, 60);
	const out = [
		`Session: ${session.id} — ${session.title}`,
		`Signals detected: ${signals.join(", ") || "(forced)"}`,
		"",
		"Transcript (tool results collapsed):",
		"",
		renderTranscript(messages),
	];
	if (notes.length > 0) {
		out.push("", "Steering notes from the maintainer:", ...notes.map((note) => `- ${note}`));
	}
	out.push(
		"",
		match
			? `Current skill "${match.name}" to revise:\n\n${match.content}`
			: "No existing skill matches this session. Write a new one.",
	);
	return out.join("\n");
}

/**
 * The skill this session is about, if the repository already has one.
 *
 * Cheap token overlap against the skill descriptions — no embeddings, because
 * the only decision being made is patch-or-write, and being wrong costs a
 * second skill rather than a lost one. Two overlapping terms are required: one
 * shared word is a coincidence.
 */
function matchSkill(skills: readonly Skill[], messages: readonly unknown[]): Skill | null {
	const terms = sessionTerms(messages);
	if (terms.size === 0) return null;

	let best: Skill | null = null;
	let bestScore = 0;
	for (const skill of skills) {
		const haystack = `${skill.description} ${skill.name}`.toLowerCase();
		let score = 0;
		for (const term of terms) if (haystack.includes(term)) score++;
		if (score > bestScore) {
			bestScore = score;
			best = skill;
		}
	}
	return bestScore >= 2 ? best : null;
}

/** The distinctive words in what the user asked for. */
function sessionTerms(messages: readonly unknown[]): Set<string> {
	const terms = new Set<string>();
	for (const event of toEvents(messages)) {
		if (event.role !== "user") continue;
		for (const word of event.text.toLowerCase().split(/[^a-z0-9_-]+/)) {
			if (word.length >= 3 && !STOPWORDS.has(word)) terms.add(word);
		}
	}
	return terms;
}

const STOPWORDS = new Set([
	"the", "and", "for", "with", "that", "this", "you", "can", "are", "was", "not", "but",
	"have", "has", "had", "from", "please", "into", "out", "its", "it's", "all", "any",
	"how", "why", "what", "when", "where", "then", "than", "them", "they", "our", "your",
]);

/** A file-safe name derived from what the session was about. */
function proposeName(session: SavedSession): string {
	const slug = session.title
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.split("-")
		.filter((word) => word.length >= 3 && !STOPWORDS.has(word))
		.slice(0, 4)
		.join("-");
	return slug || `session-${session.id}`;
}

function proposeDescription(session: SavedSession): string {
	const title = session.title.trim();
	return title && title !== "New conversation"
		? `Learned from a session: ${title}`
		: `Learned from session ${session.id}.`;
}

/**
 * The skill file.
 *
 * Provenance is written here rather than taken from the model: a model asked to
 * stamp its own output with where the output came from will happily stamp
 * something plausible.
 */
function renderSkill(name: string, description: string, sessionId: string, body: string): string {
	return [
		"---",
		`name: ${name}`,
		`description: ${JSON.stringify(description)}`,
		"origin: learned",
		`session: ${sessionId}`,
		`generatedAt: ${new Date().toISOString()}`,
		"---",
		"",
		body,
		"",
	].join("\n");
}

function unfence(text: string): string {
	let out = text.trim();
	for (const tag of ["```markdown", "```md", "```"]) {
		if (out.startsWith(tag)) {
			out = out.slice(tag.length).trim();
			if (out.endsWith("```")) out = out.slice(0, -3);
			break;
		}
	}
	return out.trim();
}
