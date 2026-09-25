import { describe, expect, it } from "vitest";
import {
	ALL_GOVERNANCE_STAGES,
	calculateStageCacheCredit,
	checkStageThresholdWarning,
	formatProviderComparisonMatrix,
	formatThresholdWarningPrompt,
	generateProviderComparisonMatrix,
	generateStageAuditReport,
	isGovernanceStage,
	renderCacheCreditVisualizer,
	renderHistoricalSpendGraph,
	STAGE_METADATA,
	type GovernanceStage,
	type SpendDataPoint,
} from "../src/index.ts";

describe("Step 29: Category 05 — Spend Transparency, Token Budgeting & Cost Control (UX-0451 to UX-0500)", () => {
	// =========================================================================
	// Foundation: 10 Governance Stages
	// =========================================================================
	describe("10 Governance Stages", () => {
		it("defines all 10 governance stages", () => {
			expect(ALL_GOVERNANCE_STAGES).toHaveLength(10);
			const expected: GovernanceStage[] = [
				"propose-plan",
				"card-generation",
				"wiki-synthesis",
				"staleness-update",
				"web-research",
				"skill-adversarial",
				"impact-prediction",
				"claim-grounding",
				"context-packing",
				"doc-review",
			];
			for (const st of expected) {
				expect(ALL_GOVERNANCE_STAGES).toContain(st);
				expect(isGovernanceStage(st)).toBe(true);
				expect(STAGE_METADATA[st]).toBeDefined();
				expect(STAGE_METADATA[st].label).toBeTruthy();
			}
			expect(isGovernanceStage("invalid_stage")).toBe(false);
		});
	});

	// =========================================================================
	// Theme 1: Cache-Read Discount Credit Visualizer (UX-0451 - UX-0460)
	// =========================================================================
	describe("Theme 1: Cache-Read Discount Credit Visualizer (UX-0451 - UX-0460)", () => {
		it("UX-0451: visualizes cache-read discount credit for proposeModulePlan decomposition", () => {
			const credit = calculateStageCacheCredit("propose-plan", 25_000, 0.8);
			expect(credit.stage).toBe("propose-plan");
			expect(credit.cachedTokens).toBe(20_000);
			expect(credit.savingsPercentage).toBeGreaterThan(50);
			const visual = renderCacheCreditVisualizer(credit);
			expect(visual).toContain("proposeModulePlan Decomposition Stage");
			expect(visual).toContain("Prompt Cache Credit");
		});

		it("UX-0452: visualizes cache-read discount credit for knowledge card batch generation", () => {
			const credit = calculateStageCacheCredit("card-generation", 12_000, 0.75);
			expect(credit.stage).toBe("card-generation");
			expect(credit.savingsUsd).toBeGreaterThan(0);
			expect(renderCacheCreditVisualizer(credit)).toContain("Knowledge Card Batch Generation");
		});

		it("UX-0453: visualizes cache-read discount credit for wiki cascade chapter synthesis", () => {
			const credit = calculateStageCacheCredit("wiki-synthesis", 30_000, 0.85);
			expect(credit.stage).toBe("wiki-synthesis");
			expect(credit.cachedCostUsd).toBeLessThan(credit.fullCostUsd);
		});

		it("UX-0454: visualizes cache-read discount credit for staleness incremental update run", () => {
			const credit = calculateStageCacheCredit("staleness-update", 18_000, 0.9);
			expect(credit.stage).toBe("staleness-update");
			expect(credit.savingsPercentage).toBeGreaterThan(60);
		});

		it("UX-0455: visualizes cache-read discount credit for deep web research multi-page digest", () => {
			const credit = calculateStageCacheCredit("web-research", 40_000, 0.8);
			expect(credit.stage).toBe("web-research");
			expect(credit.savingsUsd).toBeGreaterThan(0.01);
		});

		it("UX-0456: visualizes cache-read discount credit for agent skill generation adversarial loop", () => {
			const credit = calculateStageCacheCredit("skill-adversarial", 15_000, 0.75);
			expect(credit.stage).toBe("skill-adversarial");
			expect(credit.visualBar).toContain("█");
		});

		it("UX-0457: visualizes cache-read discount credit for code impact prediction model inference", () => {
			const credit = calculateStageCacheCredit("impact-prediction", 20_000, 0.8);
			expect(credit.stage).toBe("impact-prediction");
			expect(credit.savingsPercentage).toBeGreaterThan(0);
		});

		it("UX-0458: visualizes cache-read discount credit for claim grounding model verification pass", () => {
			const credit = calculateStageCacheCredit("claim-grounding", 22_000, 0.8);
			expect(credit.stage).toBe("claim-grounding");
			expect(credit.cachedTokens).toBe(17_600);
		});

		it("UX-0459: visualizes cache-read discount credit for large file context window packing", () => {
			const credit = calculateStageCacheCredit("context-packing", 60_000, 0.85);
			expect(credit.stage).toBe("context-packing");
			expect(credit.savingsUsd).toBeGreaterThan(0.03);
		});

		it("UX-0460: visualizes cache-read discount credit for multi-chapter documentation review", () => {
			const credit = calculateStageCacheCredit("doc-review", 35_000, 0.8);
			expect(credit.stage).toBe("doc-review");
			expect(renderCacheCreditVisualizer(credit)).toContain("Multi-Chapter Documentation Review");
		});
	});

	// =========================================================================
	// Theme 2: Detailed Post-Execution Token Expenditure Audit Report (UX-0461 - UX-0470)
	// =========================================================================
	describe("Theme 2: Post-Execution Token Expenditure Audit Report (UX-0461 - UX-0470)", () => {
		it("UX-0461: generates audit report for proposeModulePlan decomposition stage", () => {
			const report = generateStageAuditReport({
				stage: "propose-plan",
				model: "gemini-2.5-pro",
				inputTokens: 25_000,
				outputTokens: 3_500,
				cacheReadTokens: 20_000,
				latencyMs: 1420,
				usdCost: 0.0352,
			});
			expect(report).toContain("TOKEN EXPENDITURE AUDIT REPORT");
			expect(report).toContain("proposeModulePlan");
			expect(report).toContain("25,000");
			expect(report).toContain("1420 ms");
		});

		it("UX-0462: generates audit report for knowledge card batch generation", () => {
			const report = generateStageAuditReport({
				stage: "card-generation",
				model: "gemini-2.5-flash",
				inputTokens: 12_000,
				outputTokens: 1_800,
				latencyMs: 820,
				usdCost: 0.00288,
			});
			expect(report).toContain("Knowledge Card Batch Generation");
			expect(report).toContain("gemini-2.5-flash");
		});

		it("UX-0463: generates audit report for wiki cascade chapter synthesis", () => {
			const report = generateStageAuditReport({
				stage: "wiki-synthesis",
				model: "claude-3-7-sonnet",
				inputTokens: 30_000,
				outputTokens: 5_200,
				latencyMs: 3100,
				usdCost: 0.168,
			});
			expect(report).toContain("Wiki Cascade Chapter Synthesis");
			expect(report).toContain("$0.16800 USD");
		});

		it("UX-0464: generates audit report for staleness incremental update run", () => {
			const report = generateStageAuditReport({
				stage: "staleness-update",
				model: "gemini-2.5-pro",
				inputTokens: 18_000,
				outputTokens: 2_100,
				latencyMs: 1100,
				usdCost: 0.0245,
			});
			expect(report).toContain("Staleness Incremental Update Run");
		});

		it("UX-0465: generates audit report for deep web research multi-page digest", () => {
			const report = generateStageAuditReport({
				stage: "web-research",
				model: "gemini-2.5-flash",
				inputTokens: 42_000,
				outputTokens: 4_500,
				latencyMs: 2500,
				usdCost: 0.009,
			});
			expect(report).toContain("Deep Web Research Multi-Page Digest");
		});

		it("UX-0466: generates audit report for agent skill generation adversarial loop", () => {
			const report = generateStageAuditReport({
				stage: "skill-adversarial",
				model: "gpt-4o",
				inputTokens: 15_000,
				outputTokens: 3_200,
				latencyMs: 2200,
				usdCost: 0.0695,
			});
			expect(report).toContain("Agent Skill Generation Adversarial Loop");
		});

		it("UX-0467: generates audit report for code impact prediction model inference", () => {
			const report = generateStageAuditReport({
				stage: "impact-prediction",
				model: "gemini-2.5-flash",
				inputTokens: 21_000,
				outputTokens: 2_400,
				latencyMs: 950,
				usdCost: 0.00459,
			});
			expect(report).toContain("Code Impact Prediction Model Inference");
		});

		it("UX-0468: generates audit report for claim grounding model verification pass", () => {
			const report = generateStageAuditReport({
				stage: "claim-grounding",
				model: "gemini-2.5-pro",
				inputTokens: 22_500,
				outputTokens: 2_800,
				latencyMs: 1350,
				usdCost: 0.0315,
			});
			expect(report).toContain("Claim Grounding Model Verification Pass");
		});

		it("UX-0469: generates audit report for large file context window packing", () => {
			const report = generateStageAuditReport({
				stage: "context-packing",
				model: "claude-3-7-sonnet",
				inputTokens: 65_000,
				outputTokens: 3_800,
				latencyMs: 4200,
				usdCost: 0.252,
			});
			expect(report).toContain("Large File Context Window Packing");
		});

		it("UX-0470: generates audit report for multi-chapter documentation review", () => {
			const report = generateStageAuditReport({
				stage: "doc-review",
				model: "gemini-2.5-pro",
				inputTokens: 36_000,
				outputTokens: 4_900,
				latencyMs: 2600,
				usdCost: 0.0695,
			});
			expect(report).toContain("Multi-Chapter Documentation Review");
		});
	});

	// =========================================================================
	// Theme 3: Historical Spend Timeline Graph (UX-0471 - UX-0480)
	// =========================================================================
	describe("Theme 3: Historical Spend Timeline Graph (UX-0471 - UX-0480)", () => {
		const sampleHistory: SpendDataPoint[] = [
			{ timestamp: "2026-09-25T10:00:00Z", stage: "propose-plan", tokens: 24_000, usd: 0.034 },
			{ timestamp: "2026-09-25T10:15:00Z", stage: "propose-plan", tokens: 26_000, usd: 0.037 },
			{ timestamp: "2026-09-25T10:30:00Z", stage: "card-generation", tokens: 12_000, usd: 0.016 },
			{ timestamp: "2026-09-25T10:45:00Z", stage: "wiki-synthesis", tokens: 32_000, usd: 0.045 },
			{ timestamp: "2026-09-25T11:00:00Z", stage: "staleness-update", tokens: 17_000, usd: 0.023 },
			{ timestamp: "2026-09-25T11:15:00Z", stage: "web-research", tokens: 41_000, usd: 0.058 },
			{ timestamp: "2026-09-25T11:30:00Z", stage: "skill-adversarial", tokens: 16_000, usd: 0.022 },
			{ timestamp: "2026-09-25T11:45:00Z", stage: "impact-prediction", tokens: 19_000, usd: 0.026 },
			{ timestamp: "2026-09-25T12:00:00Z", stage: "claim-grounding", tokens: 23_000, usd: 0.032 },
			{ timestamp: "2026-09-25T12:15:00Z", stage: "context-packing", tokens: 58_000, usd: 0.081 },
			{ timestamp: "2026-09-25T12:30:00Z", stage: "doc-review", tokens: 34_000, usd: 0.048 },
		];

		it("UX-0471: renders historical spend timeline for proposeModulePlan decomposition", () => {
			const graph = renderHistoricalSpendGraph("propose-plan", sampleHistory);
			expect(graph).toContain("Historical Spend Timeline");
			expect(graph).toContain("proposeModulePlan");
			expect(graph).toContain("■");
			expect(graph).toContain("Run #1");
			expect(graph).toContain("Run #2");
		});

		it("UX-0472: renders historical spend timeline for knowledge card batch generation", () => {
			const graph = renderHistoricalSpendGraph("card-generation", sampleHistory);
			expect(graph).toContain("Knowledge Card Batch Generation");
		});

		it("UX-0473: renders historical spend timeline for wiki cascade chapter synthesis", () => {
			const graph = renderHistoricalSpendGraph("wiki-synthesis", sampleHistory);
			expect(graph).toContain("Wiki Cascade Chapter Synthesis");
		});

		it("UX-0474: renders historical spend timeline for staleness incremental update run", () => {
			const graph = renderHistoricalSpendGraph("staleness-update", sampleHistory);
			expect(graph).toContain("Staleness Incremental Update Run");
		});

		it("UX-0475: renders historical spend timeline for deep web research multi-page digest", () => {
			const graph = renderHistoricalSpendGraph("web-research", sampleHistory);
			expect(graph).toContain("Deep Web Research Multi-Page Digest");
		});

		it("UX-0476: renders historical spend timeline for agent skill generation adversarial loop", () => {
			const graph = renderHistoricalSpendGraph("skill-adversarial", sampleHistory);
			expect(graph).toContain("Agent Skill Generation Adversarial Loop");
		});

		it("UX-0477: renders historical spend timeline for code impact prediction model inference", () => {
			const graph = renderHistoricalSpendGraph("impact-prediction", sampleHistory);
			expect(graph).toContain("Code Impact Prediction Model Inference");
		});

		it("UX-0478: renders historical spend timeline for claim grounding model verification pass", () => {
			const graph = renderHistoricalSpendGraph("claim-grounding", sampleHistory);
			expect(graph).toContain("Claim Grounding Model Verification Pass");
		});

		it("UX-0479: renders historical spend timeline for large file context window packing", () => {
			const graph = renderHistoricalSpendGraph("context-packing", sampleHistory);
			expect(graph).toContain("Large File Context Window Packing");
		});

		it("UX-0480: renders historical spend timeline for multi-chapter documentation review", () => {
			const graph = renderHistoricalSpendGraph("doc-review", sampleHistory);
			expect(graph).toContain("Multi-Chapter Documentation Review");
		});
	});

	// =========================================================================
	// Theme 4: High-Context Threshold Warning Prompts (UX-0481 - UX-0490)
	// =========================================================================
	describe("Theme 4: High-Context Threshold Warning Prompts (UX-0481 - UX-0490)", () => {
		it("UX-0481: checks threshold warning for proposeModulePlan decomposition stage", () => {
			const warning = checkStageThresholdWarning("propose-plan", 85_000);
			expect(warning.triggered).toBe(true);
			expect(warning.warningMessage).toContain("HIGH-CONTEXT THRESHOLD EXCEEDED");
			const promptCard = formatThresholdWarningPrompt(warning);
			expect(promptCard).toContain("PRE-DISPATCH WARNING");
		});

		it("UX-0482: checks threshold warning for knowledge card batch generation", () => {
			const warning = checkStageThresholdWarning("card-generation", 55_000);
			expect(warning.triggered).toBe(true);
			expect(warning.confirmationPrompt).toContain("Do you wish to proceed");
		});

		it("UX-0483: checks threshold warning for wiki cascade chapter synthesis", () => {
			const warning = checkStageThresholdWarning("wiki-synthesis", 75_000);
			expect(warning.triggered).toBe(true);
		});

		it("UX-0484: checks threshold warning for staleness incremental update run", () => {
			const warning = checkStageThresholdWarning("staleness-update", 45_000);
			expect(warning.triggered).toBe(true);
		});

		it("UX-0485: checks threshold warning for deep web research multi-page digest", () => {
			const warning = checkStageThresholdWarning("web-research", 95_000);
			expect(warning.triggered).toBe(true);
		});

		it("UX-0486: checks threshold warning for agent skill generation adversarial loop", () => {
			const warning = checkStageThresholdWarning("skill-adversarial", 60_000);
			expect(warning.triggered).toBe(true);
		});

		it("UX-0487: checks threshold warning for code impact prediction model inference", () => {
			const warning = checkStageThresholdWarning("impact-prediction", 50_000);
			expect(warning.triggered).toBe(true);
		});

		it("UX-0488: checks threshold warning for claim grounding model verification pass", () => {
			const warning = checkStageThresholdWarning("claim-grounding", 52_000);
			expect(warning.triggered).toBe(true);
		});

		it("UX-0489: checks threshold warning for large file context window packing", () => {
			const warning = checkStageThresholdWarning("context-packing", 120_000);
			expect(warning.triggered).toBe(true);
		});

		it("UX-0490: checks threshold warning for multi-chapter documentation review", () => {
			const warning = checkStageThresholdWarning("doc-review", 85_000);
			expect(warning.triggered).toBe(true);
		});

		it("remains untriggered when context tokens are safely within budget", () => {
			const okResult = checkStageThresholdWarning("propose-plan", 10_000);
			expect(okResult.triggered).toBe(false);
			expect(okResult.warningMessage).toContain("within standard stage threshold");
		});
	});

	// =========================================================================
	// Theme 5: Model Provider Comparison Matrix (UX-0491 - UX-0500)
	// =========================================================================
	describe("Theme 5: Model Provider Comparison Matrix (UX-0491 - UX-0500)", () => {
		const sampleTokens = { input: 25_000, output: 4_000, passes: 1 };

		it("UX-0491: calculates provider cost comparison for proposeModulePlan decomposition", () => {
			const matrix = generateProviderComparisonMatrix("propose-plan", sampleTokens);
			expect(matrix.stage).toBe("propose-plan");
			expect(matrix.rows.length).toBeGreaterThanOrEqual(4);
			const table = formatProviderComparisonMatrix(matrix);
			expect(table).toContain("PROVIDER COMPARISON MATRIX");
			expect(table).toContain("gemini-2.5-flash");
			expect(table).toContain("gemini-2.5-pro");
		});

		it("UX-0492: calculates provider cost comparison for knowledge card batch generation", () => {
			const matrix = generateProviderComparisonMatrix("card-generation", { input: 12_000, output: 2_000, passes: 1 });
			expect(matrix.stage).toBe("card-generation");
			expect(matrix.recommendedModel).toBe("gemini-2.5-flash");
		});

		it("UX-0493: calculates provider cost comparison for wiki cascade chapter synthesis", () => {
			const matrix = generateProviderComparisonMatrix("wiki-synthesis", { input: 30_000, output: 6_000, passes: 1 });
			expect(matrix.stage).toBe("wiki-synthesis");
			const sonnetRow = matrix.rows.find((r) => r.modelKey === "claude-3-7-sonnet");
			expect(sonnetRow).toBeDefined();
		});

		it("UX-0494: calculates provider cost comparison for staleness incremental update run", () => {
			const matrix = generateProviderComparisonMatrix("staleness-update", { input: 18_000, output: 2_500, passes: 1 });
			expect(matrix.stage).toBe("staleness-update");
		});

		it("UX-0495: calculates provider cost comparison for deep web research multi-page digest", () => {
			const matrix = generateProviderComparisonMatrix("web-research", { input: 40_000, output: 5_000, passes: 1 });
			expect(matrix.stage).toBe("web-research");
		});

		it("UX-0496: calculates provider cost comparison for agent skill generation adversarial loop", () => {
			const matrix = generateProviderComparisonMatrix("skill-adversarial", { input: 15_000, output: 3_500, passes: 1 });
			expect(matrix.stage).toBe("skill-adversarial");
		});

		it("UX-0497: calculates provider cost comparison for code impact prediction model inference", () => {
			const matrix = generateProviderComparisonMatrix("impact-prediction", { input: 20_000, output: 2_500, passes: 1 });
			expect(matrix.stage).toBe("impact-prediction");
		});

		it("UX-0498: calculates provider cost comparison for claim grounding model verification pass", () => {
			const matrix = generateProviderComparisonMatrix("claim-grounding", { input: 22_000, output: 3_000, passes: 1 });
			expect(matrix.stage).toBe("claim-grounding");
		});

		it("UX-0499: calculates provider cost comparison for large file context window packing", () => {
			const matrix = generateProviderComparisonMatrix("context-packing", { input: 60_000, output: 4_000, passes: 1 });
			expect(matrix.stage).toBe("context-packing");
		});

		it("UX-0500: calculates provider cost comparison for multi-chapter documentation review", () => {
			const matrix = generateProviderComparisonMatrix("doc-review", { input: 35_000, output: 5_000, passes: 1 });
			expect(matrix.stage).toBe("doc-review");
			const table = formatProviderComparisonMatrix(matrix);
			expect(table).toContain("Multi-Chapter Documentation Review");
		});
	});
});
