import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { agentsExists, generateAgents, refreshKnowledgeBlock } from "@kaioken/agentsmd";
import { KAIOKEN_DIR, scan, writeScanArtifact } from "@kaioken/scan";
import { ensureIndex } from "../artifacts.js";
import type { Flags } from "../main.js";
import { resolveModelClient } from "../model.js";

/**
 * `kaioken init` — the one command to run the first time you point Kaioken at a
 * repository.
 *
 * Init used to be conceivable as "write a config file and stop", which would
 * leave the repository no better off than before: everything useful lives
 * behind three more commands. So it does the whole cheap half of the pipeline —
 * record the model, scan, index, and write the AGENTS.md any agent reads before
 * touching the code — and stops before the expensive half. The wiki and the
 * cards cost real tokens and real minutes; those stay something you ask for.
 *
 * Nothing here overwrites a decision already made. An existing model.json is
 * left alone, and an existing AGENTS.md is improved in place rather than
 * replaced, unless `force` says otherwise.
 */
export async function runInit(flags: Flags): Promise<number> {
	const root = resolve(flags.root);
	const force = flags.force || (flags.positional[0] ?? "").toLowerCase() === "force";
	const steps: string[] = [];

	await mkdir(join(root, KAIOKEN_DIR), { recursive: true });

	const model = await ensureModelConfig(root, flags.model);
	steps.push(
		model.created
			? `recorded the model in ${KAIOKEN_DIR}/model.json (${model.spec})`
			: model.spec
				? `model already configured (${model.spec}) — left alone`
				: `no model configured yet — set one with \`kaioken init --model <provider>/<id>\``,
	);

	const scanResult = await scan(root);
	await writeScanArtifact(root, scanResult);
	steps.push(`scanned ${scanResult.fileCount} files`);

	// The index is what every later question is answered from, and building it
	// needs no credentials — so there is no reason to make the user ask twice.
	const index = await ensureIndex(root, flags.force);
	steps.push(`indexed ${index.files.length} files`);

	const agents = await writeAgents(root, scanResult, flags, force);
	steps.push(agents);

	if (flags.json) {
		process.stdout.write(`${JSON.stringify({ root, steps }, null, 2)}\n`);
		return 0;
	}

	for (const step of steps) process.stdout.write(`  ${step}\n`);
	process.stdout.write("\nnext: `kaioken wiki` to generate documentation, or `kaioken chat` to ask about the code\n");
	return 0;
}

/**
 * Record the model choice, without ever overwriting one already made.
 *
 * Kaioken assumes no model anywhere else, and init is not the place to start:
 * a default written here would be billed on every later command by someone who
 * never chose it.
 */
async function ensureModelConfig(
	root: string,
	spec: string | undefined,
): Promise<{ created: boolean; spec: string }> {
	const path = join(root, KAIOKEN_DIR, "model.json");
	const existing = await readModelSpec(path);
	if (existing) return { created: false, spec: existing };
	if (!spec) return { created: false, spec: "" };

	await writeFile(path, `${JSON.stringify({ model: spec }, null, 2)}\n`, "utf8");
	return { created: true, spec };
}

async function readModelSpec(path: string): Promise<string> {
	try {
		const parsed = JSON.parse(await readFile(path, "utf8")) as { model?: unknown };
		return typeof parsed.model === "string" ? parsed.model : "";
	} catch {
		return "";
	}
}

/**
 * AGENTS.md, when a model is available for it.
 *
 * Without one, init still succeeds: the scan and the index are the parts that
 * make the repository queryable, and refusing to do them because no API key is
 * configured would be the wrong trade. The pointer block is refreshed either
 * way, since that needs no model at all.
 */
async function writeAgents(
	root: string,
	scanResult: Awaited<ReturnType<typeof scan>>,
	flags: Flags,
	force: boolean,
): Promise<string> {
	if ((await agentsExists(root)) && !force) {
		const refreshed = await refreshKnowledgeBlock(root);
		return refreshed
			? "AGENTS.md already exists — refreshed its generated section (`--force` rewrites the prose)"
			: "AGENTS.md already exists — left alone (`--force` rewrites it)";
	}

	const resolved = await resolveModelClient(flags);
	if (!resolved.ok) return `AGENTS.md skipped — ${firstLine(resolved.reason)}`;

	try {
		const result = await generateAgents({ root, scan: scanResult, client: resolved.client });
		return `${result.updated ? "improved" : "wrote"} AGENTS.md (${result.lines} lines, from ${result.sources.length} evidence files)`;
	} catch (error) {
		// A failed AGENTS.md does not undo a good scan and index, so this
		// reports rather than aborting — but it reports rather than hiding.
		return `AGENTS.md failed — ${error instanceof Error ? error.message : String(error)}`;
	}
}

function firstLine(text: string): string {
	return text.split("\n")[0] ?? text;
}
