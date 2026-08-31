import { resolve } from "node:path";
import { currentBranch, isRepo, readDiff, recentSubjects } from "@kaioken/gitops";
import type { Flags } from "../main.js";
import { resolveModelClient } from "../model.js";

/**
 * `kaioken draft [base]` — the commit message and PR description for the change
 * that is sitting there right now.
 *
 * Grounded twice over. The change itself comes from git rather than from the
 * conversation, so the draft describes what was actually done rather than what
 * was discussed; and the house style comes from the repository's own recent
 * subjects, so a project that writes `fix(parser): …` does not get handed
 * `Fix the parser` by a model that prefers it.
 *
 * Advisory only. Nothing is staged, nothing is committed, and no branch is
 * touched — the output is text to read and edit.
 */
export async function runDraft(flags: Flags): Promise<number> {
	const root = resolve(flags.root);

	if (!(await isRepo(root))) {
		process.stderr.write(`kaioken draft: ${root} is not a git repository\n`);
		return 1;
	}

	const base = flags.positional[0];
	const diff = await readDiff(root, base);
	if (!diff || diff.patch.trim() === "") {
		process.stderr.write(
			base
				? `kaioken draft: no changes against ${base} — nothing to draft\n`
				: "kaioken draft: the working tree is clean — nothing to draft\n",
		);
		return 1;
	}

	const resolved = await resolveModelClient(flags);
	if (!resolved.ok) {
		process.stderr.write(`kaioken draft: ${resolved.reason}\n`);
		return 1;
	}

	const subjects = await recentSubjects(root, 20);
	const branch = await currentBranch(root);

	let output: string;
	try {
		output = (
			await resolved.client.complete({
				system: DRAFT_SYSTEM,
				prompt: buildPrompt(diff, subjects, branch, flags.note ?? []),
				purpose: "commit draft",
			})
		).trim();
	} catch (error) {
		process.stderr.write(`kaioken draft: ${error instanceof Error ? error.message : String(error)}\n`);
		return 1;
	}

	if (flags.json) {
		process.stdout.write(
			`${JSON.stringify({ against: diff.against, files: diff.files, truncated: diff.truncated, draft: output }, null, 2)}\n`,
		);
		return 0;
	}

	process.stdout.write(
		`${diff.files.length} file(s) changed against ${diff.against}, +${diff.insertions}/-${diff.deletions}\n\n`,
	);
	process.stdout.write(`${output}\n`);
	// Said after the draft rather than before it: the reader has just been
	// handed something that looks like a commit, and the one thing they need to
	// know is that nothing has happened to their repository.
	process.stdout.write("\nnothing was staged or committed — this is a draft\n");
	if (diff.truncated) {
		process.stdout.write("the diff was truncated for the prompt; the file list above is complete\n");
	}
	return 0;
}

const DRAFT_SYSTEM = `You write commit messages and pull-request descriptions for one repository.

You are given the unified diff of a change, the repository's recent commit subjects as
house style, and any steering notes the team recorded.

Rules:
- Match the repository's own commit style — its format, tone and scopes — as shown by the
  recent subjects. Do not impose conventional commits on a project that does not use them.
- The summary line stays under 72 characters. Add a body only when the change has a real
  "why" to explain.
- The PR description has three parts: what changed, why, and how to test it.
- Describe only what the diff actually shows. Never invent tickets, reviewers, issue
  numbers, or behaviour the diff does not support.
- If the diff was truncated, describe what you can see and do not guess at the rest.

Output exactly this shape, with no commentary around it:

## Commit message
<message>

## PR description
<description>`;

function buildPrompt(
	diff: { patch: string; files: string[]; against: string; truncated: boolean },
	subjects: readonly string[],
	branch: string,
	notes: readonly string[],
): string {
	const out: string[] = [];
	if (branch) out.push(`Branch: ${branch}`, "");
	out.push(`Files changed (${diff.files.length}):`, ...diff.files.map((file) => `  ${file}`), "");
	out.push(`Diff of the current change (against ${diff.against}):`, "", diff.patch, "");

	if (subjects.length > 0) {
		// Recent history rather than the range being drafted: an uncommitted
		// change still deserves the project's voice, and the range may be empty
		// of commits entirely.
		out.push("Recent commit subjects, as style reference:", ...subjects.map((s) => `  ${s}`), "");
	}
	if (notes.length > 0) {
		out.push("Team steering notes:", ...notes.map((note) => `  - ${note}`), "");
	}
	return out.join("\n");
}
