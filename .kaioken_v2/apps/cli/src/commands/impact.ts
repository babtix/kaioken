import { resolve } from "node:path";
import { predictImpact, renderImpact } from "@kaioken/impact";
import { readScanArtifact, scan, writeScanArtifact } from "@kaioken/scan";
import { ensureIndex } from "../artifacts.js";
import type { Flags } from "../main.js";
import { resolveModelClient } from "../model.js";

/**
 * `kaioken impact <description>` — the blast radius of a change, before it is
 * made.
 *
 * The whole answer is computed from the index and the provenance records: which
 * declarations the description resolves to, which files mention them, and which
 * generated documents were written from those files. A model is used only to
 * turn prose into candidate names, and every name it proposes is checked
 * against the index before it reaches the report — so the command degrades to
 * something still useful, rather than to something invented, when no model is
 * configured.
 */
export async function runImpact(flags: Flags): Promise<number> {
	const root = resolve(flags.root);
	const description = flags.positional.join(" ").trim();

	if (!description) {
		process.stderr.write('kaioken impact: describe the change — e.g. kaioken impact "rename the config loader"\n');
		return 1;
	}

	// The cached scan unless --force: this command answers from the recorded
	// state of the repository, and re-walking a large tree to answer a question
	// about it is the slowest thing it could do. --force is how you say the
	// record is stale.
	const scanResult = flags.force ? await scan(root) : ((await readScanArtifact(root)) ?? (await scan(root)));
	await writeScanArtifact(root, scanResult);
	const index = await ensureIndex(root, flags.force);

	// The model is optional here by design, so this reports rather than stops.
	const resolved = await resolveModelClient(flags);
	const report = await predictImpact({
		root,
		description,
		scan: scanResult,
		index,
		...(resolved.ok ? { client: resolved.client } : {}),
		...(flags.limit !== undefined ? { limit: flags.limit } : {}),
	});

	if (flags.json) {
		process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
		return 0;
	}

	if (!resolved.ok) {
		process.stdout.write("no model configured — matching the names in the description literally\n\n");
	}
	for (const line of renderImpact(report)) process.stdout.write(`${line}\n`);
	return 0;
}
