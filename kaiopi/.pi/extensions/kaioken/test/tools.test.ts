import { describe, expect, it } from "vitest";
import { resolveExcerpt } from "../../../../kaioken/index/src/anchors.ts";
import { writeIndexArtifact } from "../../../../kaioken/index/src/artifact.ts";
import { buildIndex } from "../../../../kaioken/index/src/build.ts";
import { scan } from "../../../../kaioken/scan/src/scan.ts";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { registerTools } from "../tools/index.ts";
import { fakePi as createFakePi } from "./fake-pi.ts";

/**
 * Probe fixture.
 *
 * These tests are hermetic on purpose. Pointing the oracle at the live monorepo
 * would (a) make them depend on an uncommitted `.kaioken/index.json` and
 * (b) fall back to a full-repo Tree-sitter scan on a cold checkout, which takes
 * far longer than a unit-test timeout. A three-file fixture indexed once here
 * gives the same assertions at a fraction of the cost.
 */
const root = await mkdtemp(join(tmpdir(), "kaio-bridge-"));

await mkdir(join(root, "src"), { recursive: true });
await writeFile(
	join(root, "src", "alpha.ts"),
	[
		"export interface Alpha {",
		"\tname: string;",
		"}",
		"",
		"export function alphaSearch(query: string): string[] {",
		"\treturn [query];",
		"}",
		"",
	].join("\n"),
	"utf8",
);
await writeFile(join(root, "src", "beta.ts"), 'import { alphaSearch } from "./alpha.ts";\n\nalphaSearch("x");\n', "utf8");
await writeFile(join(root, "package.json"), JSON.stringify({ name: "fixture", version: "1.0.0" }), "utf8");

// Index once so every probe reads the cached artifact rather than re-scanning.
{
	const outcome = await buildIndex(await scan(root));
	await writeIndexArtifact(root, outcome.index);
}

describe("Phase 3: Kaioken Grounding Tools & Probes", () => {
	const fake = createFakePi();
	registerTools(fake.pi, () => root);

	const fakeCtx = { cwd: root } as any;

	it("registers all 7 tools with expected schemas", () => {
		expect(fake.tools.size).toBe(7);
		for (const name of [
			"kaio_symbol_lookup",
			"kaio_read_file",
			"kaio_wiki_search",
			"kaio_impact",
			"kaio_skill_load",
			"kaio_status",
			"kaio_verify",
		]) {
			expect(fake.tools.has(name)).toBe(true);
		}
	});

	// Probe 1: Nonexistent symbol lookup
	it("Probe 1: returns verbatim negative guarantee when symbol does not exist", async () => {
		const tool = fake.tools.get("kaio_symbol_lookup");
		const result = await tool.execute("call-1", { query: "authMagicLogin" }, undefined, undefined, fakeCtx);
		expect(result.content[0].text).toBe(
			'NEGATIVE GUARANTEE: no symbol matching "authMagicLogin" is declared. Do not invent it.',
		);
	});

	it("Probe 1 (positive): returns AST location when symbol exists", async () => {
		const tool = fake.tools.get("kaio_symbol_lookup");
		const result = await tool.execute("call-2", { query: "alphaSearch" }, undefined, undefined, fakeCtx);
		const hits = JSON.parse(result.content[0].text);
		expect(Array.isArray(hits)).toBe(true);
		expect(hits.length).toBeGreaterThan(0);
		expect(hits[0].symbol.name).toBe("alphaSearch");
	});

	// Probe 2: Quote a function body with byte accuracy
	it("Probe 2: read exact line range matches resolveExcerpt byte-accurately", async () => {
		const tool = fake.tools.get("kaio_read_file");
		const relPath = "src/alpha.ts";
		const start = 5;
		const end = 7;

		const result = await tool.execute("call-3", { path: relPath, start, end }, undefined, undefined, fakeCtx);
		const quotedExcerpt = result.content[0].text;
		expect(quotedExcerpt).toContain("alphaSearch");

		// Verify against resolveExcerpt from @kaioken/index
		const fullSource = await readFile(join(root, relPath), "utf8");
		const fakeFileMap = {
			path: relPath,
			hash: "hash",
			language: "typescript",
			lineCount: fullSource.split("\n").length,
			unparsed: false,
			symbols: [],
		};

		const resolution = resolveExcerpt(fakeFileMap, fullSource, quotedExcerpt);
		expect(resolution.resolved).toBe(true);
		expect(resolution.anchor?.startLine).toBe(start);
	});

	// Probe 3: Edit task compliance with verify gate
	it("Probe 3: flags non-compliance if edit task completes without calling verify", () => {
		interface AgentActionLog {
			tool: string;
			params?: any;
		}

		function checkSessionCompliance(actions: AgentActionLog[]): { compliant: boolean; reason?: string } {
			const hasEdits = actions.some((a) => ["edit", "write", "bash_mutate"].includes(a.tool));
			if (!hasEdits) return { compliant: true };

			const lastVerifyIndex = actions.map((a) => a.tool).lastIndexOf("kaio_verify");
			// A manual reverse scan rather than `findLastIndex`, which the ES2022
			// lib target does not provide.
			let lastEditIndex = -1;
			for (let i = actions.length - 1; i >= 0; i--) {
				if (["edit", "write", "bash_mutate"].includes((actions[i] as AgentActionLog).tool)) {
					lastEditIndex = i;
					break;
				}
			}

			if (lastVerifyIndex === -1) {
				return { compliant: false, reason: "Session contains edits but kaio_verify was never executed." };
			}
			if (lastVerifyIndex < lastEditIndex) {
				return {
					compliant: false,
					reason: "Edits occurred after the last kaio_verify call without subsequent verification.",
				};
			}
			return { compliant: true };
		}

		// Non-compliant session: edited without verify
		const badSession: AgentActionLog[] = [
			{ tool: "kaio_symbol_lookup", params: { query: "foo" } },
			{ tool: "edit", params: { file: "foo.ts" } },
		];
		expect(checkSessionCompliance(badSession).compliant).toBe(false);

		// Compliant session: edited then verified
		const goodSession: AgentActionLog[] = [
			{ tool: "kaio_symbol_lookup", params: { query: "foo" } },
			{ tool: "edit", params: { file: "foo.ts" } },
			{ tool: "kaio_verify" },
		];
		expect(checkSessionCompliance(goodSession).compliant).toBe(true);
	});

	// Probe 4: Blast radius / impact analysis
	it("Probe 4: predicts blast radius using AST dependents, not guessing", async () => {
		const tool = fake.tools.get("kaio_impact");
		const result = await tool.execute("call-4", { symbol: "alphaSearch" }, undefined, undefined, fakeCtx);
		const report = JSON.parse(result.content[0].text);
		expect(report).toBeDefined();
		expect(report.description).toBe("alphaSearch");
		expect(Array.isArray(report.symbols)).toBe(true);
		expect(Array.isArray(report.dependents)).toBe(true);
		// `src/beta.ts` imports alphaSearch, so it must be reported as affected.
		expect(report.dependents.some((d: any) => JSON.stringify(d).includes("beta.ts"))).toBe(true);
	});

	// Probe 5: Stale-doc drift check
	it("Probe 5: reports drift diff across docs vs code", async () => {
		const tool = fake.tools.get("kaio_status");
		const result = await tool.execute("call-5", {}, undefined, undefined, fakeCtx);
		const report = JSON.parse(result.content[0].text);
		expect(report).toBeDefined();
		expect(typeof report.ok).toBe("boolean");
		expect(typeof report.freshness).toBe("number");
		expect(Array.isArray(report.documents)).toBe(true);
	});

	it("kaio_skill_load handles missing skills cleanly", async () => {
		const tool = fake.tools.get("kaio_skill_load");
		const result = await tool.execute("call-6", { name: "nonexistent_procedure" }, undefined, undefined, fakeCtx);
		expect(result.content[0].text).toContain('Skill "nonexistent_procedure" not found');
	});

	it("kaio_verify executes and returns gate verdict on passing suite", async () => {
		const tempDir = await mkdtemp(join(tmpdir(), "kaio-verify-pass-"));
		try {
			await writeFile(
				join(tempDir, "package.json"),
				JSON.stringify({ name: "verify-test", scripts: { test: 'node -e "process.exit(0)"' } }),
			);
			const customFake = createFakePi();
			registerTools(customFake.pi, () => tempDir);
			const tool = customFake.tools.get("kaio_verify");
			const result = await tool.execute("call-pass", {}, undefined, undefined, { cwd: tempDir } as any);
			expect(result.content[0].text).toBe("VERIFY: PASS (0 errors)");
		} finally {
			await rm(tempDir, { recursive: true, force: true });
		}
	});

	it("kaio_verify executes and returns failure report on failing suite", async () => {
		const tempDir = await mkdtemp(join(tmpdir(), "kaio-verify-fail-"));
		try {
			await writeFile(
				join(tempDir, "package.json"),
				JSON.stringify({ name: "verify-test", scripts: { test: 'node -e "console.error(\\"syntax error\\"); process.exit(1)"' } }),
			);
			const customFake = createFakePi();
			registerTools(customFake.pi, () => tempDir);
			const tool = customFake.tools.get("kaio_verify");
			const result = await tool.execute("call-fail", {}, undefined, undefined, { cwd: tempDir } as any);
			expect(result.content[0].text).toContain("VERIFY: FAIL");
			expect(result.content[0].text).toContain("Enter repair loop: fix, re-run kaio_verify.");
		} finally {
			await rm(tempDir, { recursive: true, force: true });
		}
	});

	it("kaio_verify reports unverifiable when no suite detected", async () => {
		const tempDir = await mkdtemp(join(tmpdir(), "kaio-verify-none-"));
		try {
			const customFake = createFakePi();
			registerTools(customFake.pi, () => tempDir);
			const tool = customFake.tools.get("kaio_verify");
			const result = await tool.execute("call-none", {}, undefined, undefined, { cwd: tempDir } as any);
			expect(result.content[0].text).toContain("VERIFY: FAIL");
			expect(result.content[0].text).toContain("unverifiable: no native suite detected");
		} finally {
			await rm(tempDir, { recursive: true, force: true });
		}
	});
});
