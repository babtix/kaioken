import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scan, type ScanResult } from "@kaioken/scan";
import { afterEach, describe, expect, it } from "vitest";
import {
	changedSourcesFor,
	computeStaleness,
	invalidatedBy,
	type Provenance,
} from "../dist/index.js";

/**
 * Phase 5's answer must be honest and must never require a model. Presenting
 * decayed documentation as current is the failure this whole mechanism exists to
 * prevent, so every case below runs offline against real content hashes.
 */

const roots: string[] = [];

afterEach(async () => {
	await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function repo(files: Record<string, string>): Promise<{ root: string; scan: ScanResult }> {
	const root = await mkdtemp(join(tmpdir(), "kaioken-prov-"));
	roots.push(root);
	for (const [path, content] of Object.entries(files)) {
		await writeFile(join(root, path), content, "utf8");
	}
	return { root, scan: await scan(root) };
}

/** Provenance as it would have been written at generation time. */
function recordFor(document: string, scanned: ScanResult, paths: string[]): Provenance {
	return {
		document,
		generatedAt: "2026-01-01T00:00:00.000Z",
		sources: paths.map((path) => ({
			path,
			hash: scanned.files.find((f) => f.path === path)?.hash ?? "missing",
		})),
	};
}

const FILES = { "a.ts": "export const a = 1;\n", "b.ts": "export const b = 2;\n" };

describe("freshness", () => {
	it("calls a document current when every source is byte-identical", async () => {
		const { scan: scanned } = await repo(FILES);
		const report = computeStaleness([recordFor("doc.md", scanned, ["a.ts"])], scanned);

		expect(report.ok).toBe(true);
		expect(report.freshness).toBe(1);
		expect(report.documents[0]?.freshness).toBe("current");
	});

	it("calls it stale when a source changed", async () => {
		const { root, scan: before } = await repo(FILES);
		const record = recordFor("doc.md", before, ["a.ts", "b.ts"]);

		await writeFile(join(root, "a.ts"), "export const a = 99;\n", "utf8");
		const report = computeStaleness([record], await scan(root));

		expect(report.ok).toBe(false);
		expect(report.documents[0]).toMatchObject({
			freshness: "stale",
			changed: ["a.ts"],
			unchanged: ["b.ts"],
		});
	});

	it("distinguishes a deleted source from a changed one", async () => {
		const { root, scan: before } = await repo(FILES);
		const record = recordFor("doc.md", before, ["a.ts", "b.ts"]);

		await rm(join(root, "b.ts"));
		const report = computeStaleness([record], await scan(root));

		expect(report.documents[0]?.deleted).toEqual(["b.ts"]);
		expect(report.documents[0]?.freshness).toBe("stale");
	});

	it("calls a document orphaned when every source is gone", async () => {
		const { root, scan: before } = await repo(FILES);
		const record = recordFor("doc.md", before, ["a.ts"]);

		await rm(join(root, "a.ts"));
		const report = computeStaleness([record], await scan(root));

		// Different from stale: regenerating this would produce nothing.
		expect(report.documents[0]?.freshness).toBe("orphaned");
		expect(report.orphaned).toHaveLength(1);
	});

	it("refuses to call a document with no sources current", async () => {
		const { scan: scanned } = await repo(FILES);
		const report = computeStaleness(
			[{ document: "doc.md", generatedAt: "", sources: [] }],
			scanned,
		);
		// Saying "current" would be a claim the record does not support.
		expect(report.documents[0]?.freshness).toBe("unknown");
	});

	it("is unmoved by a file that no document was written from", async () => {
		const { root, scan: before } = await repo(FILES);
		const record = recordFor("doc.md", before, ["a.ts"]);

		await writeFile(join(root, "b.ts"), "export const b = 999;\n", "utf8");
		const report = computeStaleness([record], await scan(root));

		expect(report.ok).toBe(true);
		expect(report.undocumentedFiles).toContain("b.ts");
	});

	it("reports the share of documents that still match", async () => {
		const { root, scan: before } = await repo(FILES);
		const records = [
			recordFor("one.md", before, ["a.ts"]),
			recordFor("two.md", before, ["b.ts"]),
		];

		await writeFile(join(root, "a.ts"), "export const a = 3;\n", "utf8");
		const report = computeStaleness(records, await scan(root));

		expect(report.freshness).toBe(0.5);
		expect(report.stale.map((s) => s.document)).toEqual(["one.md"]);
	});

	it("counts a changed file once however many documents cite it", async () => {
		const { root, scan: before } = await repo(FILES);
		const records = [
			recordFor("one.md", before, ["a.ts"]),
			recordFor("two.md", before, ["a.ts"]),
		];

		await writeFile(join(root, "a.ts"), "export const a = 3;\n", "utf8");
		const report = computeStaleness(records, await scan(root));

		expect(report.changedFiles).toEqual(["a.ts"]);
		expect(report.stale).toHaveLength(2);
	});
});

describe("invalidation", () => {
	it("names only the documents written from a changed path", async () => {
		const { scan: scanned } = await repo(FILES);
		const records = [
			recordFor("one.md", scanned, ["a.ts"]),
			recordFor("two.md", scanned, ["b.ts"]),
			recordFor("both.md", scanned, ["a.ts", "b.ts"]),
		];

		// The point of provenance: the set is computed, not guessed at.
		expect(invalidatedBy(records, ["a.ts"])).toEqual(["both.md", "one.md"]);
	});

	it("names nothing for a path no document cites", async () => {
		const { scan: scanned } = await repo(FILES);
		expect(invalidatedBy([recordFor("one.md", scanned, ["a.ts"])], ["elsewhere.ts"])).toEqual([]);
	});

	it("returns only the sources that moved, for a targeted diff", async () => {
		const { root, scan: before } = await repo(FILES);
		const record = recordFor("doc.md", before, ["a.ts", "b.ts"]);

		await writeFile(join(root, "a.ts"), "export const a = 7;\n", "utf8");
		const changed = changedSourcesFor(record, await scan(root));

		// Showing the model the whole bundle again would cost as much as
		// generating from scratch.
		expect(changed).toHaveLength(1);
		expect(changed[0]?.path).toBe("a.ts");
		expect(changed[0]?.now).not.toBe(changed[0]?.was);
	});

	it("reports a deleted source as having no current hash", async () => {
		const { root, scan: before } = await repo(FILES);
		const record = recordFor("doc.md", before, ["a.ts"]);

		await rm(join(root, "a.ts"));
		const changed = changedSourcesFor(record, await scan(root));
		expect(changed[0]?.now).toBeNull();
	});
});

describe("no documents at all", () => {
	it("is trivially fresh rather than dividing by zero", async () => {
		const { scan: scanned } = await repo(FILES);
		const report = computeStaleness([], scanned);
		expect(report.ok).toBe(true);
		expect(report.freshness).toBe(1);
	});
});
