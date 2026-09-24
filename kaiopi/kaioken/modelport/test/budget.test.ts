import { describe, expect, it } from "vitest";
import {
	BudgetCeilingManager,
	BudgetExceededError,
	formatSpendAuditReport,
} from "../src/budget.ts";

describe("budget: BudgetCeilingManager", () => {
	it("allows dispatches within hard ceiling limit", () => {
		const mgr = new BudgetCeilingManager({ hardCeilingUsd: 1.0 });
		const check = mgr.checkBudget(0.25, "plan");
		expect(check.allowed).toBe(true);
		expect(check.currentSpendUsd).toBe(0);
		expect(check.projectedSpendUsd).toBe(0.25);
		expect(check.remainingUsd).toBe(0.75);
	});

	it("blocks dispatches that exceed the hard ceiling limit", () => {
		const mgr = new BudgetCeilingManager({ hardCeilingUsd: 0.5 });
		mgr.record("plan", { input: 100_000, output: 50_000, passes: 2 }, 0.4);

		const check = mgr.checkBudget(0.15, "cards");
		expect(check.allowed).toBe(false);
		expect(check.reason).toContain("would exceed hard ceiling");

		expect(() => mgr.enforceBudget(0.15, "cards")).toThrow(BudgetExceededError);
	});

	it("issues warning when approaching warning ratio", () => {
		const mgr = new BudgetCeilingManager({ hardCeilingUsd: 1.0, warningRatio: 0.8 });
		const check = mgr.checkBudget(0.85, "wiki");
		expect(check.allowed).toBe(true);
		expect(check.warning).toContain("Session budget near capacity");
	});

	it("accumulates multiple dispatches and computes summary", () => {
		const mgr = new BudgetCeilingManager({ hardCeilingUsd: 2.0 });
		mgr.record("plan", { input: 20_000, output: 5_000, passes: 1 }, 0.05);
		mgr.record("cards", { input: 40_000, output: 10_000, passes: 3 }, 0.15);

		const summary = mgr.summary();
		expect(summary.recordCount).toBe(2);
		expect(summary.totalInputTokens).toBe(60_000);
		expect(summary.totalOutputTokens).toBe(15_000);
		expect(summary.totalPasses).toBe(4);
		expect(summary.totalSpendUsd).toBeCloseTo(0.20, 4);
		expect(summary.remainingBudgetUsd).toBeCloseTo(1.80, 4);
		expect(summary.budgetConsumedRatio).toBeCloseTo(0.10, 4);
	});

	it("allows unconstrained spend when ceiling is null", () => {
		const mgr = new BudgetCeilingManager({ hardCeilingUsd: null });
		const check = mgr.checkBudget(50.0, "huge-run");
		expect(check.allowed).toBe(true);
		expect(check.ceilingUsd).toBeNull();
		expect(check.remainingUsd).toBeNull();
	});
});

describe("budget: formatSpendAuditReport", () => {
	it("renders chronological audit ledger with running totals", () => {
		const mgr = new BudgetCeilingManager({ hardCeilingUsd: 5.0 });
		mgr.record("plan", { input: 15_000, output: 3_000, passes: 1 }, 0.02, "gemini-2.5-flash");
		mgr.record("cards", { input: 45_000, output: 9_000, passes: 3 }, 0.08, "gemini-2.5-flash");

		const report = formatSpendAuditReport(mgr.records, mgr.hardCeilingUsd);
		expect(report).toContain("=== Kaioken Session Spend Audit Ledger ===");
		expect(report).toContain("plan");
		expect(report).toContain("cards");
		expect(report).toContain("Total Dispatches: 2");
		expect(report).toContain("Budget Ceiling:   $5.0000 USD");
	});

	it("handles empty ledger gracefully", () => {
		const report = formatSpendAuditReport([]);
		expect(report).toContain("No recorded model dispatches");
	});
});
