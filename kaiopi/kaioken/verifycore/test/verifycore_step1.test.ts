import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { buildIndex, type IndexResult, SymbolOracle } from "@kaioken/index";
import { scan, type ScanResult } from "@kaioken/scan";
import { afterEach, describe, expect, it } from "vitest";
import {
	AntiHallucinationShield,
	BasenameIndex,
	calculateGroundingScore,
	findSymbolSuggestions,
	matchQuoteAnchorFuzzy,
	verifyDocument,
} from "../src/index.ts";

const roots: string[] = [];

afterEach(async () => {
	await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

const WALK_SOURCE = [
	"/** Walks the directory tree. */",
	"export function walkTree(root: string): string[] {",
	"\tconst list: string[] = [];",
	"\tlist.push(root);",
	"\treturn list;",
	"}",
	"",
	"export const DEFAULT_IGNORES = ['.git', 'node_modules'];",
	"",
].join("\n");

async function setupRepo(files: Record<string, string> = { "src/walk.ts": WALK_SOURCE, "README.md": "# Demo\n" }): Promise<{
	root: string;
	scan: ScanResult;
	index: IndexResult;
	oracle: SymbolOracle;
}> {
	const root = await mkdtemp(join(tmpdir(), "kaioken-verifycore-step1-"));
	roots.push(root);
	for (const [path, content] of Object.entries(files)) {
		const abs = join(root, path);
		await mkdir(dirname(abs), { recursive: true });
		await writeFile(abs, content, "utf8");
	}
	const scanned = await scan(root);
	const { index } = await buildIndex(scanned);
	return { root, scan: scanned, index, oracle: new SymbolOracle(index) };
}

describe("Step 1.1: BasenameIndex (UX-1101 to UX-1105)", () => {
	it("resolves exact and basename matches in sub-millisecond time", () => {
		const files = [
			"src/walk.ts",
			"src/types.ts",
			"src/core/runner.ts",
			"README.md",
			"package.json",
		];
		const index = new BasenameIndex(files);

		const start = performance.now();
		for (let i = 0; i < 1000; i++) {
			const res = index.resolve("src/walk.ts");
			expect(res.resolved).toBe(true);
			expect(res.exact).toBe(true);
		}
		const elapsed = performance.now() - start;
		const perLookup = elapsed / 1000;
		expect(perLookup).toBeLessThan(0.1);
	});

	it("detects fabricated parent directories for ungrounded paths", () => {
		const files = ["src/walk.ts", "src/types.ts", "README.md"];
		const index = new BasenameIndex(files);

		const res = index.resolve("nonexistent_dir/sub/walk.ts");
		expect(res.resolved).toBe(false);
		expect(res.fabricatedParent).toBe(true);
	});

	it("disallows generic filenames from falsely matching without exact path", () => {
		const files = ["src/types.ts", "lib/index.ts"];
		const index = new BasenameIndex(files);

		const res = index.resolve("types.ts");
		expect(res.isGenericName).toBe(true);
		expect(res.resolved).toBe(false);
	});

	it("finds closest files via fuzzy distance for repair suggestions", () => {
		const files = ["src/walk.ts", "src/walker.ts", "lib/parser.ts"];
		const index = new BasenameIndex(files);

		const closest = index.findClosestFiles("wlk.ts");
		expect(closest.length).toBeGreaterThan(0);
		expect(closest).toContain("src/walk.ts");
	});
});

describe("Step 1.2: matchQuoteAnchorFuzzy (UX-1111 to UX-1115)", async () => {
	it("fuzzy matches slightly rewrapped or comment-altered quotes within AST scope", async () => {
		const { index, oracle } = await setupRepo();
		const fileMap = oracle.file("src/walk.ts");

		const slightlyAlteredQuote = [
			"export function walkTree(root: string): string[] {",
			"  const list: string[] = [];",
			"  list.push(root);",
			"  return list;",
			"}",
		].join("\n");

		const result = matchQuoteAnchorFuzzy(fileMap, WALK_SOURCE, slightlyAlteredQuote);
		expect(result.resolved).toBe(true);
		expect(result.anchor?.symbol).toBe("walkTree");
		expect(result.confidence).toBeGreaterThanOrEqual(0.85);
	});

	it("rejects out-of-scope fabricated quotes", async () => {
		const { oracle } = await setupRepo();
		const fileMap = oracle.file("src/walk.ts");

		const completelyFabricated = "function imaginaryAlienFunction() { return 42; }";
		const result = matchQuoteAnchorFuzzy(fileMap, WALK_SOURCE, completelyFabricated);
		expect(result.resolved).toBe(false);
		expect(result.reason).toBe("excerpt_not_found");
	});
});

describe("Step 1.3: Defect Scoring & Grounding Confidence (UX-1116 to UX-1120)", () => {
	it("calculates 100% confidence for fully grounded claims", () => {
		const claims = [
			{ kind: "file" as const, text: "src/walk.ts", line: 1 },
			{ kind: "symbol" as const, text: "walkTree", line: 2 },
		];
		const score = calculateGroundingScore(claims, [], 1.0, 0);

		expect(score.confidenceScore).toBe(100);
		expect(score.status).toBe("grounded");
		expect(score.defectCount).toBe(0);
	});

	it("drops confidence into hallucinated tier on critical defects", () => {
		const claims = [{ kind: "file" as const, text: "fake/path.ts", line: 1 }];
		const defects = [
			{
				kind: "unknown_file" as const,
				claim: "fake/path.ts",
				line: 1,
				detail: "not in repo",
				severity: "critical" as const,
			},
		];
		const score = calculateGroundingScore(claims, defects, 0.5, 0);

		expect(score.confidenceScore).toBeLessThan(70);
		expect(score.status).toBe("hallucinated");
	});
});

describe("Step 1.4: AntiHallucinationShield (UX-1121 to UX-1125)", () => {
	it("annotates document with inline ungrounded claim warnings", () => {
		const shield = new AntiHallucinationShield({ enforcement: "strict" });
		const body = [
			"# Architecture",
			"Uses `fake/module.ts` to coordinate tasks.",
		].join("\n");

		const defects = [
			{
				kind: "unknown_file" as const,
				claim: "fake/module.ts",
				line: 2,
				detail: "unknown file",
				suggestedReplacement: "src/walk.ts",
			},
		];

		const annotated = shield.annotateDocument(body, defects);
		expect(annotated).toContain('<!-- [UNGROUNDED: unknown_file "fake/module.ts" -> Suggestion: "src/walk.ts"] -->');
	});

	it("enforces acceptance thresholds based on policy mode", () => {
		const strictShield = new AntiHallucinationShield({ enforcement: "strict" });
		const permissiveShield = new AntiHallucinationShield({ enforcement: "permissive" });

		const mockReport = {
			grounded: 1,
			defects: [
				{
					kind: "unknown_symbol" as const,
					claim: "fakeSym",
					detail: "unknown",
					severity: "critical" as const,
				},
			],
			uncovered: [],
			coverage: 0.8,
			groundingConfidence: 60,
			score: {
				confidenceScore: 60,
				status: "hallucinated" as const,
				totalClaims: 2,
				groundedClaims: 1,
				defectCount: 1,
				weightedDefectScore: 25,
				paddingCount: 0,
				coverage: 0.8,
				categoryScores: {},
			},
		};

		expect(strictShield.isAcceptable(mockReport)).toBe(false);
		expect(permissiveShield.isAcceptable(mockReport)).toBe(true);
	});
});

describe("Step 1.5: Mechanistic Repair Guidance Prompt (UX-1126 to UX-1130)", async () => {
	it("suggests closest real symbols and formats repair directives", async () => {
		const { oracle, root, scan: scanned } = await setupRepo();

		const suggestions = findSymbolSuggestions(oracle, "walkTreeAsync");
		expect(suggestions).toContain("walkTree");

		const body = [
			"Call `walkTreeAsync()` from `src/fake/walk.ts`.",
			"This module provides functionality for building apps and seamlessly integrates with tools.",
		].join("\n");

		const report = await verifyDocument({
			body,
			oracle,
			scope: ["src/walk.ts"],
			knownFiles: new Set(scanned.files.map((f) => f.path)),
			readSource: async (p) => {
				const { readFile } = await import("node:fs/promises");
				try {
					return await readFile(join(root, p), "utf8");
				} catch {
					return null;
				}
			},
			annotateBody: true,
		});

		expect(report.repairPrompt).toBeDefined();
		expect(report.repairPrompt).toContain("MECHANISTIC REPAIR DIRECTIVES:");
		expect(report.repairPrompt).toContain("walkTree");
		expect(report.repairPrompt).toContain("seamlessly integrates");
		expect(report.annotatedBody).toContain("UNGROUNDED");
	});
});
