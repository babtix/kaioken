import type { IndexResult } from "@kaioken/index";
import type { ScanResult } from "@kaioken/scan";
import { gatherEvidence, type RepositoryEvidence } from "./evidence.js";
import { type Depth, depthFor, extractJson, type ModelClient } from "@kaioken/model";
import type { Module, ModulePlan, PlanValidation } from "./types.js";
import { expandDirectories, validatePlan } from "./validate.js";

const SYSTEM = `You decompose a repository into modules for a documentation pipeline.

A module is a coherent unit of purpose, not a directory listing. Group by what
code is for; split a directory that does two jobs, and merge directories that
serve one.

Rules:
- Use only file paths given in the evidence. Never invent one.
- Every file you assign must appear verbatim in the evidence.
- Prefer a shallow tree. Nest only when a parent genuinely has sub-parts.
- Purpose is one or two sentences saying what the module is for and why it
  exists. Do not restate the module name.
- It is correct to leave peripheral files unassigned. Coverage is not the goal.

Reply with JSON only:
{"modules":[{"id":"kebab-case-id","name":"Human Name","purpose":"...","files":["path"],"children":[]}]}`;

export interface ProposeResult {
	plan: ModulePlan;
	validation: PlanValidation;
	evidence: RepositoryEvidence;
	/** Raw reply, kept so a failed run is inspectable rather than opaque. */
	reply: string;
}

/**
 * Propose a module plan.
 *
 * Evidence first, model second: the repository is summarised deterministically,
 * the model is asked to interpret that summary, and the answer is then checked
 * back against the scan. The model never sees the filesystem and never decides
 * what exists.
 */
export async function proposeModulePlan(
	scan: ScanResult,
	index: IndexResult | null,
	client: ModelClient,
	options: { multiplier?: number } = {},
): Promise<ProposeResult> {
	const depth = depthFor(options.multiplier ?? 1);
	const evidence = gatherEvidence(scan, index);

	const reply = await client.complete({
		purpose: "module-plan",
		system: SYSTEM,
		prompt: buildPrompt(evidence, depth),
		maxOutputTokens: depth.maxOutputTokens,
	});

	const parsed = extractJson<{ modules?: unknown }>(reply);
	const modules = Array.isArray(parsed.modules) ? parsed.modules.map(coerceModule) : [];

	const raw: ModulePlan = {
		version: 1,
		generatedAt: new Date().toISOString(),
		multiplier: depth.multiplier,
		modules: modules.filter((m): m is Module => m !== null),
	};

	// A directory named where a file was asked for is resolved from the scan
	// rather than rejected — the intent is unambiguous and the expansion is
	// deterministic.
	const plan = expandDirectories(raw, scan);

	return { plan, validation: validatePlan(plan, scan), evidence, reply };
}

export function buildPrompt(evidence: RepositoryEvidence, depth: Depth): string {
	const languages = Object.entries(evidence.languages)
		.sort((a, b) => b[1] - a[1])
		.slice(0, 10)
		.map(([lang, n]) => `${lang} (${n})`)
		.join(", ");

	const lines: string[] = [
		`Repository: ${evidence.fileCount} files, ${Math.round(evidence.totalBytes / 1024)} KiB.`,
		`Languages: ${languages}.`,
		"",
		`Aim for roughly ${depth.targetModules} modules. Fewer is fine if the repository is small.`,
		"",
	];

	if (evidence.readmes.length > 0) {
		lines.push(`Readme files: ${evidence.readmes.join(", ")}`);
	}
	if (evidence.entryFiles.length > 0) {
		lines.push(`Likely entry points: ${evidence.entryFiles.slice(0, 20).join(", ")}`);
	}
	lines.push("", "Directories:", "");

	for (const dir of evidence.directories) {
		lines.push(
			`${dir.path}/  (${dir.fileCount} files, ${dir.languages.slice(0, 3).join("/")}, ${dir.symbolCount} declarations)`,
		);
		if (dir.symbols.length > 0) lines.push(`  exports: ${dir.symbols.join(", ")}`);
		// The files themselves, because "files" is what the reply must contain.
		for (const file of dir.files) lines.push(`  ${file}`);
		if (dir.files.length < dir.fileCount) {
			lines.push(`  ... and ${dir.fileCount - dir.files.length} more in this directory`);
		}
	}

	lines.push(
		"",
		'Every entry in "files" must be one of the exact file paths listed above.',
		"Do not write a directory path. Do not invent a path.",
	);

	return lines.join("\n");
}

/**
 * The model's output is untrusted structure. Coercion here is deliberately
 * permissive; `validatePlan` is where the complaint gets made, because it can
 * say precisely which file does not exist rather than just "malformed".
 */
function coerceModule(raw: unknown): Module | null {
	if (!raw || typeof raw !== "object") return null;
	const source = raw as Record<string, unknown>;

	const rawId = typeof source["id"] === "string" ? source["id"] : "";
	const id = rawId.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
	if (!id) return null;

	const files = Array.isArray(source["files"])
		? (source["files"] as unknown[])
				.filter((f): f is string => typeof f === "string")
				.map((f) => f.trim().replace(/^\.\//, "").split("\\").join("/"))
				.filter(Boolean)
		: [];

	const children = Array.isArray(source["children"])
		? (source["children"] as unknown[]).map(coerceModule).filter((m): m is Module => m !== null)
		: [];

	return {
		id,
		name: typeof source["name"] === "string" && source["name"].trim() ? source["name"].trim() : id,
		purpose: typeof source["purpose"] === "string" ? source["purpose"].trim() : "",
		files,
		...(children.length > 0 ? { children } : {}),
	};
}
