import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { type IndexResult, SymbolOracle } from "@kaioken/index";
import { DEFAULT_CONCURRENCY, mapLimitSettled, type ModelClient } from "@kaioken/modelport";
import type { ScanResult } from "@kaioken/scan";
import { wikiDir } from "./artifact.ts";
import { documentPath, generateDocument, titleOf } from "./generate.ts";
import { planSections } from "./plan.ts";
import type { Chapter, RunFailure, Section, WikiDocument, WikiPlan } from "./types.ts";

export type { RunFailure };

/**
 * Drive the cascade for a whole plan.
 *
 * Chapters are generated in parallel up to a concurrency limit, followed by
 * their subsections in parallel. The chapter is written first for narrative
 * order and so its subsections are known before section generation begins.
 *
 * Failures are collected rather than thrown: one unwritable chapter should not
 * discard the eleven that succeeded, and the caller records what is left for a
 * retry.
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
	/** When true, skips re-generating chapters and sections that already have documents on disk. */
	resume?: boolean;
	onDocument?: (doc: WikiDocument) => Promise<void>;
	onFailure?: (failure: RunFailure) => void;
	onProgress?: (label: string, done: number, total: number) => void;
	/**
	 * Fires when a chapter or section job starts, before its model call.
	 *
	 * `onProgress` only fires after a document completes, so a long model
	 * call leaves the caller silent. A live log needs the start signal to
	 * show what is currently in flight.
	 */
	onTaskStart?: (label: string) => void;
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
	const wantedDocSet =
		input.onlyDocuments && input.onlyDocuments.length > 0 ? new Set(input.onlyDocuments) : null;

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

	// Documents are written through a serialised tail so concurrent chapters do
	// not interleave filesystem writes.
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

	// Phase A: generate chapters and plan their sections.
	await mapLimitSettled(chapters, limit, async (chapter) => {
		const docPath = documentPath(chapter);
		const wantChapterDoc = !wantedDocSet || wantedDocSet.has(docPath);
		input.onTaskStart?.(`chapter ${chapter.id}`);

		let chapterAlreadyOnDisk = false;
		if (wantChapterDoc) {
			let existingBody: string | null = null;
			if (input.resume) {
				try {
					existingBody = await readFile(join(wikiDir(input.root), docPath), "utf8");
				} catch {
					existingBody = null;
				}
			}

			if (existingBody && existingBody.trim().length > 0) {
				chapterAlreadyOnDisk = true;
				const doc: WikiDocument = {
					path: docPath,
					chapterId: chapter.id,
					title: titleOf(existingBody, chapter.title),
					body: existingBody,
					provenance: {
						document: docPath,
						chapterId: chapter.id,
						generatedAt: new Date().toISOString(),
						sources: chapter.files
							.map((path) => {
								const record = input.scan.files.find((f) => f.path === path);
								return record ? { path, hash: record.hash } : null;
							})
							.filter((s): s is { path: string; hash: string } => s !== null),
					},
					verification: {
						grounded: 0,
						defects: [],
						uncovered: [],
						coverage: 1,
					},
				};
				documentsMap.set(doc.path, doc);
				sinkDocument(doc);
			} else {
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
			}
		}

		done++;
		input.onProgress?.(`chapter ${chapter.id}`, done, total);

		// Sections are planned after the chapter document, so the chapter exists
		// even if section planning fails.
		if (input.resume && chapterAlreadyOnDisk) {
			if (chapter.sections && chapter.sections.length > 0) {
				resolved.set(chapter.id, chapter.sections);
			}
		} else {
			try {
				const sections = await planSections({
					plan: input.plan,
					chapter,
					index: input.index,
					client: input.client,
					...(input.multiplier !== undefined ? { multiplier: input.multiplier } : {}),
					...(input.brief ? { brief: input.brief } : {}),
				});
				if (sections.length > 0) resolved.set(chapter.id, sections);
			} catch (error) {
				const reason = error instanceof Error ? error.message : String(error);
				const failure: RunFailure = {
					kind: "sections",
					chapterId: chapter.id,
					document: docPath,
					reason,
				};
				failures.push(failure);
				input.onFailure?.(failure);
			}
		}
	});

	// Phase B: generate the planned subsections.
	const sectionJobs: Array<{ chapter: Chapter; section: Section }> = [];
	for (const chapter of chapters) {
		for (const section of resolved.get(chapter.id) ?? []) {
			const path = documentPath(chapter, section);
			if (wantedDocSet && !wantedDocSet.has(path)) continue;
			sectionJobs.push({ chapter, section });
		}
	}

	await mapLimitSettled(sectionJobs, limit, async ({ chapter, section }) => {
		const path = documentPath(chapter, section);
		input.onTaskStart?.(`section ${chapter.id}/${section.id}`);
		let existingSectionBody: string | null = null;
		if (input.resume) {
			try {
				existingSectionBody = await readFile(join(wikiDir(input.root), path), "utf8");
			} catch {
				existingSectionBody = null;
			}
		}

		if (existingSectionBody && existingSectionBody.trim().length > 0) {
			const doc: WikiDocument = {
				path,
				chapterId: chapter.id,
				sectionId: section.id,
				title: titleOf(existingSectionBody, section.title),
				body: existingSectionBody,
				provenance: {
					document: path,
					chapterId: chapter.id,
					sectionId: section.id,
					generatedAt: new Date().toISOString(),
					sources: section.files
						.map((p) => {
							const record = input.scan.files.find((f) => f.path === p);
							return record ? { path: p, hash: record.hash } : null;
						})
						.filter((s): s is { path: string; hash: string } => s !== null),
				},
				verification: {
					grounded: 0,
					defects: [],
					uncovered: [],
					coverage: 1,
				},
			};
			documentsMap.set(doc.path, doc);
			sinkDocument(doc);
		} else {
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
					document: path,
					reason,
				};
				failures.push(failure);
				input.onFailure?.(failure);
			}
		}

		done++;
		input.onProgress?.(`section ${chapter.id}/${section.id}`, done, total);
	});

	await tail;

	// Persist the sections that were actually used, so a later run reuses the
	// same ids instead of inventing new ones.
	const plan: WikiPlan = {
		...input.plan,
		chapters: input.plan.chapters.map((chapter) => {
			const sections = resolved.get(chapter.id);
			return sections ? { ...chapter, sections } : chapter;
		}),
	};

	return { documents: [...documentsMap.values()], failures, plan };
}

/** Reads a repository file, returning null rather than throwing when absent. */
export function sourceReader(root: string): (path: string) => Promise<string | null> {
	return async (path: string) => {
		try {
			return await readFile(join(root, path), "utf8");
		} catch {
			return null;
		}
	};
}

function estimateTotal(chapters: readonly Chapter[], wanted: ReadonlySet<string> | null): number {
	let total = 0;
	for (const chapter of chapters) {
		if (!wanted || wanted.has(documentPath(chapter))) total++;
		total += chapter.sections?.length ?? 0;
	}
	// Sections are planned during the run, so the exact total is unknown up
	// front. Counting one section per chapter keeps the progress bar monotonic
	// without pretending to precision it does not have.
	return Math.max(total, chapters.length);
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
