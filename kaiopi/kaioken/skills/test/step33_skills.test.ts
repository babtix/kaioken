import { describe, expect, it } from "vitest";
import {
	ALL_PROCEDURE_KINDS,
	compileSkillDocumentation,
	formatCommandVerificationReport,
	formatNamespaceCollisionWarning,
	generateParameterPromptForm,
	isProcedureKind,
	matchSkillTriggers,
	PROCEDURE_METADATA,
	rankSuggestedSkills,
	renderParameterFormUI,
	renderSkillDocumentationMarkdown,
	resolveSkillNameCollisions,
	testVerificationCommand,
	type ProcedureKind,
	type SkillCandidate,
} from "../src/index.ts";

describe("Step 33: Category 18 — Agent Skills, Autonomous Procedures & SkillGen (UX-1751 to UX-1800)", () => {
	it("verifies all 10 canonical procedures are registered with valid metadata", () => {
		expect(ALL_PROCEDURE_KINDS).toHaveLength(10);
		for (const kind of ALL_PROCEDURE_KINDS) {
			expect(isProcedureKind(kind)).toBe(true);
			const meta = PROCEDURE_METADATA[kind];
			expect(meta).toBeDefined();
			expect(meta.title.length).toBeGreaterThan(0);
			expect(meta.typicalVerificationCommands.length).toBeGreaterThan(0);
			expect(meta.parameters.length).toBeGreaterThan(0);
		}
	});

	// ========================================================================
	// Theme 1: Duplicate skill name collision resolver (UX-1751 to UX-1760)
	// ========================================================================
	describe("Theme 1: Duplicate skill name collision resolver (UX-1751 to UX-1760)", () => {
		function createCollisionPair(name: string, kind: ProcedureKind): SkillCandidate[] {
			return [
				{ name, source: "repo", path: `.kaioken/skills/${name}/SKILL.md`, procedureKind: kind },
				{ name, source: "user", path: `.agents/skills/${name}/SKILL.md`, procedureKind: kind },
			];
		}

		it("[UX-1751] resolves collisions for database migration execution procedure", () => {
			const candidates = createCollisionPair("db-migrate", "db-migration");
			const result = resolveSkillNameCollisions(candidates);
			expect(result.hasCollisions).toBe(true);
			expect(result.warnings[0]?.assignedNamespace).toBe("repo");
			expect(formatNamespaceCollisionWarning(result)).toContain("Skill Namespace Collisions");
		});

		it("[UX-1752] resolves collisions for code lint and formatting repair procedure", () => {
			const candidates = createCollisionPair("code-lint", "code-lint");
			const result = resolveSkillNameCollisions(candidates);
			expect(result.resolvedSkills).toHaveLength(2);
			expect(result.resolvedSkills.map((s) => s.qualifiedName)).toContain("repo:code-lint");
		});

		it("[UX-1753] resolves collisions for production deployment release checklist", () => {
			const candidates = createCollisionPair("release-deploy", "deploy-checklist");
			const result = resolveSkillNameCollisions(candidates);
			expect(result.hasCollisions).toBe(true);
		});

		it("[UX-1754] resolves collisions for local development environment setup procedure", () => {
			const candidates = createCollisionPair("local-setup", "dev-setup");
			const result = resolveSkillNameCollisions(candidates);
			expect(result.warnings[0]?.visualWarning).toContain("local-setup");
		});

		it("[UX-1755] resolves collisions for integration test execution and triage procedure", () => {
			const candidates = createCollisionPair("test-triage", "test-triage");
			const result = resolveSkillNameCollisions(candidates);
			expect(result.hasCollisions).toBe(true);
		});

		it("[UX-1756] resolves collisions for dependency security audit and patch procedure", () => {
			const candidates = createCollisionPair("sec-audit", "security-audit");
			const result = resolveSkillNameCollisions(candidates);
			expect(result.warnings[0]?.collidingSources).toHaveLength(2);
		});

		it("[UX-1757] resolves collisions for git branch rebase and conflict resolution procedure", () => {
			const candidates = createCollisionPair("git-rebase", "git-rebase");
			const result = resolveSkillNameCollisions(candidates);
			expect(result.resolvedSkills.map((s) => s.qualifiedName)).toContain("user:git-rebase");
		});

		it("[UX-1758] resolves collisions for API documentation generation recipe", () => {
			const candidates = createCollisionPair("api-docgen", "api-docgen");
			const result = resolveSkillNameCollisions(candidates);
			expect(result.hasCollisions).toBe(true);
		});

		it("[UX-1759] resolves collisions for performance profiling and flamegraph recipe", () => {
			const candidates = createCollisionPair("perf-flamegraph", "perf-flamegraph");
			const result = resolveSkillNameCollisions(candidates);
			expect(result.hasCollisions).toBe(true);
		});

		it("[UX-1760] resolves collisions for incident response rollback runbook", () => {
			const candidates = createCollisionPair("incident-rollback", "incident-rollback");
			const result = resolveSkillNameCollisions(candidates);
			expect(result.hasCollisions).toBe(true);
			const clean = resolveSkillNameCollisions([{ name: "unique-skill", source: "repo", path: "a" }]);
			expect(formatNamespaceCollisionWarning(clean)).toContain("No skill name collisions");
		});
	});

	// ========================================================================
	// Theme 2: Verification command tester confirming executable recipes (UX-1761 to UX-1770)
	// ========================================================================
	describe("Theme 2: Verification command tester confirming executable recipes (UX-1761 to UX-1770)", () => {
		it("[UX-1761] tests verification command for database migration execution procedure", () => {
			const result = testVerificationCommand("prisma migrate status");
			expect(result.isKnownRunner).toBe(true);
			expect(result.status).toBe("valid");
			expect(formatCommandVerificationReport(result)).toContain("prisma");
		});

		it("[UX-1762] tests verification command for code lint and formatting repair procedure", () => {
			const result = testVerificationCommand("npx biome check .");
			expect(result.executable).toBe("npx");
			expect(result.status).toBe("valid");
		});

		it("[UX-1763] tests verification command for production deployment release checklist", () => {
			const result = testVerificationCommand("git status --porcelain");
			expect(result.executable).toBe("git");
			expect(result.status).toBe("valid");
		});

		it("[UX-1764] tests verification command for local development environment setup procedure", () => {
			const result = testVerificationCommand("npm run build");
			expect(result.isKnownRunner).toBe(true);
			expect(result.status).toBe("valid");
		});

		it("[UX-1765] tests verification command for integration test execution and triage procedure", () => {
			const result = testVerificationCommand("vitest run test/suite.ts");
			expect(result.isKnownRunner).toBe(true);
			expect(result.status).toBe("valid");
		});

		it("[UX-1766] tests verification command for dependency security audit and patch procedure", () => {
			const result = testVerificationCommand("npm audit --json");
			expect(result.executable).toBe("npm");
			expect(result.status).toBe("valid");
		});

		it("[UX-1767] tests verification command for git branch rebase and conflict resolution procedure", () => {
			const result = testVerificationCommand("git diff --check");
			expect(result.isKnownRunner).toBe(true);
			expect(result.status).toBe("valid");
		});

		it("[UX-1768] tests verification command for API documentation generation recipe", () => {
			const result = testVerificationCommand("node scripts/check-docs.mjs");
			expect(result.executable).toBe("node");
			expect(result.status).toBe("valid");
		});

		it("[UX-1769] tests verification command for performance profiling and flamegraph recipe", () => {
			const result = testVerificationCommand("0x -o flamegraph.html app.js");
			expect(result.executable).toBe("0x");
			expect(result.status).toBe("valid");
		});

		it("[UX-1770] tests verification command for incident response rollback runbook and rejects destructive scripts", () => {
			const safe = testVerificationCommand("git log -n 2");
			expect(safe.status).toBe("valid");

			const destructive = testVerificationCommand("rm -rf /");
			expect(destructive.isDestructive).toBe(true);
			expect(destructive.status).toBe("error");
			expect(destructive.issues.length).toBeGreaterThan(0);
		});
	});

	// ========================================================================
	// Theme 3: Interactive parameter prompt form generator (UX-1771 to UX-1780)
	// ========================================================================
	describe("Theme 3: Interactive parameter prompt form generator (UX-1771 to UX-1780)", () => {
		it("[UX-1771] generates parameter form for database migration execution procedure", () => {
			const form = generateParameterPromptForm("db-migration");
			expect(form.fields.some((f) => f.name === "env")).toBe(true);
			expect(renderParameterFormUI(form)).toContain("Interactive Form");
		});

		it("[UX-1772] generates parameter form for code lint and formatting repair procedure", () => {
			const form = generateParameterPromptForm("code-lint");
			expect(form.fields.some((f) => f.name === "autoFix")).toBe(true);
		});

		it("[UX-1773] generates parameter form for production deployment release checklist", () => {
			const form = generateParameterPromptForm("deploy-checklist");
			expect(form.fields.some((f) => f.name === "version")).toBe(true);
			expect(form.cliFlagsUsage).toContain("--version");
		});

		it("[UX-1774] generates parameter form for local development environment setup procedure", () => {
			const form = generateParameterPromptForm("dev-setup");
			expect(form.fields.some((f) => f.name === "port")).toBe(true);
		});

		it("[UX-1775] generates parameter form for integration test execution and triage procedure", () => {
			const form = generateParameterPromptForm("test-triage");
			expect(form.fields.some((f) => f.name === "filter")).toBe(true);
		});

		it("[UX-1776] generates parameter form for dependency security audit and patch procedure", () => {
			const form = generateParameterPromptForm("security-audit");
			expect(form.fields.some((f) => f.name === "severityThreshold")).toBe(true);
		});

		it("[UX-1777] generates parameter form for git branch rebase and conflict resolution procedure", () => {
			const form = generateParameterPromptForm("git-rebase");
			expect(form.fields.some((f) => f.name === "baseBranch")).toBe(true);
		});

		it("[UX-1778] generates parameter form for API documentation generation recipe", () => {
			const form = generateParameterPromptForm("api-docgen");
			expect(form.fields.some((f) => f.name === "outputDir")).toBe(true);
		});

		it("[UX-1779] generates parameter form for performance profiling and flamegraph recipe", () => {
			const form = generateParameterPromptForm("perf-flamegraph");
			expect(form.fields.some((f) => f.name === "durationSeconds")).toBe(true);
		});

		it("[UX-1780] generates parameter form for incident response rollback runbook", () => {
			const form = generateParameterPromptForm("incident-rollback");
			expect(form.fields.some((f) => f.name === "targetVersion")).toBe(true);
			const rendered = renderParameterFormUI(form, { unicode: false });
			expect(rendered).toContain("Interactive Form");
		});
	});

	// ========================================================================
	// Theme 4: Skill documentation generator (UX-1781 to UX-1790)
	// ========================================================================
	describe("Theme 4: Skill documentation generator (UX-1781 to UX-1790)", () => {
		it("[UX-1781] compiles documentation for database migration execution procedure", () => {
			const doc = compileSkillDocumentation("db-migration");
			expect(doc.markdown).toContain("name: repo:db-migrate");
			expect(doc.markdown).toContain("## ⚙️ Parameters");
		});

		it("[UX-1782] compiles documentation for code lint and formatting repair procedure", () => {
			const doc = compileSkillDocumentation("code-lint");
			expect(doc.markdown).toContain("Code Lint & Formatting");
		});

		it("[UX-1783] compiles documentation for production deployment release checklist", () => {
			const doc = compileSkillDocumentation("deploy-checklist");
			expect(doc.markdown).toContain("Production Deployment");
		});

		it("[UX-1784] compiles documentation for local development environment setup procedure", () => {
			const doc = compileSkillDocumentation("dev-setup");
			expect(doc.markdown).toContain("Local Development");
		});

		it("[UX-1785] compiles documentation for integration test execution and triage procedure", () => {
			const doc = compileSkillDocumentation("test-triage");
			expect(doc.markdown).toContain("Integration Test");
		});

		it("[UX-1786] compiles documentation for dependency security audit and patch procedure", () => {
			const doc = compileSkillDocumentation("security-audit");
			expect(doc.markdown).toContain("Security Audit");
		});

		it("[UX-1787] compiles documentation for git branch rebase and conflict resolution procedure", () => {
			const doc = compileSkillDocumentation("git-rebase");
			expect(doc.markdown).toContain("Git Branch Rebase");
		});

		it("[UX-1788] compiles documentation for API documentation generation recipe", () => {
			const doc = compileSkillDocumentation("api-docgen");
			expect(doc.markdown).toContain("API Documentation Generation");
		});

		it("[UX-1789] compiles documentation for performance profiling and flamegraph recipe", () => {
			const doc = compileSkillDocumentation("perf-flamegraph");
			expect(doc.markdown).toContain("Performance Profiling");
		});

		it("[UX-1790] compiles documentation for incident response rollback runbook", () => {
			const doc = compileSkillDocumentation("incident-rollback");
			expect(doc.markdown).toContain("Incident Response Rollback");
			expect(renderSkillDocumentationMarkdown(doc)).toContain("targetVersion");
		});
	});

	// ========================================================================
	// Theme 5: Trigger condition matcher suggesting relevant skills (UX-1791 to UX-1800)
	// ========================================================================
	describe("Theme 5: Trigger condition matcher suggesting relevant skills (UX-1791 to UX-1800)", () => {
		it("[UX-1791] matches trigger condition for database migration execution procedure", () => {
			const result = matchSkillTriggers({ prompt: "Please run database migration on new tables" });
			expect(result.topSuggestion?.procedureKind).toBe("db-migration");
		});

		it("[UX-1792] matches trigger condition for code lint and formatting repair procedure", () => {
			const result = matchSkillTriggers({ prompt: "Need to format and lint typescript files", changedFiles: ["src/index.ts"] });
			expect(result.topSuggestion?.procedureKind).toBe("code-lint");
		});

		it("[UX-1793] matches trigger condition for production deployment release checklist", () => {
			const result = matchSkillTriggers({ prompt: "Prepare release tag for production deployment" });
			expect(result.topSuggestion?.procedureKind).toBe("deploy-checklist");
		});

		it("[UX-1794] matches trigger condition for local development environment setup procedure", () => {
			const result = matchSkillTriggers({ prompt: "New contributor onboarding setup and install" });
			expect(result.topSuggestion?.procedureKind).toBe("dev-setup");
		});

		it("[UX-1795] matches trigger condition for integration test execution and triage procedure", () => {
			const result = matchSkillTriggers({ prompt: "Run test suite and triage flaky spec failures", changedFiles: ["test/api.test.ts"] });
			expect(result.topSuggestion?.procedureKind).toBe("test-triage");
		});

		it("[UX-1796] matches trigger condition for dependency security audit and patch procedure", () => {
			const result = matchSkillTriggers({ prompt: "Audit packages for CVE vulnerabilities in package-lock", changedFiles: ["package-lock.json"] });
			expect(result.topSuggestion?.procedureKind).toBe("security-audit");
		});

		it("[UX-1797] matches trigger condition for git branch rebase and conflict resolution procedure", () => {
			const result = matchSkillTriggers({ prompt: "Rebase current branch onto master and resolve merge conflicts" });
			expect(result.topSuggestion?.procedureKind).toBe("git-rebase");
		});

		it("[UX-1798] matches trigger condition for API documentation generation recipe", () => {
			const result = matchSkillTriggers({ prompt: "Generate openapi swagger documentation for routes" });
			expect(result.topSuggestion?.procedureKind).toBe("api-docgen");
		});

		it("[UX-1799] matches trigger condition for performance profiling and flamegraph recipe", () => {
			const result = matchSkillTriggers({ prompt: "Generate flamegraph profile for cpu bottleneck" });
			expect(result.topSuggestion?.procedureKind).toBe("perf-flamegraph");
		});

		it("[UX-1800] matches trigger condition for incident response rollback runbook", () => {
			const result = matchSkillTriggers({ prompt: "Emergency outage incident rollback broken release" });
			expect(result.topSuggestion?.procedureKind).toBe("incident-rollback");
			const ranked = rankSuggestedSkills({ prompt: "rollback" });
			expect(ranked[0]?.procedureKind).toBe("incident-rollback");
		});
	});
});
