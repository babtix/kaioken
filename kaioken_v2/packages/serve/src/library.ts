import type { Dirent } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import {
	computeStaleness,
	type DocumentStatus,
	type Freshness,
	type Provenance,
	type ProvenanceIndex,
} from "@kaioken/provenance";
import { KAIOKEN_DIR, readScanArtifact } from "@kaioken/scan";
import { firstHeading } from "@kaioken/search";
import { parse } from "yaml";

/**
 * The reading model behind the pages.
 *
 * A wiki on disk is a flat directory of markdown; a wiki a person can read is an
 * ordered outline with a place to start, a next chapter, and an honest label on
 * every page saying whether the code has moved since it was written. The
 * difference between those two is this module: it joins the documents, the
 * outline the plan recorded, and the provenance the generator pinned, into one
 * structure the pages render without any further reasoning.
 *
 * Every store is read by path rather than through the package that writes it —
 * the same rule the search corpus follows. Serving has to keep working with no
 * credentials, and importing the generative layer would put a model port
 * underneath it.
 */

export interface WikiDoc {
	/** Wiki-relative POSIX path, e.g. "core/retrieval.md". */
	path: string;
	href: string;
	title: string;
	chapterId: string;
	sectionId: string;
	/** Section summary or chapter goal from the plan, when there is one. */
	blurb: string;
	freshness: Freshness;
	generatedAt: string;
	/** Files the document was written from, from the provenance record. */
	sources: string[];
	/** Sources whose content no longer hashes to what was recorded. */
	changed: string[];
	/** Sources the repository no longer contains. */
	deleted: string[];
	/** Other wiki documents this one links to in its prose, resolved and deduped. */
	links: string[];
}

export interface WikiChapter {
	id: string;
	title: string;
	goal: string;
	docs: WikiDoc[];
	/** Worst freshness among the chapter's documents. */
	freshness: Freshness;
}

export interface Skill {
	/** Path under `.kaioken/skills`, e.g. "add-a-package/SKILL.md". */
	path: string;
	href: string;
	name: string;
	description: string;
}

export interface CardSummary {
	/** File name under `.kaioken/cards`, e.g. "packages-serve.json". */
	file: string;
	href: string;
	moduleId: string;
	name: string;
	summary: string;
	entryPointCount: number;
	ungrounded: number;
}

export interface Library {
	chapters: WikiChapter[];
	/** Every document in reading order. Drives previous/next. */
	docs: WikiDoc[];
	byPath: Map<string, WikiDoc>;
	/** Reverse provenance: source file -> the documents written from it. */
	bySource: Map<string, WikiDoc[]>;
	skills: Skill[];
	cards: CardSummary[];
	counts: Record<Freshness, number>;
	/** Share of documents still matching their sources, 0..1. */
	freshness: number;
	/** True when provenance was found, so freshness labels mean something. */
	judged: boolean;
	generatedAt: string;
}

export const EMPTY_LIBRARY: Library = {
	chapters: [],
	docs: [],
	byPath: new Map(),
	bySource: new Map(),
	skills: [],
	cards: [],
	counts: { current: 0, stale: 0, orphaned: 0, unknown: 0 },
	freshness: 1,
	judged: false,
	generatedAt: "",
};

/**
 * Read everything browsable out of `.kaioken`.
 *
 * Loaded once at start-up, like the index and the search index: serving is a
 * read of what the pipeline already wrote, and restarting is the refresh. A
 * missing store is not an error — a repository that has been scanned but never
 * documented still has files and declarations worth browsing.
 */
export async function readLibrary(root: string): Promise<Library> {
	const absRoot = resolve(root);
	const wikiRoot = join(absRoot, KAIOKEN_DIR, "wiki");

	const files = await walkMarkdown(wikiRoot);
	const [plan, provenance, scan] = await Promise.all([
		readPlan(absRoot),
		readProvenanceIndex(absRoot),
		readScanArtifact(absRoot),
	]);

	const records = new Map<string, Provenance>();
	for (const record of provenance?.documents ?? []) records.set(record.document, record);

	const status = new Map<string, DocumentStatus>();
	if (provenance && scan) {
		for (const entry of computeStaleness(provenance.documents, scan).documents) {
			status.set(entry.document, entry);
		}
	}

	const docs: WikiDoc[] = [];
	const rawLinks = new Map<string, string[]>();
	for (const abs of files) {
		const path = toPosix(relative(wikiRoot, abs));
		let body: string;
		try {
			body = await readFile(abs, "utf8");
		} catch {
			continue;
		}

		const record = records.get(path);
		const entry = status.get(path);
		const slash = path.lastIndexOf("/");

		docs.push({
			path,
			href: `/d/${path}`,
			title: firstHeading(body, path),
			// Provenance is authoritative; the layout on disk is the fallback,
			// because a document can exist before anything recorded it.
			chapterId: record?.chapterId ?? (slash === -1 ? "" : path.slice(0, slash)),
			sectionId: record?.sectionId ?? "",
			blurb: "",
			freshness: entry?.freshness ?? "unknown",
			generatedAt: record?.generatedAt ?? "",
			sources: (record?.sources ?? []).map((source) => source.path),
			changed: entry?.changed ?? [],
			deleted: entry?.deleted ?? [],
			links: [],
		});
		rawLinks.set(path, extractMarkdownLinkTargets(body));
	}

	// Resolve link targets to wiki-relative paths once every document is known,
	// exactly as the graph's `links` edges need: a link the model invented, or
	// one to a document that no longer exists, is dropped rather than drawn.
	const knownPaths = new Set(docs.map((doc) => doc.path));
	for (const doc of docs) {
		const resolved = new Set<string>();
		for (const href of rawLinks.get(doc.path) ?? []) {
			const target = resolveWikiLink(href, doc.path);
			if (target && target !== doc.path && knownPaths.has(target)) resolved.add(target);
		}
		doc.links = [...resolved];
	}

	const chapters = group(docs, plan);
	const ordered = chapters.flatMap((chapter) => chapter.docs);

	const counts: Record<Freshness, number> = { current: 0, stale: 0, orphaned: 0, unknown: 0 };
	for (const doc of ordered) counts[doc.freshness] += 1;

	const bySource = new Map<string, WikiDoc[]>();
	for (const doc of ordered) {
		for (const source of doc.sources) {
			const list = bySource.get(source);
			if (list) list.push(doc);
			else bySource.set(source, [doc]);
		}
	}

	const judged = provenance !== null && scan !== null;

	return {
		chapters,
		docs: ordered,
		byPath: new Map(ordered.map((doc) => [doc.path, doc])),
		bySource,
		skills: await readSkills(absRoot),
		cards: await readCards(absRoot),
		counts,
		freshness: ordered.length === 0 || !judged ? 1 : counts.current / ordered.length,
		judged,
		generatedAt: provenance?.generatedAt ?? "",
	};
}

/**
 * Inline markdown link targets outside fenced code, mirroring v1's
 * `markdownLinks` — the fences matter, since a mermaid node like
 * `cmd[cli/cmd/kaioken/main.go]` is one bracket away from a link.
 */
const LINK_RE = /\[[^\]]*\]\(\s*([^)\s]+)/g;

function extractMarkdownLinkTargets(body: string): string[] {
	const out: string[] = [];
	let inFence = false;
	for (const line of body.split(/\r?\n/)) {
		if (line.trim().startsWith("```")) {
			inFence = !inFence;
			continue;
		}
		if (inFence) continue;
		for (const match of line.matchAll(LINK_RE)) {
			const target = match[1];
			if (target) out.push(target);
		}
	}
	return out;
}

/**
 * Resolve a relative link found in `fromPath` into a wiki-relative document
 * path, or "" when it is not one — mirrors v1's `resolveWikiRef`.
 */
function resolveWikiLink(href: string, fromPath: string): string {
	let ref = href.trim();
	if (ref === "" || ref.startsWith("#") || ref.startsWith("/")) return "";
	if (ref.includes("://") || ref.startsWith("mailto:")) return "";

	const hash = ref.indexOf("#");
	if (hash !== -1) ref = ref.slice(0, hash);

	try {
		ref = decodeURIComponent(ref);
	} catch {
		// Malformed escape — use the raw text.
	}
	if (!ref.toLowerCase().endsWith(".md")) return "";

	const dir = fromPath.lastIndexOf("/");
	const out = dir === -1 ? [] : fromPath.slice(0, dir).split("/");
	for (const part of ref.replaceAll("\\", "/").split("/")) {
		if (part === "" || part === ".") continue;
		if (part === "..") {
			if (out.length === 0) return "";
			out.pop();
		} else {
			out.push(part);
		}
	}
	return out.join("/");
}

/**
 * Impose the plan's order on the documents.
 *
 * The outline is what the author decided the reading order is. Falling back to
 * the directory listing would sort "advanced" before "getting-started", which is
 * exactly the ordering a reader does not want.
 */
function group(docs: readonly WikiDoc[], plan: Plan | null): WikiChapter[] {
	const byChapter = new Map<string, WikiDoc[]>();
	for (const doc of docs) {
		const list = byChapter.get(doc.chapterId);
		if (list) list.push(doc);
		else byChapter.set(doc.chapterId, [doc]);
	}

	const chapters: WikiChapter[] = [];
	const taken = new Set<string>();

	for (const planned of plan?.chapters ?? []) {
		const found = byChapter.get(planned.id);
		if (!found) continue;
		taken.add(planned.id);
		chapters.push({
			id: planned.id,
			title: planned.title,
			goal: planned.goal,
			docs: order(found, planned),
			freshness: worst(found),
		});
	}

	// Anything the plan does not mention still has to be reachable: a document
	// nobody can navigate to is a document nobody reads.
	for (const [id, found] of [...byChapter].sort((a, b) => a[0].localeCompare(b[0]))) {
		if (taken.has(id)) continue;
		chapters.push({
			id,
			title: titleFromId(id) || "Documents",
			goal: "",
			docs: order(found, null),
			freshness: worst(found),
		});
	}

	return chapters;
}

/** Chapter index first, then the plan's section order, then whatever is left. */
function order(docs: readonly WikiDoc[], chapter: PlanChapter | null): WikiDoc[] {
	const rank = new Map<string, number>();
	(chapter?.sections ?? []).forEach((section, i) => {
		rank.set(section.id, i + 1);
		const doc = docs.find((d) => d.sectionId === section.id || d.path.endsWith(`/${section.id}.md`));
		if (doc && section.summary) doc.blurb = section.summary;
	});

	const indexDoc = docs.find((d) => isChapterIndex(d));
	if (indexDoc && chapter?.goal) indexDoc.blurb = chapter.goal;

	return [...docs].sort((a, b) => weight(a, rank) - weight(b, rank) || a.path.localeCompare(b.path));
}

function isChapterIndex(doc: WikiDoc): boolean {
	return doc.path.endsWith("/index.md") || !doc.path.includes("/");
}

function weight(doc: WikiDoc, rank: ReadonlyMap<string, number>): number {
	if (isChapterIndex(doc)) return 0;
	const key = doc.sectionId || basename(doc.path).replace(/\.md$/i, "");
	return rank.get(key) ?? Number.MAX_SAFE_INTEGER;
}

const SEVERITY: Record<Freshness, number> = { orphaned: 3, stale: 2, unknown: 1, current: 0 };

function worst(docs: readonly WikiDoc[]): Freshness {
	let out: Freshness = "current";
	for (const doc of docs) if (SEVERITY[doc.freshness] > SEVERITY[out]) out = doc.freshness;
	return out;
}

/**
 * The outline, read as data.
 *
 * Only the fields navigation needs are taken, and a malformed plan degrades to
 * no plan rather than to an error page: the documents on disk are what a reader
 * came for, and they are readable without any outline at all.
 */
interface PlanSection {
	id: string;
	title: string;
	summary: string;
}

interface PlanChapter {
	id: string;
	title: string;
	goal: string;
	sections: PlanSection[];
}

interface Plan {
	chapters: PlanChapter[];
}

async function readPlan(root: string): Promise<Plan | null> {
	let raw: unknown;
	try {
		raw = parse(await readFile(join(root, KAIOKEN_DIR, "wiki-plan.yaml"), "utf8"));
	} catch {
		return null;
	}
	if (!raw || typeof raw !== "object") return null;

	const chapters = (raw as { chapters?: unknown }).chapters;
	if (!Array.isArray(chapters)) return null;

	return {
		chapters: chapters
			.map((entry): PlanChapter | null => {
				if (!entry || typeof entry !== "object") return null;
				const source = entry as Record<string, unknown>;
				const id = str(source["id"]);
				if (!id) return null;
				const raw = source["sections"];
				const sections = Array.isArray(raw) ? raw : [];
				return {
					id,
					title: str(source["title"]) || titleFromId(id),
					goal: str(source["goal"]),
					sections: sections
						.map(normaliseSection)
						.filter((section): section is PlanSection => section !== null),
				};
			})
			.filter((chapter): chapter is PlanChapter => chapter !== null),
	};
}

function normaliseSection(raw: unknown): PlanSection | null {
	if (!raw || typeof raw !== "object") return null;
	const section = raw as Record<string, unknown>;
	const id = str(section["id"]);
	if (!id) return null;
	return {
		id,
		title: str(section["title"]) || titleFromId(id),
		summary: str(section["summary"]),
	};
}

async function readProvenanceIndex(root: string): Promise<ProvenanceIndex | null> {
	try {
		const parsed = JSON.parse(
			await readFile(join(root, KAIOKEN_DIR, "provenance.json"), "utf8"),
		) as ProvenanceIndex;
		return Array.isArray(parsed?.documents) ? parsed : null;
	} catch {
		return null;
	}
}

/**
 * Skills are handwritten procedures, and the search index already returns them.
 * A tenant that can be found but not opened is a broken link, so they are
 * browsable here too.
 */
async function readSkills(root: string): Promise<Skill[]> {
	const skillsRoot = join(root, KAIOKEN_DIR, "skills");
	const out: Skill[] = [];

	for (const abs of await walkMarkdown(skillsRoot)) {
		let body: string;
		try {
			body = await readFile(abs, "utf8");
		} catch {
			continue;
		}
		const path = toPosix(relative(skillsRoot, abs));
		const front = /^---\n([\s\S]*?)\n---/.exec(stripBom(body).replace(/\r\n/g, "\n"));
		const block = front ? (front[1] as string) : "";
		const fallback = path.replace(/\/?SKILL\.md$/i, "").replace(/\.md$/i, "");

		out.push({
			path,
			href: `/s/${path}`,
			name: field(block, "name") || fallback,
			description: field(block, "description"),
		});
	}

	return out.sort((a, b) => a.name.localeCompare(b.name));
}

function field(frontmatter: string, key: string): string {
	const found = new RegExp(`^${key}:\\s*(.+)$`, "m").exec(frontmatter);
	return found ? (found[1] as string).trim().replace(/^["']|["']$/g, "") : "";
}

/** Cards, read as the JSON they are stored as — same reason as skills. */
async function readCards(root: string): Promise<CardSummary[]> {
	const cardsRoot = join(root, KAIOKEN_DIR, "cards");
	let entries: string[];
	try {
		entries = await readdir(cardsRoot);
	} catch {
		return [];
	}

	const out: CardSummary[] = [];
	for (const file of entries.sort()) {
		if (!file.endsWith(".json")) continue;
		const card = await readCardFile(join(cardsRoot, file));
		if (!card) continue;
		const moduleId = str(card["moduleId"]) || file.replace(/\.json$/, "");
		const entryPoints = card["entryPoints"];
		out.push({
			file,
			href: `/c/${file}`,
			moduleId,
			name: str(card["name"]) || moduleId,
			summary: str(card["summary"]),
			entryPointCount: Array.isArray(entryPoints) ? entryPoints.length : 0,
			ungrounded: ungroundedCount(card["verification"]),
		});
	}
	return out;
}

export async function readCardFile(path: string): Promise<Record<string, unknown> | null> {
	try {
		const parsed = JSON.parse(await readFile(path, "utf8")) as unknown;
		return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
	} catch {
		return null;
	}
}

function ungroundedCount(raw: unknown): number {
	if (!raw || typeof raw !== "object") return 0;
	const list = (raw as { ungrounded?: unknown }).ungrounded;
	return Array.isArray(list) ? list.length : 0;
}

async function walkMarkdown(dir: string, isRoot = true): Promise<string[]> {
	let entries: Dirent[];
	try {
		entries = await readdir(dir, { withFileTypes: true });
	} catch {
		return [];
	}

	const out: string[] = [];
	for (const entry of [...entries].sort((a, b) => a.name.localeCompare(b.name))) {
		const abs = join(dir, entry.name);
		if (entry.isDirectory()) {
			out.push(...(await walkMarkdown(abs, false)));
		} else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
			if (isRoot && entry.name.toLowerCase() === "readme.md") continue;
			out.push(abs);
		}
	}
	return out;
}

function basename(path: string): string {
	const slash = path.lastIndexOf("/");
	return slash === -1 ? path : path.slice(slash + 1);
}

/** "getting-started" reads better as "Getting started" in a navigation rail. */
export function titleFromId(id: string): string {
	const words = id.replace(/[-_]+/g, " ").trim();
	return words ? words.charAt(0).toUpperCase() + words.slice(1) : "";
}

function stripBom(text: string): string {
	return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function toPosix(path: string): string {
	return sep === "/" ? path : path.split(sep).join("/");
}

function str(raw: unknown): string {
	return typeof raw === "string" ? raw.trim() : "";
}
