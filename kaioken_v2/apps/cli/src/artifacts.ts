import {
	buildIndex,
	type IndexResult,
	readIndexArtifact,
	writeIndexArtifact,
} from "@kaioken/index";
import { readScanArtifact, scan, writeScanArtifact } from "@kaioken/scan";

/**
 * Produce the phase-1 artifacts if they are not already on disk.
 *
 * Every read-side command builds on demand rather than making the user remember
 * an ordering. Reuse is by content hash, so this is close to free once warm, and
 * a first run of `search` in a fresh clone simply works.
 */
export async function ensureIndex(root: string, force = false): Promise<IndexResult> {
	const previous = force ? null : await readIndexArtifact(root);

	let scanResult = force ? null : await readScanArtifact(root);
	if (!scanResult) {
		scanResult = await scan(root);
		await writeScanArtifact(root, scanResult);
	}

	const { index } = await buildIndex(scanResult, { previous, force });
	await writeIndexArtifact(root, index);
	return index;
}
