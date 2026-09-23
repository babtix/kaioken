import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { KAIOKEN_DIR } from "@kaioken/scan";

/**
 * Parameterized prompts: reusable requests with `{{placeholder}}` slots, kept
 * in `.kaioken/templates/<name>.md` and sent as ordinary chat messages.
 *
 * A skill teaches the agent how to carry out a task. A template is the other
 * direction — it captures how the *person* phrases a recurring request
 * ("review this file for races, allocation, and error handling") so the request
 * stops being retyped from memory and starts being reviewed like anything else
 * in the repository.
 */

export const TEMPLATES_DIR = join(KAIOKEN_DIR, "templates");

export interface Template {
	name: string;
	/** Absolute path, for an error message that can be acted on. */
	path: string;
	content: string;
	/** The distinct placeholders in file order, `args` excluded. */
	vars: string[];
}

export function templatesDir(root: string): string {
	return join(root, TEMPLATES_DIR);
}

const PLACEHOLDER = /\{\{\s*([a-zA-Z0-9_-]+)\s*\}\}/g;

/** Every template in the repository, by name. A missing directory is empty. */
export async function listTemplates(root: string): Promise<Template[]> {
	let entries: string[];
	try {
		entries = await readdir(templatesDir(root));
	} catch {
		return [];
	}

	const out: Template[] = [];
	for (const entry of entries.sort()) {
		if (!entry.endsWith(".md")) continue;
		const template = await loadTemplate(root, entry.slice(0, -3));
		// One unreadable file must not hide the rest of the list.
		if (template) out.push(template);
	}
	return out;
}

/** Read one template. Null when it does not exist or the name is not a name. */
export async function loadTemplate(root: string, name: string): Promise<Template | null> {
	const clean = name.trim();
	// The name becomes a path segment, so it may not be one: a template called
	// `../../../etc/passwd` would otherwise read whatever it liked.
	if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(clean) || clean.includes("..")) return null;

	const path = join(templatesDir(root), `${clean}.md`);
	let raw: string;
	try {
		raw = await readFile(path, "utf8");
	} catch {
		return null;
	}

	const content = raw.trim();
	const vars: string[] = [];
	for (const match of content.matchAll(PLACEHOLDER)) {
		const key = match[1] as string;
		if (key !== "args" && !vars.includes(key)) vars.push(key);
	}
	return { name: clean, path, content, vars };
}

export interface Expansion {
	prompt: string;
	/** Placeholders nothing filled. They are left literal in `prompt`. */
	missing: string[];
}

/**
 * Fill a template from an argument string.
 *
 * `key=value` tokens bind named placeholders; everything else joins, in order,
 * into `{{args}}`.
 *
 * A placeholder nothing filled stays literal rather than blanking out. Sending
 * "review  for correctness" with the hole silently closed would hide the
 * mistake from the only person able to fix it; leaving `{{file}}` on screen
 * says exactly what the prompt still needs.
 */
export function expandTemplate(template: Template, argstr: string): Expansion {
	const named = new Map<string, string>();
	const rest: string[] = [];

	for (const token of argstr.split(/\s+/).filter(Boolean)) {
		const eq = token.indexOf("=");
		const key = eq === -1 ? "" : token.slice(0, eq);
		// A binding has to name a placeholder this template actually has.
		// Otherwise `explain why x=y here` would silently eat "x=y" as an
		// argument to a slot that does not exist, and the question sent would
		// be missing a word nobody could see was missing.
		if (eq > 0 && template.vars.includes(key) && !named.has(key)) {
			named.set(key, token.slice(eq + 1));
			continue;
		}
		rest.push(token);
	}
	named.set("args", rest.join(" "));

	const missing: string[] = [];
	const prompt = template.content.replace(PLACEHOLDER, (whole, key: string) => {
		const value = named.get(key);
		if (value) return value;
		// An empty catch-all is a template with no extra words, not a hole.
		if (key === "args") return "";
		if (!missing.includes(key)) missing.push(key);
		return whole;
	});

	return { prompt: prompt.trim(), missing };
}
