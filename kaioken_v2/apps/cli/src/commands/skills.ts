import { resolve } from "node:path";
import { loadSkills } from "@kaioken/agent";
import { refreshKnowledgeBlock } from "@kaioken/agentsmd";
import { parseMultiplier } from "@kaioken/model";
import { readScanArtifact, scan, writeScanArtifact } from "@kaioken/scan";
import { proposeSkills, skillExists, writeSkill, type SkillProposal } from "@kaioken/skillgen";
import { readWikiPlan } from "@kaioken/wiki";
import { ensureIndex } from "../artifacts.js";
import type { Flags } from "../main.js";
import { resolveModelClient } from "../model.js";

/**
 * `kaioken skills [xN|list]` — the task guides an agent loads before working.
 *
 * The wiki answers "what is this?"; a skill answers "how do I do X here?".
 * Generating them is two stages for the same reason the wiki is: deciding
 * *which* procedures this repository has is a different question from writing
 * one, and doing both in a single call produces a list of plausible-sounding
 * chapter titles with steps invented underneath them.
 *
 * A skill that already exists is never overwritten without `--force`. Skills
 * are the one tenant a person is expected to edit by hand.
 */
export async function runSkills(flags: Flags): Promise<number> {
	const root = resolve(flags.root);
	const first = (flags.positional[0] ?? "").toLowerCase();

	if (first === "list") return listExisting(root, flags);

	const multiplier = parseMultiplier(flags.positional.find((arg) => /^x\d+$/i.test(arg)) ?? flags.multiplier);
	if (multiplier === null) {
		process.stderr.write("kaioken skills: multiplier must be x1..x10\n");
		return 1;
	}

	const resolved = await resolveModelClient(flags);
	if (!resolved.ok) {
		process.stderr.write(`kaioken skills: ${resolved.reason}\n`);
		return 1;
	}

	// The cached scan unless --force: this command answers from the recorded
	// state of the repository, and re-walking a large tree to answer a question
	// about it is the slowest thing it could do. --force is how you say the
	// record is stale.
	const scanResult = flags.force ? await scan(root) : ((await readScanArtifact(root)) ?? (await scan(root)));
	await writeScanArtifact(root, scanResult);
	const index = await ensureIndex(root, flags.force);

	const plan = await readWikiPlan(root);
	let proposals: SkillProposal[];
	try {
		proposals = await proposeSkills({
			scan: scanResult,
			index,
			client: resolved.client,
			chapters: (plan?.chapters ?? []).map((chapter) => chapter.title),
			notes: flags.note ?? [],
			// The dial buys breadth here: more of the repository's recurring
			// tasks get a guide, rather than each guide getting longer.
			limit: Math.min(4 + multiplier * 2, 16),
		});
	} catch (error) {
		process.stderr.write(`kaioken skills: ${error instanceof Error ? error.message : String(error)}\n`);
		return 1;
	}

	if (proposals.length === 0) {
		process.stderr.write("kaioken skills: the model proposed no skills for this repository\n");
		return 1;
	}

	// `--module` doubles as "only this skill" here: one name, one regeneration,
	// so a single bad guide can be rewritten without paying for the whole set.
	const only = flags.module ? new Set(flags.module.split(",").map((name) => name.trim())) : null;

	const written: string[] = [];
	const skipped: string[] = [];
	const failed: string[] = [];
	const ungrounded: string[] = [];

	for (const proposal of proposals) {
		if (only && !only.has(proposal.name)) continue;
		if (!flags.force && (await skillExists(root, proposal.name))) {
			skipped.push(proposal.name);
			continue;
		}
		try {
			const result = await writeSkill({
				root,
				proposal,
				scan: scanResult,
				index,
				client: resolved.client,
				notes: flags.note ?? [],
			});
			written.push(result.name);
			for (const path of result.ungrounded) ungrounded.push(`${result.name}: ${path}`);
		} catch (error) {
			// One failed skill must not cost the set: the others are already
			// written, and they are what the run was for.
			failed.push(`${proposal.name} (${error instanceof Error ? error.message : String(error)})`);
		}
	}

	// New skills are only useful if an agent learns they exist. Free, and a
	// no-op in a repository with no AGENTS.md.
	const refreshed = await refreshKnowledgeBlock(root);

	if (flags.json) {
		process.stdout.write(
			`${JSON.stringify({ written, skipped, failed, ungrounded, refreshedAgents: refreshed }, null, 2)}\n`,
		);
		return failed.length > 0 && written.length === 0 ? 1 : 0;
	}

	if (written.length > 0) process.stdout.write(`wrote ${written.length} skill(s): ${written.join(", ")}\n`);
	if (skipped.length > 0) {
		process.stdout.write(`skipped ${skipped.length} that already exist: ${skipped.join(", ")}\n`);
		process.stdout.write("  --force rewrites them\n");
	}
	for (const problem of failed) process.stderr.write(`failed: ${problem}\n`);
	if (ungrounded.length > 0) {
		// Said out loud rather than filed away: a step pointing at a file that
		// does not exist is the one defect that makes a skill worse than none.
		process.stdout.write(`\n${ungrounded.length} cited path(s) the repository does not contain:\n`);
		for (const line of ungrounded.slice(0, 20)) process.stdout.write(`  ${line}\n`);
	}
	if (refreshed) process.stdout.write("\nrefreshed the generated section of AGENTS.md\n");
	return failed.length > 0 && written.length === 0 ? 1 : 0;
}

/** `kaioken skills list` — what this repository already has. */
async function listExisting(root: string, flags: Flags): Promise<number> {
	const { skills, problems } = await loadSkills(root);

	if (flags.json) {
		process.stdout.write(`${JSON.stringify({ skills, problems }, null, 2)}\n`);
		return 0;
	}
	if (skills.length === 0 && problems.length === 0) {
		process.stdout.write("no skills yet — `kaioken skills` writes them\n");
		return 0;
	}
	for (const skill of skills) process.stdout.write(`${skill.name} — ${skill.description}\n  ${skill.path}\n`);
	for (const problem of problems) process.stderr.write(`unusable: ${problem.path} — ${problem.reason}\n`);
	return 0;
}
