import type { IndexResult } from "@kaioken/index";
import { type Depth, depthFor, extractJson, type ModelClient } from "@kaioken/model";
import type { ScanResult } from "@kaioken/scan";
import type { Chapter, Section, WikiPlan } from "./types.js";

/**
 * Pass one of the cascade: survey the whole repository and outline chapters.
 *
 * This is persisted and editable before a single chapter is written, because
 * every expensive stage gets a cheap plan in front of it — correcting an
 * outline costs nothing, correcting twelve generated chapters costs everything.
 */

const GLOBAL_SYSTEM = `You outline a technical wiki for a repository.

A chapter explains one coherent thing a reader needs to understand. Order them
so a newcomer can read straight through: what the system is, then its parts in
dependency order, then how to work on it.

Rules:
- Use only file paths given in the evidence. Never invent one.
- Each chapter states a goal: what a reader will understand after reading it.
  Not a restatement of the title.
- Assign every chapter the files it is written from. A chapter with no files
  cannot be written.
- Do not create a chapter per directory. Group by subject.

Reply with JSON only:
{"chapters":[{"id":"kebab-id","title":"Title","goal":"...","files":["path"]}]}`;

const SECTION_SYSTEM = `You plan the subsections of one wiki chapter.

You are given the whole outline for context and one chapter to detail. Split the
chapter into subsections that each answer a distinct question, and give each one
the subset of the chapter's files it is written from.

Rules:
- Use only file paths from the chapter's own file list.
- A subsection covering no files is not a subsection.
- Prefer few substantial subsections over many thin ones.

Reply with JSON only:
{"sections":[{"id":"kebab-id","title":"Title","summary":"...","files":["path"]}]}`;

export interface GlobalPlanInput {
	scan: ScanResult;
	index: IndexResult | null;
	client: ModelClient;
	multiplier?: number;
}

export async function planWiki(input: GlobalPlanInput): Promise<{ plan: WikiPlan; reply: string }> {
	const depth = depthFor(input.multiplier ?? 1);
	const reply = await input.client.complete({
		purpose: "wiki-plan",
		system: GLOBAL_SYSTEM,
		prompt: buildGlobalPrompt(input.scan, input.index, depth),
		maxOutputTokens: depth.maxOutputTokens,
	});

	const parsed = extractJson<{ chapters?: unknown }>(reply);
	const chapters = Array.isArray(parsed.chapters)
		? parsed.chapters.map(coerceChapter).filter((c): c is Chapter => c !== null)
		: [];

	return {
		plan: {
			version: 1,
			generatedAt: new Date().toISOString(),
			multiplier: depth.multiplier,
			chapters,
		},
		reply,
	};
}

export interface SectionPlanInput {
	plan: WikiPlan;
	chapter: Chapter;
	index: IndexResult | null;
	client: ModelClient;
	multiplier?: number;
	brief?: string;
}

/**
 * Pass two: detail one chapter against the global plan.
 *
 * The chapter sees the whole outline, which is what stops two chapters from
 * covering the same ground in different words.
 */
export async function planSections(input: SectionPlanInput): Promise<Section[]> {
	const depth = depthFor(input.multiplier ?? 1);

	const reply = await input.client.complete({
		purpose: "wiki-sections",
		system: SECTION_SYSTEM,
		prompt: buildSectionPrompt(input, depth),
		maxOutputTokens: depth.maxOutputTokens,
	});

	const parsed = extractJson<{ sections?: unknown }>(reply);
	const allowed = new Set(input.chapter.files);

	return Array.isArray(parsed.sections)
		? parsed.sections
				.map((raw) => coerceSection(raw, allowed))
				.filter((s): s is Section => s !== null)
		: [];
}

export function buildGlobalPrompt(
	scan: ScanResult,
	index: IndexResult | null,
	depth: Depth,
): string {
	const byDirectory = new Map<string, { files: string[]; symbols: string[] }>();

	for (const file of scan.files) {
		if (file.binary || file.risk.includes("generated") || file.risk.includes("lockfile")) continue;
		const dir = file.path.includes("/") ? file.path.slice(0, file.path.lastIndexOf("/")) : ".";
		let entry = byDirectory.get(dir);
		if (!entry) {
			entry = { files: [], symbols: [] };
			byDirectory.set(dir, entry);
		}
		entry.files.push(file.path);
	}

	for (const file of index?.files ?? []) {
		const dir = file.path.includes("/") ? file.path.slice(0, file.path.lastIndexOf("/")) : ".";
		const entry = byDirectory.get(dir);
		if (!entry) continue;
		for (const symbol of file.symbols) {
			if (symbol.exported && entry.symbols.length < 15) entry.symbols.push(symbol.name);
		}
	}

	const lines: string[] = [
		`Repository: ${scan.fileCount} files.`,
		`Aim for roughly ${depth.targetModules} chapters.`,
		"",
		"Directories, their files, and what they export:",
		"",
	];

	for (const dir of [...byDirectory.keys()].sort()) {
		const entry = byDirectory.get(dir) as { files: string[]; symbols: string[] };
		lines.push(`${dir}/`);
		if (entry.symbols.length > 0) lines.push(`  exports: ${entry.symbols.join(", ")}`);
		for (const file of entry.files.slice(0, 40).sort()) lines.push(`  ${file}`);
		if (entry.files.length > 40) lines.push(`  ... and ${entry.files.length - 40} more`);
	}

	lines.push(
		"",
		'Every entry in "files" must be one of the exact paths listed above.',
		"Do not write a directory path.",
	);

	return lines.join("\n");
}

function buildSectionPrompt(
	input: SectionPlanInput,
	depth: Depth,
): string {
	const byPath = new Map((input.index?.files ?? []).map((f) => [f.path, f]));

	const lines: string[] = [];

	if (input.brief) {
		lines.push("Architecture brief (canonical terminology and high-level structure):", "", input.brief, "");
	}

	lines.push(
		"The full outline, for context:",
		"",
		...input.plan.chapters.map((c) => `- ${c.id}: ${c.title} — ${c.goal}`),
		"",
		`Detail this chapter: ${input.chapter.id} — ${input.chapter.title}`,
		`Goal: ${input.chapter.goal}`,
		"",
		`Aim for ${Math.max(2, Math.round(depth.keyPoints / 2))} subsections.`,
		"",
		"Its files, with what they declare:",
		"",
	);

	for (const path of input.chapter.files) {
		const file = byPath.get(path);
		lines.push(`--- ${path}`);
		if (!file) {
			lines.push("  (no declarations indexed)");
			continue;
		}
		for (const symbol of file.symbols.slice(0, depth.declarationsPerFile)) {
			lines.push(`  ${symbol.exported ? "+" : "-"} ${symbol.name} — ${symbol.signature}`);
		}
	}

	return lines.join("\n");
}

function coerceChapter(raw: unknown): Chapter | null {
	if (!raw || typeof raw !== "object") return null;
	const source = raw as Record<string, unknown>;
	const id = slug(typeof source["id"] === "string" ? source["id"] : "");
	if (!id) return null;

	return {
		id,
		title: text(source["title"]) || id,
		goal: text(source["goal"]),
		files: paths(source["files"]),
	};
}

function coerceSection(raw: unknown, allowed: ReadonlySet<string>): Section | null {
	if (!raw || typeof raw !== "object") return null;
	const source = raw as Record<string, unknown>;
	const id = slug(typeof source["id"] === "string" ? source["id"] : "");
	if (!id) return null;

	// A subsection may only draw on its chapter's files. Silently widening the
	// scope would let the section plan overrule the global plan.
	const files = paths(source["files"]).filter((path) => allowed.has(path));
	if (files.length === 0) return null;

	return { id, title: text(source["title"]) || id, summary: text(source["summary"]), files };
}

function slug(raw: string): string {
	return raw
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9._-]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

function text(raw: unknown): string {
	return typeof raw === "string" ? raw.trim() : "";
}

function paths(raw: unknown): string[] {
	return Array.isArray(raw)
		? (raw as unknown[])
				.filter((f): f is string => typeof f === "string")
				.map((f) => f.trim().replace(/^\.\//, "").split("\\").join("/"))
				.filter(Boolean)
		: [];
}
