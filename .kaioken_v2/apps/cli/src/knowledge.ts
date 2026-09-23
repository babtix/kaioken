import { resolve } from "node:path";
import { type KnowledgeContext, loadSkills, type Skill, type SkillProblem } from "@kaioken/agent";
import { SymbolOracle } from "@kaioken/index";
import { readScanArtifact, scan, type ScanResult, writeScanArtifact } from "@kaioken/scan";
import { contributedSkills } from "@kaioken/ext";
import { SearchIndex } from "@kaioken/search";
import { ensureIndex } from "./artifacts.js";
import { gatherProvenance } from "./commands/status.js";

/**
 * One catalog, everywhere skills are read.
 *
 * The agent's context, the exporter, the graph and the onboarding document all
 * answer "what can this repository do" — and two of them reading different
 * loaders is how those answers start to disagree. Extensions contribute into
 * the same catalog here, namespaced by their id; the repository's own skills
 * come first, because a pack must not shadow what this project says of itself.
 */
export interface SkillCatalog {
	skills: Skill[];
	problems: SkillProblem[];
}

export async function loadSkillCatalog(root: string): Promise<SkillCatalog> {
	const { skills, problems } = await loadSkills(root);
	const contributed = await contributedSkills();
	return {
		skills: [
			...skills,
			...contributed.skills.filter((skill) => !skills.some((own) => own.name === skill.name)),
		],
		problems: [
			...problems,
			...contributed.problems.map((problem) => ({
				path: problem.path,
				reason: `${problem.extension}: ${problem.reason}`,
			})),
		],
	};
}

/**
 * Load everything the agent's tools read, once.
 *
 * Building this per session rather than per tool call is the difference between
 * a tool that answers instantly and one that re-scans the repository twenty
 * times in a conversation. It is also where the "build on demand" habit of every
 * other read-side command is honoured: `chat` in a fresh clone works without
 * anyone having remembered to run `scan`.
 */
export interface LoadedKnowledge {
	context: KnowledgeContext;
	/** Skill files that could not be read. Surfaced, never swallowed. */
	skillProblems: SkillProblem[];
}

export async function loadKnowledge(
	root: string,
	options: { force?: boolean } = {},
): Promise<LoadedKnowledge> {
	const absolute = resolve(root);

	const index = await ensureIndex(absolute, options.force);
	const scanResult = await currentScan(absolute, options.force === true);
	const provenance = await gatherProvenance(absolute);
	const { skills, problems } = await loadSkillCatalog(absolute);
	const catalog = skills;

	// Search is a convenience here, not a precondition: a repository whose index
	// cannot be built still answers structural questions, and losing the whole
	// session over it would be the wrong trade.
	let search: SearchIndex | null = null;
	try {
		search = await SearchIndex.open(absolute, { force: options.force === true });
	} catch {
		search = null;
	}

	return {
		context: {
			root: absolute,
			index,
			oracle: new SymbolOracle(index),
			scan: scanResult,
			provenance,
			skills: catalog,
			search,
		},
		skillProblems: problems,
	};
}

async function currentScan(root: string, force: boolean): Promise<ScanResult> {
	if (!force) {
		const existing = await readScanArtifact(root);
		if (existing) return existing;
	}
	const fresh = await scan(root);
	await writeScanArtifact(root, fresh);
	return fresh;
}
