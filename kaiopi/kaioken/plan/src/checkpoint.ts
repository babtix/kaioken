import { parse, parseDocument, stringify } from "yaml";
import type { ScanResult } from "@kaioken/scan";
import type { Module, ModulePlan } from "./types.ts";
import { validatePlan } from "./validate.ts";

export interface PurposeLintFinding {
	moduleId: string;
	kind: "too_short" | "tautological" | "placeholder" | "duplicate" | "run_on";
	message: string;
	suggestion?: string;
}

export interface CheckpointDiagnostic {
	severity: "error" | "warning";
	message: string;
	line?: number;
	col?: number;
	moduleId?: string;
}

export interface CheckpointReport {
	valid: boolean;
	plan: ModulePlan | null;
	diagnostics: CheckpointDiagnostic[];
	purposeFindings: PurposeLintFinding[];
	moduleCount: number;
	totalFiles: number;
}

const PLACEHOLDER_TERMS = ["todo", "tbd", "fixme", "n/a", "placeholder", "...", "test", "structural module for"];

/**
 * Lints module purpose statements to ensure concise, non-repetitive descriptions (UX-1241–UX-1250).
 */
export function lintModulePurposes(modules: Module[]): PurposeLintFinding[] {
	const findings: PurposeLintFinding[] = [];
	const seenPurposes = new Map<string, string>();

	for (const mod of modules) {
		const purpose = mod.purpose ? mod.purpose.trim() : "";
		const lowerPurpose = purpose.toLowerCase();
		const lowerName = mod.name.toLowerCase();
		const lowerId = mod.id.toLowerCase();

		// 1. Missing or too short (< 10 chars or single word)
		if (purpose.length === 0) {
			findings.push({
				moduleId: mod.id,
				kind: "too_short",
				message: `Module "${mod.id}" has no purpose statement.`,
				suggestion: `Describe what code in "${mod.id}" is for and why it exists.`,
			});
			continue;
		}

		if (purpose.length < 10 || !purpose.includes(" ")) {
			findings.push({
				moduleId: mod.id,
				kind: "too_short",
				message: `Purpose for module "${mod.id}" is too brief ("${purpose}").`,
				suggestion: "Write at least one full sentence describing the module's responsibility.",
			});
		}

		// 2. Tautological: restates the module name or ID
		if (
			lowerPurpose === lowerId ||
			lowerPurpose === lowerName ||
			lowerPurpose === `${lowerId} module` ||
			lowerPurpose === `module for ${lowerId}` ||
			lowerPurpose === `module for ${lowerName}` ||
			lowerPurpose === `${lowerName} module`
		) {
			findings.push({
				moduleId: mod.id,
				kind: "tautological",
				message: `Purpose for module "${mod.id}" restates its name ("${purpose}").`,
				suggestion: "Explain the architectural role or capabilities rather than repeating the name.",
			});
		}

		// 3. Placeholders
		for (const term of PLACEHOLDER_TERMS) {
			if (
				lowerPurpose === term ||
				lowerPurpose.startsWith(`${term} `) ||
				lowerPurpose.startsWith(`${term}:`) ||
				lowerPurpose.includes(`[${term}]`) ||
				lowerPurpose.includes(term)
			) {
				findings.push({
					moduleId: mod.id,
					kind: "placeholder",
					message: `Purpose for module "${mod.id}" contains placeholder text ("${purpose}").`,
					suggestion: "Replace placeholder with a real description of module responsibilities.",
				});
				break;
			}
		}

		// 4. Duplicate purpose across multiple modules
		if (purpose.length > 0) {
			const previousId = seenPurposes.get(lowerPurpose);
			if (previousId) {
				findings.push({
					moduleId: mod.id,
					kind: "duplicate",
					message: `Module "${mod.id}" has the exact same purpose as module "${previousId}".`,
					suggestion: "Differentiate the purpose statements to clarify distinct responsibilities.",
				});
			} else {
				seenPurposes.set(lowerPurpose, mod.id);
			}
		}

		// 5. Run-on description (> 300 chars without sentence punctuation)
		if (purpose.length > 300 && !/[.!?]/.test(purpose)) {
			findings.push({
				moduleId: mod.id,
				kind: "run_on",
				message: `Purpose for module "${mod.id}" is a run-on paragraph (${purpose.length} chars) without punctuation.`,
				suggestion: "Condense to 1–2 crisp sentences.",
			});
		}
	}

	return findings;
}

/**
 * Validates a human-edited YAML module checkpoint file with syntax and schema checking (UX-1221–UX-1230).
 */
export function validateYamlCheckpoint(yamlContent: string, scan?: ScanResult): CheckpointReport {
	const diagnostics: CheckpointDiagnostic[] = [];

	// 1. Parse YAML with syntax position tracking
	let parsedDoc: ReturnType<typeof parseDocument>;
	try {
		parsedDoc = parseDocument(yamlContent);
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : String(err);
		diagnostics.push({
			severity: "error",
			message: `YAML syntax parse error: ${message}`,
		});
		return {
			valid: false,
			plan: null,
			diagnostics,
			purposeFindings: [],
			moduleCount: 0,
			totalFiles: 0,
		};
	}

	if (parsedDoc.errors && parsedDoc.errors.length > 0) {
		for (const e of parsedDoc.errors) {
			const [line, col] = e.linePos ? [e.linePos[0].line, e.linePos[0].col] : [undefined, undefined];
			diagnostics.push({
				severity: "error",
				message: `YAML syntax error: ${e.message}`,
				line,
				col,
			});
		}
		return {
			valid: false,
			plan: null,
			diagnostics,
			purposeFindings: [],
			moduleCount: 0,
			totalFiles: 0,
		};
	}

	const raw = parsedDoc.toJS();
	if (!raw || typeof raw !== "object") {
		diagnostics.push({
			severity: "error",
			message: "YAML checkpoint root must be a mapping object.",
		});
		return {
			valid: false,
			plan: null,
			diagnostics,
			purposeFindings: [],
			moduleCount: 0,
			totalFiles: 0,
		};
	}

	// 2. Validate top-level schema
	const source = raw as Record<string, unknown>;

	if (source.version !== 1) {
		diagnostics.push({
			severity: "warning",
			message: `Expected "version: 1", found "${source.version}". Checkpoint format version should be 1.`,
		});
	}

	if (source.multiplier !== undefined && (typeof source.multiplier !== "number" || source.multiplier < 1)) {
		diagnostics.push({
			severity: "warning",
			message: `"multiplier" must be a positive integer (e.g. 1..10), found "${source.multiplier}".`,
		});
	}

	if (!Array.isArray(source.modules)) {
		diagnostics.push({
			severity: "error",
			message: 'Checkpoint must contain a "modules" list.',
		});
		return {
			valid: false,
			plan: null,
			diagnostics,
			purposeFindings: [],
			moduleCount: 0,
			totalFiles: 0,
		};
	}

	// 3. Validate modules
	const seenIds = new Set<string>();
	const modules: Module[] = [];
	let totalFiles = 0;

	for (let i = 0; i < source.modules.length; i++) {
		const rawMod = source.modules[i];
		if (!rawMod || typeof rawMod !== "object") {
			diagnostics.push({
				severity: "error",
				message: `Module at index [${i}] is not an object.`,
			});
			continue;
		}

		const m = rawMod as Record<string, unknown>;

		// Check id
		if (typeof m.id !== "string" || !m.id.trim()) {
			diagnostics.push({
				severity: "error",
				message: `Module at index [${i}] is missing a required "id".`,
			});
			continue;
		}

		const id = m.id.trim().toLowerCase();
		if (seenIds.has(id)) {
			diagnostics.push({
				severity: "error",
				moduleId: id,
				message: `Duplicate module id "${id}" found at index [${i}]. Module IDs must be unique.`,
			});
		}
		seenIds.add(id);

		// Check common typo: singular "file:" instead of "files:"
		if (m.file && !m.files) {
			diagnostics.push({
				severity: "warning",
				moduleId: id,
				message: `Module "${id}" uses singular "file:" instead of "files:".`,
			});
		}

		let files: string[] = [];
		if (Array.isArray(m.files)) {
			files = (m.files as unknown[])
				.filter((f): f is string => typeof f === "string")
				.map((f) => f.trim().split("\\").join("/"))
				.filter(Boolean);
		} else if (typeof m.files === "string") {
			diagnostics.push({
				severity: "warning",
				moduleId: id,
				message: `Module "${id}" specifies "files:" as a single string instead of a YAML list.`,
			});
			files = [m.files.trim().split("\\").join("/")];
		} else if (typeof m.file === "string") {
			files = [m.file.trim().split("\\").join("/")];
		}

		totalFiles += files.length;

		const modObj: Module = {
			id,
			name: typeof m.name === "string" && m.name.trim() ? m.name.trim() : id,
			purpose: typeof m.purpose === "string" ? m.purpose.trim() : "",
			files,
		};
		modules.push(modObj);
	}

	const plan: ModulePlan = {
		version: 1,
		generatedAt: typeof source.generatedAt === "string" ? source.generatedAt : new Date().toISOString(),
		multiplier: typeof source.multiplier === "number" ? source.multiplier : 1,
		modules,
		source: source.source === "model" || source.source === "heuristic" ? source.source : "heuristic",
	};

	// 4. Run purpose linter
	const purposeFindings = lintModulePurposes(modules);

	// 5. If scan provided, validate against repository scan
	if (scan) {
		const planVal = validatePlan(plan, scan);
		for (const def of planVal.defects) {
			diagnostics.push({
				severity: def.severity,
				moduleId: def.moduleId,
				message: def.message,
			});
		}
	}

	const hasErrors = diagnostics.some((d) => d.severity === "error");

	return {
		valid: !hasErrors,
		plan,
		diagnostics,
		purposeFindings,
		moduleCount: modules.length,
		totalFiles,
	};
}

/**
 * Automatically repairs common human-editing mistakes in YAML checkpoints.
 */
export function repairYamlCheckpoint(yamlContent: string): { repairedYaml: string; repairs: string[] } {
	const repairs: string[] = [];
	let text = yamlContent;

	// Fix singular `file: "path"` to `files:\n  - "path"`
	const singularFixed = text.replace(
		/^(\s*)file:\s*["']?([^"\n\r]+)["']?$/gm,
		(match, indent, path) => {
			repairs.push("converted_singular_file_to_files_list");
			return `${indent}files:\n${indent}  - ${path.trim()}`;
		},
	);
	text = singularFixed;

	// Parse to verify and re-serialize cleanly
	try {
		const doc = parse(text);
		if (doc && typeof doc === "object" && Array.isArray((doc as Record<string, unknown>).modules)) {
			const modules = (doc as Record<string, unknown>).modules as Record<string, unknown>[];
			for (const m of modules) {
				if (typeof m.files === "string") {
					m.files = [m.files];
					repairs.push("converted_string_files_to_array");
				}
				if (typeof m.id === "string") {
					const cleanId = m.id.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
					if (cleanId !== m.id) {
						m.id = cleanId;
						repairs.push("kebab_cased_module_id");
					}
				}
			}
			text = stringify(doc, { lineWidth: 92, defaultKeyType: "PLAIN" });
		}
	} catch {
		// return partial repair if parse fails
	}

	return { repairedYaml: text, repairs: [...new Set(repairs)] };
}

/**
 * Formats a terminal-friendly diagnostic report for a checkpoint.
 */
export function formatCheckpointReport(report: CheckpointReport): string {
	const lines: string[] = [];
	const statusBadge = report.valid ? "✓ VALID CHECKPOINT" : "✗ INVALID CHECKPOINT";

	lines.push(`┌─────────────────────────────────────────────────────────────┐`);
	lines.push(`│ ${statusBadge.padEnd(59)} │`);
	lines.push(
		`│ Modules: ${report.moduleCount.toString().padEnd(4)} | Total Assigned Files: ${report.totalFiles.toString().padEnd(5)} | Errors: ${report.diagnostics.filter((d) => d.severity === "error").length.toString().padEnd(3)} │`,
	);
	lines.push(`└─────────────────────────────────────────────────────────────┘`);

	if (report.diagnostics.length > 0) {
		lines.push("\nDiagnostics:");
		for (const d of report.diagnostics) {
			const pos = d.line ? `[line ${d.line}${d.col ? `:${d.col}` : ""}] ` : "";
			const mod = d.moduleId ? `(${d.moduleId}) ` : "";
			const icon = d.severity === "error" ? "❌" : "⚠️";
			lines.push(`  ${icon} ${pos}${mod}${d.message}`);
		}
	}

	if (report.purposeFindings.length > 0) {
		lines.push("\nPurpose Lint Findings:");
		for (const p of report.purposeFindings) {
			lines.push(`  💡 [${p.moduleId}] ${p.message}`);
			if (p.suggestion) {
				lines.push(`     Suggestion: ${p.suggestion}`);
			}
		}
	}

	return lines.join("\n");
}
