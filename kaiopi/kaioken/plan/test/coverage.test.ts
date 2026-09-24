import { describe, expect, it } from "vitest";
import type { ScanResult } from "@kaioken/scan";
import type { ModulePlan } from "../src/types.ts";
import {
	computeCoverageIndicator,
	formatCoverageGauge,
	suggestModuleForFile,
} from "../src/coverage.ts";

function scanOf(files: Array<{ path: string; bytes?: number; risk?: string[]; binary?: boolean }>): ScanResult {
	return {
		root: "/repo",
		scannedAt: "",
		fileCount: files.length,
		totalBytes: files.length * 100,
		files: files.map((f) => ({
			path: f.path,
			language: "typescript",
			size: f.bytes ?? 100,
			lineCount: 10,
			risk: f.risk ?? [],
			binary: f.binary ?? false,
			hash: `hash-${f.path}`,
		})),
	} as unknown as ScanResult;
}

describe("plan: computeCoverageIndicator (UX-1231 - UX-1240)", () => {
	const plan: ModulePlan = {
		version: 1,
		generatedAt: "",
		multiplier: 1,
		modules: [
			{
				id: "auth",
				name: "Auth",
				purpose: "Authentication",
				files: ["src/auth/login.ts", "src/auth/jwt.ts"],
			},
			{
				id: "api",
				name: "API",
				purpose: "API Routes",
				files: ["src/api/routes.ts"],
			},
		],
	};

	it("computes 100% coverage when all eligible files are assigned", () => {
		const scan = scanOf([
			{ path: "src/auth/login.ts" },
			{ path: "src/auth/jwt.ts" },
			{ path: "src/api/routes.ts" },
		]);
		const rep = computeCoverageIndicator(plan, scan);
		expect(rep.coveragePercentage).toBe(100);
		expect(rep.unassignedFilesCount).toBe(0);
	});

	it("calculates unassigned files, categories, and risks accurately", () => {
		const scan = scanOf([
			{ path: "src/auth/login.ts" },
			{ path: "src/auth/jwt.ts" },
			{ path: "src/api/routes.ts" },
			{ path: "src/api/extra_controller.ts" }, // unassigned, backend-api, high risk
			{ path: "docs/readme.md" },               // unassigned, documentation, low risk
			{ path: "test/auth.test.ts" },            // unassigned, testing-fixture, low risk
			{ path: "package-lock.json", risk: ["lockfile"] }, // ignored
		]);

		const rep = computeCoverageIndicator(plan, scan);
		expect(rep.totalEligibleFiles).toBe(6);
		expect(rep.assignedFilesCount).toBe(3);
		expect(rep.unassignedFilesCount).toBe(3);
		expect(rep.coveragePercentage).toBe(50);

		expect(rep.riskBreakdown.high).toBe(1);
		expect(rep.riskBreakdown.low).toBe(2);

		const extra = rep.unassignedFiles.find((f) => f.path === "src/api/extra_controller.ts");
		expect(extra?.suggestedModuleId).toBe("api");
		expect(extra?.risk).toBe("high");
	});

	it("suggests the best module based on directory prefix match", () => {
		expect(suggestModuleForFile("src/auth/session.ts", plan)).toBe("auth");
		expect(suggestModuleForFile("src/api/v2/users.ts", plan)).toBe("api");
	});

	it("formats visual coverage meter gauge with bar and breakdown", () => {
		const scan = scanOf([
			{ path: "src/auth/login.ts" },
			{ path: "src/auth/jwt.ts" },
			{ path: "src/orphan.ts" },
		]);
		const rep = computeCoverageIndicator(plan, scan);
		const gauge = formatCoverageGauge(rep, { showBreakdown: true, width: 10 });
		expect(gauge).toContain("COVERAGE GAUGE");
		expect(gauge).toContain("Coverage: [");
		expect(gauge).toContain("Unassigned:");
	});
});
