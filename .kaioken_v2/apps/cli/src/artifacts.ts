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
	// The build carries unchanged files across by hash, so a warm repository
	// comes back byte-identical apart from `builtAt`. Serialising and writing
	// the artifact again anyway turned every read-side command — and, worse,
	// every chat turn — into a rewrite of a quarter-megabyte file for no
	// change at all. When the content is the same, the file stays as it is.
	if (!force && previous && sameIndex(previous, index)) return index;
	await writeIndexArtifact(root, index);
	return index;
}

/** Same inventory, `builtAt` aside — a timestamp is not a change. */
function sameIndex(a: IndexResult, b: IndexResult): boolean {
	return (
		a.fileCount === b.fileCount &&
		a.symbolCount === b.symbolCount &&
		JSON.stringify(a.files) === JSON.stringify(b.files)
	);
}
