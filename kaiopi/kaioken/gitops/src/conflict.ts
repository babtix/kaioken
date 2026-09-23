import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { git, gitLine } from "./run.ts";
import { worktreeStatus } from "./worktree.ts";

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

/**
 * Scan repository for merge conflicts and measure branch divergence.
 */
export async function detectConflicts(
	repo: string,
	baseBranch = "main",
	incomingBranch?: string,
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
	};
}

/**
 * Render an ANSI-styled visual merge conflict warning card.
 */
export function renderConflictCard(info: MergeConflictInfo): string {
	const totalMarkers = info.conflictedFiles.reduce((acc, f) => acc + f.markerCount, 0);
	const fileCount = info.conflictedFiles.length;

	const border = "─".repeat(68);
	const lines = [
		`┌${border}┐`,
		`│ ⚠️  MERGE CONFLICT WARNING CARD                                     │`,
		`├${border}┤`,
		`│ Base Branch    : ${pad(info.baseBranch, 48)} │`,
		`│ Incoming Branch: ${pad(info.incomingBranch, 48)} │`,
		`│ Divergence     : ${pad(`${info.ahead} commit(s) ahead, ${info.behind} commit(s) behind`, 48)} │`,
		`│ Conflicted     : ${pad(`${fileCount} file(s) with ${totalMarkers} conflict marker section(s)`, 48)} │`,
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

	lines.push(
		`├${border}┤`,
		`│ Actionable Recovery Playbook:                                      │`,
		`│ 1. Inspect 3-way diff: kaioken gitops conflict --path <file>       │`,
		`│ 2. Rebase worktree branch: git rebase ${pad(info.baseBranch, 27)}  │`,
		`│ 3. Resolve markers, run git add, git rebase --continue             │`,
		`│ 4. Re-run verification gate before re-attempting fast-forward      │`,
		`└${border}┘`,
	);

	return lines.join("\n");
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
