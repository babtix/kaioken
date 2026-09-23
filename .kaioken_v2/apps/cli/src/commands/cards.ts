import { relative, resolve } from "node:path";
import {
	type Card,
	cardsDir,
	generateCards,
	parseMultiplier,
	readModulePlan,
	validatePlan,
	writeCard,
} from "@kaioken/plan";
import { readScanArtifact, scan, writeScanArtifact } from "@kaioken/scan";
import { refreshKnowledgeBlock } from "@kaioken/agentsmd";
import { ensureIndex } from "../artifacts.js";
import type { Flags } from "../main.js";
import { resolveModelClient } from "../model.js";

/**
 * Generate a knowledge card per module.
 *
 * The plan is authoritative. Cards are generated for exactly the modules it
 * declares, over exactly the files it assigns — editing the plan is how a user
 * changes what gets generated, which is the whole reason the checkpoint exists.
 */
export async function runCards(flags: Flags): Promise<number> {
	const root = resolve(flags.root);

	const multiplier = parseMultiplier(flags.positional[0] ?? flags.multiplier);
	if (multiplier === null) {
		process.stderr.write("kaioken cards: multiplier must be x1..x10\n");
		return 1;
	}

	const plan = await readModulePlan(root);
	if (!plan) {
		process.stderr.write("kaioken cards: no module plan — run `kaioken plan` first\n");
		return 1;
	}

	const scanResult = (await readScanArtifact(root)) ?? (await writeAndReturn(root));
	const validation = validatePlan(plan, scanResult);
	if (!validation.ok) {
		// Generating against a plan with errors would spend tokens describing
		// files that do not exist.
		process.stderr.write("kaioken cards: the module plan has errors\n");
		for (const defect of validation.defects.filter((d) => d.severity === "error")) {
			process.stderr.write(`  ${defect.message}\n`);
		}
		process.stderr.write("  run `kaioken plan --check` for detail\n");
		return 1;
	}

	const index = await ensureIndex(root);
	const client = await resolveModelClient(flags);
	if (!client.ok) {
		process.stderr.write(`kaioken cards: ${client.reason}\n`);
		return 1;
	}
	if (client.warning) process.stderr.write(`kaioken cards: ${client.warning}\n`);

	// The scan's file set, so a config or docs file in scope is reported as
	// having no declarations rather than as not existing.
	const knownFiles = new Map(
		scanResult.files.filter((f) => !f.binary).map((f) => [f.path, f.hash] as const),
	);

	const results = await generateCards(plan, index, client.client, {
		multiplier,
		knownFiles,
		...(flags.module ? { only: [flags.module] } : {}),
		onProgress: (moduleId, done, total) => {
			if (!flags.json) process.stdout.write(`  [${done + 1}/${total}] ${moduleId}\n`);
		},
	});

	if (results.length === 0) {
		process.stderr.write(
			flags.module
				? `kaioken cards: no module with id "${flags.module}"\n`
				: "kaioken cards: the plan declares no module that owns files\n",
		);
		return 1;
	}

	const written: string[] = [];
	for (const result of results) written.push(await writeCard(root, result.card));

	return report(root, results.map((r) => r.card), written, flags);
}

async function writeAndReturn(root: string) {
	const result = await scan(root);
	await writeScanArtifact(root, result);
	return result;
}

async function report(root: string, cards: Card[], written: string[], flags: Flags): Promise<number> {
	const ungrounded = cards.reduce((n, c) => n + c.verification.ungrounded.length, 0);
	const unknownFiles = cards.reduce((n, c) => n + c.verification.unknownFiles.length, 0);
	// New cards change what an agent reads before editing. The refresh is free,
	// and a no-op in a repository with no AGENTS.md.
	const refreshed = written.length > 0 ? await refreshKnowledgeBlock(root) : false;

	if (flags.json) {
		process.stdout.write(`${JSON.stringify({ cards, refreshedAgents: refreshed }, null, 2)}\n`);
		return ungrounded + unknownFiles > 0 ? 1 : 0;
	}

	const out: string[] = ["", `wrote ${written.length} cards to ${relative(root, cardsDir(root))}`, ""];

	for (const card of cards) {
		const v = card.verification;
		const flag = v.ungrounded.length + v.unknownFiles.length > 0 ? "!" : " ";
		out.push(
			`${flag} ${card.moduleId.padEnd(24)} ${v.grounded} grounded, ${v.ungrounded.length} unverifiable, ${v.uncovered.length} uncovered`,
		);
		// Unverifiable claims are reported, never quietly dropped: a confidently
		// wrong card is worse than a missing one.
		for (const name of v.ungrounded.slice(0, 5)) out.push(`      unverifiable: ${name}`);
		for (const path of v.unknownFiles.slice(0, 5)) out.push(`      not in scope: ${path}`);
	}

	out.push("");
	out.push(
		ungrounded + unknownFiles === 0
			? "every claim checks out against the structural index"
			: `${ungrounded + unknownFiles} claims could not be grounded — raise the multiplier to buy correction passes`,
	);
	if (refreshed) out.push("", "refreshed the generated section of AGENTS.md");

	process.stdout.write(`${out.join("\n")}\n`);
	return ungrounded + unknownFiles > 0 ? 1 : 0;
}
