import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { KAIOKEN_DIR } from "@kaioken/scan";
import { parse, stringify } from "yaml";
import type { Chapter, Provenance, ProvenanceIndex, Section, WikiDocument, WikiPlan } from "./types.js";

export const WIKI_PLAN_ARTIFACT = join(KAIOKEN_DIR, "wiki-plan.yaml");
export const WIKI_DIR = join(KAIOKEN_DIR, "wiki");
export const PROVENANCE_ARTIFACT = join(KAIOKEN_DIR, "provenance.json");

export function wikiPlanPath(root: string): string {
	return join(resolve(root), WIKI_PLAN_ARTIFACT);
}

export function wikiDir(root: string): string {
	return join(resolve(root), WIKI_DIR);
}

export function provenancePath(root: string): string {
	return join(resolve(root), PROVENANCE_ARTIFACT);
}

const HEADER = `# Kaioken wiki plan — edit this file.
#
# The outline is a checkpoint, not an output. Reordering chapters, rewriting a
# goal, or moving a file between chapters costs nothing here and changes what
# gets written; the same correction after generation costs every chapter.
#
# "goal" steers what each chapter argues. "files" is the only evidence that
# chapter may draw on — a claim about a file listed nowhere is reported as a
# defect rather than silently believed.
`;

export async function writeWikiPlan(root: string, plan: WikiPlan): Promise<string> {
	const path = wikiPlanPath(root);
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, `${HEADER}\n${stringify(plan, { lineWidth: 92 })}`, "utf8");
	return path;
}

export async function readWikiPlan(root: string): Promise<WikiPlan | null> {
	try {
		return normalisePlan(parse(await readFile(wikiPlanPath(root), "utf8")));
	} catch {
		return null;
	}
}

/**
 * Coerce a hand-edited outline into shape. Liberal here, strict in validation:
 * the complaint belongs on the content, not on a parse error.
 */
export function normalisePlan(raw: unknown): WikiPlan | null {
	if (!raw || typeof raw !== "object") return null;
	const source = raw as Record<string, unknown>;

	const chapters = Array.isArray(source["chapters"])
		? (source["chapters"] as unknown[])
				.map(normaliseChapter)
				.filter((c): c is Chapter => c !== null)
		: [];

	return {
		version: 1,
		generatedAt: typeof source["generatedAt"] === "string" ? source["generatedAt"] : "",
		multiplier: typeof source["multiplier"] === "number" ? source["multiplier"] : 1,
		chapters,
	};
}

function normaliseChapter(raw: unknown): Chapter | null {
	if (!raw || typeof raw !== "object") return null;
	const source = raw as Record<string, unknown>;
	const id = str(source["id"]);
	if (!id) return null;

	const sections = Array.isArray(source["sections"])
		? (source["sections"] as unknown[])
				.map(normaliseSection)
				.filter((s): s is Section => s !== null)
		: [];

	return {
		id,
		title: str(source["title"]) || id,
		goal: str(source["goal"]),
		files: pathList(source["files"]),
		...(sections.length > 0 ? { sections } : {}),
	};
}

function normaliseSection(raw: unknown): Section | null {
	if (!raw || typeof raw !== "object") return null;
	const source = raw as Record<string, unknown>;
	const id = str(source["id"]);
	if (!id) return null;
	return {
		id,
		title: str(source["title"]) || id,
		summary: str(source["summary"]),
		files: pathList(source["files"]),
	};
}

function str(raw: unknown): string {
	return typeof raw === "string" ? raw.trim() : "";
}

function pathList(raw: unknown): string[] {
	return Array.isArray(raw)
		? (raw as unknown[])
				.filter((f): f is string => typeof f === "string")
				.map((f) => f.trim().split("\\").join("/"))
				.filter(Boolean)
		: [];
}

/**
 * Write a document and its provenance.
 *
 * The Markdown on disk is what a human reads and what the serve layer renders;
 * the provenance record is what a program acts on. Keeping them separate is
 * deliberate — a prose "referenced files" section at the bottom of a chapter
 * would be neither reliably machine-readable nor pleasant to read.
 */
export async function writeWikiDocument(root: string, doc: WikiDocument): Promise<string> {
	const path = join(wikiDir(root), doc.path);
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, `${doc.body.trimEnd()}\n`, "utf8");
	return path;
}

export async function writeProvenance(root: string, records: Provenance[]): Promise<string> {
	const path = provenancePath(root);
	await mkdir(dirname(path), { recursive: true });
	const index: ProvenanceIndex = {
		version: 1,
		generatedAt: new Date().toISOString(),
		documents: [...records].sort((a, b) => a.document.localeCompare(b.document)),
	};
	await writeFile(path, `${JSON.stringify(index, null, 2)}\n`, "utf8");
	return path;
}

export async function readProvenance(root: string): Promise<ProvenanceIndex | null> {
	try {
		return JSON.parse(await readFile(provenancePath(root), "utf8")) as ProvenanceIndex;
	} catch {
		return null;
	}
}
