import { describe, expect, it } from "vitest";
import type { ModulePlan } from "../src/types.ts";
import {
	CardSortingSession,
	createModule,
	mergeModules,
	moveFile,
	removeModule,
	renderCardSortingGrid,
	renderModuleTree,
	splitModule,
} from "../src/cardsort.ts";

function samplePlan(): ModulePlan {
	return {
		version: 1,
		generatedAt: "2026-09-24T00:00:00Z",
		multiplier: 1,
		modules: [
			{
				id: "backend",
				name: "Backend Services",
				purpose: "API endpoints and database controllers",
				files: [
					"src/api/users.ts",
					"src/api/auth.ts",
					"src/db/models.ts",
					"src/db/migrations.ts",
				],
			},
			{
				id: "frontend",
				name: "Frontend UI",
				purpose: "User interface components and views",
				files: ["src/ui/app.tsx", "src/ui/header.tsx"],
			},
		],
	};
}

describe("plan: module boundary operations (UX-1241 - UX-1280)", () => {
	it("moves a file between modules", () => {
		const plan = samplePlan();
		const updated = moveFile(plan, "src/api/auth.ts", "frontend");

		const backend = updated.modules.find((m) => m.id === "backend");
		const frontend = updated.modules.find((m) => m.id === "frontend");

		expect(backend?.files).not.toContain("src/api/auth.ts");
		expect(frontend?.files).toContain("src/api/auth.ts");
	});

	it("throws when moving to non-existent module", () => {
		const plan = samplePlan();
		expect(() => moveFile(plan, "src/api/auth.ts", "ghost")).toThrow(
			/Target module "ghost" does not exist/,
		);
	});

	it("splits an oversized module by subdirectories (UX-1261 - UX-1270)", () => {
		const plan = samplePlan();
		const split = splitModule(plan, "backend", { by: "directory" });

		const backend = split.modules.find((m) => m.id === "backend");
		expect(backend?.children).toBeDefined();
		expect(backend?.children?.length).toBe(2);

		const childIds = backend?.children?.map((c) => c.id);
		expect(childIds).toContain("backend-api");
		expect(childIds).toContain("backend-db");
	});

	it("splits an oversized module by architectural domain", () => {
		const plan = samplePlan();
		const split = splitModule(plan, "backend", { by: "domain" });
		const backend = split.modules.find((m) => m.id === "backend");
		expect(backend?.children?.length).toBeGreaterThan(1);
	});

	it("merges two tightly coupled modules (UX-1271 - UX-1280)", () => {
		const plan = samplePlan();
		const merged = mergeModules(plan, "frontend", "backend", {
			mergedName: "Full Stack Monolith",
			mergedPurpose: "Consolidated application",
		});

		expect(merged.modules).toHaveLength(1);
		const target = merged.modules[0]!;
		expect(target.id).toBe("backend");
		expect(target.name).toBe("Full Stack Monolith");
		expect(target.files).toHaveLength(6);
	});

	it("creates and removes modules safely", () => {
		let plan = samplePlan();
		plan = createModule(plan, {
			id: "infra",
			name: "Infrastructure",
			purpose: "Deployment manifests and configs",
			files: ["Dockerfile"],
		});
		expect(plan.modules).toHaveLength(3);

		plan = removeModule(plan, "infra", "backend");
		expect(plan.modules).toHaveLength(2);
		const backend = plan.modules.find((m) => m.id === "backend");
		expect(backend?.files).toContain("Dockerfile");
	});
});

describe("plan: renderModuleTree and renderCardSortingGrid (UX-1241 - UX-1250, UX-1281 - UX-1290)", () => {
	it("renders hierarchical module tree with branch glyphs", () => {
		const plan = samplePlan();
		const tree = renderModuleTree(plan, { showFiles: true });
		expect(tree).toContain("Module Tree");
		expect(tree).toContain("├── [backend] Backend Services");
		expect(tree).toContain("└── [frontend] Frontend UI");
		expect(tree).toContain("📄 src/api/users.ts");
	});

	it("renders visual card-sorting grid layout", () => {
		const plan = samplePlan();
		const grid = renderCardSortingGrid(plan, { selectedModuleId: "backend" });
		expect(grid).toContain("INTERACTIVE MODULE CARD-SORTING BOARD");
		expect(grid).toContain("[backend]");
		expect(grid).toContain("[SELECTED]");
		expect(grid).toContain("[frontend]");
	});
});

describe("plan: CardSortingSession state management", () => {
	it("supports undo and redo for boundary reorganization", () => {
		const session = new CardSortingSession(samplePlan());
		expect(session.plan.modules[0]!.files).toContain("src/api/users.ts");

		session.move("src/api/users.ts", "frontend");
		expect(session.plan.modules[0]!.files).not.toContain("src/api/users.ts");
		expect(session.plan.modules[1]!.files).toContain("src/api/users.ts");

		// Undo
		expect(session.undo()).toBe(true);
		expect(session.plan.modules[0]!.files).toContain("src/api/users.ts");
		expect(session.plan.modules[1]!.files).not.toContain("src/api/users.ts");

		// Redo
		expect(session.redo()).toBe(true);
		expect(session.plan.modules[0]!.files).not.toContain("src/api/users.ts");
		expect(session.plan.modules[1]!.files).toContain("src/api/users.ts");
	});
});
