import { promises as fs } from "node:fs";
import { join, resolve } from "node:path";
import { randomInt } from "node:crypto";

/**
 * A saved conversation session on disk.
 * Stored under `.kaioken/sessions/<id>.json`.
 */
export interface SavedSession {
	id: string;
	title: string;
	created: string;
	updated: string;
	model: string;
	provider: string;
	mode: string;
	thinking: string;
	turns: number;
	messages: unknown[];
	transcript?: string[];
	/**
	 * Where this conversation came from.
	 *
	 * A `/fork` or a `/compact` does not end a session and start an unrelated
	 * one — it takes the conversation in a different direction from a point
	 * that still exists. Recording the point is what lets `/tree` show the
	 * shape of a session that has been rewound three times, instead of a flat
	 * list in which the relationship between the branches is lost.
	 */
	parent?: SessionParent;
}

export interface SessionParent {
	/** The session branched from. */
	id: string;
	/** How many turns that session had at the moment of the branch. */
	turns: number;
	/** What caused the branch. */
	reason: "fork" | "compact" | "resume";
}

/**
 * Summary metadata for session listings.
 */
export interface SessionMeta {
	id: string;
	title: string;
	created: string;
	updated: string;
	model: string;
	provider: string;
	mode: string;
	thinking: string;
	turns: number;
	filePath: string;
	parent?: SessionParent;
}

/** The sessions directory inside a repository. */
export function sessionsDir(root: string): string {
	return join(resolve(root), ".kaioken", "sessions");
}

/** Full file path for a session ID. */
export function sessionPath(root: string, id: string): string {
	return join(sessionsDir(root), `${id}.json`);
}

/**
 * Generate a unique, time-ordered session ID: `YYYYMMDD-HHmmss-XXXX`.
 */
export function generateSessionId(): string {
	const now = new Date();
	const pad = (n: number) => String(n).padStart(2, "0");
	const y = now.getFullYear();
	const m = pad(now.getMonth() + 1);
	const d = pad(now.getDate());
	const hh = pad(now.getHours());
	const mm = pad(now.getMinutes());
	const ss = pad(now.getSeconds());
	const rand = String(randomInt(1000, 10000));
	return `${y}${m}${d}-${hh}${mm}${ss}-${rand}`;
}

/**
 * Derive a clean title from conversation messages.
 * Extracts the first user question, stripped of markdown and capped at 60 chars.
 */
export function deriveTitle(messages: unknown[]): string {
	if (!Array.isArray(messages)) return "New conversation";
	for (const item of messages) {
		if (item && typeof item === "object") {
			const msg = item as { role?: string; content?: unknown };
			if (msg.role === "user") {
				let text = "";
				if (typeof msg.content === "string") {
					text = msg.content;
				} else if (Array.isArray(msg.content)) {
					for (const part of msg.content) {
						if (part && typeof part === "object" && "text" in part && typeof part.text === "string") {
							text += part.text;
						}
					}
				}
				const clean = text.replace(/[\r\n\t]+/g, " ").trim();
				if (clean.length > 0) {
					return clean.length > 60 ? `${clean.slice(0, 57)}…` : clean;
				}
			}
		}
	}
	return "New conversation";
}

/**
 * Save a session to `.kaioken/sessions/<id>.json`.
 * Ensures directory exists before writing.
 */
export async function saveSession(root: string, session: SavedSession): Promise<void> {
	const dir = sessionsDir(root);
	await fs.mkdir(dir, { recursive: true });
	const target = sessionPath(root, session.id);
	const temp = `${target}.${randomInt(10000, 99999)}.tmp`;
	const json = JSON.stringify(session, null, 2);
	await fs.writeFile(temp, json, "utf8");
	await fs.rename(temp, target);
}

/**
 * Load a saved session by ID or prefix match.
 */
export async function loadSession(root: string, idOrPrefix: string): Promise<SavedSession | null> {
	const dir = sessionsDir(root);
	const needle = idOrPrefix.trim().toLowerCase();
	if (!needle) return null;

	// Check direct file existence first
	try {
		const directPath = sessionPath(root, needle);
		const raw = await fs.readFile(directPath, "utf8");
		return JSON.parse(raw) as SavedSession;
	} catch {
		// Fall back to prefix matching
	}

	try {
		const files = await fs.readdir(dir);
		const matches = files.filter((f) => f.endsWith(".json") && f.toLowerCase().startsWith(needle));
		if (matches.length === 0) return null;
		// If multiple match, pick closest or first
		const picked = matches[0] as string;
		const raw = await fs.readFile(join(dir, picked), "utf8");
		return JSON.parse(raw) as SavedSession;
	} catch {
		return null;
	}
}

/**
 * List all saved sessions in `.kaioken/sessions/`, ordered newest first.
 */
export async function listSessions(root: string): Promise<SessionMeta[]> {
	const dir = sessionsDir(root);
	let files: string[] = [];
	try {
		files = await fs.readdir(dir);
	} catch {
		return [];
	}

	const list: SessionMeta[] = [];
	for (const file of files) {
		if (!file.endsWith(".json")) continue;
		const fullPath = join(dir, file);
		try {
			const raw = await fs.readFile(fullPath, "utf8");
			const parsed = JSON.parse(raw) as SavedSession;
			list.push({
				id: parsed.id ?? file.replace(/\.json$/, ""),
				title: parsed.title ?? "Untitled conversation",
				created: parsed.created ?? "",
				updated: parsed.updated ?? parsed.created ?? "",
				model: parsed.model ?? "",
				provider: parsed.provider ?? "",
				mode: parsed.mode ?? "build",
				thinking: parsed.thinking ?? "off",
				turns: parsed.turns ?? (Array.isArray(parsed.messages) ? parsed.messages.filter((m: any) => m?.role === "user").length : 0),
				filePath: fullPath,
				...(parsed.parent ? { parent: parsed.parent } : {}),
			});
		} catch {
			// Skip corrupted or unreadable session files
		}
	}

	// Sort by updated timestamp descending, fallback to id descending
	list.sort((a, b) => {
		const ta = a.updated ? new Date(a.updated).getTime() : 0;
		const tb = b.updated ? new Date(b.updated).getTime() : 0;
		if (ta !== tb) return tb - ta;
		return b.id.localeCompare(a.id);
	});

	return list;
}

/**
 * Delete a saved session by ID.
 */
export async function deleteSession(root: string, id: string): Promise<boolean> {
	try {
		const p = sessionPath(root, id);
		await fs.unlink(p);
		return true;
	} catch {
		return false;
	}
}
