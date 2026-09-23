import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { KAIOKEN_DIR, scan } from "@kaioken/scan";
import { computeStaleness } from "./staleness.ts";
import type { Provenance, StalenessReport } from "./types.ts";

export async function readProvenanceIndex(root: string): Promise<Provenance[] | null> {
	for (const loc of [join(root, KAIOKEN_DIR, "wiki", "provenance.json"), join(root, KAIOKEN_DIR, "provenance.json")]) {
		try {
			const data = JSON.parse(await readFile(loc, "utf8"));
			if (data && Array.isArray(data.documents)) return data.documents;
		} catch {
			// ignore missing or malformed
		}
	}
	return null;
}

export async function readCardsSafe(root: string): Promise<Provenance[]> {
	const cardsDir = join(root, KAIOKEN_DIR, "cards");
	const out: Provenance[] = [];
	try {
		const files = await readdir(cardsDir);
		for (const file of files) {
			if (!file.endsWith(".json")) continue;
			try {
				const card = JSON.parse(await readFile(join(cardsDir, file), "utf8"));
				if (card?.sources) {
					out.push({
						document: `card:${card.moduleId || file.replace(/\.json$/, "")}`,
						generatedAt: card.generatedAt || "",
						sources: card.sources,
					});
				}
			} catch {
				// ignore
			}
		}
	} catch {
		// cards directory does not exist yet
	}
	return out;
}

export async function gatherProvenance(root: string): Promise<Provenance[]> {
	const records: Provenance[] = [];
	const wiki = await readProvenanceIndex(root);
	if (wiki) records.push(...wiki);
	const cards = await readCardsSafe(root);
	records.push(...cards);
	return records;
}

export async function checkDrift(root: string): Promise<StalenessReport> {
	const scanResult = await scan(root);
	const records = await gatherProvenance(root);
	return computeStaleness(records, scanResult);
}
