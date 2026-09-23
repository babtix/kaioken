import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { IndexResult } from "@kaioken/index";
import type { ModelClient } from "@kaioken/modelport";
import { gatherModuleEvidence } from "@kaioken/plan";
import type { ScanResult } from "@kaioken/scan";
import { skillsDir } from "@kaioken/skills";
import { detectCommands } from "@kaioken/verify";
import type { SkillProposal } from "./propose.ts";

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

const REPAIR_SYSTEM = `You revise a skill document against a defect report.

Fix exactly what the report names: replace or remove citations to files that do
not exist in this repository, and ensure all cited paths match real repository files.
Keep the rest of the markdown document intact and concise. Output ONLY the markdown body.`;

export interface WriteSkillInput {
	root: string;
	proposal: SkillProposal;
	scan: ScanResult;
	index: IndexResult | null;
	client: ModelClient;
	notes?: readonly string[];
	repairPasses?: number;
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
	/**
	 * Prescribed verification commands in ## Verification that do not correspond
	 * to anything declared in the repository.
	 */
	unverifiedCommands: string[];
}

export async function writeSkill(input: WriteSkillInput): Promise<WrittenSkill> {
	const known = new Map(input.scan.files.map((file) => [file.path, file.hash]));
	const sources = resolveSources(input.scan, input.proposal.files);

	const evidence = gatherModuleEvidence(input.index, sources, { knownFiles: known });

	let body = unfence(
		(
			await input.client.complete({
				system: WRITE_SYSTEM,
				prompt: buildPrompt(input.proposal, evidence, input.notes ?? []),
				purpose: `skill ${input.proposal.name}`,
			})
		).trim(),
	);
	if (!body) throw new Error(`the model returned an empty body for skill "${input.proposal.name}"`);

	let ungrounded = citedButMissing(body, known);
	const repairPasses = input.repairPasses ?? 2;

	for (let pass = 0; pass < repairPasses && ungrounded.length > 0; pass++) {
		const revisedRaw = await input.client.complete({
			system: REPAIR_SYSTEM,
			prompt: buildCorrectionPrompt(body, ungrounded, evidence),
			purpose: `skill repair ${input.proposal.name} pass ${pass + 1}`,
		});
		const revisedBody = unfence(revisedRaw.trim());
		if (!revisedBody) continue;
		const candidateUngrounded = citedButMissing(revisedBody, known);
		if (candidateUngrounded.length < ungrounded.length) {
			body = revisedBody;
			ungrounded = candidateUngrounded;
		}
	}

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

	const prescribed = extractPrescribedCommands(body);
	const unverifiedCommands = await validateVerificationCommands(input.root, prescribed);

	return {
		name: input.proposal.name,
		description,
		path: `.kaioken/skills/${input.proposal.name}.md`,
		lines: document.split("\n").length,
		sources,
		ungrounded,
		unverifiedCommands,
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

function buildCorrectionPrompt(
	body: string,
	ungrounded: readonly string[],
	evidence: ReturnType<typeof gatherModuleEvidence>,
): string {
	const lines = [
		"Your previous skill document cited file paths that do NOT exist in this repository:",
		...ungrounded.map((path) => `- \`${path}\``),
		"",
		"Replace or remove citations to those nonexistent files. Only cite files that exist in the evidence sources below:",
		"",
		...evidence.files.map((file) => `- \`${file.path}\``),
		"",
		"Previous draft:",
		body,
	];
	return lines.join("\n");
}

const COMMAND_RUNNERS = new Set([
	"npm",
	"npx",
	"pnpm",
	"pnpx",
	"yarn",
	"bun",
	"bunx",
	"deno",
	"cargo",
	"go",
	"make",
	"pytest",
	"python",
	"python3",
	"vitest",
	"jest",
	"tsc",
	"gradle",
	"mvn",
	"rake",
	"dotnet",
	"mix",
]);

function isLikelyCommand(candidate: string): boolean {
	if (!candidate || candidate.length > 200) return false;
	if (candidate.startsWith("http://") || candidate.startsWith("https://")) return false;
	if (/^[\w./-]+\.[A-Za-z0-9]{1,8}$/.test(candidate) && !candidate.startsWith("./")) return false;

	const firstWord = candidate.split(/\s+/)[0] ?? "";
	if (COMMAND_RUNNERS.has(firstWord)) return true;
	if (candidate.startsWith("./") || candidate.startsWith("sh ") || candidate.startsWith("bash ")) return true;
	return false;
}

export function extractPrescribedCommands(body: string): string[] {
	const match = body.match(/^##\s+Verification\b([^\n]*\n(?:(?!^##\s+).*\n*)*)/im);
	if (!match || !match[1]) return [];
	const section = match[1];

	const commands = new Set<string>();

	for (const block of section.matchAll(/```(?:[a-zA-Z0-9_-]+)?\s*\n([\s\S]*?)\n```/g)) {
		const lines = (block[1] ?? "").split("\n");
		for (const line of lines) {
			const trimmed = line.trim().replace(/^[$>]\s*/, "");
			if (trimmed && !trimmed.startsWith("#") && !trimmed.startsWith("//")) {
				commands.add(trimmed);
			}
		}
	}

	for (const inline of section.matchAll(/`([^`\n]+)`/g)) {
		const candidate = (inline[1] ?? "").trim().replace(/^[$>]\s*/, "");
		if (isLikelyCommand(candidate)) {
			commands.add(candidate);
		}
	}

	return [...commands];
}

async function pathExists(file: string): Promise<boolean> {
	try {
		await stat(file);
		return true;
	} catch {
		return false;
	}
}

export async function validateVerificationCommands(
	root: string,
	commands: readonly string[],
): Promise<string[]> {
	if (commands.length === 0) return [];

	let gateCommands: string[] = [];
	try {
		const detected = await detectCommands(root);
		gateCommands = detected.commands.map((c) => c.command.trim());
	} catch {
		// ignore
	}

	const packageScripts = new Set<string>();
	try {
		const pkgContent = await readFile(join(root, "package.json"), "utf8");
		const pkg = JSON.parse(pkgContent) as { scripts?: Record<string, unknown> };
		if (pkg && typeof pkg === "object" && pkg.scripts && typeof pkg.scripts === "object") {
			for (const key of Object.keys(pkg.scripts)) {
				packageScripts.add(key);
			}
		}
	} catch {
		// ignore
	}

	const makeTargets = new Set<string>();
	try {
		const makeContent = await readFile(join(root, "Makefile"), "utf8");
		for (const match of makeContent.matchAll(/^([a-zA-Z0-9_.-]+)\s*:/gm)) {
			const target = match[1]?.trim();
			if (target && !target.startsWith(".")) makeTargets.add(target);
		}
	} catch {
		// ignore
	}

	const hasCargo = await pathExists(join(root, "Cargo.toml"));
	const hasGo = await pathExists(join(root, "go.mod"));
	const hasPy =
		(await pathExists(join(root, "pyproject.toml"))) ||
		(await pathExists(join(root, "setup.py"))) ||
		(await pathExists(join(root, "requirements.txt")));
	const hasDeno =
		(await pathExists(join(root, "deno.json"))) ||
		(await pathExists(join(root, "deno.jsonc")));

	const unverified: string[] = [];

	for (const cmd of commands) {
		const clean = cmd.trim();
		if (!clean) continue;

		if (gateCommands.some((gc) => clean === gc || clean.startsWith(gc) || gc.startsWith(clean))) {
			continue;
		}

		const pmMatch = /^(?:npm|pnpm|yarn|bun)(?:\s+run)?\s+([a-zA-Z0-9:_-]+)/.exec(clean);
		if (pmMatch) {
			const scriptName = pmMatch[1];
			if (scriptName && packageScripts.has(scriptName)) {
				continue;
			}
			if (scriptName === "test" && (packageScripts.has("test") || gateCommands.length > 0)) {
				continue;
			}
		}

		const makeMatch = /^make(?:\s+([a-zA-Z0-9_.-]+))?/.exec(clean);
		if (makeMatch) {
			const target = makeMatch[1] ?? "";
			if (!target && makeTargets.size > 0) continue;
			if (target && makeTargets.has(target)) continue;
		}

		if (hasCargo && /^cargo\s+(?:test|build|check|run|clippy)/.test(clean)) {
			continue;
		}

		if (hasGo && /^go\s+(?:test|build|vet|run)/.test(clean)) {
			continue;
		}

		if (hasPy && /^(?:pytest|python\s+-m\s+unittest)/.test(clean)) {
			continue;
		}

		if (hasDeno && /^deno\s+(?:test|check|lint)/.test(clean)) {
			continue;
		}

		if (clean.startsWith("./")) {
			const scriptPath = clean.split(/\s+/)[0]?.replace(/^\.\//, "") ?? "";
			if (await pathExists(join(root, scriptPath))) {
				continue;
			}
		}

		unverified.push(clean);
	}

	return unverified;
}
