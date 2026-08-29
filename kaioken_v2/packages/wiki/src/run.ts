import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { type IndexResult, SymbolOracle } from "@kaioken/index";
import type { ModelClient } from "@kaioken/model";
import type { ScanResult } from "@kaioken/scan";
import { generateDocument } from "./generate.js";
import { planSections } from "./plan.js";
import type { Chapter, Section, WikiDocument, WikiPlan } from "./types.js";

/**
 * Drive the cascade for a whole plan.
 *
 * The chapter is written first and its subsections after, so each subsection is
 * elaborating something already argued rather than inventing its own framing.
 */

export interface RunInput {
	root: string;
	plan: WikiPlan;
	scan: ScanResult;
	index: IndexResult | null;
	client: ModelClient;
	multiplier?: number;
	/** Restrict the run to these chapter ids. */
	only?: string[];
	onProgress?: (label: string, done: number, total: number) => void;
}

export interface RunOutput {
	documents: WikiDocument[];
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

	const wanted = input.only && input.only.length > 0 ? new Set(input.only) : null;
	const chapters = input.plan.chapters.filter(
		(c) => (!wanted || wanted.has(c.id)) && c.files.length > 0,
	);

	const documents: WikiDocument[] = [];
	const resolved = new Map<string, Section[]>();
	let done = 0;
	const total = estimateTotal(chapters);

	for (const chapter of chapters) {
		input.onProgress?.(chapter.id, done, total);

		documents.push(
			await generateDocument({
				plan: input.plan,
				chapter,
				index: input.index,
				oracle,
				client: input.client,
				...(input.multiplier !== undefined ? { multiplier: input.multiplier } : {}),
				scanFiles: input.scan.files,
				readSource,
			}),
		);
		done++;

		// A hand-edited plan may already carry sections; otherwise plan them now
		// against the global outline.
		const sections =
			chapter.sections && chapter.sections.length > 0
				? chapter.sections
				: await planSections(input.plan, chapter, input.index, input.client, input.multiplier ?? 1);
		resolved.set(chapter.id, sections);

		for (const section of sections) {
			input.onProgress?.(`${chapter.id}/${section.id}`, done, total);
			documents.push(
				await generateDocument({
					plan: input.plan,
					chapter,
					section,
					index: input.index,
					oracle,
					client: input.client,
					...(input.multiplier !== undefined ? { multiplier: input.multiplier } : {}),
					scanFiles: input.scan.files,
					readSource,
				}),
			);
			done++;
		}
	}

	return {
		documents,
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
 */
export function sourceReader(root: string): (path: string) => Promise<string | null> {
	const cache = new Map<string, string | null>();
	return async (path: string) => {
		const hit = cache.get(path);
		if (hit !== undefined) return hit;
		let value: string | null;
		try {
			value = await readFile(join(root, path), "utf8");
		} catch {
			value = null;
		}
		cache.set(path, value);
		return value;
	};
}

/** Chapters plus a guess at their subsections, for the progress denominator. */
function estimateTotal(chapters: readonly Chapter[]): number {
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
