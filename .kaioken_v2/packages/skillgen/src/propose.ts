import { extractJson, type ModelClient } from "@kaioken/model";
import { gatherEvidence, type RepositoryEvidence } from "@kaioken/plan";
import type { IndexResult } from "@kaioken/index";
import type { ScanResult } from "@kaioken/scan";

/**
 * Which tasks in this repository deserve a written procedure.
 *
 * The wiki describes; a skill prescribes. That distinction is the whole of the
 * planning prompt, because the failure mode is not a bad skill — it is a set of
 * skills that are really chapters, restating what the code is under a
 * verb-shaped name and teaching nobody how to do anything.
 */

export interface SkillProposal {
	/** kebab-case, verb-led. Becomes the file name. */
	name: string;
	/** What it covers and when to load it — what a runtime matches on. */
	description: string;
	/** The one task it teaches, in a sentence. */
	task: string;
	/** Repository files that show how the task is done here. */
	files: string[];
}

const PLAN_SYSTEM = `You are deciding which SKILLS to write for a specific repository.

A skill is a short, task-oriented guide an AI coding agent loads at the moment it starts
work: "how do I do X in THIS project". Good skills describe RECURRING TASKS a contributor
actually performs — not descriptions of what the code is, which the wiki already covers.

Good skills for a typical repo look like:
- add-an-api-endpoint, add-a-cli-command, add-a-database-migration
- write-a-test, run-the-test-suite, debug-a-failing-build
- add-a-ui-component, wire-a-new-config-option, release-a-version

Bad skills (do NOT produce these):
- "architecture-overview", "project-structure" — those are wiki chapters, not tasks
- anything a general model already knows without this repo ("how to write Go")

Propose 5-12 skills that fit THIS repository's actual stack and layout. For each give:
- name: kebab-case, verb-led, specific ("add-a-tui-command", not "tui")
- description: one or two sentences saying what it covers AND when an agent should load
  it. This is what a runtime matches against, so name the concrete triggers.
- task: one sentence stating the task the skill teaches
- files: the repo-relative files or directories that show how this task is done here —
  include real examples an agent should imitate

Return ONLY JSON: {"skills":[{"name":"...","description":"...","task":"...","files":["..."]}]}`;

export interface ProposeInput {
	scan: ScanResult;
	index: IndexResult | null;
	client: ModelClient;
	/** Wiki chapter titles, so the plan prescribes where the wiki describes. */
	chapters?: readonly string[];
	notes?: readonly string[];
	/** Upper bound on how many skills to keep. */
	limit?: number;
}

export async function proposeSkills(input: ProposeInput): Promise<SkillProposal[]> {
	const evidence = gatherEvidence(input.scan, input.index);
	const raw = await input.client.complete({
		system: PLAN_SYSTEM,
		prompt: buildPlanPrompt(evidence, input.chapters ?? [], input.notes ?? []),
		purpose: "skill plan",
	});

	// `extractJson` throws when the reply carries no JSON at all, and that is
	// the right shape: a plan that could not be read is not the same as a
	// repository with no recurring tasks, and the caller has to say so.
	const parsed = extractJson<{ skills?: unknown }>(raw);
	const proposed = Array.isArray(parsed.skills) ? parsed.skills : [];

	const out: SkillProposal[] = [];
	const seen = new Set<string>();
	for (const entry of proposed) {
		const proposal = normalise(entry);
		// A duplicate name would mean the second skill silently overwrote the
		// first on disk — one paid-for generation destroying another.
		if (!proposal || seen.has(proposal.name)) continue;
		seen.add(proposal.name);
		out.push(proposal);
		if (input.limit && out.length >= input.limit) break;
	}
	return out;
}

function normalise(entry: unknown): SkillProposal | null {
	if (!entry || typeof entry !== "object") return null;
	const record = entry as Record<string, unknown>;
	const name = slug(typeof record.name === "string" ? record.name : "");
	if (!name) return null;

	const description = text(record.description);
	const task = text(record.task);
	return {
		name,
		// The description is what a runtime matches on, so a skill without one
		// is a skill that never loads. The task sentence is the fallback.
		description: description || task,
		task: task || description,
		files: Array.isArray(record.files)
			? record.files.filter((file): file is string => typeof file === "string" && file.trim() !== "")
			: [],
	};
}

/** A model-supplied name, made safe to be a file name. */
export function slug(name: string): string {
	return name
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 60);
}

function text(value: unknown): string {
	return typeof value === "string" ? value.trim() : "";
}

function buildPlanPrompt(
	evidence: RepositoryEvidence,
	chapters: readonly string[],
	notes: readonly string[],
): string {
	const languages = Object.entries(evidence.languages)
		.sort((a, b) => b[1] - a[1])
		.slice(0, 10)
		.map(([language, count]) => `${language} (${count})`);

	const out: string[] = [
		`Repository: ${evidence.fileCount} files, ${evidence.totalBytes} bytes`,
		`Languages: ${languages.join(", ")}`,
		"",
		"Layout — directory, file count, and what is declared there:",
		"",
	];

	for (const directory of evidence.directories.slice(0, 60)) {
		out.push(
			`${directory.path || "."}/ — ${directory.fileCount} files [${directory.languages.slice(0, 3).join(", ")}]`,
		);
		if (directory.symbols.length > 0) out.push(`  declares: ${directory.symbols.slice(0, 10).join(", ")}`);
	}

	if (evidence.entryFiles.length > 0) {
		out.push("", `Entry points: ${evidence.entryFiles.slice(0, 20).join(", ")}`);
	}
	if (evidence.readmes.length > 0) {
		out.push(`Readmes: ${evidence.readmes.slice(0, 10).join(", ")}`);
	}
	if (chapters.length > 0) {
		out.push(
			"",
			"Existing wiki chapters. They describe; you prescribe. Do not propose a skill that",
			"would restate one of these:",
			...chapters.map((title) => `- ${title}`),
		);
	}
	if (notes.length > 0) {
		out.push("", "Maintainer steering notes (authoritative):", ...notes.map((note) => `- ${note}`));
	}
	return out.join("\n");
}
