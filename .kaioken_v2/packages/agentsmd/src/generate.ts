import { writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { readCards } from "@kaioken/plan";
import type { ModelClient } from "@kaioken/model";
import type { ScanResult } from "@kaioken/scan";
import { readWikiPlan } from "@kaioken/wiki";
import { loadSkills } from "@kaioken/agent";
import {
	agentsPath,
	authoredBody,
	knowledgeSection,
	loadAgents,
	mergeKnowledge,
} from "./document.js";
import { collectSources, renderSources, type Source } from "./sources.js";

const WRITE_SYSTEM = `You write AGENTS.md for one specific repository: the instruction file an
AI coding agent reads before it changes anything.

The test for every single line is: "would a competent agent likely get this WRONG without
being told?" If the answer is no, the line does not belong in the file. A short, dense
AGENTS.md that is entirely non-obvious beats a long one padded with generic advice.

INCLUDE, when the sources actually support it:
- exact developer commands, especially non-obvious ones (the real build, test, lint,
  typecheck, codegen and run commands, copied from task runners, CI or manifests)
- how to run ONE test or ONE package, not just the whole suite
- required command ORDER when it matters (for example lint -> typecheck -> test)
- monorepo or multi-package boundaries: which directory owns what, and the real entrypoints
- toolchain quirks: generated code and build artifacts that must never be hand-edited,
  migrations, codegen steps, special env loading, dev servers, deploy flow
- repo-specific conventions that DIFFER from the language or framework default
- testing quirks: fixtures, required services, snapshot workflow, slow or flaky suites
- constraints worth preserving from any existing instruction file in the sources

EXCLUDE, always:
- generic software advice ("write tests", "keep functions small", "use clear names")
- tutorials, exhaustive file trees, or a restatement of the directory listing
- obvious language conventions the model already knows
- anything you cannot support from the provided sources — never guess a command
- architecture prose that merely describes what the code is

Shape the file like this, dropping any section you have nothing real to put in:

# AGENTS.md

One or two sentences: what this repository is, and the single most important thing to know
before editing it.

## Commands
A short list of the exact commands, with the directory they run from when it is not the
repo root. Mark the ones that are non-obvious.

## Architecture
Only the few structural facts that change how an agent should work: package boundaries,
real entrypoints, the direction dependencies flow. A handful of bullets, not an essay.

## Conventions
Repo-specific rules that differ from defaults, each stated as an instruction.

## Gotchas
The traps: generated files, lockstep updates, required services, expensive suites.

Rules:
- Prefer executable sources of truth. When a README and a CI workflow disagree, trust CI
  and state what CI does.
- Quote commands verbatim, in backticks, exactly as they appear in the sources.
- Be terse and imperative. Aim for 40-120 lines total. Cut anything you are unsure of.
- Do NOT write a section about the .kaioken directory or the generated wiki, skills or
  knowledge cards. That section is appended automatically after you; writing your own
  would duplicate it.
- Output ONLY the markdown document. No frontmatter, no commentary, no code fence around
  the whole file.`;

const IMPROVE_SYSTEM = `${WRITE_SYSTEM}

You are IMPROVING an existing AGENTS.md, which is provided below. Do not rewrite it
blindly. Keep every claim that the current sources still support — especially team
knowledge that no config file states, since it was probably written by a human who knew
something you cannot see. Delete fluff, generic advice, and any claim the sources now
contradict. Add what is missing. Return the complete updated document.`;

export interface GenerateAgentsInput {
	root: string;
	scan: ScanResult;
	client: ModelClient;
	/** Steering notes from the session. Authoritative — a human wrote them. */
	notes?: readonly string[];
}

export interface AgentsResult {
	path: string;
	lines: number;
	/** True when an existing file was improved rather than written fresh. */
	updated: boolean;
	/** The repo-relative files handed to the model as evidence. */
	sources: string[];
}

/**
 * Write, or improve, AGENTS.md at the repository root.
 *
 * The knowledge block is spliced in from disk afterwards, so running this again
 * after `kaioken wiki` is cheap and safe: it refreshes the pointers without
 * touching a word of the prose.
 */
export async function generateAgents(input: GenerateAgentsInput): Promise<AgentsResult> {
	const root = resolve(input.root);
	const sources = await collectSources(root, input.scan);
	if (sources.length === 0) {
		throw new Error(
			`no manifests, CI config or README found in ${root} — nothing to write AGENTS.md from`,
		);
	}

	const existing = authoredBody(await loadAgents(root));
	const document = unfence(
		await input.client.complete({
			system: existing ? IMPROVE_SYSTEM : WRITE_SYSTEM,
			prompt: await buildPrompt(root, input.scan, sources, existing, input.notes ?? []),
			purpose: "AGENTS.md",
		}),
	);
	if (document === "") throw new Error("the model returned an empty AGENTS.md");

	const final = mergeKnowledge(document, await knowledgeSection(root));
	await writeFile(agentsPath(root), final, "utf8");

	return {
		path: agentsPath(root),
		lines: final.split("\n").length,
		updated: existing !== "",
		sources: sources.map((s) => s.path),
	};
}

/**
 * Rewrite only the generated pointer block, with no model call.
 *
 * This is what runs after a wiki or cards build, so the instruction file learns
 * about new documentation for free. A repository with no AGENTS.md is not an
 * error here — there is simply nothing to refresh.
 */
export async function refreshKnowledgeBlock(root: string): Promise<boolean> {
	const document = await loadAgents(root);
	if (document.trim() === "") return false;
	const section = await knowledgeSection(root);
	if (section === "") return false;
	const final = mergeKnowledge(document, section);
	if (final === document) return false;
	await writeFile(agentsPath(root), final, "utf8");
	return true;
}

/**
 * The evidence: repository shape, the executable sources, and whatever the
 * knowledge engine has already established about this codebase.
 *
 * That last part is what keeps AGENTS.md consistent with the wiki instead of
 * inventing a second, conflicting vocabulary for the same components.
 */
async function buildPrompt(
	root: string,
	scan: ScanResult,
	sources: readonly Source[],
	existing: string,
	notes: readonly string[],
): Promise<string> {
	const out: string[] = [
		`Repository root: ${basename(root)}`,
		`Inventory: ${scan.fileCount} files, ${scan.totalBytes} bytes`,
		"",
		"Top-level layout:",
		"",
		...topLevel(scan).map((entry) => `- ${entry}`),
		"",
		"Source files (executable sources of truth — trust these over prose):",
		"",
		renderSources(sources),
	];

	const plan = await readWikiPlan(root);
	if (plan && plan.chapters.length > 0) {
		out.push(
			"",
			"Existing wiki chapters. An agent can already read these, so do NOT restate their content:",
			...plan.chapters.map((chapter) => `- ${chapter.title}: ${chapter.goal}`),
		);
	}

	const cards = await readCards(root);
	if (cards.length > 0) {
		out.push(
			"",
			"Modules this repository has already been decomposed into. Use these names and this",
			"vocabulary rather than inventing your own:",
			...cards.map((card) => `- ${card.moduleId} (${card.name}): ${firstLine(card.summary)}`),
		);
	}

	const { skills } = await loadSkills(root);
	if (skills.length > 0) {
		out.push(
			"",
			"Existing task guides. Procedure for these tasks is already documented, so do NOT re-explain them:",
			...skills.map((skill) => `- ${skill.name}: ${skill.description}`),
		);
	}

	if (notes.length > 0) {
		out.push(
			"",
			"Maintainer steering notes. These are authoritative and come from a human who knows this",
			"project — reflect them in the file:",
			...notes.map((note) => `- ${note}`),
		);
	}

	if (existing !== "") {
		out.push("", "Current AGENTS.md to improve in place:", "", existing);
	}

	return out.join("\n");
}

/** The repository's top-level directories, with how much each holds. */
function topLevel(scan: ScanResult): string[] {
	const counts = new Map<string, number>();
	for (const file of scan.files) {
		const slash = file.path.indexOf("/");
		const top = slash === -1 ? "(root files)" : `${file.path.slice(0, slash)}/`;
		counts.set(top, (counts.get(top) ?? 0) + 1);
	}
	return [...counts.entries()]
		.sort((a, b) => b[1] - a[1])
		.slice(0, 25)
		.map(([name, count]) => `${name} (${count} files)`);
}

function firstLine(text: string): string {
	return (text.trim().split(/\r?\n/)[0] ?? "").slice(0, 200);
}

/** Strip the markdown fence some models wrap a whole document in. */
function unfence(document: string): string {
	let text = document.trim();
	for (const tag of ["```markdown", "```md", "```"]) {
		if (text.startsWith(tag)) {
			text = text.slice(tag.length).trim();
			if (text.endsWith("```")) text = text.slice(0, -3);
			break;
		}
	}
	return text.trim();
}
