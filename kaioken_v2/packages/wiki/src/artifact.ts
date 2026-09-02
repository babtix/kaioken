import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { KAIOKEN_DIR } from "@kaioken/scan";
import { parse, stringify } from "yaml";
import type {
	Chapter,
	Provenance,
	ProvenanceIndex,
	Section,
	WikiDocument,
	WikiPlan,
	WikiRunState,
} from "./types.js";

export const WIKI_PLAN_ARTIFACT = join(KAIOKEN_DIR, "wiki-plan.yaml");
export const WIKI_DIR = join(KAIOKEN_DIR, "wiki");
export const PROVENANCE_ARTIFACT = join(KAIOKEN_DIR, "provenance.json");
export const WIKI_STATE_ARTIFACT = join(KAIOKEN_DIR, "wiki-state.json");
export const BRIEF_ARTIFACT = join(KAIOKEN_DIR, "architecture.md");

export function wikiPlanPath(root: string): string {
	return join(resolve(root), WIKI_PLAN_ARTIFACT);
}

export function wikiDir(root: string): string {
	return join(resolve(root), WIKI_DIR);
}

export function provenancePath(root: string): string {
	return join(resolve(root), PROVENANCE_ARTIFACT);
}

export function wikiStatePath(root: string): string {
	return join(resolve(root), WIKI_STATE_ARTIFACT);
}

export function briefPath(root: string): string {
	return join(resolve(root), BRIEF_ARTIFACT);
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

/**
 * State of the last wiki run, for `kaioken wiki retry`.
 * Tolerant reader: any failure yields null, never an error.
 */
export async function readWikiState(root: string): Promise<WikiRunState | null> {
	try {
		const raw = JSON.parse(await readFile(wikiStatePath(root), "utf8")) as unknown;
		if (!raw || typeof raw !== "object") return null;
		const obj = raw as Record<string, unknown>;
		if (obj["version"] !== 1 || !Array.isArray(obj["failures"])) return null;
		return {
			version: 1,
			updatedAt: typeof obj["updatedAt"] === "string" ? obj["updatedAt"] : "",
			model: typeof obj["model"] === "string" ? obj["model"] : "",
			multiplier: typeof obj["multiplier"] === "number" ? obj["multiplier"] : 1,
			failures: obj["failures"] as WikiRunState["failures"],
		};
	} catch {
		return null;
	}
}

export async function writeWikiState(root: string, state: WikiRunState): Promise<string> {
	const path = wikiStatePath(root);
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, `${JSON.stringify(state, null, 2)}\n`, "utf8");
	return path;
}

/**
 * Resolve a document path back to the chapter — and, for a subsection, the
 * section — that produced it.
 *
 * Sections are persisted into the outline after a run precisely so this lookup
 * is possible. Re-planning them here would invent different ids and leave the
 * documents already on disk describing the same ground under other names.
 */
export function locate(
	plan: { chapters: Chapter[] },
	document: string,
): { chapter: Chapter; section?: Section } | null {
	const slash = document.indexOf("/");
	if (slash === -1) return null;

	const chapterId = document.slice(0, slash);
	const leaf = document.slice(slash + 1).replace(/\.md$/, "");
	const chapter = plan.chapters.find((c) => c.id === chapterId);
	if (!chapter) return null;

	if (leaf === "index") return { chapter };
	const section = chapter.sections?.find((s) => s.id === leaf);
	return section ? { chapter, section } : null;
}

/**
 * Write a top-level README.md index in .kaioken/wiki/ listing all chapters and sections.
 */
export async function writeWikiIndex(root: string, plan: WikiPlan): Promise<string> {
	const path = join(wikiDir(root), "README.md");
	await mkdir(dirname(path), { recursive: true });

	const lines: string[] = [
		"# Repository Wiki",
		"",
		`Generated by Kaioken (multiplier ×${plan.multiplier}).`,
		"",
	];

	for (const chapter of plan.chapters) {
		lines.push(`## [${chapter.title}](${chapter.id}/index.md)`);
		if (chapter.goal) lines.push(chapter.goal);
		lines.push("");
		for (const section of chapter.sections ?? []) {
			const summarySuffix = section.summary ? ` — ${section.summary}` : "";
			lines.push(`- [${section.title}](${chapter.id}/${section.id}.md)${summarySuffix}`);
		}
		if ((chapter.sections ?? []).length > 0) lines.push("");
	}

	await writeFile(path, `${lines.join("\n").trimEnd()}\n`, "utf8");
	return path;
}
