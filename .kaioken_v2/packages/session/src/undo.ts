import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { randomInt } from "node:crypto";
import { dirname, join, relative, resolve, sep } from "node:path";
import { KAIOKEN_DIR } from "@kaioken/scan";

/**
 * What a file looked like before the agent changed it.
 *
 * Git is the real undo, and nothing here pretends otherwise — but an agent
 * writes between commits, and the change it just made to the wrong file is
 * exactly the one git cannot help with yet. So each write records the previous
 * bytes first, and `/undo` puts them back.
 *
 * The record is taken at approval time, before the tool runs. Reading the file
 * afterwards would capture what the agent wrote, which is the one thing an undo
 * stack must never store.
 */

export const UNDO_DIR = join(KAIOKEN_DIR, "undo");

export interface UndoEntry {
	/** Repository-relative, POSIX separators. */
	path: string;
	/** The tool that made the change, for the report. */
	tool: string;
	at: string;
	/**
	 * The file's contents before the change, or null when the file did not
	 * exist — a created file is undone by deleting it, not by writing "".
	 */
	before: string | null;
	/** The session the change belongs to. */
	session: string;
}

export function undoPath(root: string): string {
	return join(resolve(root), UNDO_DIR, "journal.jsonl");
}

/**
 * Record one file's prior state.
 *
 * Append-only JSON lines: a crash mid-session leaves every entry written before
 * it intact and readable, where a rewritten array would leave a truncated file
 * that parses as nothing at all.
 *
 * A file too large to hold in memory is recorded as unreadable rather than
 * silently skipped, so `/undo` can say it will not restore it instead of
 * appearing to and doing nothing.
 */
export async function recordUndo(
	root: string,
	entry: { path: string; tool: string; session: string },
): Promise<void> {
	const absolute = resolve(root, entry.path);
	// A path outside the repository is not this journal's business, and
	// restoring one later would write wherever the agent pointed.
	const rel = relative(resolve(root), absolute);
	if (rel === "" || rel.startsWith("..") || rel.split(sep).includes("..")) return;

	let before: string | null = null;
	try {
		before = await readFile(absolute, "utf8");
	} catch {
		before = null;
	}

	const record: UndoEntry = {
		path: rel.split(sep).join("/"),
		tool: entry.tool,
		at: new Date().toISOString(),
		before,
		session: entry.session,
	};

	const journal = undoPath(root);
	await mkdir(dirname(journal), { recursive: true });
	await writeFile(journal, `${JSON.stringify(record)}\n`, { flag: "a", encoding: "utf8" });
}

/** Every recorded change, oldest first. Unparseable lines are skipped. */
export async function readUndoJournal(root: string): Promise<UndoEntry[]> {
	let raw: string;
	try {
		raw = await readFile(undoPath(root), "utf8");
	} catch {
		return [];
	}
	const out: UndoEntry[] = [];
	for (const line of raw.split("\n")) {
		if (!line.trim()) continue;
		try {
			const parsed = JSON.parse(line) as UndoEntry;
			if (typeof parsed.path === "string") out.push(parsed);
		} catch {
			// One corrupt line must not cost the user the rest of the stack.
		}
	}
	return out;
}

export interface UndoOutcome {
	entry: UndoEntry;
	/** "restored" put contents back; "deleted" removed a file the agent created. */
	action: "restored" | "deleted";
}

/**
 * Undo the most recent recorded change.
 *
 * One step per call, because the caller has to be able to report each one: a
 * loop that quietly reverted six files would be indistinguishable, from the
 * outside, from a loop that reverted the wrong six.
 */
export async function undoLast(root: string): Promise<UndoOutcome | null> {
	const entries = await readUndoJournal(root);
	const entry = entries.pop();
	if (!entry) return null;

	const absolute = resolve(root, entry.path);
	let action: UndoOutcome["action"];
	if (entry.before === null) {
		await rm(absolute, { force: true });
		action = "deleted";
	} else {
		await mkdir(dirname(absolute), { recursive: true });
		await writeFile(absolute, entry.before, "utf8");
		action = "restored";
	}

	await rewriteJournal(root, entries);
	return { entry, action };
}

/** Forget the stack — after a commit, the file's prior state is git's job. */
export async function clearUndoJournal(root: string): Promise<void> {
	await rm(undoPath(root), { force: true });
}

/**
 * The files a shell command is likely to change.
 *
 * A `write` or `edit` names its file; a bash command does not, so the journal
 * can only be recovered by reading the command. That read is a heuristic and
 * says so: it knows redirections (which create or truncate whatever they name,
 * exist or not) and the everyday file-mutating commands, whose arguments are
 * files by definition. Everything else — a glob, a variable, a command that
 * writes through a path it computes — passes unrecorded, and `/undo` says
 * nothing about it rather than claiming a restore it never took.
 *
 * `files` are targets that should exist (the caller stats before journaling);
 * `creates` are redirection targets, journaled either way — a target that did
 * not exist is undone by deleting it.
 */
export interface BashTargets {
	files: string[];
	creates: string[];
}

/** Commands whose non-flag arguments are files they mutate. */
const FILE_ARG_COMMANDS = new Set([
	"rm",
	"mv",
	"cp",
	"sed",
	"tee",
	"touch",
	"chmod",
	"chown",
	"ln",
	"rename",
	"shred",
	"install",
	"truncate",
]);

/** Never journal more than this from one command. */
const MAX_BASH_TARGETS = 25;

export function bashFileTargets(command: string): BashTargets {
	const files: string[] = [];
	const creates: string[] = [];
	const seen = new Set<string>();
	const add = (list: string[], token: string): void => {
		if (!token || seen.has(token) || files.length + creates.length >= MAX_BASH_TARGETS) return;
		seen.add(token);
		list.push(token);
	};

	// Pipelines and lists are separate commands; each segment's first word is
	// its own command name.
	for (const segment of command.split(/\|\||&&|[|;]/)) {
		const tokens = tokenize(segment);
		let commandName = "";
		const positional: string[] = [];
		for (let i = 0; i < tokens.length; i++) {
			const token = tokens[i] as string;
			// Redirection: `> f`, `>> f`, `2> f`, and the attached `>f` forms.
			const redirect = /^(?:\d*)?(>>?)$/.exec(token) ?? /^(?:\d*)?(>>?)(.+)$/.exec(token);
			if (redirect) {
				const target = redirect[2] ?? tokens[++i];
				// `2>&1` duplicates a descriptor; it creates no file.
				if (target && !target.startsWith("&")) add(creates, target);
				continue;
			}
			if (!commandName) {
				// Skip leading VAR=value assignments to find the command name.
				if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(token)) continue;
				commandName = token;
				continue;
			}
			if (token.startsWith("-")) continue;
			positional.push(token);
		}

		if (!FILE_ARG_COMMANDS.has(commandName)) continue;
		// sed's first positional is the script (`sed -i 's/a/b/' file`); mv and
		// cp's last is the destination, which may not exist yet.
		let args = positional;
		if (commandName === "sed") args = args.slice(1);
		if ((commandName === "mv" || commandName === "cp" || commandName === "ln" || commandName === "install") && args.length > 1) {
			const dest = args[args.length - 1] as string;
			add(creates, dest);
			args = args.slice(0, -1);
		}
		for (const arg of args) add(files, arg);
	}

	return { files, creates };
}

/**
 * Split a shell segment into words, honouring quotes.
 *
 * A quoted path with spaces (`"dir with spaces/file.txt"`) is one word; the
 * quotes themselves are not part of it. This is a reader, not a shell —
 * escapes, command substitution and globs are beyond what a journal heuristic
 * needs, and the words it cannot parse correctly it simply never journals.
 */
function tokenize(segment: string): string[] {
	const tokens: string[] = [];
	let current = "";
	let quote: string | null = null;
	for (const ch of segment.trim()) {
		if (quote) {
			if (ch === quote) quote = null;
			else current += ch;
			continue;
		}
		if (ch === '"' || ch === "'") {
			quote = ch;
			continue;
		}
		if (/\s/.test(ch)) {
			if (current) tokens.push(current);
			current = "";
			continue;
		}
		current += ch;
	}
	if (current) tokens.push(current);
	return tokens;
}

/**
 * Rewrite the journal with the popped entry gone.
 *
 * Written to a temporary file and renamed, so an interrupted undo leaves the
 * old journal rather than half of a new one — a half-written stack would lose
 * every earlier step as well as the one being undone.
 */
async function rewriteJournal(root: string, entries: readonly UndoEntry[]): Promise<void> {
	const journal = undoPath(root);
	if (entries.length === 0) {
		await rm(journal, { force: true });
		return;
	}
	const temp = `${journal}.${randomInt(10000, 99999)}.tmp`;
	await mkdir(dirname(journal), { recursive: true });
	await writeFile(temp, `${entries.map((entry) => JSON.stringify(entry)).join("\n")}\n`, "utf8");
	const { rename } = await import("node:fs/promises");
	await rename(temp, journal);
}
