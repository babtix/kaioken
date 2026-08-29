import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type { ScanResult } from "./types.js";

/** Everything the pipeline derives lives here, at the repo root. */
export const KAIOKEN_DIR = ".kaioken";
export const SCAN_ARTIFACT = join(KAIOKEN_DIR, "scan.json");

export function scanArtifactPath(root: string): string {
	return join(resolve(root), SCAN_ARTIFACT);
}

/**
 * No stage is a black box: the scan writes an inspectable artifact before the
 * next stage reads it. Formatted, sorted and newline-terminated so a diff of two
 * scans is readable by a person.
 */
export async function writeScanArtifact(root: string, result: ScanResult): Promise<string> {
	const path = scanArtifactPath(root);
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, `${JSON.stringify(result, null, 2)}\n`, "utf8");
	return path;
}

export async function readScanArtifact(root: string): Promise<ScanResult | null> {
	try {
		const text = await readFile(scanArtifactPath(root), "utf8");
		return JSON.parse(text) as ScanResult;
	} catch {
		return null;
	}
}
