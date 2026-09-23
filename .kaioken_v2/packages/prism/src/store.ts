import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { KAIOKEN_DIR } from "@kaioken/scan";

/**
 * Where an imported corpus lives.
 *
 * PRISM is deliberately a *separate* corpus from the wiki. The wiki is what
 * Kaioken derived about a repository and can regenerate at will; this is
 * documents a person brought in — a spec, a contract, a stack of papers — which
 * nothing can regenerate and which belong to a domain, not to a commit. Mixing
 * the two would mean a question about clause 4 could be answered with a
 * paragraph about the parser.
 *
 * One directory per module, one JSON file per document, and one file of
 * vectors. Plain files rather than a database: the corpus has to survive being
 * copied, diffed, and read by something that is not this program.
 */

export const PRISM_DIR = join(KAIOKEN_DIR, "prism");

/** A named knowledge domain. Retrieval is always scoped to exactly one. */
export interface Module {
	slug: string;
	name: string;
	description?: string;
	/** Specialises generation for this domain, when set. */
	systemPrompt?: string;
	createdAt: string;
	updatedAt: string;
}

export type DocumentStatus = "ready" | "failed";

export interface PrismDocument {
	id: string;
	filename: string;
	/** Where it was imported from, so a stale document can be re-imported. */
	source?: string;
	status: DocumentStatus;
	bytes: number;
	childCount: number;
	parentCount: number;
	/** Why a failed document failed, in terms the importer can act on. */
	error?: string;
	importedAt: string;
}

/** One stored passage. Children are searched; parents are read. */
export interface Chunk {
	doc: string;
	index: number;
	type: "child" | "parent";
	/** The index of this child's parent, or NO_PARENT. Children only. */
	parentIndex: number;
	/** The nearest enclosing heading, when the source had one. */
	section?: string;
	text: string;
	/** This child's row in the module's vector file, or NO_VECTOR. */
	vec: number;
}

/** Zero would be indistinguishable from "the parent at index 0". */
export const NO_PARENT = -1;
export const NO_VECTOR = -1;

export interface ModuleData {
	module: Module;
	documents: PrismDocument[];
	chunks: Chunk[];
	/** Row-aligned with every child whose `vec` is not NO_VECTOR. */
	vectors: number[][];
}

export function prismDir(root: string): string {
	return join(resolve(root), PRISM_DIR);
}

export function moduleDir(root: string, slug: string): string {
	return join(prismDir(root), slug);
}

/** A module name made safe to be a directory name. */
export function slugify(name: string): string {
	return name
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 60);
}

export async function listModules(root: string): Promise<Module[]> {
	let entries: string[];
	try {
		entries = await readdir(prismDir(root));
	} catch {
		return [];
	}
	const out: Module[] = [];
	for (const entry of entries.sort()) {
		const data = await readModule(root, entry);
		if (data) out.push(data.module);
	}
	return out;
}

export async function readModule(root: string, slug: string): Promise<ModuleData | null> {
	const dir = moduleDir(root, slug);
	try {
		const module = JSON.parse(await readFile(join(dir, "module.json"), "utf8")) as Module;
		const documents = await readJson<PrismDocument[]>(join(dir, "documents.json"), []);
		const chunks = await readJson<Chunk[]>(join(dir, "chunks.json"), []);
		const vectors = await readJson<number[][]>(join(dir, "vectors.json"), []);
		return { module, documents, chunks, vectors };
	} catch {
		return null;
	}
}

export async function writeModule(root: string, data: ModuleData): Promise<void> {
	const dir = moduleDir(root, data.module.slug);
	await mkdir(dir, { recursive: true });
	await writeFile(join(dir, "module.json"), `${JSON.stringify(data.module, null, 2)}\n`, "utf8");
	await writeFile(join(dir, "documents.json"), `${JSON.stringify(data.documents, null, 2)}\n`, "utf8");
	// The chunk and vector files are the bulk of the corpus and nobody reads
	// them by hand, so they are written compact.
	await writeFile(join(dir, "chunks.json"), `${JSON.stringify(data.chunks)}\n`, "utf8");
	await writeFile(join(dir, "vectors.json"), `${JSON.stringify(data.vectors)}\n`, "utf8");
}

export async function createModule(
	root: string,
	name: string,
	description?: string,
): Promise<ModuleData> {
	const slug = slugify(name);
	if (!slug) throw new Error(`"${name}" does not reduce to a usable module name`);

	const existing = await readModule(root, slug);
	// Silently returning the existing module would make `prism new` look like it
	// had created a second one, and the next import would land somewhere the
	// user did not expect.
	if (existing) throw new Error(`module "${slug}" already exists`);

	const now = new Date().toISOString();
	const data: ModuleData = {
		module: { slug, name: name.trim(), createdAt: now, updatedAt: now, ...(description ? { description } : {}) },
		documents: [],
		chunks: [],
		vectors: [],
	};
	await writeModule(root, data);
	return data;
}

export async function deleteModule(root: string, slug: string): Promise<boolean> {
	const dir = moduleDir(root, slug);
	const existing = await readModule(root, slug);
	if (!existing) return false;
	await rm(dir, { recursive: true, force: true });
	return true;
}

/** The active module's slug, or "" when none has been selected. */
export async function readActiveModule(root: string): Promise<string> {
	try {
		const parsed = JSON.parse(await readFile(join(prismDir(root), "active.json"), "utf8")) as {
			module?: unknown;
		};
		return typeof parsed.module === "string" ? parsed.module : "";
	} catch {
		return "";
	}
}

export async function writeActiveModule(root: string, slug: string): Promise<void> {
	await mkdir(prismDir(root), { recursive: true });
	await writeFile(join(prismDir(root), "active.json"), `${JSON.stringify({ module: slug }, null, 2)}\n`, "utf8");
}

/** Documents that reached `ready`, which is what a module's count should mean. */
export function readyDocuments(data: ModuleData): PrismDocument[] {
	return data.documents.filter((document) => document.status === "ready");
}

async function readJson<T>(path: string, fallback: T): Promise<T> {
	try {
		return JSON.parse(await readFile(path, "utf8")) as T;
	} catch {
		return fallback;
	}
}
