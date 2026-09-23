import { mkdir, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { skillsDir } from "@kaioken/agent";
import type { IndexResult } from "@kaioken/index";
import type { ModelClient } from "@kaioken/model";
import { gatherModuleEvidence } from "@kaioken/plan";
import type { ScanResult } from "@kaioken/scan";
import type { SkillProposal } from "./propose.js";

/**
 * Writing one skill.
 *
 * The body is a checklist, and the only thing that makes it worth more than a
 * general model's guess is that every step names a file this repository
 * actually contains. So the sources are resolved from the scan before the model
 * sees them, and the paths it cites are checked against the scan afterwards —
 * a skill that sends an agent to a file that does not exist is worse than no
 * skill, because the agent will believe it.
 */

const WRITE_SYSTEM = `You write ONE skill for an AI coding agent working in a specific repository. The
agent has already read this project's wiki; your job is procedural, not descriptive: how is
this task actually performed HERE.

Write markdown with this shape:

# <Task title>

One or two sentences: what this skill covers and when to use it.

## Prerequisites
Only if there are real ones (a running service, a generated file, an env var).

## Steps
A numbered list. Each step names REAL files and functions from the sources, in the order a
contributor touches them. Where a step means "copy the existing pattern", show the pattern
with a short verbatim excerpt and its path.

## Conventions to follow
The local rules that are NOT obvious from the code alone: naming, error handling, where
registration happens, what must be updated in lockstep. Be specific to this repo.

## Verification
How to confirm the change worked here — the actual test, build or run command this repo uses.

## Common mistakes
Failure modes a newcomer or an agent hits in THIS codebase. Only real ones you can support
from the sources.

Rules:
- Ground everything in the provided sources. Never invent a file, function, command or step.
- Be concise and imperative. This is a checklist an agent follows, not an essay. Aim for
  60-150 lines; if the task is genuinely simple, be shorter.
- Quote code verbatim when showing a pattern, and cite its path.
- Do NOT restate what the code is; state what to DO.

Output ONLY the markdown body. No frontmatter, no JSON, no commentary.`;

export interface WriteSkillInput {
	root: string;
	proposal: SkillProposal;
	scan: ScanResult;
	index: IndexResult | null;
	client: ModelClient;
	notes?: readonly string[];
}

export interface WrittenSkill {
	name: string;
	description: string;
	/** Repository-relative path of the file written. */
	path: string;
	lines: number;
	/** The files the skill was written from, as resolved against the scan. */
	sources: string[];
	/**
	 * Paths the body cites that the repository does not contain.
	 *
	 * Reported, never hidden: this is the one failure mode that makes a skill
	 * actively harmful, and the author is the only person who can fix it.
	 */
	ungrounded: string[];
}

export async function writeSkill(input: WriteSkillInput): Promise<WrittenSkill> {
	const known = new Map(input.scan.files.map((file) => [file.path, file.hash]));
	const sources = resolveSources(input.scan, input.proposal.files);

	const evidence = gatherModuleEvidence(input.index, sources, { knownFiles: known });

	const body = unfence(
		(
			await input.client.complete({
				system: WRITE_SYSTEM,
				prompt: buildPrompt(input.proposal, evidence, input.notes ?? []),
				purpose: `skill ${input.proposal.name}`,
			})
		).trim(),
	);
	if (!body) throw new Error(`the model returned an empty body for skill "${input.proposal.name}"`);

	const description = input.proposal.description || input.proposal.task;
	const document = [
		"---",
		`name: ${input.proposal.name}`,
		`description: ${JSON.stringify(description)}`,
		"origin: generated",
		`generatedAt: ${new Date().toISOString()}`,
		...(sources.length > 0 ? ["sources:", ...sources.map((path) => `  - ${path}`)] : []),
		"---",
		"",
		body,
		"",
	].join("\n");

	const dir = skillsDir(input.root);
	await mkdir(dir, { recursive: true });
	const file = join(dir, `${input.proposal.name}.md`);
	await writeFile(file, document, "utf8");

	return {
		name: input.proposal.name,
		description,
		path: `.kaioken/skills/${input.proposal.name}.md`,
		lines: document.split("\n").length,
		sources,
		ungrounded: citedButMissing(body, known),
	};
}

/** Does the repository already have this skill? */
export async function skillExists(root: string, name: string): Promise<boolean> {
	try {
		return (await stat(join(skillsDir(root), `${name}.md`))).isFile();
	} catch {
		return false;
	}
}

/**
 * The proposal's file list, resolved against what the repository contains.
 *
 * A proposal may name a directory ("apps/cli/src/commands"), which stands for
 * the files under it — that is how a contributor would describe where a pattern
 * lives, and refusing to expand it would leave the writer with no sources for
 * the most useful skills.
 */
function resolveSources(scan: ScanResult, wanted: readonly string[]): string[] {
	const paths = new Set<string>();
	const all = scan.files.map((file) => file.path);

	for (const entry of wanted) {
		const clean = entry.replace(/^\.\//, "").replace(/\/+$/, "");
		if (!clean) continue;
		if (all.includes(clean)) {
			paths.add(clean);
			continue;
		}
		const prefix = `${clean}/`;
		for (const path of all) {
			if (path.startsWith(prefix)) paths.add(path);
		}
	}

	// A skill written from two hundred files is a skill written from none: the
	// evidence would be summarised into uselessness before the model saw it.
	return [...paths].sort().slice(0, 40);
}

/** Paths the body cites in backticks that the scan does not contain. */
function citedButMissing(body: string, known: ReadonlyMap<string, string>): string[] {
	const missing = new Set<string>();
	for (const match of body.matchAll(/`([^`\n]+)`/g)) {
		const candidate = (match[1] as string).trim();
		// Only things shaped like a repository path are checked. A command in
		// backticks is not a claim about a file, and flagging `npm test` as a
		// missing path would bury the real findings.
		if (!/^[\w./-]+\.[A-Za-z0-9]{1,8}$/.test(candidate)) continue;
		if (candidate.startsWith("http")) continue;
		const path = candidate.replace(/^\.\//, "");
		if (!known.has(path)) missing.add(path);
	}
	return [...missing].sort();
}

function buildPrompt(
	proposal: SkillProposal,
	evidence: ReturnType<typeof gatherModuleEvidence>,
	notes: readonly string[],
): string {
	const out: string[] = [
		`Skill: ${proposal.name}`,
		"",
		`Task it teaches: ${proposal.task}`,
		`When it applies: ${proposal.description}`,
		"",
	];

	if (notes.length > 0) {
		out.push("Maintainer steering notes (authoritative):", ...notes.map((note) => `- ${note}`), "");
	}

	out.push("Sources — the files that show how this is done here:", "");
	for (const file of evidence.files) {
		out.push(`--- ${file.path} (${file.language || "text"}, ${file.lineCount} lines)`);
		for (const declaration of file.declarations) out.push(`  ${declaration}`);
	}
	if (evidence.missing.length > 0) {
		out.push(
			"",
			"These paths were proposed but do not exist in this repository. Do not refer to them:",
			...evidence.missing.map((path) => `- ${path}`),
		);
	}
	return out.join("\n");
}

function unfence(text: string): string {
	let out = text.trim();
	for (const tag of ["```markdown", "```md", "```"]) {
		if (out.startsWith(tag)) {
			out = out.slice(tag.length).trim();
			if (out.endsWith("```")) out = out.slice(0, -3);
			break;
		}
	}
	return out.trim();
}
