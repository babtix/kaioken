import type { ScanResult } from "@kaioken/scan";
import type { DocumentStatus, Provenance, StalenessReport } from "./types.js";

/**
 * Compute freshness by comparing recorded source hashes against the scan.
 *
 * Deliberately deterministic and offline. This is the half of phase 5 that must
 * never break: a fresh clone with no credentials still has to be able to say how
 * far the code has moved past its documentation, and a system that presented
 * decayed documentation as current would be worse than one with none.
 *
 * Nothing is stored. The report is derived on demand from two artifacts that
 * already exist, so it cannot drift out of sync with either.
 */
export function computeStaleness(
	documents: readonly Provenance[],
	scan: ScanResult,
): StalenessReport {
	const current = new Map(scan.files.map((file) => [file.path, file.hash]));

	const statuses: DocumentStatus[] = documents.map((record) => status(record, current));

	const changedFiles = new Set<string>();
	const deletedFiles = new Set<string>();
	const documented = new Set<string>();

	for (const record of documents) {
		for (const source of record.sources) documented.add(source.path);
	}
	for (const entry of statuses) {
		for (const path of entry.changed) changedFiles.add(path);
		for (const path of entry.deleted) deletedFiles.add(path);
	}

	const stale = statuses.filter((s) => s.freshness === "stale");
	const orphaned = statuses.filter((s) => s.freshness === "orphaned");
	const fresh = statuses.filter((s) => s.freshness === "current");

	const undocumentedFiles = scan.files
		.filter((file) => !file.binary && !documented.has(file.path))
		.map((file) => file.path)
		.sort();

	return {
		stale,
		current: fresh,
		orphaned,
		documents: statuses,
		changedFiles: [...changedFiles].sort(),
		deletedFiles: [...deletedFiles].sort(),
		undocumentedFiles,
		freshness: statuses.length === 0 ? 1 : fresh.length / statuses.length,
		ok: stale.length === 0 && orphaned.length === 0,
	};
}

function status(record: Provenance, current: ReadonlyMap<string, string>): DocumentStatus {
	const changed: string[] = [];
	const deleted: string[] = [];
	const unchanged: string[] = [];

	for (const source of record.sources) {
		const hash = current.get(source.path);
		if (hash === undefined) deleted.push(source.path);
		else if (hash !== source.hash) changed.push(source.path);
		else unchanged.push(source.path);
	}

	return {
		document: record.document,
		freshness: freshnessOf(record, changed, deleted),
		changed: changed.sort(),
		deleted: deleted.sort(),
		unchanged: unchanged.sort(),
		generatedAt: record.generatedAt,
	};
}

function freshnessOf(
	record: Provenance,
	changed: readonly string[],
	deleted: readonly string[],
): DocumentStatus["freshness"] {
	// A document with no recorded sources cannot be judged. Saying "current"
	// would be a claim the record does not support.
	if (record.sources.length === 0) return "unknown";
	// Every source gone means the subject itself is gone, which is a different
	// problem from being out of date: regenerating would produce nothing.
	if (deleted.length === record.sources.length) return "orphaned";
	if (changed.length > 0 || deleted.length > 0) return "stale";
	return "current";
}

/**
 * Which documents a set of changed paths invalidates.
 *
 * This is the inverse lookup that makes selective regeneration possible: rather
 * than regenerating everything because something moved, match the moved files
 * against what each document was actually written from.
 */
export function invalidatedBy(
	documents: readonly Provenance[],
	changedPaths: Iterable<string>,
): string[] {
	const changed = new Set(changedPaths);
	const out: string[] = [];

	for (const record of documents) {
		if (record.sources.some((source) => changed.has(source.path))) out.push(record.document);
	}
	return out.sort();
}

/**
 * The diff to show a model when regenerating: only the sources that actually
 * moved, never the document's whole bundle. Regenerating from everything would
 * cost the same as generating from scratch and lose the point of the exercise.
 */
export function changedSourcesFor(
	record: Provenance,
	scan: ScanResult,
): { path: string; was: string; now: string | null }[] {
	const current = new Map(scan.files.map((file) => [file.path, file.hash]));

	return record.sources
		.filter((source) => current.get(source.path) !== source.hash)
		.map((source) => ({
			path: source.path,
			was: source.hash,
			now: current.get(source.path) ?? null,
		}));
}
