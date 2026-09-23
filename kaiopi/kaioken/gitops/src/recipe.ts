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
}

export interface DelegationRecipe {
	taskSlug: string;
	taskType: DelegationTaskType;
	branch: string;
	worktreePath: string;
	launchCommand: string;
	mergeCommand: string;
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
 * Build one-command isolated git worktree and generate its delegation launch recipe.
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
	const launchCommand = `cd ${wtPath} && pi${modelArg}`;
	const mergeCommand = `kaioken gitops merge ${taskSlug}`;

	return {
		taskSlug,
		taskType,
		branch,
		worktreePath: wtPath,
		launchCommand,
		mergeCommand,
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
		`  Worktree Path : ${recipe.worktreePath}`,
		`  Branch        : ${recipe.branch}`,
		`  Launch Command: ${recipe.launchCommand}`,
		`  Merge Command : ${recipe.mergeCommand}`,
	];
	if (recipe.model) {
		lines.push(`  Model Target  : ${recipe.model}`);
	}
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
