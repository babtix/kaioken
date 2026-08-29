import { basename } from "node:path";
import type { GateCommand } from "./gate.js";
import type { KnowledgeContext } from "./types.js";

/**
 * The system prompt is where this engine's advantage is spent or wasted.
 *
 * A generic coding agent guesses about the repository and then writes confident
 * prose about its guesses. This one is told, up front, three things it cannot
 * derive: what the repository is made of, what written procedure already exists
 * for working in it, and exactly which commands will be run against its claim of
 * success. The rest of the prompt exists to make it prefer asking the index over
 * remembering.
 *
 * What is deliberately *not* here: the skills themselves, and the wiki. Both are
 * a tool call away. Inlining them would spend the context window on material for
 * tasks this session is not doing.
 */

export interface PromptOptions {
	/** Commands the gate will run when the agent claims it is finished. */
	gate: readonly GateCommand[];
	/** Whether the agent can change files this session. */
	canWrite: boolean;
}

export function buildSystemPrompt(ctx: KnowledgeContext, options: PromptOptions): string {
	const sections: string[] = [];

	sections.push(
		[
			`You are Kaioken, working inside the repository "${basename(ctx.root)}".`,
			"",
			"You have a structural index of this repository and, where they have been",
			"generated, a verified wiki and knowledge cards. Prefer them over recall:",
			"you can determine whether a symbol exists rather than assuming, and that is",
			"the one question you are otherwise worst at.",
		].join("\n"),
	);

	sections.push(["## This repository", "", describeRepository(ctx)].join("\n"));

	if (ctx.skills.length > 0) {
		const lines = ctx.skills.map((skill) => `- **${skill.name}** — ${skill.description}`);
		sections.push(
			[
				"## Skills",
				"",
				"Written procedures for tasks in this repository. Load one with `skill_load`",
				"before doing a task it covers; where a skill and your defaults disagree, the",
				"skill wins — it was written by someone who knows this codebase.",
				"",
				...lines,
			].join("\n"),
		);
	}

	sections.push(
		[
			"## How to work",
			"",
			"- Before stating that a function, type or constant exists, confirm it with",
			"  `symbol_lookup`. A negative answer from it is definitive; treat it as fact.",
			"- Use `wiki_search` to find where a topic lives before reading files at random.",
			"- Quote code only from what you have actually read. Do not reconstruct it.",
			"- Say plainly when something is not in the index rather than filling the gap.",
		].join("\n"),
	);

	sections.push(gateSection(options));

	return sections.join("\n\n");
}

/**
 * Tell the agent the gate exists, and what is in it.
 *
 * Naming the exact commands is the point. An agent that knows its work will be
 * compiled and tested runs those commands itself, and an agent that has been
 * told nothing declares victory on a file it never parsed. The gate runs either
 * way — but it should be a confirmation, not a surprise.
 */
function gateSection(options: PromptOptions): string {
	const lines = ["## Finishing", ""];

	if (options.canWrite) {
		lines.push(
			"You can change files in this repository. Keep changes minimal and in the style",
			"of the code around them.",
			"",
		);
	} else {
		lines.push(
			"This session is read-only: you have no tool that changes a file. Where a change",
			"is needed, describe it precisely — path, and the edit — rather than pretending",
			"to have made it.",
			"",
		);
	}

	if (options.gate.length === 0) {
		lines.push(
			"No build or test command could be discovered for this repository, so nothing",
			"will verify your work automatically. Be correspondingly careful, and say so",
			"when you are unsure.",
		);
		return lines.join("\n");
	}

	lines.push(
		"When you say you are finished, these commands are run and their exit codes decide",
		"whether the work is accepted:",
		"",
		...options.gate.map((command) => `    ${command.command}`),
		"",
		"Run them yourself before you claim to be done. Do not report success on work you",
		"have not seen pass.",
	);

	return lines.join("\n");
}

function describeRepository(ctx: KnowledgeContext): string {
	const languages = new Map<string, number>();
	for (const file of ctx.scan.files) {
		if (file.language === "unknown" || file.binary) continue;
		languages.set(file.language, (languages.get(file.language) ?? 0) + 1);
	}

	const top = [...languages.entries()]
		.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
		.slice(0, 6)
		.map(([language, count]) => `${language} (${count})`);

	const lines = [
		`- ${ctx.scan.fileCount} files scanned; ${ctx.index.files.length} indexed for declarations.`,
	];
	if (top.length > 0) lines.push(`- Languages: ${top.join(", ")}.`);

	const directories = topDirectories(ctx);
	if (directories.length > 0) lines.push(`- Top-level layout: ${directories.join(", ")}.`);

	// Whether documentation exists changes which tool the agent should reach for
	// first, so it is stated rather than left to be discovered by a failed call.
	if (ctx.provenance.length > 0) {
		lines.push(
			`- ${ctx.provenance.length} generated document(s) are indexed and searchable via \`wiki_search\`.`,
		);
	} else {
		lines.push(
			"- No wiki or cards have been generated yet, so `wiki_search` reaches declarations only.",
		);
	}

	return lines.join("\n");
}

function topDirectories(ctx: KnowledgeContext): string[] {
	const counts = new Map<string, number>();
	for (const file of ctx.scan.files) {
		const slash = file.path.indexOf("/");
		if (slash === -1) continue;
		const dir = file.path.slice(0, slash);
		counts.set(dir, (counts.get(dir) ?? 0) + 1);
	}
	return [...counts.entries()]
		.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
		.slice(0, 8)
		.map(([dir]) => `${dir}/`);
}
