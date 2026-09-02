import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { type IndexResult, SymbolOracle } from "@kaioken/index";
import { DEFAULT_CONCURRENCY, mapLimitSettled, type ModelClient } from "@kaioken/model";
import type { ScanResult } from "@kaioken/scan";
import { documentPath, generateDocument } from "./generate.js";
import { planSections } from "./plan.js";
import type { Chapter, RunFailure, Section, WikiDocument, WikiPlan } from "./types.js";

export type { RunFailure };

/**
 * Drive the cascade for a whole plan.
 *
 * Chapters are generated in parallel up to a concurrency limit, followed by
 * their subsections in parallel. The chapter is written first for narrative
 * order and so its subsections are known before section generation begins.
 */

export interface RunInput {
	root: string;
	plan: WikiPlan;
	scan: ScanResult;
	index: IndexResult | null;
	client: ModelClient;
	multiplier?: number;
	brief?: string;
	concurrency?: number;
	/** Restrict the run to these chapter ids. */
	only?: string[];
	/** Restrict the run to these exact document paths. */
	onlyDocuments?: readonly string[];
	onDocument?: (doc: WikiDocument) => Promise<void>;
	onFailure?: (failure: RunFailure) => void;
	onProgress?: (label: string, done: number, total: number) => void;
}

export interface RunOutput {
	documents: WikiDocument[];
	failures: RunFailure[];
	/**
	 * The plan with every section it actually used filled in.
	 *
	 * Persisting these back is what makes section ids stable: without them a
	 * later run re-plans from scratch, invents different ids, and leaves the
	 * previous documents on disk as orphans describing the same ground.
	 */
	plan: WikiPlan;
}

export async function runWiki(input: RunInput): Promise<RunOutput> {
	const oracle = new SymbolOracle(input.index ?? emptyIndex());
	const readSource = sourceReader(input.root);

	const wantedChapters = input.only && input.only.length > 0 ? new Set(input.only) : null;
	const wantedDocSet = input.onlyDocuments && input.onlyDocuments.length > 0
		? new Set(input.onlyDocuments)
		: null;

	const chapters = input.plan.chapters.filter((c) => {
		if (c.files.length === 0) return false;
		if (wantedChapters && !wantedChapters.has(c.id)) return false;
		if (wantedDocSet) {
			const hasChapterDoc = wantedDocSet.has(documentPath(c));
			const hasSectionDoc = [...wantedDocSet].some((p) => p.startsWith(`${c.id}/`));
			if (!hasChapterDoc && !hasSectionDoc) return false;
		}
		return true;
	});

	const documentsMap = new Map<string, WikiDocument>();
	const failures: RunFailure[] = [];
	const resolved = new Map<string, Section[]>();

	let tail: Promise<void> = Promise.resolve();
	const sinkDocument = (doc: WikiDocument) => {
		if (!input.onDocument) return;
		tail = tail.then(async () => {
			try {
				await input.onDocument?.(doc);
			} catch (error) {
				const reason = error instanceof Error ? error.message : String(error);
				const failure: RunFailure = {
					kind: "document",
					chapterId: doc.chapterId,
					...(doc.sectionId ? { sectionId: doc.sectionId } : {}),
					document: doc.path,
					reason: `sink write failed: ${reason}`,
				};
				failures.push(failure);
				input.onFailure?.(failure);
			}
		});
	};

	const limit = Math.max(1, input.concurrency ?? DEFAULT_CONCURRENCY);
	const total = estimateTotal(chapters, wantedDocSet);
	let done = 0;

	// Phase A: Generate chapters and plan sections.
	await mapLimitSettled(chapters, limit, async (chapter) => {
		const docPath = documentPath(chapter);
		const wantChapterDoc = !wantedDocSet || wantedDocSet.has(docPath);

		if (wantChapterDoc) {
			try {
				const doc = await generateDocument({
					plan: input.plan,
					chapter,
					index: input.index,
					oracle,
					client: input.client,
					...(input.multiplier !== undefined ? { multiplier: input.multiplier } : {}),
					...(input.brief ? { brief: input.brief } : {}),
					scanFiles: input.scan.files,
					readSource,
				});
				documentsMap.set(doc.path, doc);
				sinkDocument(doc);
			} catch (error) {
				const reason = error instanceof Error ? error.message : String(error);
				const failure: RunFailure = {
					kind: "document",
					chapterId: chapter.id,
					document: docPath,
					reason,
				};
				failures.push(failure);
				input.onFailure?.(failure);
			}
			done++;
			input.onProgress?.(chapter.id, done, total);
		}

		// A hand-edited plan may already carry sections; otherwise plan them now
		// against the global outline.
		const wantAnySections = !wantedDocSet ||
			[...wantedDocSet].some((p) => p.startsWith(`${chapter.id}/`) && p !== docPath);

		if (chapter.sections && chapter.sections.length > 0) {
			resolved.set(chapter.id, chapter.sections);
		} else if (wantAnySections) {
			try {
				const sections = await planSections({
					plan: input.plan,
					chapter,
					index: input.index,
					client: input.client,
					multiplier: input.multiplier ?? 1,
					...(input.brief ? { brief: input.brief } : {}),
				});
				resolved.set(chapter.id, sections);
			} catch (error) {
				const reason = error instanceof Error ? error.message : String(error);
				const failure: RunFailure = {
					kind: "sections",
					chapterId: chapter.id,
					document: `${chapter.id}/*`,
					reason,
				};
				failures.push(failure);
				input.onFailure?.(failure);
			}
		}
	});

	// Phase B: Generate sections concurrently.
	const sectionWork: Array<{ chapter: Chapter; section: Section }> = [];
	for (const chapter of chapters) {
		const sections = resolved.get(chapter.id) ?? chapter.sections ?? [];
		for (const section of sections) {
			const path = documentPath(chapter, section);
			if (!wantedDocSet || wantedDocSet.has(path)) {
				sectionWork.push({ chapter, section });
			}
		}
	}

	await mapLimitSettled(sectionWork, limit, async ({ chapter, section }) => {
		const docPath = documentPath(chapter, section);
		try {
			const doc = await generateDocument({
				plan: input.plan,
				chapter,
				section,
				index: input.index,
				oracle,
				client: input.client,
				...(input.multiplier !== undefined ? { multiplier: input.multiplier } : {}),
				...(input.brief ? { brief: input.brief } : {}),
				scanFiles: input.scan.files,
				readSource,
			});
			documentsMap.set(doc.path, doc);
			sinkDocument(doc);
		} catch (error) {
			const reason = error instanceof Error ? error.message : String(error);
			const failure: RunFailure = {
				kind: "document",
				chapterId: chapter.id,
				sectionId: section.id,
				document: docPath,
				reason,
			};
			failures.push(failure);
			input.onFailure?.(failure);
		}
		done++;
		input.onProgress?.(`${chapter.id}/${section.id}`, done, total);
	});

	// Await the serialized sink to ensure all writes complete.
	await tail;

	// Deterministically order documents in plan order: chapters followed by their sections.
	const documents: WikiDocument[] = [];
	for (const chapter of input.plan.chapters) {
		const chapterDoc = documentsMap.get(documentPath(chapter));
		if (chapterDoc) documents.push(chapterDoc);

		const sections = resolved.get(chapter.id) ?? chapter.sections ?? [];
		for (const section of sections) {
			const secDoc = documentsMap.get(documentPath(chapter, section));
			if (secDoc) documents.push(secDoc);
		}
	}

	return {
		documents,
		failures,
		plan: {
			...input.plan,
			chapters: input.plan.chapters.map((chapter) => {
				const sections = resolved.get(chapter.id);
				return sections && sections.length > 0 ? { ...chapter, sections } : chapter;
			}),
		},
	};
}

/**
 * Reads a source file once and remembers it. Excerpt resolution asks for the
 * same handful of files repeatedly, and re-reading them per claim would make
 * verification cost more than generation.
 * Caches the promise to prevent duplicate reads under concurrency.
 */
export function sourceReader(root: string): (path: string) => Promise<string | null> {
	const cache = new Map<string, Promise<string | null>>();
	return (path: string) => {
		const hit = cache.get(path);
		if (hit !== undefined) return hit;
		const promise = (async () => {
			try {
				return await readFile(join(root, path), "utf8");
			} catch {
				return null;
			}
		})();
		cache.set(path, promise);
		return promise;
	};
}

/** Chapters plus a guess at their subsections, for the progress denominator. */
function estimateTotal(chapters: readonly Chapter[], wantedDocSet: ReadonlySet<string> | null): number {
	if (wantedDocSet) return wantedDocSet.size;
	return chapters.reduce(
		(sum, chapter) => sum + 1 + (chapter.sections?.length ?? 2),
		0,
	);
}

function emptyIndex(): IndexResult {
	return {
		root: "",
		builtAt: "",
		fileCount: 0,
		symbolCount: 0,
		unparsedLanguages: {},
		files: [],
	};
}
