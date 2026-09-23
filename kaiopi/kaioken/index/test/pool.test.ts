import { describe, expect, it } from "vitest";
import {
	clearParserPools,
	getAllPoolStats,
	getParserPool,
	loadGrammar,
	pruneAllIdleParsers,
	withParser,
} from "../src/index.ts";

describe("tree-sitter WASM parser pool recycling (UX-0611-UX-0620)", () => {
	it("recycles parser instances across repeated acquire/release cycles", async () => {
		const grammar = await loadGrammar("typescript");
		expect(grammar).not.toBeNull();

		clearParserPools();
		const pool = getParserPool("typescript", grammar!.language, { maxSize: 2 });

		const parser1 = await pool.acquire();
		expect(pool.inUseCount).toBe(1);
		expect(pool.availableCount).toBe(0);

		pool.release(parser1);
		expect(pool.inUseCount).toBe(0);
		expect(pool.availableCount).toBe(1);

		const parser2 = await pool.acquire();
		// Reused the released instance
		expect(parser2).toBe(parser1);
		expect(pool.inUseCount).toBe(1);

		pool.release(parser2);
		expect(pool.availableCount).toBe(1);
	});

	it("tracks telemetry metrics including creation, recycled count and eviction", async () => {
		const grammar = await loadGrammar("python");
		expect(grammar).not.toBeNull();

		clearParserPools();
		const pool = getParserPool("python", grammar!.language, { maxSize: 3 });

		await withParser("python", grammar!.language, (p) => {
			const tree = p.parse("x = 1");
			tree?.delete();
		});

		await withParser("python", grammar!.language, (p) => {
			const tree = p.parse("y = 2");
			tree?.delete();
		});

		const stats = pool.stats;
		expect(stats.language).toBe("python");
		expect(stats.totalAcquired).toBe(2);
		expect(stats.totalReleased).toBe(2);
		expect(stats.totalCreated).toBe(1);
		expect(stats.totalRecycled).toBe(2);
		expect(stats.idleCount).toBe(1);
		expect(stats.activeCount).toBe(0);

		const allStats = getAllPoolStats();
		expect(allStats["python"]?.totalCreated).toBe(1);
	});

	it("handles concurrent requests within pool capacity without deadlock", async () => {
		const grammar = await loadGrammar("go");
		expect(grammar).not.toBeNull();

		clearParserPools();
		const pool = getParserPool("go", grammar!.language, { maxSize: 2 });

		const tasks = Array.from({ length: 6 }, async (_, i) => {
			return withParser("go", grammar!.language, async (parser) => {
				const tree = parser.parse(`package main\nconst Val${i} = ${i}\n`);
				const count = tree?.rootNode.namedChildCount ?? 0;
				tree?.delete();
				return count;
			});
		});

		const results = await Promise.all(tasks);
		expect(results).toHaveLength(6);
		expect(pool.stats.totalCreated).toBeLessThanOrEqual(2);
		expect(pool.stats.totalAcquired).toBe(6);
	});

	it("prunes idle parsers older than maxIdleMs threshold", async () => {
		const grammar = await loadGrammar("typescript");
		expect(grammar).not.toBeNull();

		clearParserPools();
		const pool = getParserPool("typescript", grammar!.language, {
			maxSize: 4,
			maxIdleMs: 50,
		});

		const p1 = await pool.acquire();
		const p2 = await pool.acquire();
		pool.release(p1);
		pool.release(p2);
		expect(pool.availableCount).toBe(2);

		// Wait 60ms to exceed maxIdleMs
		await new Promise((r) => setTimeout(r, 65));

		const pruned = pruneAllIdleParsers(50);
		expect(pruned).toBe(2);
		expect(pool.availableCount).toBe(0);
	});
});
