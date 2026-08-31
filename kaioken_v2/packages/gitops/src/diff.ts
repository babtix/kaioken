import { git, gitLine, isRepo } from "./run.js";

/**
 * What the working tree, or a range, actually changed.
 *
 * `/draft` needs three things to write a commit message that fits the
 * repository rather than a generic one: the diff, the list of paths (so a
 * truncated diff still names everything touched), and how this project has
 * phrased its own commits. All three are read here, deterministically, before
 * any model is involved.
 */

export interface DiffSnapshot {
	/** The unified diff. Possibly truncated — see `truncated`. */
	patch: string;
	/** Repository-relative paths, in git's order. */
	files: string[];
	insertions: number;
	deletions: number;
	/** True when `patch` was cut to fit the budget; `files` is still complete. */
	truncated: boolean;
	/** What was compared: "worktree", "staged", or the range given. */
	against: string;
}

/**
 * How much diff to carry into a prompt.
 *
 * A 400 KB refactor does not produce a 400 KB-better commit message, and the
 * tail of a long diff is the least informative part of it. The file list is
 * gathered separately and is never truncated, so a cut patch still leaves the
 * model knowing the full shape of the change.
 */
const PATCH_BUDGET = 96 * 1024;

/**
 * Read the change.
 *
 * With no `base`, staged changes are preferred over unstaged: someone who has
 * run `git add` has already said which change they mean. Only when the index is
 * empty does this fall back to the whole working tree.
 */
export async function readDiff(repo: string, base?: string): Promise<DiffSnapshot | null> {
	if (!(await isRepo(repo))) return null;

	const range = base?.trim();
	let args: string[];
	let against: string;
	if (range) {
		args = [range];
		against = range;
	} else if ((await gitLine(repo, "diff", "--cached", "--name-only")) !== "") {
		args = ["--cached"];
		against = "staged";
	} else {
		args = [];
		against = "worktree";
	}

	const files = splitLines(await gitLine(repo, "diff", ...args, "--name-only"));
	const patchResult = await git(repo, "diff", ...args, "--no-color");
	if (!patchResult.ok) return null;

	const raw = patchResult.stdout;
	const truncated = raw.length > PATCH_BUDGET;
	const { insertions, deletions } = parseShortstat(await gitLine(repo, "diff", ...args, "--shortstat"));

	return {
		patch: truncated ? `${raw.slice(0, PATCH_BUDGET)}\n… diff truncated …\n` : raw,
		files,
		insertions,
		deletions,
		truncated,
		against,
	};
}

/**
 * Recent commit subjects, newest first.
 *
 * Shown to the model as the house style to match. A repository writing
 * `fix(parser): …` and one writing `Fix the parser` are both internally
 * consistent, and neither wants the other's convention imposed on it.
 */
export async function recentSubjects(repo: string, limit = 20): Promise<string[]> {
	const out = await gitLine(repo, "log", `-${Math.max(1, Math.min(100, limit))}`, "--pretty=format:%s");
	return splitLines(out);
}

/** The current branch, or "" when detached or outside a repository. */
export async function currentBranch(repo: string): Promise<string> {
	const name = await gitLine(repo, "rev-parse", "--abbrev-ref", "HEAD");
	return name === "HEAD" ? "" : name;
}

/** `git diff --shortstat` — " 3 files changed, 12 insertions(+), 4 deletions(-)". */
function parseShortstat(line: string): { insertions: number; deletions: number } {
	const ins = /(\d+) insertion/.exec(line);
	const del = /(\d+) deletion/.exec(line);
	return {
		insertions: ins ? Number(ins[1]) : 0,
		deletions: del ? Number(del[1]) : 0,
	};
}

function splitLines(text: string): string[] {
	return text
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean);
}
