import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { type IndexResult, SymbolOracle } from "@kaioken/index";
import { DEFAULT_CONCURRENCY, mapLimitSettled, type ModelClient } from "@kaioken/modelport";
import type { ScanResult } from "@kaioken/scan";
import { readProvenance, readVerification, readWikiState, wikiDir, writeWikiState } from "./artifact.ts";
import { documentPath, generateDocument, titleOf } from "./generate.ts";
import { planSections } from "./plan.ts";
import { sourceReader } from "./run.ts";
import type { Chapter, RunFailure, Section, VerificationReport, WikiDocument, WikiPlan, WikiRunState } from "./types.ts";
import { groundingDefects } from "./verify.ts";

export interface ResumableCascadeInput {
	root: string;
	plan: WikiPlan;
	scan: ScanResult;
	index: IndexResult | null;
	client: ModelClient;
	multiplier?: number;
	brief?: string;
	concurrency?: number;
	only?: string[];
	onlyDocuments?: readonly string[];
	/** Force rerun even if chapters are verified clean. */
	force?: boolean;
	onChapterSkipped?: (chapterId: string, docPath: string, reason: string) => void;
	onTaskStart?: (label: string) => void;
	onProgress?: (label: string, done: number, total: number) => void;
	onDocument?: (doc: WikiDocument) => Promise<void>;
	onFailure?: (failure: RunFailure) => void;
}

export interface ResumableCascadeOutput {
	documents: WikiDocument[];
	failures: RunFailure[];
	plan: WikiPlan;
	skipped: string[];
	generated: string[];
}

/**
 * Resumable cascade runner skipping already-clean, verified chapters on retry (UX-1401 to UX-1410, UX-1441 to UX-1450).
 * Verifies disk presence, zero grounding defects, and source hash integrity before deciding to skip.
 */
export async function runResumableCascade(input: ResumableCascadeInput): Promise<ResumableCascadeOutput> {
	const oracle = new SymbolOracle(input.index ?? {
		root: "",
		builtAt: "",
		fileCount: 0,
		symbolCount: 0,
		unparsedLanguages: {},
		files: [],
	});
	const readSource = sourceReader(input.root);

	// Load existing artifacts for verification and provenance checks
	const existingVerification = await readVerification(input.root);
	const existingProvenance = await readProvenance(input.root);
	const existingState = await readWikiState(input.root);

	const verificationByDoc = new Map<string, VerificationReport>();
	if (existingVerification) {
		for (const doc of existingVerification.documents) {
			verificationByDoc.set(doc.document, {
				grounded: doc.grounded,
				defects: doc.defects,
				uncovered: doc.uncovered,
				coverage: doc.coverage,
			});
		}
	}

	const provenanceByDoc = new Map<string, Array<{ path: string; hash: string }>>();
	if (existingProvenance) {
		for (const doc of existingProvenance.documents) {
			provenanceByDoc.set(doc.document, doc.sources);
		}
	}

	const scanHashMap = new Map<string, string>(input.scan.files.map((f) => [f.path, f.hash]));

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
	const resolvedSections = new Map<string, Section[]>();
	const skipped: string[] = [];
	const generated: string[] = [];

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
	let done = 0;
	const totalChapters = chapters.length;

	// Check if a document is clean and verified
	const isDocumentCleanAndFresh = async (docPath: string, files: readonly string[]): Promise<{ fresh: boolean; body?: string }> => {
		if (input.force) return { fresh: false };

		let body: string | null = null;
		try {
			body = await readFile(join(wikiDir(input.root), docPath), "utf8");
		} catch {
			return { fresh: false };
		}
		if (!body || body.trim().length === 0) return { fresh: false };

		// Check verification report
		const report = verificationByDoc.get(docPath);
		if (report) {
			const defects = groundingDefects(report.defects);
			if (defects.length > 0) return { fresh: false, body };
		}

		// Check source file hash drift
		const sources = provenanceByDoc.get(docPath);
		if (sources && sources.length > 0) {
			for (const s of sources) {
				const currentHash = scanHashMap.get(s.path);
				if (currentHash === undefined || currentHash !== s.hash) {
					return { fresh: false, body }; // source file drifted!
				}
			}
		} else {
			// If no saved provenance, check files directly against scan
			for (const file of files) {
				if (!scanHashMap.has(file)) return { fresh: false, body };
			}
		}

		return { fresh: true, body };
	};

	// Phase A: Generate / Skip Chapter Documents
	await mapLimitSettled(chapters, limit, async (chapter) => {
		const docPath = documentPath(chapter);
		const wantChapterDoc = !wantedDocSet || wantedDocSet.has(docPath);

		if (wantChapterDoc) {
			const check = await isDocumentCleanAndFresh(docPath, chapter.files);
			if (check.fresh && check.body) {
				input.onChapterSkipped?.(chapter.id, docPath, "already clean and verified without source drift");
				skipped.push(docPath);

				const report = verificationByDoc.get(docPath) ?? {
					grounded: 1,
					defects: [],
					uncovered: [],
					coverage: 1,
				};

				const doc: WikiDocument = {
					path: docPath,
					chapterId: chapter.id,
					title: titleOf(check.body, chapter.title),
					body: check.body,
					provenance: {
						document: docPath,
						chapterId: chapter.id,
						generatedAt: new Date().toISOString(),
						sources: chapter.files
							.map((p) => {
								const hash = scanHashMap.get(p);
								return hash ? { path: p, hash } : null;
							})
							.filter((s): s is { path: string; hash: string } => s !== null),
					},
					verification: report,
				};
				documentsMap.set(doc.path, doc);
				sinkDocument(doc);
			} else {
				input.onTaskStart?.(`chapter ${chapter.id}`);
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
					generated.push(docPath);
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
		input.onProgress?.(`chapter ${chapter.id}`, done, totalChapters);

		// Handle section planning
		if (chapter.sections && chapter.sections.length > 0) {
			resolvedSections.set(chapter.id, chapter.sections);
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
				if (sections.length > 0) resolvedSections.set(chapter.id, sections);
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

	// Phase B: Generate / Skip Planned Subsections
	const sectionJobs: Array<{ chapter: Chapter; section: Section }> = [];
	for (const chapter of chapters) {
		for (const section of resolvedSections.get(chapter.id) ?? []) {
			const path = documentPath(chapter, section);
			if (wantedDocSet && !wantedDocSet.has(path)) continue;
			sectionJobs.push({ chapter, section });
		}
	}

	await mapLimitSettled(sectionJobs, limit, async ({ chapter, section }) => {
		const path = documentPath(chapter, section);
		const check = await isDocumentCleanAndFresh(path, section.files);

		if (check.fresh && check.body) {
			input.onChapterSkipped?.(chapter.id, path, "section document clean & verified");
			skipped.push(path);

			const report = verificationByDoc.get(path) ?? {
				grounded: 1,
				defects: [],
				uncovered: [],
				coverage: 1,
			};

			const doc: WikiDocument = {
				path,
				chapterId: chapter.id,
				sectionId: section.id,
				title: titleOf(check.body, section.title),
				body: check.body,
				provenance: {
					document: path,
					chapterId: chapter.id,
					sectionId: section.id,
					generatedAt: new Date().toISOString(),
					sources: section.files
						.map((p) => {
							const hash = scanHashMap.get(p);
							return hash ? { path: p, hash } : null;
						})
						.filter((s): s is { path: string; hash: string } => s !== null),
				},
				verification: report,
			};
			documentsMap.set(doc.path, doc);
			sinkDocument(doc);
		} else {
			input.onTaskStart?.(`section ${chapter.id}/${section.id}`);
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
				generated.push(path);
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
	});

	await tail;

	// Save incremental run state
	const runState: WikiRunState = {
		version: 1,
		updatedAt: new Date().toISOString(),
		model: (input.client as { modelName?: string }).modelName ?? "model",
		multiplier: input.multiplier ?? 1,
		failures,
	};
	try {
		await writeWikiState(input.root, runState);
	} catch {
		// soft ignore state write errors
	}

	const updatedChapters = input.plan.chapters.map((ch) => {
		const planned = resolvedSections.get(ch.id);
		return planned ? { ...ch, sections: planned } : ch;
	});

	return {
		documents: [...documentsMap.values()],
		failures,
		plan: { ...input.plan, chapters: updatedChapters },
		skipped,
		generated,
	};
}
