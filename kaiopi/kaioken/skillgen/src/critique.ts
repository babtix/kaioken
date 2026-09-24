import { parseProcedureSteps } from "@kaioken/skills";

/**
 * Adversarial critique repair loop support (UX-1721–UX-1730).
 *
 * The writer drafts; the critic attacks. This module is the attacker: given a
 * skill body and the repository scan, it lists every step that cannot be
 * trusted — cited paths the repo does not contain, placeholder steps with no
 * actionable content, and a missing Verification section. `writeSkill` runs
 * this critic between drafts and only keeps a revision that reduces the defect
 * count, so ungrounded steps are eliminated rather than reworded.
 */

export type SkillCritiqueDefectKind = "ungrounded_path" | "empty_step" | "missing_verification";

export interface SkillCritiqueDefect {
	kind: SkillCritiqueDefectKind;
	/** Zero-based step index, or -1 for document-level defects. */
	step: number;
	/** The offending claim: missing path, step title, or section name. */
	claim: string;
	/** 1-based line number in the body, or 0 when not applicable. */
	line: number;
	detail: string;
}

export interface SkillCritiqueReport {
	defects: SkillCritiqueDefect[];
	/** Sorted unique missing paths cited by the body. */
	ungrounded: string[];
	/** 0–100 grounding score. 100 means no defects. */
	score: number;
	/** True when there are no defects. */
	grounded: boolean;
}

export type KnownFilesInput =
	| ReadonlyMap<string, string>
	| readonly string[]
	| { files: readonly { path: string }[] };

function knownPaths(known: KnownFilesInput): Set<string> {
	if (known instanceof Map) return new Set<string>(known.keys());
	if (Array.isArray(known)) return new Set<string>(known);
	const withFiles = known as { files: readonly { path: string }[] };
	return new Set<string>(withFiles.files.map((file) => file.path));
}

function isFileLike(candidate: string): boolean {
	if (!candidate || candidate.length > 200) return false;
	if (candidate.startsWith("http://") || candidate.startsWith("https://")) return false;
	return /^[\w./-]+\.[A-Za-z0-9]{1,8}$/.test(candidate);
}

function lineOf(body: string, index: number): number {
	return body.slice(0, index).split("\n").length;
}

function isPlaceholderStep(body: string): boolean {
	const normalised = body.trim().toLowerCase();
	if (!normalised) return true;
	if (normalised.length < 12) return true;
	return /^(todo|tbd|fixme|xxx|\.+|wip)\b/.test(normalised);
}

/**
 * Critique a skill body against the repository scan.
 *
 * Pure and fail-soft: non-string bodies yield a single empty-step defect
 * rather than throwing, so the repair loop can always ask "what is wrong".
 */
export function critiqueSkill(body: string, known: KnownFilesInput): SkillCritiqueDefect[] {
	if (typeof body !== "string" || !body.trim()) {
		return [{ kind: "empty_step", step: -1, claim: "(empty body)", line: 0, detail: "skill body is empty" }];
	}
	const knownSet = knownPaths(known);
	const defects: SkillCritiqueDefect[] = [];
	const seenPaths = new Set<string>();
	const steps = parseProcedureSteps(body);
	const stepOfLine = new Map<number, number>();
	for (const step of steps) {
		for (let line = step.line; line < step.line + step.body.split("\n").length; line++) {
			if (!stepOfLine.has(line)) stepOfLine.set(line, step.index);
		}
		if (isPlaceholderStep(step.body)) {
			defects.push({
				kind: "empty_step",
				step: step.index,
				claim: step.title,
				line: step.line,
				detail: `step ${step.index + 1} has no actionable content`,
			});
		}
	}
	for (const match of body.matchAll(/`([^`\n]+)`/g)) {
		const candidate = (match[1] ?? "").trim();
		if (!isFileLike(candidate)) continue;
		if (candidate.startsWith("http")) continue;
		const path = candidate.replace(/^\.\//, "");
		if (knownSet.has(path) || seenPaths.has(path)) continue;
		seenPaths.add(path);
		const matchIndex = match.index ?? 0;
		const line = lineOf(body, matchIndex);
		defects.push({
			kind: "ungrounded_path",
			step: stepOfLine.get(line) ?? -1,
			claim: path,
			line,
			detail: `cited path "${path}" does not exist in the repository scan`,
		});
	}
	if (!/^##\s+verification\b/im.test(body)) {
		defects.push({
			kind: "missing_verification",
			step: -1,
			claim: "## Verification",
			line: 0,
			detail: "skill has no ## Verification section prescribing how to confirm the change",
		});
	}
	return defects.sort((a, b) => a.line - b.line || a.claim.localeCompare(b.claim));
}

/** Sorted unique missing paths — the repair loop's stop condition. */
export function ungroundedPaths(body: string, known: KnownFilesInput): string[] {
	const out = new Set<string>();
	for (const defect of critiqueSkill(body, known)) {
		if (defect.kind === "ungrounded_path") out.add(defect.claim);
	}
	return [...out].sort();
}

/** Summarise a defect list into a score and grounded flag. */
export function summariseCritique(defects: readonly SkillCritiqueDefect[]): SkillCritiqueReport {
	let penalty = 0;
	const ungrounded = new Set<string>();
	for (const defect of defects) {
		if (defect.kind === "ungrounded_path") {
			penalty += 25;
			ungrounded.add(defect.claim);
		} else if (defect.kind === "empty_step") {
			penalty += 10;
		} else {
			penalty += 15;
		}
	}
	const score = Math.max(0, 100 - penalty);
	return {
		defects: [...defects],
		ungrounded: [...ungrounded].sort(),
		score,
		grounded: defects.length === 0,
	};
}

/** Human- and model-readable rendering of a defect list for the repair prompt. */
export function formatCritiqueReport(defects: readonly SkillCritiqueDefect[]): string {
	if (defects.length === 0) return "No grounding defects.";
	const lines = ["Skill critique — fix every item below:"];
	for (const defect of defects) {
		const where = defect.line > 0 ? `line ${defect.line}` : "document";
		const step = defect.step >= 0 ? `step ${defect.step + 1}` : "document";
		lines.push(`- [${defect.kind}] ${where} (${step}): \`${defect.claim}\` — ${defect.detail}`);
	}
	return lines.join("\n");
}
