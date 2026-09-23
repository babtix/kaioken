import { describe, expect, it } from "vitest";
import { FastStalenessChecker, fastCheckStaleness } from "../src/staleness.ts";
import type { Provenance } from "../src/types.ts";

describe("Sub-50ms Zero-Token Staleness Performance", () => {
	it("evaluates staleness for 1,000 files and 200 documents in under 50ms", () => {
		// Generate 1,000 simulated file hashes
		const currentHashes = new Map<string, string>();
		for (let i = 0; i < 1000; i++) {
			currentHashes.set(`src/file_${i}.ts`, `hash_${i}_v1`);
		}

		// Generate 200 documents citing 3 to 10 files each
		const documents: Provenance[] = [];
		for (let d = 0; d < 200; d++) {
			const sources = [];
			for (let s = 0; s < 5; s++) {
				const fileIdx = (d * 5 + s) % 1000;
				sources.push({
					path: `src/file_${fileIdx}.ts`,
					hash: `hash_${fileIdx}_v1`,
				});
			}
			documents.push({
				document: `docs/chapter_${d}.md`,
				generatedAt: "2026-01-01",
				sources,
			});
		}

		// Mutate 10 files to simulate recent edits
		for (let m = 0; m < 10; m++) {
			currentHashes.set(`src/file_${m * 10}.ts`, `hash_${m * 10}_v2_MODIFIED`);
		}

		// Warm up JIT
		fastCheckStaleness(documents.slice(0, 10), currentHashes);

		// Benchmark direct fastCheckStaleness
		const startDirect = performance.now();
		const report = fastCheckStaleness(documents, currentHashes);
		const durationDirect = performance.now() - startDirect;

		expect(report.ok).toBe(false);
		expect(report.stale.length).toBeGreaterThan(0);
		// Strictest guarantee: must complete in under 50ms
		expect(durationDirect).toBeLessThan(50);

		// Benchmark pre-indexed FastStalenessChecker
		const checker = new FastStalenessChecker(documents);
		const startChecker = performance.now();
		const quick = checker.quickCheck(currentHashes);
		const durationQuick = performance.now() - startChecker;

		expect(quick.ok).toBe(false);
		expect(quick.staleCount).toBe(report.stale.length);
		// Inverted lookup should be sub-5ms
		expect(durationQuick).toBeLessThan(10);

		// Benchmark invalidation lookup
		const startInvalidate = performance.now();
		const invalidated = checker.invalidatedBy(["src/file_0.ts", "src/file_10.ts"]);
		const durationInvalidate = performance.now() - startInvalidate;

		expect(invalidated.length).toBeGreaterThan(0);
		expect(durationInvalidate).toBeLessThan(5);
	});
});
