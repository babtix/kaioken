import { createHash } from "node:crypto";
import type { Dirent } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import { readIndexArtifact } from "@kaioken/index";
import { KAIOKEN_DIR } from "@kaioken/scan";

/**
 * The corpus is everything the engine knows about a repository, flattened into
 * one searchable shape. Tenants share the index rather than each carrying their
 * own, so a single query reaches all of them and ranking is comparable across
 * them.
 */

export type Kind = "wiki" | "card" | "skill" | "symbol";

/** One indexed source. */
export interface Doc {
	/** How a caller opens this again: wiki-relative path, or a repo file path. */
	path: string;
	kind: Kind;
	/** Top-level grouping — wiki section, module id, or the file's directory. */
	section: string;
	title: string;
	/** Content hash. Keys the embedding cache and drives rebuild detection. */
	hash: string;
}

/**
 * One retrievable passage. Documents are split so a hit points at the paragraph
 * that answers the question rather than at a 400-line chapter.
 */
export interface Chunk {
	doc: number;
	/** Nearest enclosing heading (or declaration): the snippet's caption, and extra text to match on. */
	heading: string;
	/** 1-based line in the source document where the passage starts. */
	line: number;
	text: string;
}

export interface Corpus {
	docs: Doc[];
	chunks: Chunk[];
	/** Changes when any contributing artifact changes. Drives rebuild. */
	fingerprint: string;
}

const MAX_CHUNK_CHARS = 2000;
const MIN_CHUNK_CHARS = 40;

/**
 * Walk the generated stores and return the corpus.
 *
 * A missing store is not an error: a repository with a symbol index but no wiki
 * indexes fine, and must, because phases 1 and 2 ship before anything generative
 * has ever run.
 */
export async function collect(root: string): Promise<Corpus> {
	const absRoot = resolve(root);
	const docs: Doc[] = [];
	const chunks: Chunk[] = [];

	await collectWiki(absRoot, docs, chunks);
	await collectCards(absRoot, docs, chunks);
	await collectSkills(absRoot, docs, chunks);
	await collectSymbols(absRoot, docs, chunks);

	return { docs, chunks, fingerprint: fingerprintOf(docs) };
}

/**
 * Wiki chapters, as markdown on disk. This is the tenant the thesis is built
 * around; it is empty until phase 4 generates something, and that is fine.
 */
async function collectWiki(root: string, docs: Doc[], chunks: Chunk[]): Promise<void> {
	const wikiRoot = join(root, KAIOKEN_DIR, "wiki");
	const files = await walkMarkdown(wikiRoot);

	for (const abs of files.sort()) {
		let body: string;
		try {
			body = await readFile(abs, "utf8");
		} catch {
			continue;
		}

		const path = toPosix(relative(wikiRoot, abs));
		const slash = path.indexOf("/");
		const docId = docs.length;

		docs.push({
			path,
			kind: "wiki",
			section: slash === -1 ? "" : (path.slice(0, slash) as string),
			title: firstHeading(body, path),
			hash: hash(body),
		});

		for (const chunk of splitMarkdown(body, docId)) chunks.push(chunk);
	}
}

/**
 * Knowledge cards, read as the JSON they are stored as.
 *
 * The card store is read by path rather than through the package that writes it:
 * a card on disk is an artifact, and making the search layer depend on the
 * generative layer to read one would put a model port underneath a tenant that
 * must keep working with no credentials at all.
 */
async function collectCards(root: string, docs: Doc[], chunks: Chunk[]): Promise<void> {
	const cardsRoot = join(root, KAIOKEN_DIR, "cards");

	let entries: string[];
	try {
		entries = await readdir(cardsRoot);
	} catch {
		return;
	}

	for (const name of entries.sort()) {
		if (!name.endsWith(".json")) continue;

		let card: {
			moduleId?: unknown;
			name?: unknown;
			summary?: unknown;
			keyPoints?: unknown;
			entryPoints?: unknown;
		};
		let raw: string;
		try {
			raw = await readFile(join(cardsRoot, name), "utf8");
			card = JSON.parse(raw) as typeof card;
		} catch {
			// A corrupt card is skipped, exactly as the card reader does: the
			// rest of the knowledge is still searchable.
			continue;
		}

		const moduleId = typeof card.moduleId === "string" ? card.moduleId : name.replace(/\.json$/, "");
		const title = typeof card.name === "string" && card.name ? card.name : moduleId;
		const docId = docs.length;

		docs.push({
			path: toPosix(join("cards", name)),
			kind: "card",
			section: moduleId,
			title,
			hash: hash(raw),
		});

		const summary = typeof card.summary === "string" ? card.summary : "";
		if (summary.trim()) {
			chunks.push({ doc: docId, heading: title, line: 1, text: summary.trim() });
		}

		if (Array.isArray(card.keyPoints)) {
			const points = card.keyPoints.filter((point): point is string => typeof point === "string");
			if (points.length > 0) {
				chunks.push({
					doc: docId,
					heading: `${title} — key points`,
					line: 1,
					text: points.join("\n"),
				});
			}
		}

		// Entry points carry the module's public vocabulary, which is often what
		// a query actually names.
		if (Array.isArray(card.entryPoints)) {
			const lines: string[] = [];
			for (const entry of card.entryPoints) {
				if (!entry || typeof entry !== "object") continue;
				const record = entry as { name?: unknown; file?: unknown; note?: unknown };
				if (typeof record.name !== "string") continue;
				const where = typeof record.file === "string" ? ` (${record.file})` : "";
				const note = typeof record.note === "string" ? ` — ${record.note}` : "";
				lines.push(`${record.name}${where}${note}`);
			}
			if (lines.length > 0) {
				chunks.push({
					doc: docId,
					heading: `${title} — entry points`,
					line: 1,
					text: lines.join("\n"),
				});
			}
		}
	}
}

/**
 * Skills — the written procedures under `.kaioken/skills`.
 *
 * Unlike every other tenant, these are handwritten rather than generated, which
 * is why they are indexed at all: a procedure nobody can find is a procedure
 * nobody follows. The frontmatter is stripped rather than parsed, because the
 * only field that matters here is the name, and the layer that actually
 * validates a skill lives above this one.
 */
async function collectSkills(root: string, docs: Doc[], chunks: Chunk[]): Promise<void> {
	const skillsRoot = join(root, KAIOKEN_DIR, "skills");
	const files = await walkMarkdown(skillsRoot);

	for (const abs of files.sort()) {
		let body: string;
		try {
			body = await readFile(abs, "utf8");
		} catch {
			continue;
		}

		const path = toPosix(relative(skillsRoot, abs));
		const front = /^---\n([\s\S]*?)\n---\n?/.exec(body.replace(/^﻿/, "").replace(/\r\n/g, "\n"));
		const declared = front ? /^name:\s*(.+)$/m.exec(front[1] as string) : null;
		const fallback = path.replace(/\/?SKILL\.md$/i, "").replace(/\.md$/i, "");

		const docId = docs.length;
		docs.push({
			path: toPosix(join("skills", path)),
			kind: "skill",
			section: fallback,
			title: declared ? (declared[1] as string).trim().replace(/^["']|["']$/g, "") : fallback,
			hash: hash(body),
		});

		const content = front ? body.slice(front[0].length) : body;
		for (const chunk of splitMarkdown(content, docId)) chunks.push(chunk);
	}
}

/**
 * Declarations from the structural index.
 *
 * This tenant is why `kaioken search` is useful the day it ships, before any
 * model has been called: the signatures and doc comments of a repository are
 * genuine derived knowledge about it, and they are the only knowledge that
 * exists after phase 1.
 */
async function collectSymbols(root: string, docs: Doc[], chunks: Chunk[]): Promise<void> {
	const index = await readIndexArtifact(root);
	if (!index) return;

	for (const file of index.files) {
		if (file.symbols.length === 0) continue;

		const docId = docs.length;
		const slash = file.path.lastIndexOf("/");

		docs.push({
			path: file.path,
			kind: "symbol",
			section: slash === -1 ? "" : file.path.slice(0, slash),
			title: file.path,
			hash: file.hash,
		});

		for (const symbol of file.symbols) {
			// The declaration is the passage. Signature and doc are indexed
			// together because a query is as likely to use the prose vocabulary
			// as the code vocabulary.
			const text = [symbol.signature, symbol.doc].filter(Boolean).join("\n");
			chunks.push({
				doc: docId,
				heading: `${symbol.kind} ${symbol.parent ? `${symbol.parent}.` : ""}${symbol.name}`,
				line: symbol.startLine,
				text,
			});
		}
	}
}

/**
 * Split markdown at headings, then split anything still oversized. Navigation
 * lists are dropped: a table of contents matches every query and answers none.
 */
export function splitMarkdown(body: string, docId: number): Chunk[] {
	const lines = body.split(/\r?\n/);
	const out: Chunk[] = [];

	let heading = "";
	let buffer: string[] = [];
	let startLine = 1;
	let inFence = false;

	const flush = (endExclusive: number) => {
		const text = buffer.join("\n").trim();
		buffer = [];
		if (text.length < MIN_CHUNK_CHARS) return;
		if (isNavigation(heading, text)) return;

		for (const piece of splitOversized(text)) {
			out.push({ doc: docId, heading, line: startLine, text: piece });
		}
		startLine = endExclusive + 1;
	};

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i] as string;

		// Headings inside a fenced block are code, not structure.
		if (/^\s*(?:```|~~~)/.test(line)) inFence = !inFence;

		const match = !inFence ? /^(#{1,6})\s+(.*)$/.exec(line) : null;
		if (match) {
			flush(i);
			heading = (match[2] as string).trim();
			startLine = i + 1;
			continue;
		}
		buffer.push(line);
	}
	flush(lines.length);

	return out;
}

/**
 * A passage that is mostly links is a table of contents. It would rank for
 * everything and inform nothing.
 */
function isNavigation(heading: string, text: string): boolean {
	const lowered = heading.toLowerCase();
	if (lowered === "contents" || lowered === "table of contents" || lowered === "index") {
		return true;
	}
	const lines = text.split("\n").filter((l) => l.trim().length > 0);
	if (lines.length < 3) return false;
	const linkish = lines.filter((l) => /^\s*(?:[-*+]|\d+\.)\s*\[.+\]\(.+\)\s*$/.test(l)).length;
	return linkish / lines.length > 0.8;
}

/** Break a long passage on paragraph boundaries rather than mid-sentence. */
function splitOversized(text: string): string[] {
	if (text.length <= MAX_CHUNK_CHARS) return [text];

	const out: string[] = [];
	let current = "";
	for (const paragraph of text.split(/\n{2,}/)) {
		if (current.length > 0 && current.length + paragraph.length > MAX_CHUNK_CHARS) {
			out.push(current.trim());
			current = "";
		}
		current += (current.length > 0 ? "\n\n" : "") + paragraph;
	}
	if (current.trim().length > 0) out.push(current.trim());
	return out;
}

export function firstHeading(body: string, fallback: string): string {
	for (const line of body.split(/\r?\n/)) {
		const match = /^#{1,6}\s+(.*)$/.exec(line);
		if (match) {
			const title = (match[1] as string).trim();
			if (title) return title;
		}
	}
	return fallback;
}

async function walkMarkdown(dir: string): Promise<string[]> {
	let entries: Dirent[];
	try {
		entries = await readdir(dir, { withFileTypes: true });
	} catch {
		return [];
	}

	const out: string[] = [];
	for (const entry of entries) {
		const abs = join(dir, entry.name);
		if (entry.isDirectory()) out.push(...(await walkMarkdown(abs)));
		else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) out.push(abs);
	}
	return out;
}

/**
 * One hash over every document's identity and content hash. Any change to any
 * contributing artifact changes it, which is how the index knows it is stale
 * without re-reading the whole corpus.
 */
function fingerprintOf(docs: readonly Doc[]): string {
	const h = createHash("sha256");
	for (const doc of docs) h.update(`${doc.kind}\0${doc.path}\0${doc.hash}\n`);
	return h.digest("hex");
}

function hash(text: string): string {
	return createHash("sha256").update(text).digest("hex");
}

function toPosix(path: string): string {
	return sep === "/" ? path : path.split(sep).join("/");
}
