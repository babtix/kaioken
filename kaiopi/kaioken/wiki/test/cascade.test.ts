import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { IndexResult } from "@kaioken/index";
import type { ModelClient, ModelRequest } from "@kaioken/modelport";
import type { ScanResult } from "@kaioken/scan";
import { writeProvenance, writeVerification, writeWikiDocument, writeWikiPlan } from "../src/artifact.ts";
import { budgetChapterEvidence, estimateTokens } from "../src/budget.ts";
import { runResumableCascade } from "../src/cascade.ts";
import { computeDocCoverageHeatmap, renderCoverageHeatmap } from "../src/heatmap.ts";
import { formatLinkValidationReport, slugifyHeading, validateWikiLinks } from "../src/linkval.ts";
import { formatTypewriterChunk, streamTypewriterText, TypewriterStream } from "../src/typewriter.ts";
import type { Chapter, WikiDocument, WikiPlan } from "../src/types.ts";

function scriptedClient(replies: string[]): ModelClient & { requests: ModelRequest[] } {
	const requests: ModelRequest[] = [];
	let index = 0;
	return {
		requests,
		async complete(request: ModelRequest): Promise<string> {
			requests.push(request);
			const reply = replies[Math.min(index, replies.length - 1)] ?? "";
			index++;
			return reply;
		},
	};
}

const mockScan: ScanResult = {
	root: "/repo",
	scannedAt: "2026-09-24T00:00:00.000Z",
	fileCount: 3,
	totalBytes: 1000,
	files: [
		{ path: "src/engine.ts", binary: false, size: 500, hash: "hash-engine", language: "typescript", risk: [] },
		{ path: "src/worker.ts", binary: false, size: 300, hash: "hash-worker", language: "typescript", risk: [] },
		{ path: "src/util.ts", binary: false, size: 200, hash: "hash-util", language: "typescript", risk: [] },
	],
};

const mockIndex: IndexResult = {
	root: "/repo",
	builtAt: "",
	fileCount: 3,
	symbolCount: 4,
	unparsedLanguages: {},
	files: [
		{
			path: "src/engine.ts",
			language: "typescript",
			lineCount: 50,
			unparsed: false,
			hash: "hash-engine",
			symbols: [
				{ name: "Engine", kind: "class", exported: true, startLine: 10, endLine: 40, signature: "class Engine", doc: "" },
				{ name: "start", kind: "method", exported: true, parent: "Engine", startLine: 15, endLine: 20, signature: "start(): void", doc: "" },
			],
		},
		{
			path: "src/worker.ts",
			language: "typescript",
			lineCount: 30,
			unparsed: false,
			hash: "hash-worker",
			symbols: [
				{ name: "Worker", kind: "class", exported: true, startLine: 5, endLine: 25, signature: "class Worker", doc: "" },
			],
		},
		{
			path: "src/util.ts",
			language: "typescript",
			lineCount: 20,
			unparsed: false,
			hash: "hash-util",
			symbols: [
				{ name: "clamp", kind: "function", exported: true, startLine: 2, endLine: 8, signature: "clamp(n: number): number", doc: "" },
			],
		},
	],
};

const mockPlan: WikiPlan = {
	version: 1,
	generatedAt: "2026-09-24T00:00:00.000Z",
	multiplier: 1,
	chapters: [
		{
			id: "01-architecture",
			title: "System Architecture",
			goal: "Explain core pipeline orchestrator and worker architecture.",
			files: ["src/engine.ts", "src/worker.ts"],
		},
		{
			id: "02-utilities",
			title: "Utility Library",
			goal: "Explain shared mathematical clamp utilities.",
			files: ["src/util.ts"],
		},
	],
};

describe("wiki: 12.1 resumable cascade runner", () => {
	it("skips chapters that already have clean verification and un-drifted sources", async () => {
		const tempDir = await mkdtemp(join(tmpdir(), "kaioken-cascade-test-"));
		try {
			await writeWikiPlan(tempDir, mockPlan);

			// Write existing clean document
			const cleanDocPath = "01-architecture/index.md";
			const cleanDoc: WikiDocument = {
				path: cleanDocPath,
				chapterId: "01-architecture",
				title: "System Architecture",
				body: "# System Architecture\n\nThe `Engine` orchestrates `Worker` instances.",
				provenance: {
					document: cleanDocPath,
					chapterId: "01-architecture",
					generatedAt: new Date().toISOString(),
					sources: [
						{ path: "src/engine.ts", hash: "hash-engine" },
						{ path: "src/worker.ts", hash: "hash-worker" },
					],
				},
				verification: {
					grounded: 2,
					defects: [],
					uncovered: [],
					coverage: 1,
				},
			};
			await writeWikiDocument(tempDir, cleanDoc);

			// Write verification record marking 01-architecture as clean
			await writeVerification(tempDir, {
				multiplier: 1,
				model: "mock-model",
				documents: [
					{
						document: cleanDocPath,
						grounded: 2,
						defects: [],
						uncovered: [],
						coverage: 1,
					},
				],
			});

			const client = scriptedClient([
				"# Utility Library\n\nThe `clamp` helper restricts numerical values.",
				"[]", // empty sections plan
			]);

			const skippedCalls: string[] = [];
			const result = await runResumableCascade({
				root: tempDir,
				plan: mockPlan,
				scan: mockScan,
				index: mockIndex,
				client,
				onChapterSkipped: (id) => skippedCalls.push(id),
			});

			// Chapter 01-architecture should be skipped, 02-utilities generated!
			expect(result.skipped).toContain("01-architecture/index.md");
			expect(skippedCalls).toContain("01-architecture");
			expect(result.generated).toContain("02-utilities/index.md");
			expect(result.documents.length).toBe(2);
		} finally {
			await rm(tempDir, { recursive: true, force: true });
		}
	});

	it("regenerates chapter when source files have drifted", async () => {
		const tempDir = await mkdtemp(join(tmpdir(), "kaioken-cascade-drift-test-"));
		try {
			await writeWikiPlan(tempDir, mockPlan);

			const staleDoc: WikiDocument = {
				path: "01-architecture/index.md",
				chapterId: "01-architecture",
				title: "System Architecture",
				body: "# System Architecture\n\nOld text.",
				provenance: {
					document: "01-architecture/index.md",
					chapterId: "01-architecture",
					generatedAt: new Date().toISOString(),
					sources: [{ path: "src/engine.ts", hash: "old-stale-hash" }],
				},
				verification: { grounded: 1, defects: [], uncovered: [], coverage: 1 },
			};
			await writeWikiDocument(tempDir, staleDoc);
			await writeProvenance(tempDir, [staleDoc.provenance]);

			const client = scriptedClient([
				"# System Architecture\n\nFresh `Engine` documentation.",
				"[]",
				"# Utility Library\n\nFresh `clamp` documentation.",
				"[]",
			]);

			const result = await runResumableCascade({
				root: tempDir,
				plan: mockPlan,
				scan: mockScan,
				index: mockIndex,
				client,
			});

			// Since source hash was "old-stale-hash" vs scan's "hash-engine", it must be regenerated
			expect(result.generated).toContain("01-architecture/index.md");
		} finally {
			await rm(tempDir, { recursive: true, force: true });
		}
	});
});

describe("wiki: 12.2 real-time token streaming typewriter effect", () => {
	it("buffers and flushes text in immediate mode", async () => {
		const stream = new TypewriterStream({ immediate: true });
		stream.append("Hello, ");
		stream.append("Kaioken wiki!");

		let output = "";
		await stream.flush((chunk) => {
			output += chunk;
		});

		expect(output).toBe("Hello, Kaioken wiki!");
	});

	it("formats typewriter chunks with cursor glyphs", () => {
		expect(formatTypewriterChunk("Chapter text", { cursorGlyph: "▊" })).toBe("Chapter text▊");
		expect(formatTypewriterChunk("Chapter text", { cursorGlyph: "" })).toBe("Chapter text");
	});

	it("streams full document text through streamTypewriterText", async () => {
		let collected = "";
		await streamTypewriterText(
			"# Architecture Overview\n\nComplete specification.",
			(c) => {
				collected += c;
			},
			{ immediate: true },
		);
		expect(collected).toBe("# Architecture Overview\n\nComplete specification.");
	});
});

describe("wiki: 12.3 cross-chapter relative markdown link validator", () => {
	it("slugifies markdown headings into github-compatible anchor slugs", () => {
		expect(slugifyHeading("# 1. Core Architecture!")).toBe("1-core-architecture");
		expect(slugifyHeading("### Background Workers & Queue")).toBe("background-workers-queue");
	});

	it("validates valid cross-chapter links and heading anchors", () => {
		const doc1: WikiDocument = {
			path: "01-architecture.md",
			chapterId: "01-architecture",
			title: "Architecture",
			body: "# Architecture\n\nSee [Utilities](./02-utilities.md#numeric-helpers) for details.",
			provenance: { document: "01-architecture.md", chapterId: "01", generatedAt: "", sources: [] },
			verification: { grounded: 1, defects: [], uncovered: [], coverage: 1 },
		};

		const doc2: WikiDocument = {
			path: "02-utilities.md",
			chapterId: "02-utilities",
			title: "Utilities",
			body: "# Utilities\n\n## Numeric Helpers\n\nMathematical helper functions.",
			provenance: { document: "02-utilities.md", chapterId: "02", generatedAt: "", sources: [] },
			verification: { grounded: 1, defects: [], uncovered: [], coverage: 1 },
		};

		const report = validateWikiLinks({ documents: [doc1, doc2] });
		expect(report.ok).toBe(true);
		expect(report.validLinks).toBe(1);
		expect(report.deadLinks).toHaveLength(0);
	});

	it("detects 404 dead document links and suggests closest match", () => {
		const doc1: WikiDocument = {
			path: "01-architecture.md",
			chapterId: "01-architecture",
			title: "Architecture",
			body: "Refer to [Storage](./02-storag.md) for database info.",
			provenance: { document: "01-architecture.md", chapterId: "01", generatedAt: "", sources: [] },
			verification: { grounded: 1, defects: [], uncovered: [], coverage: 1 },
		};

		const doc2: WikiDocument = {
			path: "02-storage.md",
			chapterId: "02-storage",
			title: "Storage",
			body: "# Storage\n\nDatabase schema.",
			provenance: { document: "02-storage.md", chapterId: "02", generatedAt: "", sources: [] },
			verification: { grounded: 1, defects: [], uncovered: [], coverage: 1 },
		};

		const report = validateWikiLinks({ documents: [doc1, doc2] });
		expect(report.ok).toBe(false);
		expect(report.deadLinks).toHaveLength(1);
		expect(report.deadLinks[0]?.reason).toBe("document_not_found");
		expect(report.deadLinks[0]?.suggestion).toContain("02-storage.md");

		const formatted = formatLinkValidationReport(report);
		expect(formatted).toContain("Document 404");
		expect(formatted).toContain("Suggested repair");
	});

	it("detects dead heading anchor in existing document", () => {
		const doc1: WikiDocument = {
			path: "01-architecture.md",
			chapterId: "01-architecture",
			title: "Architecture",
			body: "See [Storage Details](./02-storage.md#missing-heading-anchor).",
			provenance: { document: "01-architecture.md", chapterId: "01", generatedAt: "", sources: [] },
			verification: { grounded: 1, defects: [], uncovered: [], coverage: 1 },
		};

		const doc2: WikiDocument = {
			path: "02-storage.md",
			chapterId: "02-storage",
			title: "Storage",
			body: "# Storage\n\n## Database Persistence",
			provenance: { document: "02-storage.md", chapterId: "02", generatedAt: "", sources: [] },
			verification: { grounded: 1, defects: [], uncovered: [], coverage: 1 },
		};

		const report = validateWikiLinks({ documents: [doc1, doc2] });
		expect(report.ok).toBe(false);
		expect(report.deadLinks[0]?.reason).toBe("anchor_not_found");
	});
});

describe("wiki: 12.4 repository documentation coverage heatmap", () => {
	const doc1: WikiDocument = {
		path: "01-architecture.md",
		chapterId: "01-architecture",
		title: "System Architecture",
		body: "# System Architecture\n\nThe `Engine` in `src/engine.ts` coordinates workers in `src/worker.ts`.",
		provenance: {
			document: "01-architecture.md",
			chapterId: "01-architecture",
			generatedAt: "",
			sources: [
				{ path: "src/engine.ts", hash: "hash-engine" },
				{ path: "src/worker.ts", hash: "hash-worker" },
			],
		},
		verification: { grounded: 2, defects: [], uncovered: [], coverage: 1 },
	};

	it("computes coverage heatmap ratios and complexity reading time pills", () => {
		const heatmap = computeDocCoverageHeatmap([doc1], mockScan, mockIndex, mockPlan);
		expect(heatmap.totalRepoFiles).toBe(3);
		expect(heatmap.coveredRepoFiles).toBe(2); // engine and worker
		expect(heatmap.repoCoveragePercentage).toBe(67);
		expect(heatmap.unassignedFiles).toContain("src/util.ts");

		const ch1 = heatmap.chapters.find((c) => c.chapterId === "01-architecture");
		expect(ch1?.coveredFiles).toBe(2);
		expect(ch1?.fileCoverageRatio).toBe(1.0);
		expect(ch1?.complexityPill).toContain("min");
	});

	it("renders visual terminal documentation coverage heatmap table", () => {
		const heatmap = computeDocCoverageHeatmap([doc1], mockScan, mockIndex, mockPlan);
		const rendered = renderCoverageHeatmap(heatmap);
		expect(rendered).toContain("Documentation Coverage Heatmap");
		expect(rendered).toContain("[01-architecture]");
		expect(rendered).toContain("Uncovered Files (1): src/util.ts");
	});
});

describe("wiki: 12.5 hierarchical evidence budgeting", () => {
	it("preserves all declarations when token estimate is below ceiling", () => {
		const chapter: Chapter = {
			id: "01",
			title: "Core",
			goal: "Core architecture",
			files: ["src/a.ts"],
		};
		const files = [
			{
				path: "src/a.ts",
				language: "typescript",
				lineCount: 20,
				declarations: ["+ export class Server", "+ export function listen(): void"],
			},
		];

		const budgeted = budgetChapterEvidence({ chapter, files, maxTokens: 2000 });
		expect(budgeted.tokenEstimate).toBeLessThanOrEqual(2000);
		expect(budgeted.prunedDeclarationsCount).toBe(0);
		expect(budgeted.compressionRatio).toBe(1.0);
		expect(budgeted.formattedEvidence).toContain("Server");
		expect(budgeted.formattedEvidence).toContain("listen");
	});

	it("compacts and prioritizes exported declarations when budget is constrained", () => {
		const chapter: Chapter = {
			id: "01",
			title: "Core",
			goal: "Core architecture",
			files: ["src/big.ts"],
		};

		// 200 internal declarations that exceed a tight budget
		const declarations: string[] = [
			"+ export class PrimaryAPI",
			"+ export function publicMethod(): void",
		];
		for (let i = 0; i < 150; i++) {
			declarations.push(`- privateHelperFunction${i}(data: unknown): boolean // internal details line`);
		}

		const files = [{ path: "src/big.ts", language: "typescript", lineCount: 500, declarations }];

		const budgeted = budgetChapterEvidence({ chapter, files, maxTokens: 250 });
		expect(budgeted.tokenEstimate).toBeLessThanOrEqual(350);
		expect(budgeted.prunedDeclarationsCount).toBeGreaterThan(50);
		expect(budgeted.compressionRatio).toBeLessThan(1.0);
		// Crucial: Primary exported API is preserved!
		expect(budgeted.formattedEvidence).toContain("PrimaryAPI");
	});
});
