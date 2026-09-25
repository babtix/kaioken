import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { git, gitLine } from "./run.ts";
import { worktreeStatus } from "./worktree.ts";
import type { DelegationTaskType } from "./recipe.ts";

export interface ConflictedFileSummary {
	path: string;
	markerCount: number;
}

export interface MergeConflictInfo {
	hasConflicts: boolean;
	conflictedFiles: ConflictedFileSummary[];
	ahead: number;
	behind: number;
	baseBranch: string;
	incomingBranch: string;
	taskType?: DelegationTaskType | string;
}

export interface ThreeWayDiffFile {
	path: string;
	hasAncestor: boolean;
	hasOurs: boolean;
	hasTheirs: boolean;
	ancestorContent?: string;
	oursContent?: string;
	theirsContent?: string;
	formattedDiff: string;
}

export interface ThreeWayDiffResult {
	files: ThreeWayDiffFile[];
	summary: string;
}

export interface ConflictPlaybook {
	archetypeName: string;
	diagnosis: string;
	recoverySteps: string[];
}

/**
 * Archetype-specific recovery guidance for the 10 worktree task types (UX-1851 to UX-1860).
 */
export function getConflictPlaybook(
	taskType?: string,
	incomingBranch?: string,
	baseBranch = "main",
): ConflictPlaybook {
	const normalized = (taskType || inferTaskTypeFromBranch(incomingBranch) || "custom").toLowerCase();
	const base = baseBranch || "main";

	switch (normalized) {
		case "refactor":
			return {
				archetypeName: "Experimental Refactoring Branch (UX-1851)",
				diagnosis: "AST refactoring diverged from target interfaces; symbol references or method signatures clash.",
				recoverySteps: [
					"Inspect 3-way diff with: kaioken gitops conflict --path <file>",
					`Rebase refactor branch onto target base: git rebase ${base}`,
					"Run AST symbol index check: kaioken index verify",
					"Ensure no renamed symbols break public API contracts before re-merging",
				],
			};

		case "deps":
			return {
				archetypeName: "Automated Dependency Upgrade Task (UX-1852)",
				diagnosis: "Package manifests or lockfiles have diverged due to concurrent package additions or version bumps.",
				recoverySteps: [
					`Rebase dependency branch onto target base: git rebase ${base}`,
					"Checkout package.json from incoming branch and lockfile from target base",
					"Run package manager install to regenerate lockfile cleanly: npm install / pnpm install",
					"Verify peer dependency resolutions and zero runtime regressions",
				],
			};

		case "docs":
			return {
				archetypeName: "Documentation Rewrite Worktree (UX-1853)",
				diagnosis: "Documentation chapters or knowledge cards diverged from concurrent code or wiki chapter updates.",
				recoverySteps: [
					`Rebase documentation branch onto target base: git rebase ${base}`,
					"Check markdown headings and code citation anchors in conflicted files",
					"Run wiki anchor validator to ensure referenced line ranges exist",
					"Accept both documentation sections if non-overlapping, then harmonize flow",
				],
			};

		case "fix":
			return {
				archetypeName: "Failing Bug Investigation Sandbox (UX-1854)",
				diagnosis: "Bug patch touches code that was concurrently modified or refactored on base branch.",
				recoverySteps: [
					`Rebase bugfix onto updated base branch: git rebase ${base}`,
					"Preserve new regression test file from bug investigation worktree",
					"Run test runner specifically on regression repro test: npm test <testPath>",
					"Verify fix still passes without reverting upstream bugfixes",
				],
			};

		case "bench":
			return {
				archetypeName: "Performance Benchmark Trial Branch (UX-1855)",
				diagnosis: "Benchmark trial branch diverged from base, invalidating comparative performance measurements.",
				recoverySteps: [
					`Rebase benchmark trial branch onto exact commit of target base: git rebase ${base}`,
					"Run benchmark harness to establish updated baseline numbers",
					"Resolve benchmark parameter or telemetry logger conflicts",
					"Ensure benchmark results report accurate latency delta",
				],
			};

		case "migration":
			return {
				archetypeName: "Multi-Package Migration Experiment (UX-1856)",
				diagnosis: "Cross-package imports or workspace root configs diverged during multi-package migration.",
				recoverySteps: [
					`Rebase migration branch onto target base: git rebase ${base}`,
					"Verify workspace package topology and cross-package dependency graph",
					"Run offline barrel integrity check: npm run check:kaioken",
					"Fast-forward only after all packages compile cleanly",
				],
			};

		case "security":
			return {
				archetypeName: "Security Patch Isolated Worktree (UX-1857)",
				diagnosis: "Security advisory patch diverged from base, risking accidental disclosure or stale patch bypass.",
				recoverySteps: [
					`Rebase security patch onto target base: git rebase ${base}`,
					"Inspect 3-way diff to verify CVE mitigation remains fully intact",
					"Ensure no security test cases or regression vectors are dropped during merge",
					"Enforce verified signed commit before merge",
				],
			};

		case "prototype":
			return {
				archetypeName: "Feature Prototyping Scratchpad (UX-1858)",
				diagnosis: "Exploratory prototype branch contains experimental code clashing with production standards.",
				recoverySteps: [
					`Rebase prototype branch onto target base: git rebase ${base}`,
					"Cherry-pick only finalized prototype components into clean feature branch",
					"Discard temporary scratchpad logging and hardcoded mock data",
					"Re-attempt fast-forward merge once prototype is cleaned",
				],
			};

		case "cleanup":
			return {
				archetypeName: "Code Cleanup and Formatting Sweep (UX-1859)",
				diagnosis: "Broad formatting sweep conflicts with concurrent functional code modifications.",
				recoverySteps: [
					`Rebase cleanup branch onto target base: git rebase ${base}`,
					"Favor functional changes from target base branch over formatting adjustments",
					"Re-run code formatter / linter over merged result: npm run format",
					"Fast-forward formatting sweep cleanly",
				],
			};

		case "staging":
			return {
				archetypeName: "Release Candidate Staging Worktree (UX-1860)",
				diagnosis: "Release candidate branch diverged from main; release tag or version changelog conflict detected.",
				recoverySteps: [
					`Rebase staging branch onto target base: git rebase ${base}`,
					"Verify changelog entries from both branches are preserved and concatenated",
					"Confirm semantic release version number in package.json",
					"Run full production build and verification test suite",
				],
			};

		default:
			return {
				archetypeName: "Custom Worktree Task",
				diagnosis: "Working tree branches have diverged with conflicting concurrent file edits.",
				recoverySteps: [
					"Inspect 3-way diff: kaioken gitops conflict --path <file>",
					`Rebase worktree branch: git rebase ${base}`,
					"Resolve markers, run git add, git rebase --continue",
					"Re-run verification gate before re-attempting fast-forward",
				],
			};
	}
}

/**
 * Scan repository for merge conflicts and measure branch divergence.
 */
export async function detectConflicts(
	repo: string,
	baseBranch = "main",
	incomingBranch?: string,
	taskType?: DelegationTaskType | string,
): Promise<MergeConflictInfo> {
	const status = await worktreeStatus(repo);
	const conflictedFiles: ConflictedFileSummary[] = [];

	for (const file of status.conflicted) {
		const fullPath = join(repo, file);
		let markerCount = 0;
		try {
			const content = await readFile(fullPath, "utf8");
			const matches = content.match(/^[<]{7}\s/gm);
			markerCount = matches ? matches.length : 1;
		} catch {
			markerCount = 1;
		}
		conflictedFiles.push({ path: file, markerCount });
	}

	let ahead = 0;
	let behind = 0;

	if (incomingBranch) {
		const countLine = await gitLine(
			repo,
			"rev-list",
			"--left-right",
			"--count",
			`${baseBranch}...${incomingBranch}`,
		);
		const parts = countLine.split(/\s+/).map((n) => parseInt(n, 10));
		if (parts.length >= 2 && !Number.isNaN(parts[0]) && !Number.isNaN(parts[1])) {
			behind = parts[0];
			ahead = parts[1];
		}
	}

	return {
		hasConflicts: conflictedFiles.length > 0,
		conflictedFiles,
		ahead,
		behind,
		baseBranch,
		incomingBranch: incomingBranch ?? "<incoming>",
		taskType: taskType ?? inferTaskTypeFromBranch(incomingBranch),
	};
}

/**
 * Render visual merge conflict warning card explaining diverged state across the 10 task archetypes.
 */
export function renderConflictCard(
	info: MergeConflictInfo,
	options: { color?: boolean; plain?: boolean } = {},
): string {
	const totalMarkers = info.conflictedFiles.reduce((acc, f) => acc + f.markerCount, 0);
	const fileCount = info.conflictedFiles.length;
	const playbook = getConflictPlaybook(info.taskType, info.incomingBranch);

	const border = "─".repeat(68);
	const lines = [
		`┌${border}┐`,
		`│ ⚠️  MERGE CONFLICT WARNING CARD                                     │`,
		`├${border}┤`,
		`│ Task Archetype : ${pad(playbook.archetypeName, 48)} │`,
		`│ Base Branch    : ${pad(info.baseBranch, 48)} │`,
		`│ Incoming Branch: ${pad(info.incomingBranch, 48)} │`,
		`│ Divergence     : ${pad(`${info.ahead} commit(s) ahead, ${info.behind} commit(s) behind`, 48)} │`,
		`│ Conflicted     : ${pad(`${fileCount} file(s) with ${totalMarkers} conflict marker section(s)`, 48)} │`,
		`├${border}┤`,
		`│ Diagnosis:                                                         │`,
		`│   ${pad(playbook.diagnosis, 64)} │`,
		`├${border}┤`,
		`│ Affected Files:                                                    │`,
	];

	for (const f of info.conflictedFiles.slice(0, 8)) {
		const entry = `• ${f.path} (${f.markerCount} conflict block${f.markerCount > 1 ? "s" : ""})`;
		lines.push(`│   ${pad(entry, 64)} │`);
	}
	if (info.conflictedFiles.length > 8) {
		lines.push(`│   ${pad(`... and ${info.conflictedFiles.length - 8} more file(s)`, 64)} │`);
	}

	lines.push(`├${border}┤`, `│ Actionable Recovery Playbook:                                      │`);

	for (let i = 0; i < playbook.recoverySteps.length; i++) {
		const step = `${i + 1}. ${playbook.recoverySteps[i]}`;
		lines.push(`│ ${pad(step, 66)} │`);
	}

	lines.push(`└${border}┘`);

	return lines.join("\n");
}

export function renderPlainConflictCard(info: MergeConflictInfo): string {
	return renderConflictCard(info, { plain: true, color: false });
}

export function renderMarkdownConflictCard(info: MergeConflictInfo): string {
	const playbook = getConflictPlaybook(info.taskType, info.incomingBranch);
	const totalMarkers = info.conflictedFiles.reduce((acc, f) => acc + f.markerCount, 0);

	const out = [
		`### ⚠️ Merge Conflict Warning: ${playbook.archetypeName}`,
		`- **Base Branch**: \`${info.baseBranch}\``,
		`- **Incoming Branch**: \`${info.incomingBranch}\``,
		`- **Divergence**: ${info.ahead} commits ahead, ${info.behind} commits behind`,
		`- **Conflicts**: ${info.conflictedFiles.length} file(s), ${totalMarkers} marker sections`,
		"",
		`> **Diagnosis**: ${playbook.diagnosis}`,
		"",
		"#### Conflicted Files",
	];

	for (const f of info.conflictedFiles) {
		out.push(`- \`${f.path}\` (${f.markerCount} block${f.markerCount > 1 ? "s" : ""})`);
	}

	out.push("", "#### Recovery Playbook");
	for (let i = 0; i < playbook.recoverySteps.length; i++) {
		out.push(`${i + 1}. ${playbook.recoverySteps[i]}`);
	}

	return out.join("\n");
}

/**
 * Extract 3-way git stages (:1: ancestor, :2: ours/target, :3: theirs/incoming)
 * for a conflicted file.
 */
export async function getThreeWayDiff(repo: string, filePath?: string): Promise<ThreeWayDiffResult> {
	const status = await worktreeStatus(repo);
	const targets = filePath ? [filePath] : status.conflicted;

	if (targets.length === 0) {
		return {
			files: [],
			summary: "No conflicted files found to diff.",
		};
	}

	const files: ThreeWayDiffFile[] = [];

	for (const relPath of targets) {
		const aRes = await git(repo, "show", `:1:${relPath}`);
		const oRes = await git(repo, "show", `:2:${relPath}`);
		const tRes = await git(repo, "show", `:3:${relPath}`);

		const formattedDiff = [
			`=== 3-WAY DIFF: ${relPath} ===`,
			`--- Stage 1: Ancestor (Common Base) [${aRes.ok ? "Present" : "Missing"}] ---`,
			aRes.ok ? truncateSnippet(aRes.stdout) : "(no ancestor version)",
			`--- Stage 2: Target / Ours (HEAD) [${oRes.ok ? "Present" : "Missing"}] ---`,
			oRes.ok ? truncateSnippet(oRes.stdout) : "(no ours version)",
			`--- Stage 3: Incoming / Theirs [${tRes.ok ? "Present" : "Missing"}] ---`,
			tRes.ok ? truncateSnippet(tRes.stdout) : "(no theirs version)",
			`=== END 3-WAY DIFF: ${relPath} ===`,
		].join("\n");

		files.push({
			path: relPath,
			hasAncestor: aRes.ok,
			hasOurs: oRes.ok,
			hasTheirs: tRes.ok,
			ancestorContent: aRes.ok ? aRes.stdout : undefined,
			oursContent: oRes.ok ? oRes.stdout : undefined,
			theirsContent: tRes.ok ? tRes.stdout : undefined,
			formattedDiff,
		});
	}

	return {
		files,
		summary: `Extracted 3-way stages for ${files.length} conflicted file(s).`,
	};
}

function pad(str: string, width: number): string {
	if (str.length >= width) return str.slice(0, width);
	return str + " ".repeat(width - str.length);
}

function truncateSnippet(text: string, maxLines = 15): string {
	const lines = text.split(/\r?\n/);
	if (lines.length <= maxLines) return text;
	return `${lines.slice(0, maxLines).join("\n")}\n... (${lines.length - maxLines} lines truncated) ...`;
}

function inferTaskTypeFromBranch(branch?: string): DelegationTaskType | undefined {
	if (!branch) return undefined;
	const lower = branch.toLowerCase();
	if (lower.includes("refactor")) return "refactor";
	if (lower.includes("dep") || lower.includes("upgrade")) return "deps";
	if (lower.includes("doc") || lower.includes("wiki")) return "docs";
	if (lower.includes("fix") || lower.includes("bug")) return "fix";
	if (lower.includes("bench") || lower.includes("perf")) return "bench";
	if (lower.includes("migrat")) return "migration";
	if (lower.includes("sec") || lower.includes("vuln")) return "security";
	if (lower.includes("proto")) return "prototype";
	if (lower.includes("clean") || lower.includes("format")) return "cleanup";
	if (lower.includes("stage") || lower.includes("rc")) return "staging";
	return undefined;
}
