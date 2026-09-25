import { git } from "./run.ts";
import { createWorktree, slug, worktreePath } from "./worktree.ts";

export type DelegationTaskType =
	| "refactor"
	| "deps"
	| "docs"
	| "fix"
	| "bench"
	| "migration"
	| "security"
	| "prototype"
	| "cleanup"
	| "staging"
	| "custom";

export interface WorktreeEntry {
	path: string;
	head: string;
	branch: string | null;
	bare: boolean;
	isKaioken: boolean;
	isLocked: boolean;
	lockReason?: string;
}

export interface DelegationRecipeOptions {
	taskType?: DelegationTaskType;
	model?: string;
	customArgs?: string;
}

export interface DelegationRecipe {
	taskSlug: string;
	taskType: DelegationTaskType;
	archetypeName: string;
	branch: string;
	worktreePath: string;
	launchCommand: string;
	mergeCommand: string;
	verifyCommand: string;
	environmentFlags: Record<string, string>;
	model?: string;
	createdAt: string;
}

/**
 * List all git worktrees registered in `root`.
 *
 * Parses `git worktree list --porcelain` into typed records.
 */
export async function listWorktrees(root: string): Promise<WorktreeEntry[]> {
	const res = await git(root, "worktree", "list", "--porcelain");
	if (!res.ok) return [];

	const entries: WorktreeEntry[] = [];
	const blocks = res.stdout.split(/\r?\n\r?\n/).filter((b) => b.trim() !== "");

	for (const block of blocks) {
		const lines = block.split(/\r?\n/);
		let path = "";
		let head = "";
		let branch: string | null = null;
		let bare = false;
		let isLocked = false;
		let lockReason: string | undefined;

		for (const line of lines) {
			if (line.startsWith("worktree ")) {
				path = line.slice("worktree ".length).trim();
			} else if (line.startsWith("HEAD ")) {
				head = line.slice("HEAD ".length).trim();
			} else if (line.startsWith("branch ")) {
				const fullRef = line.slice("branch ".length).trim();
				branch = fullRef.replace(/^refs\/heads\//, "");
			} else if (line === "bare") {
				bare = true;
			} else if (line.startsWith("locked")) {
				isLocked = true;
				const reason = line.slice("locked".length).trim();
				if (reason) lockReason = reason;
			}
		}

		if (path) {
			const normPath = path.replace(/\\/g, "/");
			const isKaioken =
				normPath.includes("/.kaioken/worktrees/") || (branch !== null && branch.startsWith("kaioken/"));
			entries.push({
				path,
				head,
				branch,
				bare,
				isKaioken,
				isLocked,
				lockReason,
			});
		}
	}

	return entries;
}

/**
 * Build one-command isolated git worktree and generate its delegation launch recipe
 * outputting launch commands across the 10 task archetypes:
 * 1. experimental refactoring branch (UX-1881)
 * 2. automated dependency upgrade task (UX-1882)
 * 3. documentation rewrite worktree (UX-1883)
 * 4. failing bug investigation sandbox (UX-1884)
 * 5. performance benchmark trial branch (UX-1885)
 * 6. multi-package migration experiment (UX-1886)
 * 7. security patch isolated worktree (UX-1887)
 * 8. feature prototyping scratchpad (UX-1888)
 * 9. code cleanup and formatting sweep (UX-1889)
 * 10. release candidate staging worktree (UX-1890)
 */
export async function generateDelegationRecipe(
	root: string,
	name: string,
	options: DelegationRecipeOptions = {},
): Promise<DelegationRecipe> {
	const taskSlug = slug(name);
	const taskType = options.taskType ?? inferTaskType(name);
	const branch = `kaioken/${taskSlug}`;
	const wtPath = await createWorktree(root, taskSlug);

	const modelArg = options.model ? ` --model ${options.model}` : "";
	const customArgs = options.customArgs ? ` ${options.customArgs}` : "";

	const archetypeName = getArchetypeName(taskType);
	const { launchCommand, verifyCommand, environmentFlags } = getArchetypeLaunchSpecs(
		taskType,
		wtPath,
		taskSlug,
		modelArg,
		customArgs,
	);
	const mergeCommand = `kaioken gitops merge ${taskSlug}`;

	return {
		taskSlug,
		taskType,
		archetypeName,
		branch,
		worktreePath: wtPath,
		launchCommand,
		mergeCommand,
		verifyCommand,
		environmentFlags,
		model: options.model,
		createdAt: new Date().toISOString(),
	};
}

/**
 * Format a delegation recipe for terminal display.
 */
export function formatDelegationRecipe(recipe: DelegationRecipe): string {
	const lines = [
		`Delegation Recipe for [${recipe.taskSlug}] (${recipe.taskType}):`,
		`  Worktree Path  : ${recipe.worktreePath}`,
		`  Branch         : ${recipe.branch}`,
		`  Launch Command : ${recipe.launchCommand}`,
		`  Verify Command : ${recipe.verifyCommand}`,
		`  Merge Command  : ${recipe.mergeCommand}`,
	];
	if (recipe.model) {
		lines.push(`  Model Target  : ${recipe.model}`);
	}
	return lines.join("\n");
}

/**
 * Render a markdown delegation card suitable for documentation or task tickets.
 */
export function renderMarkdownRecipeCard(recipe: DelegationRecipe): string {
	const lines = [
		`### 🚀 Worktree Delegation Recipe: ${recipe.archetypeName}`,
		`- **Task Slug**: \`${recipe.taskSlug}\``,
		`- **Worktree Path**: \`${recipe.worktreePath}\``,
		`- **Branch**: \`${recipe.branch}\``,
		recipe.model ? `- **Target Model**: \`${recipe.model}\`` : "",
		"",
		"#### Launch Command",
		"```bash",
		recipe.launchCommand,
		"```",
		"",
		"#### Verification Gate",
		"```bash",
		recipe.verifyCommand,
		"```",
		"",
		"#### Safe Fast-Forward Merge",
		"```bash",
		recipe.mergeCommand,
		"```",
	].filter(Boolean);

	return lines.join("\n");
}

function inferTaskType(name: string): DelegationTaskType {
	const lower = name.toLowerCase();
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
	return "custom";
}

function getArchetypeName(taskType: DelegationTaskType): string {
	switch (taskType) {
		case "refactor":
			return "Experimental Refactoring Branch (UX-1881)";
		case "deps":
			return "Automated Dependency Upgrade Task (UX-1882)";
		case "docs":
			return "Documentation Rewrite Worktree (UX-1883)";
		case "fix":
			return "Failing Bug Investigation Sandbox (UX-1884)";
		case "bench":
			return "Performance Benchmark Trial Branch (UX-1885)";
		case "migration":
			return "Multi-Package Migration Experiment (UX-1886)";
		case "security":
			return "Security Patch Isolated Worktree (UX-1887)";
		case "prototype":
			return "Feature Prototyping Scratchpad (UX-1888)";
		case "cleanup":
			return "Code Cleanup and Formatting Sweep (UX-1889)";
		case "staging":
			return "Release Candidate Staging Worktree (UX-1890)";
		default:
			return "Custom Worktree Delegation Task";
	}
}

function getArchetypeLaunchSpecs(
	taskType: DelegationTaskType,
	wtPath: string,
	slug: string,
	modelArg: string,
	customArgs: string,
): { launchCommand: string; verifyCommand: string; environmentFlags: Record<string, string> } {
	switch (taskType) {
		case "refactor":
			return {
				launchCommand: `cd ${wtPath} && pi${modelArg} --mode refactor${customArgs}`,
				verifyCommand: `kaioken index verify && npm test`,
				environmentFlags: { KAIOKEN_TASK_TYPE: "refactor", KAIOKEN_WORKTREE: slug },
			};
		case "deps":
			return {
				launchCommand: `cd ${wtPath} && npm update --no-audit && pi${modelArg} --mode deps${customArgs}`,
				verifyCommand: `npm test && node scripts/check-kaioken-barrels.mjs`,
				environmentFlags: { KAIOKEN_TASK_TYPE: "deps", KAIOKEN_WORKTREE: slug },
			};
		case "docs":
			return {
				launchCommand: `cd ${wtPath} && pi${modelArg} --mode docs${customArgs}`,
				verifyCommand: `kaioken wiki verify && npm run check:kaioken`,
				environmentFlags: { KAIOKEN_TASK_TYPE: "docs", KAIOKEN_WORKTREE: slug },
			};
		case "fix":
			return {
				launchCommand: `cd ${wtPath} && pi${modelArg} --mode bugfix${customArgs}`,
				verifyCommand: `npm test`,
				environmentFlags: { KAIOKEN_TASK_TYPE: "fix", KAIOKEN_WORKTREE: slug },
			};
		case "bench":
			return {
				launchCommand: `cd ${wtPath} && pi${modelArg} --mode benchmark${customArgs}`,
				verifyCommand: `npm run bench || npm test`,
				environmentFlags: { KAIOKEN_TASK_TYPE: "bench", KAIOKEN_WORKTREE: slug },
			};
		case "migration":
			return {
				launchCommand: `cd ${wtPath} && pi${modelArg} --mode migration${customArgs}`,
				verifyCommand: `npm run check:kaioken && npm test`,
				environmentFlags: { KAIOKEN_TASK_TYPE: "migration", KAIOKEN_WORKTREE: slug },
			};
		case "security":
			return {
				launchCommand: `cd ${wtPath} && pi${modelArg} --mode security-patch${customArgs}`,
				verifyCommand: `npm audit --omit=dev && npm test`,
				environmentFlags: { KAIOKEN_TASK_TYPE: "security", KAIOKEN_WORKTREE: slug },
			};
		case "prototype":
			return {
				launchCommand: `cd ${wtPath} && pi${modelArg} --mode prototype${customArgs}`,
				verifyCommand: `npm test`,
				environmentFlags: { KAIOKEN_TASK_TYPE: "prototype", KAIOKEN_WORKTREE: slug },
			};
		case "cleanup":
			return {
				launchCommand: `cd ${wtPath} && pi${modelArg} --mode cleanup${customArgs}`,
				verifyCommand: `npm run format:check || npm test`,
				environmentFlags: { KAIOKEN_TASK_TYPE: "cleanup", KAIOKEN_WORKTREE: slug },
			};
		case "staging":
			return {
				launchCommand: `cd ${wtPath} && pi${modelArg} --mode staging-verify${customArgs}`,
				verifyCommand: `npm run check:kaioken && npm test`,
				environmentFlags: { KAIOKEN_TASK_TYPE: "staging", KAIOKEN_WORKTREE: slug },
			};
		default:
			return {
				launchCommand: `cd ${wtPath} && pi${modelArg}${customArgs}`,
				verifyCommand: `npm test`,
				environmentFlags: { KAIOKEN_TASK_TYPE: "custom", KAIOKEN_WORKTREE: slug },
			};
	}
}
