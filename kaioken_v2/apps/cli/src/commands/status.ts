import { resolve } from "node:path";
import { readCards } from "@kaioken/plan";
import { computeStaleness, type Provenance, type StalenessReport } from "@kaioken/provenance";
import { readScanArtifact, scan, writeScanArtifact } from "@kaioken/scan";
import { readProvenance } from "@kaioken/wiki";
import type { Flags } from "../main.js";

/**
 * How far has this repository moved past the state its documentation describes?
 *
 * No model, no network, no credentials. The whole answer is a comparison of
 * recorded content hashes against a fresh scan — which is why this keeps working
 * in a clone with no API access, and why it is the command a CI job can rely on.
 */
export async function runStatus(flags: Flags): Promise<number> {
	const root = resolve(flags.root);

	// Always a fresh scan: asking "has anything moved?" against a cached answer
	// would be circular.
	const scanResult = await scan(root);
	await writeScanArtifact(root, scanResult);

	const records = await gatherProvenance(root);

	if (records.length === 0) {
		if (flags.json) {
			process.stdout.write(`${JSON.stringify({ documents: [], ok: true, freshness: 1 }, null, 2)}\n`);
			return 0;
		}
		process.stdout.write("nothing generated yet — run `kaioken cards` or `kaioken wiki`\n");
		return 0;
	}

	const report = computeStaleness(records, scanResult);

	if (flags.json) {
		process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
	} else {
		printReport(report, flags);
	}

	// `--check` is the CI drift gate: 0 fresh, 1 stale. Without it, reporting is
	// not a failure — you often want to see the state without failing a build.
	if (flags.check) return report.ok ? 0 : 1;
	return 0;
}

/**
 * Every tenant's records in one list. Chapters and cards age identically, so
 * staleness has no reason to know which is which.
 */
export async function gatherProvenance(root: string): Promise<Provenance[]> {
	const records: Provenance[] = [];

	const wiki = await readProvenance(root);
	if (wiki) records.push(...wiki.documents);

	for (const card of await readCards(root)) {
		records.push({
			document: `card:${card.moduleId}`,
			generatedAt: card.generatedAt,
			sources: card.sources,
		});
	}

	return records;
}

/** Read the scan if it is there, otherwise take one. */
export async function scanOrRead(root: string) {
	return (await readScanArtifact(root)) ?? (await scan(root));
}

function printReport(report: StalenessReport, flags: Flags): void {
	const out: string[] = [
		`${report.documents.length} documents · ${Math.round(report.freshness * 100)}% still match their sources`,
		"",
	];

	if (report.stale.length > 0) {
		out.push(`stale (${report.stale.length})`);
		for (const entry of report.stale) {
			out.push(`  ${entry.document}`);
			for (const path of entry.changed.slice(0, 4)) out.push(`      changed: ${path}`);
			for (const path of entry.deleted.slice(0, 4)) out.push(`      deleted: ${path}`);
			const extra = entry.changed.length + entry.deleted.length - 4;
			if (extra > 0) out.push(`      ... and ${extra} more`);
		}
		out.push("");
	}

	if (report.orphaned.length > 0) {
		out.push(`orphaned (${report.orphaned.length}) — every source is gone`);
		for (const entry of report.orphaned) out.push(`  ${entry.document}`);
		out.push("");
	}

	if (flags.json !== true && report.current.length > 0 && flags.verbose) {
		out.push(`current (${report.current.length})`);
		for (const entry of report.current) out.push(`  ${entry.document}`);
		out.push("");
	}

	if (report.changedFiles.length > 0) {
		out.push(`${report.changedFiles.length} source files changed since generation`);
	}
	if (report.deletedFiles.length > 0) {
		out.push(`${report.deletedFiles.length} source files were deleted`);
	}
	// Not a defect — documentation is selective — but the honest denominator.
	out.push(`${report.undocumentedFiles.length} scanned files are described by nothing`);

	out.push("");
	out.push(
		report.ok
			? "documentation matches the code"
			: "run `kaioken update` to regenerate only what changed",
	);

	process.stdout.write(`${out.join("\n")}\n`);
}
