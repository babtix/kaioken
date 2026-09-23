import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { KAIOKEN_DIR } from "@kaioken/scan";
import type { IndexResult } from "./types.js";

export const INDEX_ARTIFACT = join(KAIOKEN_DIR, "index.json");

export function indexArtifactPath(root: string): string {
	return join(resolve(root), INDEX_ARTIFACT);
}

/** Inspectable on disk before the next stage reads it, like every other stage. */
export async function writeIndexArtifact(root: string, index: IndexResult): Promise<string> {
	const path = indexArtifactPath(root);
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, `${JSON.stringify(index, null, 2)}\n`, "utf8");
	return path;
}

export async function readIndexArtifact(root: string): Promise<IndexResult | null> {
	try {
		return JSON.parse(await readFile(indexArtifactPath(root), "utf8")) as IndexResult;
	} catch {
		return null;
	}
}
