import { relative, resolve } from "node:path";
import { buildIndex, readIndexArtifact, writeIndexArtifact } from "@kaioken/index";
import { type FileRecord, type Risk, scan, writeScanArtifact } from "@kaioken/scan";
import type { Flags } from "../main.js";

/**
 * One traversal, then the declaration inventory over it. Both artifacts land on
 * disk before anything downstream reads them, and neither stage touches the
 * network — this command must work in a fresh clone with no credentials.
 */
export async function runScan(flags: Flags): Promise<number> {
	const root = resolve(flags.root);
	const started = Date.now();

	const scanResult = await scan(root);
	const scanPath = await writeScanArtifact(root, scanResult);

	const previous = flags.force ? null : await readIndexArtifact(root);
	const { index, stats } = await buildIndex(scanResult, { previous, force: flags.force });
	const indexPath = await writeIndexArtifact(root, index);

	const elapsedMs = Date.now() - started;

	if (flags.json) {
		process.stdout.write(
			`${JSON.stringify(
				{
					root,
					elapsedMs,
					scan: {
						artifact: relative(root, scanPath),
						fileCount: scanResult.fileCount,
						totalBytes: scanResult.totalBytes,
						languages: countBy(scanResult.files, (f) => f.language),
						risk: countRisks(scanResult.files),
					},
					index: {
						artifact: relative(root, indexPath),
						fileCount: index.fileCount,
						symbolCount: index.symbolCount,
						unparsedLanguages: index.unparsedLanguages,
						...stats,
					},
				},
				null,
				2,
			)}\n`,
		);
		return 0;
	}

	const out: string[] = [];
	out.push(`scanned ${root}`);
	out.push(
		`  ${scanResult.fileCount} files, ${formatBytes(scanResult.totalBytes)} in ${elapsedMs}ms`,
	);

	const languages = topEntries(countBy(scanResult.files, (f) => f.language), 8);
	if (languages.length > 0) {
		out.push("");
		out.push("languages");
		for (const [language, count] of languages) {
			out.push(`  ${language.padEnd(14)} ${count}`);
		}
	}

	const risks = countRisks(scanResult.files);
	out.push("");
	if (Object.keys(risks).length === 0) {
		out.push("risk flags        none");
	} else {
		out.push("risk flags");
		for (const [risk, count] of topEntries(risks, 10)) {
			out.push(`  ${risk.padEnd(14)} ${count}`);
		}
	}

	out.push("");
	out.push("symbols");
	out.push(`  ${index.symbolCount} declarations across ${index.fileCount} files`);
	out.push(`  ${stats.parsed} parsed, ${stats.reused} reused, ${stats.skipped} not indexable`);

	const unparsed = topEntries(index.unparsedLanguages, 5);
	if (unparsed.length > 0) {
		out.push(`  no grammar bound: ${unparsed.map(([l, c]) => `${l} (${c})`).join(", ")}`);
	}

	out.push("");
	out.push(`wrote ${relative(root, scanPath)}`);
	out.push(`wrote ${relative(root, indexPath)}`);

	process.stdout.write(`${out.join("\n")}\n`);
	return 0;
}

function countBy<T>(items: T[], key: (item: T) => string): Record<string, number> {
	const out: Record<string, number> = {};
	for (const item of items) {
		const k = key(item);
		out[k] = (out[k] ?? 0) + 1;
	}
	return out;
}

function countRisks(files: FileRecord[]): Record<Risk, number> {
	const out = {} as Record<Risk, number>;
	for (const file of files) {
		for (const risk of file.risk) out[risk] = (out[risk] ?? 0) + 1;
	}
	return out;
}

function topEntries(counts: Record<string, number>, limit: number): [string, number][] {
	return Object.entries(counts)
		.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
		.slice(0, limit);
}

function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	const units = ["KiB", "MiB", "GiB"];
	let value = bytes / 1024;
	let unit = 0;
	while (value >= 1024 && unit < units.length - 1) {
		value /= 1024;
		unit++;
	}
	return `${value.toFixed(1)} ${units[unit]}`;
}
