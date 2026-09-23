import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { git, gitLine, isRepo } from "./run.ts";

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

	const trackedFiles = splitLines(await gitLine(repo, "diff", ...args, "--name-only"));
	const patchResult = await git(repo, "diff", ...args, "--no-color");

	// `git diff` never reports untracked files. For a worktree or staged
	// snapshot the model still needs to know about them: a brand-new file is
	// invisible to the diff above but is exactly what the commit message must
	// describe. Historical ranges skip this — an old range has no worktree.
	const untracked = range ? [] : await listUntracked(repo);
	const files = [...trackedFiles];
	for (const name of untracked) {
		if (!files.includes(name)) files.push(name);
	}

	let raw = patchResult.ok ? patchResult.stdout : "";
	if (!patchResult.ok && files.length === 0) return null;

	const { patch: untrackedPatch, insertions: untrackedInsertions } =
		await buildUntrackedPatch(repo, untracked);
	if (untrackedPatch !== "") {
		raw = raw.endsWith("\n") || raw === "" ? `${raw}${untrackedPatch}` : `${raw}\n${untrackedPatch}`;
	}
	const truncated = raw.length > PATCH_BUDGET;
	const shortstat = parseShortstat(await gitLine(repo, "diff", ...args, "--shortstat"));

	return {
		patch: truncated ? `${raw.slice(0, PATCH_BUDGET)}\n… diff truncated …\n` : raw,
		files,
		insertions: shortstat.insertions + untrackedInsertions,
		deletions: shortstat.deletions,
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

/**
 * Files git does not track yet, honoring .gitignore.
 *
 * `git diff` (staged or not) never mentions these, so without this call a
 * snapshot of a fresh checkout with three new files reports zero files.
 */
async function listUntracked(repo: string): Promise<string[]> {
	return splitLines(await gitLine(repo, "ls-files", "--others", "--exclude-standard"));
}

/**
 * A synthetic unified diff for untracked files, treating each as all-added.
 *
 * Example: a new `notes.txt` containing `hello` becomes
 * `diff --git a/notes.txt b/notes.txt` plus `+hello`, so the model sees the
 * content even though `git diff` prints nothing for it.
 *
 * Unreadable, binary, or vanished files stay in `files` but contribute no
 * patch lines — the file list is the guarantee, the patch is best-effort.
 */
async function buildUntrackedPatch(
	repo: string,
	untracked: string[],
): Promise<{ patch: string; insertions: number }> {
	let patch = "";
	let insertions = 0;
	for (const name of untracked) {
		let content: string;
		try {
			content = await readFile(join(repo, name), "utf8");
		} catch {
			continue;
		}
		if (content.includes("\0")) {
			patch += `diff --git a/${name} b/${name}\nnew file mode 100644\nBinary files /dev/null and b/${name} differ\n`;
			continue;
		}
		const lines = content === "" ? [] : content.split("\n").map((line) => line.replace(/\r$/, ""));
		if (lines.length > 0 && lines[lines.length - 1] === "" && content.endsWith("\n")) lines.pop();
		insertions += lines.length;
		patch +=
			`diff --git a/${name} b/${name}\nnew file mode 100644\n--- /dev/null\n+++ b/${name}\n` +
			`@@ -0,0 +1,${lines.length} @@\n` +
			(lines.length > 0 ? `${lines.map((line) => `+${line}`).join("\n")}\n` : "");
	}
	return { patch, insertions };
}
