import type { IndexResult } from "@kaioken/index";
import type { ScanResult } from "@kaioken/scan";
import { type Depth, depthFor, extractJson, type ModelClient } from "@kaioken/modelport";
import { gatherEvidence, type RepositoryEvidence } from "./evidence.ts";
import type { Module, ModulePlan, PlanValidation } from "./types.ts";
import { expandDirectories, validatePlan } from "./validate.ts";

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
	source: "model" | "heuristic";
}

/**
 * Propose a module plan.
 *
 * Evidence first, model second: the repository is summarised deterministically,
 * the model is asked to interpret that summary, and the answer is then checked
 * back against the scan. If no model is provided or model completion fails,
 * a deterministic structural clustering fallback groups files by directory/package.
 */
export async function proposeModulePlan(
	scan: ScanResult,
	index: IndexResult | null,
	client?: ModelClient | null,
	options: { multiplier?: number } = {},
): Promise<ProposeResult> {
	const depth = depthFor(options.multiplier ?? 1);
	const evidence = gatherEvidence(scan, index);

	let reply = "";
	let modules: (Module | null)[] = [];
	let source: "model" | "heuristic" = "model";

	if (!client) {
		source = "heuristic";
		modules = proposeHeuristicModules(scan, evidence);
	} else {
		try {
			reply = await client.complete({
				purpose: "module-plan",
				system: SYSTEM,
				prompt: buildPrompt(evidence, depth),
				maxOutputTokens: depth.maxOutputTokens,
			});
			const parsed = extractJson<{ modules?: unknown }>(reply);
			modules = Array.isArray(parsed.modules) ? parsed.modules.map(coerceModule) : [];
		} catch {
			source = "heuristic";
			modules = proposeHeuristicModules(scan, evidence);
		}
	}

	const raw: ModulePlan = {
		version: 1,
		generatedAt: new Date().toISOString(),
		multiplier: depth.multiplier,
		modules: modules.filter((m): m is Module => m !== null),
		source,
	};
	// A directory named where a file was asked for is resolved from the scan
	// rather than rejected — the intent is unambiguous and the expansion is
	// deterministic.
	const plan = expandDirectories(raw, scan);

	return { plan, validation: validatePlan(plan, scan), evidence, reply, source };
}

/**
 * Deterministic structural clustering fallback when no model is available or model completion fails.
 * Groups files by package boundaries (e.g. packages/foo, kaioken/plan) or top-level directories.
 */
export function proposeHeuristicModules(scan: ScanResult, _evidence?: RepositoryEvidence): Module[] {
	const eligibleFiles = scan.files.filter(
		(f) => !f.binary && !f.risk.includes("generated") && !f.risk.includes("lockfile"),
	);
	if (eligibleFiles.length === 0) {
		return [];
	}

	const groups = new Map<string, string[]>();
	const monorepoPrefixes = new Set(["packages", "crates", "modules", "libs", "services", "apps", "kaioken"]);

	for (const file of eligibleFiles) {
		const normalized = file.path.split("\\").join("/");
		const parts = normalized.split("/");
		let groupKey: string;
		if (parts.length === 1) {
			groupKey = "root";
		} else if (parts.length > 2 && monorepoPrefixes.has(parts[0]!.toLowerCase())) {
			groupKey = `${parts[0]}/${parts[1]}`;
		} else {
			groupKey = parts[0]!;
		}

		let list = groups.get(groupKey);
		if (!list) {
			list = [];
			groups.set(groupKey, list);
		}
		list.push(normalized);
	}

	const modules: Module[] = [];
	for (const [groupKey, files] of groups.entries()) {
		const id = groupKey.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
		const name = groupKey
			.split(/[/_-]+/)
			.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
			.join(" ");
		modules.push({
			id: id || "module",
			name: name || groupKey,
			purpose: `Structural module for ${groupKey}`,
			files: files.sort(),
		});
	}

	return modules;
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

	const rawId = typeof source.id === "string" ? source.id : "";
	const id = rawId
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9._-]+/g, "-")
		.replace(/^-+|-+$/g, "");
	if (!id) return null;

	const files = Array.isArray(source.files)
		? (source.files as unknown[])
				.filter((f): f is string => typeof f === "string")
				// Separators first, then the `./` prefix: doing it the other way
				// round leaves `.\src\a.ts` as `./src/a.ts`, because `.\` never
				// matches a leading `./`.
				.map((f) => f.trim().split("\\").join("/").replace(/^\.\//, ""))
				.filter(Boolean)
		: [];

	const children = Array.isArray(source.children)
		? (source.children as unknown[]).map(coerceModule).filter((m): m is Module => m !== null)
		: [];

	return {
		id,
		name: typeof source.name === "string" && source.name.trim() ? source.name.trim() : id,
		purpose: typeof source.purpose === "string" ? source.purpose.trim() : "",
		files,
		...(children.length > 0 ? { children } : {}),
	};
}
