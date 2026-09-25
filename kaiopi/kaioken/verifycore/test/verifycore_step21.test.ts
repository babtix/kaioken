import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { buildIndex, type IndexResult, SymbolOracle } from "@kaioken/index";
import { scan, type ScanResult } from "@kaioken/scan";
import { afterEach, describe, expect, it } from "vitest";
import {
	ALL_DOMAINS,
	AntiHallucinationShield,
	BasenameIndex,
	calculateDomainConfidence,
	calculateGroundingScore,
	crossValidateCitationLinks,
	extractClaims,
	findPadding,
	findSymbolSuggestions,
	renderAuditView,
	verifyDocument,
} from "../src/index.ts";

const roots: string[] = [];

afterEach(async () => {
	await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

const DEMO_SOURCE = [
	"/** Processes verification claims and returns results. */",
	"export function processVerification(claimId: string, options?: { fast?: boolean }): boolean {",
	"\tconst valid = claimId.length > 0;",
	"\treturn valid;",
	"}",
	"",
	"export const TIMEOUT_MS = 50;",
].join("\n");

async function setupRepo(files: Record<string, string> = { "src/verify.ts": DEMO_SOURCE, "README.md": "# Demo\n" }): Promise<{
	root: string;
	scan: ScanResult;
	index: IndexResult;
	oracle: SymbolOracle;
}> {
	const root = await mkdtemp(join(tmpdir(), "kaioken-verifycore-step21-"));
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

describe("Step 21.1: O(1) Pre-Indexed Domain Lookup Maps (UX-1106 to UX-1110)", () => {
	it("[UX-1106] verifies performance metric assertions in sub-millisecond O(1) time", () => {
		const index = new BasenameIndex(["src/verify.ts"]);
		index.registerMetrics(["< 50ms", "sub-millisecond", "0 allocations"]);

		const start = performance.now();
		for (let i = 0; i < 1000; i++) {
			expect(index.hasMetric("< 50ms")).toBe(true);
			expect(index.hasMetric("0 allocations")).toBe(true);
		}
		const elapsed = performance.now() - start;
		expect(elapsed / 1000).toBeLessThan(0.1);

		const ungrounded = index.resolveMetric("10000ms runaway loop");
		expect(ungrounded.resolved).toBe(false);
		expect(ungrounded.candidate).toBeDefined();
	});

	it("[UX-1107] verifies configuration key citations in O(1) time", () => {
		const index = new BasenameIndex(["src/verify.ts"]);
		index.registerConfigKeys(["enforcement", "minConfidence", "enableFuzzyAnchor", "compilerOptions.moduleResolution"]);

		expect(index.hasConfigKey("enforcement")).toBe(true);
		expect(index.hasConfigKey("minConfidence")).toBe(true);
		expect(index.hasConfigKey("compilerOptions.moduleResolution")).toBe(true);

		const invalid = index.resolveConfigKey("completelyFabricatedConfigSetting");
		expect(invalid.resolved).toBe(false);
		expect(invalid.candidates.length).toBeGreaterThan(0);
	});

	it("[UX-1108] verifies third-party dependency claims in O(1) time", () => {
		const index = new BasenameIndex(["src/verify.ts"]);
		index.registerDependencies(["@mario/pi", "@earendil-works/pi-tui", "vitest", "tree-sitter"]);

		expect(index.hasDependency("@mario/pi")).toBe(true);
		expect(index.hasDependency("vitest")).toBe(true);

		const invalid = index.resolveDependency("nonexistent-hallucinated-package-xyz");
		expect(invalid.resolved).toBe(false);
	});

	it("[UX-1109] verifies historical commit attribution quotes in O(1) time", () => {
		const index = new BasenameIndex(["src/verify.ts"]);
		index.registerCommits(["a2da6b98", "54f5f2c3", "08c88325"]);

		expect(index.hasCommit("a2da6b98")).toBe(true);
		expect(index.hasCommit("54f5f2c3")).toBe(true);

		const invalid = index.resolveCommit("deadbeefdeadbeef");
		expect(invalid.resolved).toBe(false);
	});

	it("[UX-1110] verifies database column and index citations in O(1) time", () => {
		const index = new BasenameIndex(["src/verify.ts"]);
		index.registerDbEntities(["checkpoints", "sessions", "idx_sessions_created_at", "checkpoints.session_id"]);

		expect(index.hasDbEntity("checkpoints")).toBe(true);
		expect(index.hasDbEntity("idx_sessions_created_at")).toBe(true);
		expect(index.hasDbEntity("checkpoints.session_id")).toBe(true);

		const invalid = index.resolveDbEntity("imaginary_table.imaginary_col");
		expect(invalid.resolved).toBe(false);
	});
});

describe("Step 21.2: Padding & Generic Boilerplate Detector Across 10 Domains (UX-1131 to UX-1140)", () => {
	it("detects and categorizes fluff across all 10 domain targets with actionable replacement guidance", () => {
		const sampleFluffBody = [
			"# Chapter: Core Architecture",
			"This file contains necessary logic for the entire platform.", // UX-1131 (file_path)
			"This function does what it says and signature is self-explanatory.", // UX-1132 (symbol_signature)
			"The method accepts comprehensive parameters and appropriate arguments.", // UX-1133 (api_param)
			"It features a clean separation of concerns and follows best practices.", // UX-1134 (arch_boundary)
			"To deploy, run the appropriate command or execute command as needed.", // UX-1135 (command_example)
			"The engine delivers blazing fast performance and lightning fast speed.", // UX-1136 (perf_metric)
			"There are standard configuration options and various settings available.", // UX-1137 (config_key)
			"The codebase depends on standard libraries and various third-party packages.", // UX-1138 (dependency_claim)
			"Historical commits were made and authored in earlier commits.", // UX-1139 (commit_quote)
			"Data is stored in standard database schema with various columns and tables.", // UX-1140 (db_citation)
		].join("\n");

		const padding = findPadding(sampleFluffBody);
		expect(padding.length).toBeGreaterThanOrEqual(10);

		const domainsDetected = new Set(padding.map((p) => p.domain));
		for (const domain of ALL_DOMAINS) {
			expect(domainsDetected.has(domain)).toBe(true);
		}

		for (const p of padding) {
			expect(p.suggestion).toBeDefined();
			expect(p.line).toBeGreaterThan(0);
		}
	});
});

describe("Step 21.3: Interactive Claim Verification Audit View (UX-1141 to UX-1150)", () => {
	it("renders structured 10-domain audit breakdown with status badges and defect details", async () => {
		const { oracle, root, scan: scanned } = await setupRepo();
		const body = [
			"# Chapter 1: System Overview",
			"Uses `src/verify.ts` and calls `processVerification()`.",
			"Configured with `enforcement: strict` and runs in `< 50ms`.",
			"References `fake/invalid/module.ts` and unknown symbol `alienFunction()`.",
			"Depends on `@mario/pi` and records `commit 54f5f2c3` in table `checkpoints.id`.",
		].join("\n");

		const report = await verifyDocument({
			body,
			oracle,
			scope: ["src/verify.ts"],
			knownFiles: new Set(scanned.files.map((f) => f.path)),
			readSource: async (p) => {
				const { readFile } = await import("node:fs/promises");
				try {
					return await readFile(join(root, p), "utf8");
				} catch {
					return null;
				}
			},
		});

		expect(report.auditView).toBeDefined();
		const view = renderAuditView(report, { useAnsi: false });

		expect(view).toContain("Claim Verification & Grounding Audit");
		expect(view).toContain("Overall Status:");
		expect(view).toContain("Category Grounding Breakdown (10 Domains)");
		expect(view).toContain("File Path References (Wiki)");
		expect(view).toContain("Symbol Signature Quotes (Cards)");
		expect(view).toContain("Performance Metric Assertions");
		expect(view).toContain("Configuration Key Citations");
		expect(view).toContain("Third-Party Dependencies");
		expect(view).toContain("Historical Commit Quotes");
		expect(view).toContain("Database Columns & Indexes");
	});
});

describe("Step 21.4: Strict Directory Path Verifier (UX-1151 to UX-1160)", () => {
	it("prevents fabricated parent directories across file and schema hierarchies", () => {
		const files = [
			"src/verify.ts",
			"src/core/runner.ts",
			"docs/wiki/chapter1.md",
			"package.json",
		];
		const index = new BasenameIndex(files);

		// Valid path with valid directories
		const validCheck = index.verifyStrictParentPath("src/core/runner.ts");
		expect(validCheck.valid).toBe(true);
		expect(validCheck.fabricatedParent).toBe(false);

		// Fabricated parent paths
		const fake1 = index.verifyStrictParentPath("nonexistent_subsystem/core/runner.ts");
		expect(fake1.valid).toBe(false);
		expect(fake1.fabricatedParent).toBe(true);
		expect(fake1.missingParent).toBe("nonexistent_subsystem");

		const fake2 = index.verifyStrictParentPath("src/fake_folder/verify.ts");
		expect(fake2.valid).toBe(false);
		expect(fake2.fabricatedParent).toBe(true);
		expect(fake2.missingParent).toBe("src/fake_folder");
	});
});

describe("Step 21.5: Defect Scoring & Grounding Confidence for 10 Domains (UX-1161 to UX-1170)", () => {
	it("calculates discrete confidence percentages and status across all 10 domain targets", () => {
		const claims = [
			{ kind: "file" as const, text: "src/verify.ts", line: 1, domain: "file_path" as const },
			{ kind: "symbol" as const, text: "processVerification", line: 2, domain: "symbol_signature" as const },
			{ kind: "perf_metric" as const, text: "< 50ms", line: 3, domain: "perf_metric" as const },
			{ kind: "config_key" as const, text: "enforcement: strict", line: 4, domain: "config_key" as const },
			{ kind: "dependency_claim" as const, text: "@mario/pi", line: 5, domain: "dependency_claim" as const },
			{ kind: "commit_quote" as const, text: "commit 54f5f2c3", line: 6, domain: "commit_quote" as const },
			{ kind: "db_citation" as const, text: "checkpoints.id", line: 7, domain: "db_citation" as const },
		];

		const defects = [
			{
				kind: "ungrounded_perf_metric" as const,
				claim: "< 50ms",
				line: 3,
				domain: "perf_metric" as const,
				detail: "metric not verified",
				severity: "warning" as const,
			},
		];

		const score = calculateGroundingScore(claims, defects, 1.0, 0);

		expect(score.categoryBreakdown).toBeDefined();
		const breakdown = score.categoryBreakdown!;

		// File path domain has 1 claim and 0 defects -> 100% confidence
		expect(breakdown.file_path.confidence).toBe(100);
		expect(breakdown.file_path.status).toBe("grounded");

		// Perf metric domain has 1 claim and 1 defect -> reduced confidence
		expect(breakdown.perf_metric.confidence).toBeLessThan(70);
		expect(breakdown.perf_metric.status).toBe("hallucinated");

		// Individual helper calculation
		const fileConf = calculateDomainConfidence(claims, defects, "file_path");
		expect(fileConf.confidence).toBe(100);
	});
});

describe("Step 21.6: Symbol Existence Verifier Checking Declarations in Index (UX-1171 to UX-1180)", async () => {
	it("verifies declared symbols, methods, and types in SymbolOracle with nearest repair suggestions", async () => {
		const { oracle } = await setupRepo();

		expect(oracle.has("processVerification")).toBe(true);
		expect(oracle.has("TIMEOUT_MS")).toBe(true);
		expect(oracle.has("nonexistentAlienSymbol")).toBe(false);

		const suggestions = findSymbolSuggestions(oracle, "processVerificationAsync");
		expect(suggestions).toContain("processVerification");
	});
});

describe("Step 21.7: Citation Link Cross-Validator (UX-1181 to UX-1190)", () => {
	it("cross-validates markdown link targets, resolving relative paths and detecting 404 broken links", () => {
		const files = [
			"docs/wiki/chapter1.md",
			"docs/wiki/chapter2.md",
			"src/verify.ts",
			"README.md",
		];
		const index = new BasenameIndex(files);

		const claims = [
			{
				kind: "link" as const,
				text: "Chapter 2",
				target: "chapter2.md",
				line: 10,
				domain: "file_path" as const,
			},
			{
				kind: "link" as const,
				text: "Verify Source",
				target: "../../src/verify.ts",
				line: 12,
				domain: "file_path" as const,
			},
			{
				kind: "link" as const,
				text: "Broken Doc",
				target: "nonexistent_chapter.md",
				line: 15,
				domain: "file_path" as const,
			},
		];

		const defects = crossValidateCitationLinks(claims, index, {
			currentFilePath: "docs/wiki/chapter1.md",
		});

		expect(defects.length).toBe(1);
		expect(defects[0].kind).toBe("broken_link");
		expect(defects[0].claim).toBe("nonexistent_chapter.md");
		expect(defects[0].severity).toBe("critical");
	});
});

describe("Step 21.8: Mechanistic Repair Guidance Prompt for 10 Domains (UX-1191 to UX-1200)", async () => {
	it("generates deterministic replacement directives for hallucinated claims across all 10 domains", async () => {
		const { oracle, root, scan: scanned } = await setupRepo();

		const body = [
			"# Guide",
			"Uses `src/unknown/nonexistent.ts` to call `processVerif()`.",
			"Configured via `badConfigSettingKey: true`.",
			"Requires dependency `@bad-scope/phantom-lib`.",
			"Refer to `commit deadbeef00` and table `missing_tbl.id`.",
			"Claims blazing fast performance and lightning fast speed.",
		].join("\n");

		const report = await verifyDocument({
			body,
			oracle,
			scope: ["src/verify.ts"],
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
		const prompt = report.repairPrompt!;

		expect(prompt).toContain("MECHANISTIC REPAIR DIRECTIVES:");
		expect(prompt).toContain("replace ungrounded file citation");
		expect(prompt).toContain("remove generic boilerplate phrase");
		expect(prompt).toContain("processVerification"); // suggested replacement for processVerif()
	});
});
