/**
 * 10 Canonical Autonomous Procedures (Category 18: Step 33, UX-1751 to UX-1800).
 */
export type ProcedureKind =
	| "db-migration"
	| "code-lint"
	| "deploy-checklist"
	| "dev-setup"
	| "test-triage"
	| "security-audit"
	| "git-rebase"
	| "api-docgen"
	| "perf-flamegraph"
	| "incident-rollback";

export const ALL_PROCEDURE_KINDS: readonly ProcedureKind[] = [
	"db-migration",
	"code-lint",
	"deploy-checklist",
	"dev-setup",
	"test-triage",
	"security-audit",
	"git-rebase",
	"api-docgen",
	"perf-flamegraph",
	"incident-rollback",
] as const;

export function isProcedureKind(val: unknown): val is ProcedureKind {
	return typeof val === "string" && (ALL_PROCEDURE_KINDS as readonly string[]).includes(val);
}

export interface ProcedureParameter {
	name: string;
	type: "string" | "number" | "boolean" | "choice";
	description: string;
	required: boolean;
	defaultValue?: unknown;
	choices?: string[];
	validationRegex?: string;
}

export interface ProcedureMeta {
	kind: ProcedureKind;
	name: string;
	title: string;
	defaultNamespace: string;
	description: string;
	defaultTriggers: string[];
	fileExtensions: string[];
	typicalVerificationCommands: string[];
	parameters: ProcedureParameter[];
}

export const PROCEDURE_METADATA: Record<ProcedureKind, ProcedureMeta> = {
	"db-migration": {
		kind: "db-migration",
		name: "db-migrate",
		title: "Database Migration Execution Procedure",
		defaultNamespace: "repo",
		description: "Apply, verify, and document transactional database migrations across environments.",
		defaultTriggers: ["migration", "prisma", "flyway", "liquibase", "schema.sql", "migrate"],
		fileExtensions: [".sql", ".prisma"],
		typicalVerificationCommands: ["prisma migrate status", "npm run db:check", "pg_isready"],
		parameters: [
			{ name: "env", type: "choice", description: "Target execution environment", required: true, defaultValue: "development", choices: ["development", "staging", "production"] },
			{ name: "dryRun", type: "boolean", description: "Simulate migration without committing changes", required: false, defaultValue: true },
			{ name: "migrationName", type: "string", description: "Optional name of specific migration", required: false },
		],
	},
	"code-lint": {
		kind: "code-lint",
		name: "code-lint-repair",
		title: "Code Lint & Formatting Repair Procedure",
		defaultNamespace: "repo",
		description: "Scan, auto-fix, and verify source code formatting and static analysis rules.",
		defaultTriggers: ["lint", "format", "biome", "eslint", "prettier", "style"],
		fileExtensions: [".ts", ".js", ".tsx", ".jsx", ".json"],
		typicalVerificationCommands: ["npm run lint", "npx biome check", "npx eslint ."],
		parameters: [
			{ name: "autoFix", type: "boolean", description: "Automatically fix safe lint violations", required: false, defaultValue: true },
			{ name: "targetPath", type: "string", description: "Subdirectory or file pattern to inspect", required: false, defaultValue: "." },
		],
	},
	"deploy-checklist": {
		kind: "deploy-checklist",
		name: "release-deploy",
		title: "Production Deployment Release Checklist",
		defaultNamespace: "ops",
		description: "Enforce pre-flight verification, artifact hashes, and post-deployment health probes.",
		defaultTriggers: ["deploy", "release", "production", "tag", "checklist", "publish"],
		fileExtensions: [".yaml", ".yml", ".dockerfile", "Dockerfile"],
		typicalVerificationCommands: ["git status --porcelain", "npm run check:kaioken", "docker compose config"],
		parameters: [
			{ name: "version", type: "string", description: "Semantic release version tag", required: true, validationRegex: "^v?[0-9]+\\.[0-9]+\\.[0-9]+.*$" },
			{ name: "skipTests", type: "boolean", description: "Override test gate (strongly discouraged)", required: false, defaultValue: false },
		],
	},
	"dev-setup": {
		kind: "dev-setup",
		name: "local-setup",
		title: "Local Development Environment Setup Procedure",
		defaultNamespace: "dev",
		description: "Bootstrap local dependencies, environment variables, local databases, and dev daemons.",
		defaultTriggers: ["setup", "onboard", "install", "init", "env", "bootstrap"],
		fileExtensions: [".env.example", "package.json", "Makefile"],
		typicalVerificationCommands: ["node -v", "npm -v", "npm run build"],
		parameters: [
			{ name: "includeSeedData", type: "boolean", description: "Seed local database with dummy records", required: false, defaultValue: true },
			{ name: "port", type: "number", description: "Local development server port", required: false, defaultValue: 3000 },
		],
	},
	"test-triage": {
		kind: "test-triage",
		name: "test-triage",
		title: "Integration Test Execution & Triage Procedure",
		defaultNamespace: "test",
		description: "Execute test matrices, isolate flakes, and generate reproducible failure reports.",
		defaultTriggers: ["test", "vitest", "jest", "pytest", "spec", "triage"],
		fileExtensions: [".test.ts", ".spec.ts", ".test.js", "_test.go"],
		typicalVerificationCommands: ["npm test", "vitest run", "npx jest --bail"],
		parameters: [
			{ name: "filter", type: "string", description: "Test name or pattern regex filter", required: false },
			{ name: "maxRetries", type: "number", description: "Number of retries for flaky test detection", required: false, defaultValue: 2 },
		],
	},
	"security-audit": {
		kind: "security-audit",
		name: "sec-audit",
		title: "Dependency Security Audit & Patch Procedure",
		defaultNamespace: "sec",
		description: "Inspect SBOM, query CVE advisories, and apply non-breaking security patches.",
		defaultTriggers: ["audit", "cve", "vulnerability", "dependabot", "security", "patch"],
		fileExtensions: ["package-lock.json", "pnpm-lock.yaml", "yarn.lock"],
		typicalVerificationCommands: ["npm audit", "pnpm audit --audit-level=high"],
		parameters: [
			{ name: "severityThreshold", type: "choice", description: "Minimum vulnerability level to block on", required: false, defaultValue: "moderate", choices: ["low", "moderate", "high", "critical"] },
			{ name: "autoUpdatePatch", type: "boolean", description: "Auto-upgrade packages with patch versions", required: false, defaultValue: false },
		],
	},
	"git-rebase": {
		kind: "git-rebase",
		name: "git-rebase-sync",
		title: "Git Branch Rebase & Conflict Resolution Procedure",
		defaultNamespace: "repo",
		description: "Safely rebase feature branches against trunk with automated three-way merge triage.",
		defaultTriggers: ["rebase", "conflict", "merge", "git", "cherry-pick", "branch"],
		fileExtensions: [".git"],
		typicalVerificationCommands: ["git status", "git diff --check", "git log -n 1"],
		parameters: [
			{ name: "baseBranch", type: "string", description: "Target upstream branch to rebase onto", required: true, defaultValue: "origin/master" },
			{ name: "interactive", type: "boolean", description: "Prompt confirmation before each conflict resolution", required: false, defaultValue: true },
		],
	},
	"api-docgen": {
		kind: "api-docgen",
		name: "api-docgen",
		title: "API Documentation Generation Recipe",
		defaultNamespace: "doc",
		description: "Extract OpenAPI schemas and AST route signatures into living markdown docs.",
		defaultTriggers: ["openapi", "swagger", "api-doc", "routes", "endpoint", "docgen"],
		fileExtensions: [".json", ".yaml", "routes.ts"],
		typicalVerificationCommands: ["npx @kaioken/wiki check", "openapi-generator validate"],
		parameters: [
			{ name: "format", type: "choice", description: "Output documentation format", required: false, defaultValue: "markdown", choices: ["markdown", "html", "json"] },
			{ name: "outputDir", type: "string", description: "Target destination directory", required: false, defaultValue: "./docs/api" },
		],
	},
	"perf-flamegraph": {
		kind: "perf-flamegraph",
		name: "perf-flamegraph",
		title: "Performance Profiling & Flamegraph Recipe",
		defaultNamespace: "perf",
		description: "Capture V8 / CPU sampling profiles, detect event-loop stalls, and render flamegraphs.",
		defaultTriggers: ["flamegraph", "profile", "perf", "cpu", "memory-leak", "bottleneck"],
		fileExtensions: [".cpuprofile", ".heapsnapshot"],
		typicalVerificationCommands: ["node --prof", "0x -v"],
		parameters: [
			{ name: "durationSeconds", type: "number", description: "Profiling sample capture duration in seconds", required: false, defaultValue: 30 },
			{ name: "targetEndpoint", type: "string", description: "URL or command to load test", required: false, defaultValue: "http://localhost:3000" },
		],
	},
	"incident-rollback": {
		kind: "incident-rollback",
		name: "incident-rollback",
		title: "Incident Response Rollback Runbook",
		defaultNamespace: "ops",
		description: "Emergency rollback runbook isolating broken releases and restoring known-good state.",
		defaultTriggers: ["rollback", "incident", "outage", "emergency", "revert", "hotfix"],
		fileExtensions: [".env", "k8s/"],
		typicalVerificationCommands: ["git log -n 2", "curl -sf http://localhost:3000/health"],
		parameters: [
			{ name: "targetVersion", type: "string", description: "Known-good commit SHA or release tag to restore", required: true },
			{ name: "reason", type: "string", description: "Incident tracking ticket or brief rationale", required: true },
		],
	},
};

// ============================================================================
// THEME 1: Duplicate Skill Name Collision Resolver (UX-1751 to UX-1760)
// ============================================================================

export interface SkillCandidate {
	name: string;
	namespace?: string;
	source: "repo" | "user" | "builtin" | "plugin";
	path: string;
	procedureKind?: ProcedureKind;
}

export interface CollisionWarning {
	skillName: string;
	collidingSources: string[];
	assignedNamespace: string;
	visualWarning: string;
}

export interface CollisionResolutionResult {
	hasCollisions: boolean;
	totalSkills: number;
	resolvedSkills: Array<SkillCandidate & { qualifiedName: string }>;
	warnings: CollisionWarning[];
}

export function resolveSkillNameCollisions(
	skills: readonly SkillCandidate[],
	options: { preferredSource?: "repo" | "user" | "builtin" } = {},
): CollisionResolutionResult {
	const byName = new Map<string, SkillCandidate[]>();

	for (const sk of skills) {
		const list = byName.get(sk.name) ?? [];
		list.push(sk);
		byName.set(sk.name, list);
	}

	const warnings: CollisionWarning[] = [];
	const resolvedSkills: Array<SkillCandidate & { qualifiedName: string }> = [];

	for (const [name, candidates] of byName.entries()) {
		if (candidates.length === 1) {
			const c = candidates[0]!;
			const ns = c.namespace ?? c.source;
			resolvedSkills.push({ ...c, qualifiedName: `${ns}:${name}` });
			continue;
		}

		// Collision detected!
		const collidingSources = candidates.map((c) => `${c.source} (${c.path})`);
		const preferred = options.preferredSource ?? "repo";
		const primary = candidates.find((c) => c.source === preferred) ?? candidates[0]!;
		const assignedNamespace = primary.namespace ?? primary.source;

		const visualWarning = [
			`[NAMESPACE COLLISION] Skill "${name}" declared in ${candidates.length} sources:`,
			...candidates.map((c) => `  - [${c.source}] ${c.path} -> qualified as "${c.namespace ?? c.source}:${name}"`),
			`  -> Defaulting to "${assignedNamespace}:${name}" per resolution priority.`,
		].join("\n");

		warnings.push({
			skillName: name,
			collidingSources,
			assignedNamespace,
			visualWarning,
		});

		for (const c of candidates) {
			const ns = c.namespace ?? c.source;
			resolvedSkills.push({ ...c, qualifiedName: `${ns}:${name}` });
		}
	}

	return {
		hasCollisions: warnings.length > 0,
		totalSkills: skills.length,
		resolvedSkills,
		warnings,
	};
}

export function formatNamespaceCollisionWarning(
	result: CollisionResolutionResult,
	options: { unicode?: boolean } = {},
): string {
	const u = options.unicode ?? true;
	if (!result.hasCollisions) {
		return u ? "✔ No skill name collisions detected across namespaces." : "OK: No skill name collisions detected.";
	}

	const icon = u ? "⚠ " : "WARNING: ";
	const border = u ? "─".repeat(74) : "-".repeat(74);
	const lines = [
		`${icon}Skill Namespace Collisions Detected (${result.warnings.length} conflicts)`,
		border,
	];

	for (const w of result.warnings) {
		lines.push(w.visualWarning);
		lines.push(border);
	}

	return lines.join("\n");
}

// ============================================================================
// THEME 2: Verification Command Tester Confirming Executable Recipes (UX-1761 to UX-1770)
// ============================================================================

export interface CommandTestResult {
	command: string;
	executable: string;
	isKnownRunner: boolean;
	isDestructive: boolean;
	hasNetworkCall: boolean;
	syntaxValid: boolean;
	status: "valid" | "warning" | "error";
	issues: string[];
	recommendations: string[];
}

const DESTRUCTIVE_PATTERNS = [
	/\brm\s+(-rf?|-fr)\s+(\/|\*)/,
	/\bdrop\s+database\b/i,
	/\bformat\s+[a-z]:/i,
	/\btruncate\s+table\b/i,
	/:(){ :|:& };:/,
];

const NETWORK_PATTERNS = [
	/\bcurl\b/,
	/\bwget\b/,
	/\bfetch\b/,
	/\bssh\b/,
	/\bgit\s+(clone|fetch|pull|push)\b/,
	/\bnpm\s+(publish|login)\b/,
];

const KNOWN_EXECUTABLES = new Set([
	"npm", "npx", "pnpm", "yarn", "bun", "deno", "node", "git", "prisma", "vitest",
	"jest", "docker", "docker-compose", "python", "python3", "pytest", "cargo", "go",
	"make", "curl", "0x", "biome", "eslint", "prettier",
]);

export function testVerificationCommand(
	command: string,
	options: { disallowNetwork?: boolean; procedureKind?: ProcedureKind } = {},
): CommandTestResult {
	const trimmed = command.trim();
	if (!trimmed) {
		return {
			command: "",
			executable: "",
			isKnownRunner: false,
			isDestructive: false,
			hasNetworkCall: false,
			syntaxValid: false,
			status: "error",
			issues: ["Empty verification command provided"],
			recommendations: ["Specify an executable verification command string"],
		};
	}

	const parts = trimmed.split(/\s+/);
	const executable = parts[0]!.toLowerCase();
	const isKnownRunner = KNOWN_EXECUTABLES.has(executable);

	const issues: string[] = [];
	const recommendations: string[] = [];

	let isDestructive = false;
	for (const pat of DESTRUCTIVE_PATTERNS) {
		if (pat.test(trimmed)) {
			isDestructive = true;
			issues.push(`Command contains destructive pattern: ${pat}`);
			recommendations.push("Remove destructive parameters or isolate behind explicit confirmation flags");
		}
	}

	let hasNetworkCall = false;
	for (const pat of NETWORK_PATTERNS) {
		if (pat.test(trimmed)) {
			hasNetworkCall = true;
			if (options.disallowNetwork) {
				issues.push("Offline mode active: command attempts external network access");
				recommendations.push("Use local mock fixtures or cached artifacts instead of network requests");
			}
		}
	}

	if (!isKnownRunner) {
		recommendations.push(`Executable "${executable}" is not in standard repository runner whitelist`);
	}

	let status: "valid" | "warning" | "error" = "valid";
	if (isDestructive || (hasNetworkCall && options.disallowNetwork)) {
		status = "error";
	} else if (!isKnownRunner || issues.length > 0) {
		status = "warning";
	}

	return {
		command: trimmed,
		executable,
		isKnownRunner,
		isDestructive,
		hasNetworkCall,
		syntaxValid: true,
		status,
		issues,
		recommendations,
	};
}

export function formatCommandVerificationReport(
	result: CommandTestResult,
	options: { unicode?: boolean } = {},
): string {
	const u = options.unicode ?? true;
	const icon = result.status === "valid" ? (u ? "✔ " : "[PASS] ") : result.status === "warning" ? (u ? "⚠ " : "[WARN] ") : (u ? "✖ " : "[FAIL] ");

	const lines = [
		`${icon}Verification Command Test: "${result.command}"`,
		`  Executable: ${result.executable} (Known: ${result.isKnownRunner ? "Yes" : "No"}) | Destructive: ${result.isDestructive ? "YES" : "No"} | Network: ${result.hasNetworkCall ? "Yes" : "No"}`,
	];

	if (result.issues.length > 0) {
		lines.push("  Issues:");
		for (const iss of result.issues) lines.push(`    - ${iss}`);
	}

	if (result.recommendations.length > 0) {
		lines.push("  Recommendations:");
		for (const rec of result.recommendations) lines.push(`    + ${rec}`);
	}

	return lines.join("\n");
}

// ============================================================================
// THEME 3: Interactive Parameter Prompt Form Generator (UX-1771 to UX-1780)
// ============================================================================

export interface ParameterFormField {
	name: string;
	label: string;
	type: "string" | "number" | "boolean" | "choice";
	description: string;
	required: boolean;
	defaultValue?: unknown;
	choices?: string[];
	renderedInput: string;
}

export interface ParameterForm {
	procedureKind: ProcedureKind;
	title: string;
	fields: ParameterFormField[];
	cliFlagsUsage: string;
}

export function generateParameterPromptForm(
	procedureKind: ProcedureKind,
	customParams?: ProcedureParameter[],
): ParameterForm {
	const meta = PROCEDURE_METADATA[procedureKind];
	const params = customParams ?? meta.parameters;

	const fields: ParameterFormField[] = params.map((p) => {
		let renderedInput = "";
		if (p.type === "choice") {
			renderedInput = `[select: ${(p.choices ?? []).join(" | ")}] (default: ${p.defaultValue})`;
		} else if (p.type === "boolean") {
			renderedInput = `[toggle: Y/n] (default: ${p.defaultValue ? "true" : "false"})`;
		} else if (p.type === "number") {
			renderedInput = `[number] (default: ${p.defaultValue ?? "none"})`;
		} else {
			renderedInput = `[text] (default: "${p.defaultValue ?? ""}")`;
		}

		return {
			name: p.name,
			label: p.name.replace(/([A-Z])/g, " $1").toLowerCase(),
			type: p.type,
			description: p.description,
			required: p.required,
			defaultValue: p.defaultValue,
			choices: p.choices,
			renderedInput,
		};
	});

	const cliFlagsUsage = params
		.map((p) => {
			const flag = `--${p.name.replace(/([A-Z])/g, "-$1").toLowerCase()}`;
			return p.required ? `${flag}=<value>` : `[${flag}=<value>]`;
		})
		.join(" ");

	return {
		procedureKind,
		title: meta.title,
		fields,
		cliFlagsUsage: `kaioken skills run ${meta.name} ${cliFlagsUsage}`,
	};
}

export function renderParameterFormUI(
	form: ParameterForm,
	options: { unicode?: boolean } = {},
): string {
	const u = options.unicode ?? true;
	const cTopLeft = u ? "┌" : "+";
	const cTopRight = u ? "┐" : "+";
	const cBottomLeft = u ? "└" : "+";
	const cBottomRight = u ? "┘" : "+";
	const cHoriz = u ? "─" : "-";
	const cVert = u ? "│" : "|";

	const lines = [
		`${cTopLeft}${cHoriz.repeat(2)} [Interactive Form: ${form.title}] ${cHoriz.repeat(Math.max(4, 50 - form.title.length))}${cTopRight}`,
		`${cVert} CLI Usage: ${form.cliFlagsUsage}`,
		`${cVert} Parameters (${form.fields.length}):`,
	];

	for (const f of form.fields) {
		const reqBadge = f.required ? " (REQUIRED)" : "";
		lines.push(`${cVert}   • ${f.name}${reqBadge}: ${f.description}`);
		lines.push(`${cVert}     Input: ${f.renderedInput}`);
	}

	lines.push(`${cBottomLeft}${cHoriz.repeat(70)}${cBottomRight}`);
	return lines.join("\n");
}

// ============================================================================
// THEME 4: Skill Documentation Generator (UX-1781 to UX-1790)
// ============================================================================

export interface SkillDocumentationResult {
	procedureKind: ProcedureKind;
	title: string;
	name: string;
	markdown: string;
	summary: string;
}

export function compileSkillDocumentation(
	procedureKind: ProcedureKind,
	options: { namespace?: string } = {},
): SkillDocumentationResult {
	const meta = PROCEDURE_METADATA[procedureKind];
	const ns = options.namespace ?? meta.defaultNamespace;

	const mdLines = [
		"---",
		`name: ${ns}:${meta.name}`,
		`title: "${meta.title}"`,
		`namespace: ${ns}`,
		`triggers: [${meta.defaultTriggers.map((t) => `"${t}"`).join(", ")}]`,
		"---",
		"",
		`# ${meta.title}`,
		"",
		`> ${meta.description}`,
		"",
		"## ⚙️ Parameters",
		"",
		"| Parameter | Type | Required | Default | Description |",
		"| :--- | :--- | :---: | :--- | :--- |",
		...meta.parameters.map(
			(p) => `| \`${p.name}\` | \`${p.type}\` | ${p.required ? "Yes" : "No"} | \`${p.defaultValue ?? "none"}\` | ${p.description} |`,
		),
		"",
		"## 🚀 Execution Recipes",
		"",
		"1. **Pre-flight Check**:",
		"   ```bash",
		`   ${meta.typicalVerificationCommands[0] ?? "git status"}`,
		"   ```",
		"2. **Execute Autonomous Procedure**:",
		`   Follow the step-by-step procedure defined for \`${meta.name}\`.`,
		"",
		"## 🔍 Verification Commands",
		"",
		...meta.typicalVerificationCommands.map((cmd) => `- \`${cmd}\``),
		"",
	];

	const markdown = mdLines.join("\n");
	return {
		procedureKind,
		title: meta.title,
		name: `${ns}:${meta.name}`,
		markdown,
		summary: `Compiled ${meta.title} (${meta.parameters.length} parameters, ${meta.typicalVerificationCommands.length} verification commands).`,
	};
}

export function renderSkillDocumentationMarkdown(result: SkillDocumentationResult): string {
	return result.markdown;
}

// ============================================================================
// THEME 5: Trigger Condition Matcher Suggesting Relevant Skills (UX-1791 to UX-1800)
// ============================================================================

export interface SkillTriggerContext {
	prompt?: string;
	changedFiles?: string[];
	branch?: string;
}

export interface SkillSuggestionItem {
	procedureKind: ProcedureKind;
	title: string;
	qualifiedName: string;
	confidenceScore: number; // 0 to 100
	matchedTriggers: string[];
	rationale: string;
}

export interface SkillSuggestionResult {
	suggestions: SkillSuggestionItem[];
	topSuggestion?: SkillSuggestionItem;
}

export function matchSkillTriggers(
	context: SkillTriggerContext,
	catalog: readonly ProcedureKind[] = ALL_PROCEDURE_KINDS,
): SkillSuggestionResult {
	const promptTokens = (context.prompt ?? "")
		.toLowerCase()
		.split(/[\s,./\\_-]+/)
		.filter(Boolean);

	const changedPaths = (context.changedFiles ?? []).map((f) => f.toLowerCase());
	const branchName = (context.branch ?? "").toLowerCase();

	const suggestions: SkillSuggestionItem[] = [];

	for (const kind of catalog) {
		const meta = PROCEDURE_METADATA[kind];
		const matchedTriggers: string[] = [];
		let score = 0;

		// Match triggers in prompt
		for (const trigger of meta.defaultTriggers) {
			if (promptTokens.includes(trigger.toLowerCase()) || (context.prompt ?? "").toLowerCase().includes(trigger.toLowerCase())) {
				matchedTriggers.push(`prompt:${trigger}`);
				score += 35;
			}
		}

		// Match file extensions in changed files
		for (const ext of meta.fileExtensions) {
			if (changedPaths.some((p) => p.endsWith(ext) || p.includes(ext))) {
				matchedTriggers.push(`file:${ext}`);
				score += 30;
			}
		}

		// Match procedure name or kind
		if (promptTokens.includes(meta.name.toLowerCase()) || promptTokens.includes(kind.toLowerCase())) {
			matchedTriggers.push(`direct-name:${meta.name}`);
			score += 40;
		}

		// Match branch keywords
		if (branchName.includes(kind) || branchName.includes(meta.name)) {
			matchedTriggers.push(`branch:${branchName}`);
			score += 20;
		}

		score = Math.min(100, score);

		if (score > 0) {
			suggestions.push({
				procedureKind: kind,
				title: meta.title,
				qualifiedName: `${meta.defaultNamespace}:${meta.name}`,
				confidenceScore: score,
				matchedTriggers,
				rationale: `Matched ${matchedTriggers.length} trigger(s): ${matchedTriggers.join(", ")}`,
			});
		}
	}

	suggestions.sort((a, b) => b.confidenceScore - a.confidenceScore);

	return {
		suggestions,
		topSuggestion: suggestions[0],
	};
}

export function rankSuggestedSkills(
	context: SkillTriggerContext,
	catalog?: readonly ProcedureKind[],
): SkillSuggestionItem[] {
	return matchSkillTriggers(context, catalog).suggestions;
}
