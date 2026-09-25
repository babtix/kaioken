import { describe, expect, it } from "vitest";
import {
	ARCHITECTURAL_DOMAINS,
	checkArchitectureConsistency,
	computeDomainCoverageIndicator,
	detectArchitecturalDomain,
	formatArchitectureConsistencyReport,
	mergeDomainSiblings,
	renderDomainCoverageCard,
	renderDomainModuleTree,
	splitDomainModule,
	type ArchitecturalDomain,
	type ModulePlan,
} from "../src/index.ts";

describe("Step 30: Category 13 — Module Planning & Architecture Decomposition (UX-1251 to UX-1300)", () => {
	const samplePlan: ModulePlan = {
		version: 1,
		multiplier: 1,
		source: "heuristic",
		generatedAt: "2026-09-25T12:00:00Z",
		modules: [
			{
				id: "ui-views",
				name: "Frontend UI Components",
				purpose: "UI view components and layouts",
				files: [
					"src/components/Header.tsx",
					"src/components/Footer.tsx",
					"src/components/Sidebar.tsx",
					"src/views/Dashboard.tsx",
				],
			},
			{
				id: "api-routes",
				name: "Backend API Handlers",
				purpose: "HTTP request route handlers",
				files: [
					"src/api/users.ts",
					"src/api/auth.ts",
					"src/routes/projects.ts",
				],
			},
			{
				id: "db-models",
				name: "Database ORM Models",
				purpose: "ORM models and migrations",
				files: [
					"src/models/User.ts",
					"src/models/Project.ts",
					"migrations/001_init.sql",
				],
			},
			{
				id: "auth-guard",
				name: "Authentication & Session",
				purpose: "Session controllers and tokens",
				files: [
					"src/auth/jwt.ts",
					"src/auth/session.ts",
				],
			},
			{
				id: "queue-workers",
				name: "Background Job Workers",
				purpose: "Background task processor and cron",
				files: [
					"src/workers/indexer.ts",
					"src/workers/cleanup.ts",
				],
			},
			{
				id: "infra-scripts",
				name: "Cloud Infrastructure",
				purpose: "Deployment scripts and Dockerfiles",
				files: [
					"infra/terraform/main.tf",
					"Dockerfile",
				],
			},
			{
				id: "shared-utils",
				name: "Shared Utilities",
				purpose: "Common helpers and transformers",
				files: [
					"src/utils/format.ts",
					"src/utils/math.ts",
				],
			},
			{
				id: "cli-commands",
				name: "CLI Command Interfaces",
				purpose: "Terminal CLI interface",
				files: [
					"src/cli/index.ts",
					"src/commands/build.ts",
				],
			},
			{
				id: "ext-clients",
				name: "External Third-Party Clients",
				purpose: "API client adapters and integrations",
				files: [
					"src/clients/github.ts",
					"src/clients/stripe.ts",
				],
			},
			{
				id: "test-harness",
				name: "Testing Fixtures & Harness",
				purpose: "Mock harnesses and unit tests",
				files: [
					"test/fixtures/mock_user.json",
					"test/harness.ts",
				],
			},
		],
	};

	const allRepoFiles = [
		// frontend-ui
		"src/components/Header.tsx",
		"src/components/Footer.tsx",
		"src/components/Sidebar.tsx",
		"src/views/Dashboard.tsx",
		"src/components/UnassignedModal.tsx",
		// backend-api
		"src/api/users.ts",
		"src/api/auth.ts",
		"src/routes/projects.ts",
		"src/api/unassigned_route.ts",
		// database-orm
		"src/models/User.ts",
		"src/models/Project.ts",
		"migrations/001_init.sql",
		"src/models/UnassignedAudit.ts",
		// auth-session
		"src/auth/jwt.ts",
		"src/auth/session.ts",
		"src/auth/oauth_unassigned.ts",
		// job-worker
		"src/workers/indexer.ts",
		"src/workers/cleanup.ts",
		"src/workers/email_unassigned.ts",
		// cloud-infra
		"infra/terraform/main.tf",
		"Dockerfile",
		"infra/k8s/unassigned.yaml",
		// shared-util
		"src/utils/format.ts",
		"src/utils/math.ts",
		"src/utils/unassigned_string.ts",
		// cli-interface
		"src/cli/index.ts",
		"src/commands/build.ts",
		"src/commands/unassigned_cmd.ts",
		// third-party-client
		"src/clients/github.ts",
		"src/clients/stripe.ts",
		"src/clients/unassigned_slack.ts",
		// testing-fixture
		"test/fixtures/mock_user.json",
		"test/harness.ts",
		"test/fixtures/unassigned_fixture.json",
	];

	// =========================================================================
	// Theme 1: Unassigned File Coverage Indicator (UX-1251 - UX-1260)
	// =========================================================================
	describe("Theme 1: Unassigned File Coverage Indicator (UX-1251 - UX-1260)", () => {
		it("UX-1251: tracks unassigned files in frontend UI view components", () => {
			const rep = computeDomainCoverageIndicator(samplePlan, allRepoFiles, "frontend-ui");
			expect(rep.domain).toBe("frontend-ui");
			expect(rep.unassignedDomainFiles).toContain("src/components/UnassignedModal.tsx");
			expect(rep.coveragePercentage).toBe(80.0);
			expect(rep.visualGauge).toContain("80.0%");
			expect(renderDomainCoverageCard(rep)).toContain("Frontend UI Components");
		});

		it("UX-1252: tracks unassigned files in backend API route handlers", () => {
			const rep = computeDomainCoverageIndicator(samplePlan, allRepoFiles, "backend-api");
			expect(rep.domain).toBe("backend-api");
			expect(rep.unassignedDomainFiles).toContain("src/api/unassigned_route.ts");
		});

		it("UX-1253: tracks unassigned files in database ORM models and migrations", () => {
			const rep = computeDomainCoverageIndicator(samplePlan, allRepoFiles, "database-orm");
			expect(rep.domain).toBe("database-orm");
			expect(rep.unassignedDomainFiles).toContain("src/models/UnassignedAudit.ts");
		});

		it("UX-1254: tracks unassigned files in authentication and session controllers", () => {
			const rep = computeDomainCoverageIndicator(samplePlan, allRepoFiles, "auth-session");
			expect(rep.domain).toBe("auth-session");
			expect(rep.unassignedDomainFiles).toContain("src/auth/oauth_unassigned.ts");
		});

		it("UX-1255: tracks unassigned files in background job queue workers", () => {
			const rep = computeDomainCoverageIndicator(samplePlan, allRepoFiles, "job-worker");
			expect(rep.domain).toBe("job-worker");
			expect(rep.unassignedDomainFiles).toContain("src/workers/email_unassigned.ts");
		});

		it("UX-1256: tracks unassigned files in cloud infrastructure deployment scripts", () => {
			const rep = computeDomainCoverageIndicator(samplePlan, allRepoFiles, "cloud-infra");
			expect(rep.domain).toBe("cloud-infra");
			expect(rep.unassignedDomainFiles).toContain("infra/k8s/unassigned.yaml");
		});

		it("UX-1257: tracks unassigned files in shared utility libraries and helpers", () => {
			const rep = computeDomainCoverageIndicator(samplePlan, allRepoFiles, "shared-util");
			expect(rep.domain).toBe("shared-util");
			expect(rep.unassignedDomainFiles).toContain("src/utils/unassigned_string.ts");
		});

		it("UX-1258: tracks unassigned files in CLI command line interfaces", () => {
			const rep = computeDomainCoverageIndicator(samplePlan, allRepoFiles, "cli-interface");
			expect(rep.domain).toBe("cli-interface");
			expect(rep.unassignedDomainFiles).toContain("src/commands/unassigned_cmd.ts");
		});

		it("UX-1259: tracks unassigned files in external third-party integration clients", () => {
			const rep = computeDomainCoverageIndicator(samplePlan, allRepoFiles, "third-party-client");
			expect(rep.domain).toBe("third-party-client");
			expect(rep.unassignedDomainFiles).toContain("src/clients/unassigned_slack.ts");
		});

		it("UX-1260: tracks unassigned files in testing fixtures and mock harnesses", () => {
			const rep = computeDomainCoverageIndicator(samplePlan, allRepoFiles, "testing-fixture");
			expect(rep.domain).toBe("testing-fixture");
			expect(rep.unassignedDomainFiles).toContain("test/fixtures/unassigned_fixture.json");
		});
	});

	// =========================================================================
	// Theme 2: Granular Module Splitter (UX-1261 - UX-1270)
	// =========================================================================
	describe("Theme 2: Granular Module Splitter (UX-1261 - UX-1270)", () => {
		const makeOversizedPlan = (modId: string, domain: ArchitecturalDomain, filePrefix: string): ModulePlan => {
			const files = Array.from({ length: 16 }, (_, i) => `${filePrefix}/sub_${i % 4}/file_${i}.ts`);
			return {
				version: 1,
				generatedAt: "2026-09-25T12:00:00Z",
				multiplier: 1,
				modules: [{ id: modId, name: modId, purpose: "Test", files }],
			};
		};

		it("UX-1261: splits oversized monolithic frontend UI view components", () => {
			const plan = makeOversizedPlan("ui-views", "frontend-ui", "src/components");
			const split = splitDomainModule(plan, "ui-views", "frontend-ui", { maxFilesPerSubmodule: 5 });
			const target = split.modules.find((m) => m.id === "ui-views");
			expect(target?.children?.length).toBeGreaterThan(1);
			expect(target?.children?.[0]?.name).toContain("Frontend UI");
		});

		it("UX-1262: splits oversized monolithic backend API route handlers", () => {
			const plan = makeOversizedPlan("api-routes", "backend-api", "src/api");
			const split = splitDomainModule(plan, "api-routes", "backend-api", { maxFilesPerSubmodule: 5 });
			expect(split.modules[0]?.children?.length).toBeGreaterThan(1);
		});

		it("UX-1263: splits oversized monolithic database ORM models and migrations", () => {
			const plan = makeOversizedPlan("db-models", "database-orm", "src/models");
			const split = splitDomainModule(plan, "db-models", "database-orm", { maxFilesPerSubmodule: 5 });
			expect(split.modules[0]?.children?.length).toBeGreaterThan(1);
		});

		it("UX-1264: splits oversized monolithic authentication and session controllers", () => {
			const plan = makeOversizedPlan("auth-guard", "auth-session", "src/auth");
			const split = splitDomainModule(plan, "auth-guard", "auth-session", { maxFilesPerSubmodule: 5 });
			expect(split.modules[0]?.children?.length).toBeGreaterThan(1);
		});

		it("UX-1265: splits oversized monolithic background job queue workers", () => {
			const plan = makeOversizedPlan("queue-workers", "job-worker", "src/workers");
			const split = splitDomainModule(plan, "queue-workers", "job-worker", { maxFilesPerSubmodule: 5 });
			expect(split.modules[0]?.children?.length).toBeGreaterThan(1);
		});

		it("UX-1266: splits oversized monolithic cloud infrastructure deployment scripts", () => {
			const plan = makeOversizedPlan("infra-scripts", "cloud-infra", "infra");
			const split = splitDomainModule(plan, "infra-scripts", "cloud-infra", { maxFilesPerSubmodule: 5 });
			expect(split.modules[0]?.children?.length).toBeGreaterThan(1);
		});

		it("UX-1267: splits oversized monolithic shared utility libraries and helpers", () => {
			const plan = makeOversizedPlan("shared-utils", "shared-util", "src/utils");
			const split = splitDomainModule(plan, "shared-utils", "shared-util", { maxFilesPerSubmodule: 5 });
			expect(split.modules[0]?.children?.length).toBeGreaterThan(1);
		});

		it("UX-1268: splits oversized monolithic CLI command line interfaces", () => {
			const plan = makeOversizedPlan("cli-commands", "cli-interface", "src/commands");
			const split = splitDomainModule(plan, "cli-commands", "cli-interface", { maxFilesPerSubmodule: 5 });
			expect(split.modules[0]?.children?.length).toBeGreaterThan(1);
		});

		it("UX-1269: splits oversized monolithic external third-party integration clients", () => {
			const plan = makeOversizedPlan("ext-clients", "third-party-client", "src/clients");
			const split = splitDomainModule(plan, "ext-clients", "third-party-client", { maxFilesPerSubmodule: 5 });
			expect(split.modules[0]?.children?.length).toBeGreaterThan(1);
		});

		it("UX-1270: splits oversized monolithic testing fixtures and mock harnesses", () => {
			const plan = makeOversizedPlan("test-harness", "testing-fixture", "test/fixtures");
			const split = splitDomainModule(plan, "test-harness", "testing-fixture", { maxFilesPerSubmodule: 5 });
			expect(split.modules[0]?.children?.length).toBeGreaterThan(1);
		});
	});

	// =========================================================================
	// Theme 3: Module Merger for Coupled Siblings (UX-1271 - UX-1280)
	// =========================================================================
	describe("Theme 3: Module Merger for Coupled Siblings (UX-1271 - UX-1280)", () => {
		const makeSiblingPlan = (id1: string, id2: string): ModulePlan => ({
			version: 1,
			generatedAt: "2026-09-25T12:00:00Z",
			multiplier: 1,
			modules: [
				{ id: id1, name: "Module 1", purpose: "Purpose 1", files: ["a.ts"] },
				{ id: id2, name: "Module 2", purpose: "Purpose 2", files: ["b.ts"] },
			],
		});

		it("UX-1271: merges tightly coupled sibling frontend UI view components", () => {
			const plan = makeSiblingPlan("ui-buttons", "ui-icons");
			const merged = mergeDomainSiblings(plan, "frontend-ui", "ui-buttons", "ui-icons");
			expect(merged.modules).toHaveLength(1);
			expect(merged.modules[0]?.files).toEqual(["a.ts", "b.ts"]);
		});

		it("UX-1272: merges tightly coupled sibling backend API route handlers", () => {
			const plan = makeSiblingPlan("api-v1", "api-v2");
			const merged = mergeDomainSiblings(plan, "backend-api", "api-v1", "api-v2");
			expect(merged.modules).toHaveLength(1);
		});

		it("UX-1273: merges tightly coupled sibling database ORM models and migrations", () => {
			const plan = makeSiblingPlan("db-models", "db-migrations");
			const merged = mergeDomainSiblings(plan, "database-orm", "db-migrations", "db-models");
			expect(merged.modules).toHaveLength(1);
		});

		it("UX-1274: merges tightly coupled sibling authentication and session controllers", () => {
			const plan = makeSiblingPlan("auth-jwt", "auth-session");
			const merged = mergeDomainSiblings(plan, "auth-session", "auth-jwt", "auth-session");
			expect(merged.modules).toHaveLength(1);
		});

		it("UX-1275: merges tightly coupled sibling background job queue workers", () => {
			const plan = makeSiblingPlan("worker-email", "worker-queue");
			const merged = mergeDomainSiblings(plan, "job-worker", "worker-email", "worker-queue");
			expect(merged.modules).toHaveLength(1);
		});

		it("UX-1276: merges tightly coupled sibling cloud infrastructure deployment scripts", () => {
			const plan = makeSiblingPlan("infra-docker", "infra-k8s");
			const merged = mergeDomainSiblings(plan, "cloud-infra", "infra-docker", "infra-k8s");
			expect(merged.modules).toHaveLength(1);
		});

		it("UX-1277: merges tightly coupled sibling shared utility libraries and helpers", () => {
			const plan = makeSiblingPlan("util-format", "util-string");
			const merged = mergeDomainSiblings(plan, "shared-util", "util-format", "util-string");
			expect(merged.modules).toHaveLength(1);
		});

		it("UX-1278: merges tightly coupled sibling CLI command line interfaces", () => {
			const plan = makeSiblingPlan("cli-core", "cli-subcommands");
			const merged = mergeDomainSiblings(plan, "cli-interface", "cli-subcommands", "cli-core");
			expect(merged.modules).toHaveLength(1);
		});

		it("UX-1279: merges tightly coupled sibling external third-party integration clients", () => {
			const plan = makeSiblingPlan("client-slack", "client-discord");
			const merged = mergeDomainSiblings(plan, "third-party-client", "client-discord", "client-slack");
			expect(merged.modules).toHaveLength(1);
		});

		it("UX-1280: merges tightly coupled sibling testing fixtures and mock harnesses", () => {
			const plan = makeSiblingPlan("test-mocks", "test-fixtures");
			const merged = mergeDomainSiblings(plan, "testing-fixture", "test-mocks", "test-fixtures");
			expect(merged.modules).toHaveLength(1);
		});
	});

	// =========================================================================
	// Theme 4: Visual Module Tree Hierarchy Explorer (UX-1281 - UX-1290)
	// =========================================================================
	describe("Theme 4: Visual Module Tree Hierarchy Explorer (UX-1281 - UX-1290)", () => {
		it("UX-1281: explores module tree for frontend UI view components", () => {
			const tree = renderDomainModuleTree(samplePlan, { filterDomain: "frontend-ui", showFiles: true });
			expect(tree).toContain("MODULE TREE EXPLORER");
			expect(tree).toContain("Frontend UI Components");
			expect(tree).toContain("[L0]");
			expect(tree).toContain("Header.tsx");
		});

		it("UX-1282: explores module tree for backend API route handlers", () => {
			const tree = renderDomainModuleTree(samplePlan, { filterDomain: "backend-api" });
			expect(tree).toContain("Backend API");
		});

		it("UX-1283: explores module tree for database ORM models and migrations", () => {
			const tree = renderDomainModuleTree(samplePlan, { filterDomain: "database-orm" });
			expect(tree).toContain("database-orm");
		});

		it("UX-1284: explores module tree for authentication and session controllers", () => {
			const tree = renderDomainModuleTree(samplePlan, { filterDomain: "auth-session" });
			expect(tree).toContain("auth-session");
		});

		it("UX-1285: explores module tree for background job queue workers", () => {
			const tree = renderDomainModuleTree(samplePlan, { filterDomain: "job-worker" });
			expect(tree).toContain("job-worker");
		});

		it("UX-1286: explores module tree for cloud infrastructure deployment scripts", () => {
			const tree = renderDomainModuleTree(samplePlan, { filterDomain: "cloud-infra" });
			expect(tree).toContain("cloud-infra");
		});

		it("UX-1287: explores module tree for shared utility libraries and helpers", () => {
			const tree = renderDomainModuleTree(samplePlan, { filterDomain: "shared-util" });
			expect(tree).toContain("shared-util");
		});

		it("UX-1288: explores module tree for CLI command line interfaces", () => {
			const tree = renderDomainModuleTree(samplePlan, { filterDomain: "cli-interface" });
			expect(tree).toContain("cli-interface");
		});

		it("UX-1289: explores module tree for external third-party integration clients", () => {
			const tree = renderDomainModuleTree(samplePlan, { filterDomain: "third-party-client" });
			expect(tree).toContain("third-party-client");
		});

		it("UX-1290: explores module tree for testing fixtures and mock harnesses", () => {
			const tree = renderDomainModuleTree(samplePlan, { filterDomain: "testing-fixture" });
			expect(tree).toContain("testing-fixture");
		});
	});

	// =========================================================================
	// Theme 5: Automated Architecture Consistency Check (UX-1291 - UX-1300)
	// =========================================================================
	describe("Theme 5: Automated Architecture Consistency Check (UX-1291 - UX-1300)", () => {
		it("UX-1291: checks architecture consistency for frontend UI view components (detects DB inversion)", () => {
			const invertedPlan: ModulePlan = {
				version: 1,
				generatedAt: "2026-09-25T12:00:00Z",
				multiplier: 1,
				modules: [
					{
						id: "ui-broken",
						name: "UI with DB",
						purpose: "UI",
						files: ["src/components/Button.tsx", "src/models/User.ts", "migrations/001.sql"],
					},
				],
			};
			const rep = checkArchitectureConsistency(invertedPlan);
			expect(rep.hasCriticalViolations).toBe(true);
			const issue = rep.issuesByDomain["frontend-ui"].find((i) => i.issueType === "FORBIDDEN_LAYER_INVERSION");
			expect(issue).toBeDefined();
			expect(issue?.message).toContain("Forbidden Layer Inversion");
		});

		it("UX-1292: checks architecture consistency for backend API route handlers", () => {
			const rep = checkArchitectureConsistency(samplePlan, allRepoFiles);
			expect(rep.scannedModulesCount).toBe(10);
		});

		it("UX-1293: checks architecture consistency for database ORM models and migrations", () => {
			const rep = checkArchitectureConsistency(samplePlan);
			expect(rep.issuesByDomain["database-orm"]).toBeDefined();
		});

		it("UX-1294: checks architecture consistency for authentication and session controllers", () => {
			const rep = checkArchitectureConsistency(samplePlan);
			expect(rep.issuesByDomain["auth-session"]).toBeDefined();
		});

		it("UX-1295: checks architecture consistency for background job queue workers", () => {
			const rep = checkArchitectureConsistency(samplePlan);
			expect(rep.issuesByDomain["job-worker"]).toBeDefined();
		});

		it("UX-1296: checks architecture consistency for cloud infrastructure deployment scripts", () => {
			const rep = checkArchitectureConsistency(samplePlan);
			expect(rep.issuesByDomain["cloud-infra"]).toBeDefined();
		});

		it("UX-1297: checks architecture consistency for shared utility libraries and helpers", () => {
			const rep = checkArchitectureConsistency(samplePlan);
			expect(rep.issuesByDomain["shared-util"]).toBeDefined();
		});

		it("UX-1298: checks architecture consistency for CLI command line interfaces", () => {
			const rep = checkArchitectureConsistency(samplePlan);
			expect(rep.issuesByDomain["cli-interface"]).toBeDefined();
		});

		it("UX-1299: checks architecture consistency for external third-party integration clients", () => {
			const rep = checkArchitectureConsistency(samplePlan);
			expect(rep.issuesByDomain["third-party-client"]).toBeDefined();
		});

		it("UX-1300: checks architecture consistency for testing fixtures and mock harnesses", () => {
			const mixedTestPlan: ModulePlan = {
				version: 1,
				generatedAt: "2026-09-25T12:00:00Z",
				multiplier: 1,
				modules: [
					{
						id: "prod-service",
						name: "Prod Service",
						purpose: "Business service",
						files: ["src/services/user.ts", "test/mocks/user_mock.json"],
					},
				],
			};
			const rep = checkArchitectureConsistency(mixedTestPlan);
			const issue = rep.issues.find((i) => i.issueType === "TEST_LEAK_IN_PRODUCTION");
			expect(issue).toBeDefined();
			expect(issue?.message).toContain("test fixture file(s) mixed into production code");
			const formatted = formatArchitectureConsistencyReport(rep);
			expect(formatted).toContain("ARCHITECTURE CONSISTENCY AUDIT REPORT");
		});
	});
});
