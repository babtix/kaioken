import { resolve } from "node:path";
import { type KnowledgeContext, loadSkills, type SkillProblem } from "@kaioken/agent";
import { SymbolOracle } from "@kaioken/index";
import { readScanArtifact, scan, type ScanResult, writeScanArtifact } from "@kaioken/scan";
import { contributedSkills } from "@kaioken/ext";
import { SearchIndex } from "@kaioken/search";
import { ensureIndex } from "./artifacts.js";
import { gatherProvenance } from "./commands/status.js";

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
	const { skills, problems } = await loadSkills(absolute);

	// Installed extensions contribute skills into the same catalog. This is
	// what makes `ext install` mean anything: a documentation pack that the
	// agent never loads is a directory of files nobody reads. The repository's
	// own skills come first — a pack must not shadow what this project says
	// about itself — and an extension's are namespaced by its id.
	const contributed = await contributedSkills();
	const catalog = [...skills, ...contributed.skills.filter((skill) => !skills.some((own) => own.name === skill.name))];
	const skillIssues = [
		...problems,
		...contributed.problems.map((problem) => ({ path: problem.path, reason: `${problem.extension}: ${problem.reason}` })),
	];

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
		skillProblems: skillIssues,
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
