import { readdir } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";
import type { AutocompleteItem, AutocompleteProvider, AutocompleteSuggestions } from "@earendil-works/pi-tui";
import { findCommand } from "./commands.js";
import { THEME_NAMES } from "./theme.js";

/**
 * Completion for the composer.
 *
 * The division of labour matters: the `/` palette owns the command *name* —
 * that is v1's behaviour and it closes the moment you type a space — and this
 * owns everything after it. Arguments, and file paths anywhere in a message.
 * Two menus fighting over the same keystroke is worse than either alone, so
 * this deliberately does not trigger on `/`.
 *
 * Pure apart from one `readdir`: the candidate lists are data, and resolving a
 * completion is a string operation, so both are testable without a terminal.
 */

/** Values a command's argument can take, where the set is closed and short. */
export const ARGUMENT_VALUES: Record<string, string[]> = {
	theme: THEME_NAMES,
	mode: ["build", "plan", "general", "explore", "review", "prism"],
	thinking: ["off", "minimal", "low", "medium", "high", "xhigh", "max", "show", "hide"],
	wiki: ["x1", "x2", "x3", "x4", "x5", "x10", "force", "update", "retry"],
	cards: ["x1", "x2", "x3", "force"],
	research: ["x1", "x3", "x5", "x10"],
	skills: ["force", "list"],
	notes: ["add", "clear"],
	queue: ["clear"],
	hook: ["install", "remove"],
	tutorial: ["all"],
	explain: ["all"],
};

/** How many file candidates to offer before it stops being a menu. */
const MAX_FILES = 40;

/** Directories never worth completing into. */
const SKIP = new Set(["node_modules", ".git", "dist", ".kaioken", ".next", "target", "build"]);

export function kaiokenAutocomplete(root: string): AutocompleteProvider {
	return {
		// `@` is the explicit ask. A bare path-looking token also triggers, but
		// only when it already looks like a path — completing every word the
		// user types would make the menu a nuisance rather than a help.
		triggerCharacters: ["@"],

		async getSuggestions(lines, cursorLine, cursorCol): Promise<AutocompleteSuggestions | null> {
			const line = lines[cursorLine] ?? "";
			const before = line.slice(0, cursorCol);

			const argument = argumentSuggestions(before);
			if (argument) return argument;

			const token = tokenAt(before);
			if (!looksLikePath(token)) return null;
			const items = await pathSuggestions(root, token);
			return items.length > 0 ? { items, prefix: token } : null;
		},

		applyCompletion(lines, cursorLine, cursorCol, item, prefix) {
			const line = lines[cursorLine] ?? "";
			const start = cursorCol - prefix.length;
			const next = [...lines];
			next[cursorLine] = line.slice(0, start) + item.value + line.slice(cursorCol);
			return { lines: next, cursorLine, cursorCol: start + item.value.length };
		},
	};
}

/** The whitespace-delimited token ending at the cursor. */
export function tokenAt(before: string): string {
	return /(\S*)$/.exec(before)?.[1] ?? "";
}

/**
 * Whether a token is asking to be completed as a path.
 *
 * An `@` prefix is explicit. Otherwise it has to already carry a separator or
 * a leading dot, so ordinary prose never opens a file menu mid-sentence.
 */
export function looksLikePath(token: string): boolean {
	if (token.startsWith("@")) return true;
	if (token.length < 2) return false;
	return token.includes("/") || token.startsWith("./") || token.startsWith(".");
}

/**
 * Values for the argument of a slash command.
 *
 * Only fires once the command name is settled — there is a space after it —
 * which is exactly where the `/` palette gets out of the way.
 */
export function argumentSuggestions(before: string): AutocompleteSuggestions | null {
	const match = /^\/(\S+)\s+(\S*)$/.exec(before);
	if (!match) return null;
	const command = findCommand(match[1] as string);
	if (!command) return null;
	const values = ARGUMENT_VALUES[command.name];
	if (!values) return null;

	const prefix = match[2] as string;
	const items = values
		.filter((value) => value.startsWith(prefix.toLowerCase()))
		.map((value) => ({ value, label: value }));
	return items.length > 0 ? { items, prefix } : null;
}

/**
 * Files and directories under the token's directory.
 *
 * One directory at a time rather than a recursive walk: a repository has more
 * files than a menu can hold, and reading them all to show forty is a cost the
 * user pays on every keystroke.
 */
export async function pathSuggestions(root: string, token: string): Promise<AutocompleteItem[]> {
	const bare = token.startsWith("@") ? token.slice(1) : token;
	const at = token.startsWith("@") ? "@" : "";

	// A trailing separator means "inside this directory"; otherwise the last
	// segment is a partial name to filter on.
	const endsWithSep = bare.endsWith("/") || bare.endsWith(sep);
	const dirPart = endsWithSep ? bare : dirname(bare);
	const namePart = endsWithSep ? "" : bare.slice(dirPart === "." ? 0 : dirPart.length + 1);

	const searchDir = isAbsolute(bare) ? dirPart : resolve(root, dirPart === "." ? "" : dirPart);
	let entries: Array<{ name: string; isDirectory(): boolean }>;
	try {
		entries = await readdir(searchDir, { withFileTypes: true, encoding: "utf8" });
	} catch {
		return [];
	}

	const needle = namePart.toLowerCase();
	const items: AutocompleteItem[] = [];
	for (const entry of entries) {
		if (SKIP.has(entry.name)) continue;
		// A leading dot is only offered when it was asked for.
		if (entry.name.startsWith(".") && !needle.startsWith(".")) continue;
		if (!entry.name.toLowerCase().startsWith(needle)) continue;

		const isDir = entry.isDirectory();
		const prefix = dirPart === "." && !endsWithSep ? "" : `${dirPart.replace(/[\\/]+$/, "")}/`;
		const value = `${at}${prefix}${entry.name}${isDir ? "/" : ""}`;
		items.push({ value, label: `${entry.name}${isDir ? "/" : ""}`, description: isDir ? "dir" : "" });
		if (items.length >= MAX_FILES) break;
	}
	// Directories first: they are the ones you complete *through*.
	items.sort((a, b) => Number(b.description === "dir") - Number(a.description === "dir") || a.label.localeCompare(b.label));
	return items;
}

/** Resolve a completed `@path` token against the root, for callers that read it. */
export function resolveToken(root: string, token: string): string {
	const bare = token.startsWith("@") ? token.slice(1) : token;
	return isAbsolute(bare) ? bare : join(root, bare);
}
