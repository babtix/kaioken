import { createHash } from "node:crypto";
import type { Dirent } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { basename, extname, join, relative, resolve } from "node:path";
import type { EmbeddingProvider } from "@kaioken/search";
import { chunkParentChild, Headings, type ChunkConfig } from "./chunk.js";
import {
	NO_PARENT,
	NO_VECTOR,
	type Chunk,
	type ModuleData,
	type PrismDocument,
	writeModule,
} from "./store.js";

/**
 * Bringing documents in.
 *
 * Ingestion is where the corpus is decided, and the two decisions that matter
 * are both about honesty. A document that fails is recorded as failed with the
 * reason, rather than quietly missing from a corpus somebody will later ask
 * questions of; and embedding is optional, because a corpus that can only be
 * built with an embedding provider is a corpus most people never build. Without
 * one, retrieval runs on BM25 alone and says so.
 */

/** Text formats worth chunking. Anything else is skipped with a reason. */
const TEXT_EXTENSIONS = new Set([
	".md",
	".markdown",
	".txt",
	".rst",
	".org",
	".adoc",
	".csv",
	".json",
	".yaml",
	".yml",
	".html",
	".htm",
	".tex",
]);

/** A single document past this is truncated rather than refused. */
const MAX_DOCUMENT_BYTES = 8 * 1024 * 1024;

export interface IngestInput {
	root: string;
	data: ModuleData;
	/** A file or a directory. A directory is walked for text documents. */
	path: string;
	embeddings?: EmbeddingProvider;
	chunking?: Partial<ChunkConfig>;
	onProgress?: (filename: string, done: number, total: number) => void;
}

export interface IngestResult {
	imported: PrismDocument[];
	skipped: Array<{ path: string; reason: string }>;
	/** True when chunks were stored without vectors. */
	lexicalOnly: boolean;
}

export async function ingest(input: IngestInput): Promise<IngestResult> {
	const targets = await collectTargets(input.path);
	if (targets.files.length === 0) {
		return { imported: [], skipped: targets.skipped, lexicalOnly: !input.embeddings };
	}

	const imported: PrismDocument[] = [];
	const skipped = [...targets.skipped];

	for (let i = 0; i < targets.files.length; i++) {
		const file = targets.files[i] as string;
		input.onProgress?.(basename(file), i, targets.files.length);

		let text: string;
		let bytes: number;
		try {
			const info = await stat(file);
			bytes = info.size;
			const raw = await readFile(file, "utf8");
			text = raw.length > MAX_DOCUMENT_BYTES ? raw.slice(0, MAX_DOCUMENT_BYTES) : raw;
		} catch (error) {
			skipped.push({ path: file, reason: error instanceof Error ? error.message : String(error) });
			continue;
		}

		if (text.trim() === "") {
			skipped.push({ path: file, reason: "empty" });
			continue;
		}

		const id = documentId(text);
		// Re-importing the same bytes is a no-op rather than a second copy:
		// duplicated chunks would win retrieval twice and crowd the rest out.
		if (input.data.documents.some((document) => document.id === id)) {
			skipped.push({ path: file, reason: "already imported" });
			continue;
		}

		const document = await ingestOne(input, { id, file, text, bytes });
		input.data.documents.push(document);
		imported.push(document);
	}

	input.data.module.updatedAt = new Date().toISOString();
	await writeModule(input.root, input.data);
	input.onProgress?.("", targets.files.length, targets.files.length);

	return { imported, skipped, lexicalOnly: !input.embeddings };
}

async function ingestOne(
	input: IngestInput,
	file: { id: string; file: string; text: string; bytes: number },
): Promise<PrismDocument> {
	const runes = [...file.text];
	const headings = new Headings(runes);
	const pairs = chunkParentChild(file.text, input.chunking ?? {});

	if (pairs.length === 0) {
		return {
			id: file.id,
			filename: basename(file.file),
			source: file.file,
			status: "failed",
			bytes: file.bytes,
			childCount: 0,
			parentCount: 0,
			error: "nothing to chunk",
			importedAt: new Date().toISOString(),
		};
	}

	// Parents are stored once, children point at them by index. The offset used
	// here is the chunk array's, not the splitter's, because that is what a
	// retrieval hit has to resolve through.
	const parentSlots = new Map<number, number>();
	const chunks: Chunk[] = [];
	for (const pair of pairs) {
		if (parentSlots.has(pair.parentIndex)) continue;
		const slot = chunks.length;
		parentSlots.set(pair.parentIndex, slot);
		chunks.push({
			doc: file.id,
			index: slot,
			type: "parent",
			parentIndex: NO_PARENT,
			text: pair.parentText,
			vec: NO_VECTOR,
			...(headings.at(pair.parentStart) ? { section: headings.at(pair.parentStart) } : {}),
		});
	}

	const children: Chunk[] = [];
	for (const pair of pairs) {
		const slot = chunks.length + children.length;
		const section = headings.at(pair.childStart);
		children.push({
			doc: file.id,
			index: slot,
			type: "child",
			parentIndex: parentSlots.get(pair.parentIndex) ?? NO_PARENT,
			text: pair.childText,
			vec: NO_VECTOR,
			...(section ? { section } : {}),
		});
	}

	// Embedding happens before the first write, so a failure leaves no
	// half-ingested document behind to clean up.
	if (input.embeddings && children.length > 0) {
		try {
			const vectors = await input.embeddings.embed(
				children.map((child) => (child.section ? `${child.section}\n${child.text}` : child.text)),
			);
			for (let i = 0; i < children.length && i < vectors.length; i++) {
				const vector = vectors[i];
				if (!vector || vector.length === 0) continue;
				(children[i] as Chunk).vec = input.data.vectors.length;
				input.data.vectors.push(vector);
			}
		} catch (error) {
			return {
				id: file.id,
				filename: basename(file.file),
				source: file.file,
				status: "failed",
				bytes: file.bytes,
				childCount: 0,
				parentCount: 0,
				error: `embedding failed: ${error instanceof Error ? error.message : String(error)}`,
				importedAt: new Date().toISOString(),
			};
		}
	}

	// Offsets were assigned against the module's existing chunks, so shift them
	// into place before storing.
	const base = input.data.chunks.length;
	for (const chunk of [...chunks, ...children]) {
		chunk.index += base;
		if (chunk.parentIndex !== NO_PARENT) chunk.parentIndex += base;
		input.data.chunks.push(chunk);
	}

	return {
		id: file.id,
		filename: basename(file.file),
		source: file.file,
		status: "ready",
		bytes: file.bytes,
		childCount: children.length,
		parentCount: chunks.length,
		importedAt: new Date().toISOString(),
	};
}

/**
 * The document's identity is its content, not its path.
 *
 * A file moved between imports is the same document; a file edited between
 * imports is a different one. Hashing the path as well would make the first
 * case a duplicate, and hashing neither would make the second invisible.
 */
function documentId(text: string): string {
	return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

async function collectTargets(
	path: string,
): Promise<{ files: string[]; skipped: Array<{ path: string; reason: string }> }> {
	const target = resolve(path);
	const skipped: Array<{ path: string; reason: string }> = [];

	let info: Awaited<ReturnType<typeof stat>>;
	try {
		info = await stat(target);
	} catch {
		return { files: [], skipped: [{ path: target, reason: "no such file or directory" }] };
	}

	if (info.isFile()) {
		if (!TEXT_EXTENSIONS.has(extname(target).toLowerCase())) {
			return { files: [], skipped: [{ path: target, reason: `unsupported type ${extname(target) || "(none)"}` }] };
		}
		return { files: [target], skipped };
	}

	const files: string[] = [];
	const walk = async (dir: string): Promise<void> => {
		let entries: Dirent[];
		try {
			entries = await readdir(dir, { withFileTypes: true });
		} catch {
			return;
		}
		for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
			// A hidden directory in a document tree is tooling, not documents.
			if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
			const full = join(dir, entry.name);
			if (entry.isDirectory()) {
				await walk(full);
			} else if (TEXT_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
				files.push(full);
			} else {
				skipped.push({ path: relative(target, full), reason: "unsupported type" });
			}
		}
	};
	await walk(target);
	return { files, skipped };
}
