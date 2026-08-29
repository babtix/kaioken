import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { KAIOKEN_DIR } from "@kaioken/scan";
import type { KnowledgeGraph } from "./types.js";

export const GRAPH_ARTIFACT = join(KAIOKEN_DIR, "graph.json");

export function graphPath(root: string): string {
	return join(resolve(root), GRAPH_ARTIFACT);
}

export async function writeGraph(root: string, graph: KnowledgeGraph): Promise<string> {
	const path = graphPath(root);
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, `${JSON.stringify(graph, null, 2)}\n`, "utf8");
	return path;
}

export async function readGraph(root: string): Promise<KnowledgeGraph | null> {
	try {
		const parsed = JSON.parse(await readFile(graphPath(root), "utf8")) as KnowledgeGraph;
		return parsed.version === 1 ? parsed : null;
	} catch {
		return null;
	}
}

/**
 * Handoff bundle: every tenant's knowledge in one directory.
 *
 * The point of an export is that the receiving side needs nothing installed —
 * no kaioken, no node_modules, no credentials. Everything is plain files:
 * cards as the JSON they are stored as, wiki documents as the Markdown a
 * person reads, skills and the graph beside them.
 *
 * Layout, all under one directory:
 *
 *     cards/<module>.json    knowledge cards, verbatim
 *     wiki/<path>            generated chapters and sections, verbatim
 *     skills/<name>          handwritten procedures, verbatim
 *     graph.json             the derived graph
 *     knowledge.md           the human-readable summary
 *     manifest.json          what is in the bundle, and where it came from
 */
export interface ExportManifest {
	version: 1;
	generatedAt: string;
	repository: string;
	counts: { cards: number; wikiDocuments: number; skills: number };
}

export const CARD_DIR = "cards";
export const WIKI_DIR = "wiki";
export const SKILL_DIR = "skills";

export async function writeExportTree(
	bundleRoot: string,
	files: readonly { path: string; content: string }[],
	manifest: ExportManifest,
): Promise<string[]> {
	const written: string[] = [];
	for (const file of files) {
		const target = safeJoin(bundleRoot, file.path);
		await mkdir(dirname(target), { recursive: true });
		await writeFile(target, file.content, "utf8");
		written.push(file.path);
	}
	const manifestPath = safeJoin(bundleRoot, "manifest.json");
	await mkdir(dirname(manifestPath), { recursive: true });
	await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
	written.push("manifest.json");
	return written.sort();
}

/** Join inside the bundle, refusing anything that tries to escape it. */
function safeJoin(bundleRoot: string, relative: string): string {
	const target = resolve(bundleRoot, relative);
	const base = resolve(bundleRoot);
	if (target !== base && !target.startsWith(base + dirSep())) {
		throw new Error(`export path escapes the bundle: ${relative}`);
	}
	return target;
}

function dirSep(): string {
	return process.platform === "win32" ? "\\" : "/";
}

/**
 * Copy the wiki tree as files. Reading here rather than importing a wiki
 * function keeps the export independent of how the wiki stores things, and
 * the layout on disk already is the export format.
 */
/** Returns wiki-relative paths (no `wiki/` prefix) with file contents. */
export async function readWikiTree(wikiRoot: string): Promise<{ path: string; content: string }[]> {
	const out: { path: string; content: string }[] = [];
	await walk(wikiRoot, "", out);
	return out;
}

async function walk(
	dir: string,
	prefix: string,
	out: { path: string; content: string }[],
): Promise<void> {
	let entries;
	try {
		entries = await readdir(dir, { withFileTypes: true });
	} catch {
		return;
	}
	for (const entry of entries) {
		const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
		if (entry.isDirectory()) {
			await walk(join(dir, entry.name), rel, out);
		} else if (entry.name.endsWith(".md")) {
			const content = await readFile(join(dir, entry.name), "utf8");
			// Wiki-relative: the same id provenance records use, so graph and
			// bundle agree on what a document is called.
			out.push({ path: rel, content });
		}
	}
}
