import { describe, expect, it } from "vitest";
import {
	calculateFreshnessDial,
	classifyDocCategory,
	formatFreshnessSummary,
	renderFreshnessDial,
} from "../src/dial.ts";
import type { StalenessReport } from "../src/types.ts";

describe("FreshnessDialCalculator & Visual Renderer", () => {
	it("correctly classifies documents into standard categories", () => {
		expect(classifyDocCategory("docs/architecture/system-overview.md")).toBe("architecture");
		expect(classifyDocCategory("card:auth-module")).toBe("cards");
		expect(classifyDocCategory(".kaioken/cards/user.json")).toBe("cards");
		expect(classifyDocCategory("subsystem-graph-edges.md")).toBe("subsystems");
		expect(classifyDocCategory("skills/verify-build.md")).toBe("procedures");
		expect(classifyDocCategory("api/routes/users.md")).toBe("api");
		expect(classifyDocCategory("models/user-schema.md")).toBe("data_models");
		expect(classifyDocCategory("security-audit-token.md")).toBe("security");
		expect(classifyDocCategory("deploy-runbook.md")).toBe("runbooks");
		expect(classifyDocCategory("perf-tuning-benchmark.md")).toBe("benchmarks");
		expect(classifyDocCategory("onboarding-tutorial.md")).toBe("tutorials");
		expect(classifyDocCategory("misc/random.md")).toBe("other");
	});

	it("calculates freshness dial stats and tier thresholds", () => {
		const mockReport: StalenessReport = {
			ok: false,
			freshness: 0.85,
			changedFiles: ["a.ts"],
			deletedFiles: [],
			undocumentedFiles: [],
			documents: [
				{
					document: "docs/arch/overview.md",
					freshness: "current",
					changed: [],
					deleted: [],
					unchanged: ["a.ts"],
					generatedAt: "",
				},
				{
					document: "card:users",
					freshness: "stale",
					changed: ["a.ts"],
					deleted: [],
					unchanged: [],
					generatedAt: "",
				},
			],
			current: [
				{
					document: "docs/arch/overview.md",
					freshness: "current",
					changed: [],
					deleted: [],
					unchanged: ["a.ts"],
					generatedAt: "",
				},
			],
			stale: [
				{
					document: "card:users",
					freshness: "stale",
					changed: ["a.ts"],
					deleted: [],
					unchanged: [],
					generatedAt: "",
				},
			],
			orphaned: [],
		};

		const dial = calculateFreshnessDial(mockReport);
		expect(dial.overallPercentage).toBe(85);
		expect(dial.tier).toBe("healthy");
		expect(dial.totalDocuments).toBe(2);
		expect(dial.freshDocuments).toBe(1);
		expect(dial.staleDocuments).toBe(1);

		expect(dial.categories.architecture.total).toBe(1);
		expect(dial.categories.architecture.fresh).toBe(1);
		expect(dial.categories.architecture.percentage).toBe(100);

		expect(dial.categories.cards.total).toBe(1);
		expect(dial.categories.cards.stale).toBe(1);
		expect(dial.categories.cards.percentage).toBe(0);
	});

	it("renders compact format", () => {
		const dial = calculateFreshnessDial({
			ok: true,
			freshness: 1.0,
			changedFiles: [],
			deletedFiles: [],
			undocumentedFiles: [],
			documents: [],
			current: [],
			stale: [],
			orphaned: [],
		});
		const compact = renderFreshnessDial(dial, { format: "compact" });
		expect(compact).toContain("Freshness: 100%");
		expect(compact).toContain("PRISTINE");
	});

	it("renders ASCII and bar formats", () => {
		const dial = calculateFreshnessDial({
			ok: false,
			freshness: 0.6,
			changedFiles: ["a.ts"],
			deletedFiles: [],
			undocumentedFiles: [],
			documents: [{ document: "doc1", freshness: "stale", changed: [], deleted: [], unchanged: [], generatedAt: "" }],
			current: [],
			stale: [{ document: "doc1", freshness: "stale", changed: [], deleted: [], unchanged: [], generatedAt: "" }],
			orphaned: [],
		});

		const ascii = renderFreshnessDial(dial, { format: "ascii" });
		expect(ascii).toContain("[======....] 60% (warning)");

		const bar = renderFreshnessDial(dial, { format: "bar" });
		expect(bar).toContain("60% (warning)");
	});

	it("formats textual summary across categories", () => {
		const mockReport: StalenessReport = {
			ok: true,
			freshness: 1.0,
			changedFiles: [],
			deletedFiles: [],
			undocumentedFiles: [],
			documents: [
				{
					document: "api/routes.md",
					freshness: "current",
					changed: [],
					deleted: [],
					unchanged: [],
					generatedAt: "",
				},
			],
			current: [
				{
					document: "api/routes.md",
					freshness: "current",
					changed: [],
					deleted: [],
					unchanged: [],
					generatedAt: "",
				},
			],
			stale: [],
			orphaned: [],
		};

		const dial = calculateFreshnessDial(mockReport);
		const summary = formatFreshnessSummary(dial);
		expect(summary).toContain("Repository Freshness: 100% [PRISTINE]");
		expect(summary).toContain("api");
		expect(summary).toContain("100%");
	});
});
