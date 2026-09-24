import { describe, expect, it } from "vitest";
import {
	formatCheckpointReport,
	lintModulePurposes,
	repairYamlCheckpoint,
	validateYamlCheckpoint,
} from "../src/checkpoint.ts";
import type { Module } from "../src/types.ts";

describe("plan: lintModulePurposes (UX-1241 - UX-1250)", () => {
	it("flags empty or too brief purpose statements", () => {
		const modules: Module[] = [
			{ id: "mod1", name: "Mod1", purpose: "", files: ["a.ts"] },
			{ id: "mod2", name: "Mod2", purpose: "short", files: ["b.ts"] },
		];
		const findings = lintModulePurposes(modules);
		expect(findings.some((f) => f.moduleId === "mod1" && f.kind === "too_short")).toBe(true);
		expect(findings.some((f) => f.moduleId === "mod2" && f.kind === "too_short")).toBe(true);
	});

	it("flags tautological purposes that restate the module name or id", () => {
		const modules: Module[] = [
			{ id: "auth", name: "Authentication", purpose: "auth", files: ["auth.ts"] },
			{ id: "users", name: "Users", purpose: "Users module", files: ["users.ts"] },
			{ id: "billing", name: "Billing", purpose: "Module for billing", files: ["billing.ts"] },
		];
		const findings = lintModulePurposes(modules);
		expect(findings.filter((f) => f.kind === "tautological")).toHaveLength(3);
	});

	it("flags placeholder text in purpose", () => {
		const modules: Module[] = [
			{ id: "payments", name: "Payments", purpose: "TODO: implement description", files: ["pay.ts"] },
			{ id: "shipping", name: "Shipping", purpose: "Structural module for shipping", files: ["ship.ts"] },
		];
		const findings = lintModulePurposes(modules);
		expect(findings.filter((f) => f.kind === "placeholder")).toHaveLength(2);
	});

	it("flags duplicate purpose statements across distinct modules", () => {
		const modules: Module[] = [
			{ id: "a", name: "A", purpose: "Handles system notifications and alerting", files: ["a.ts"] },
			{ id: "b", name: "B", purpose: "Handles system notifications and alerting", files: ["b.ts"] },
		];
		const findings = lintModulePurposes(modules);
		expect(findings.some((f) => f.kind === "duplicate" && f.moduleId === "b")).toBe(true);
	});

	it("passes for well-formed, descriptive purpose statements", () => {
		const modules: Module[] = [
			{
				id: "auth",
				name: "Authentication",
				purpose: "Validates JWT access tokens and manages secure user login sessions",
				files: ["auth.ts"],
			},
		];
		const findings = lintModulePurposes(modules);
		expect(findings).toHaveLength(0);
	});
});

describe("plan: validateYamlCheckpoint (UX-1221 - UX-1230)", () => {
	it("detects YAML syntax errors with line position", () => {
		const invalidYaml = `version: 1
modules:
  - id: auth
      bad_indent: here
`;
		const report = validateYamlCheckpoint(invalidYaml);
		expect(report.valid).toBe(false);
		expect(report.diagnostics.some((d) => d.severity === "error")).toBe(true);
	});

	it("validates valid YAML checkpoint", () => {
		const validYaml = `version: 1
multiplier: 3
modules:
  - id: core
    name: Core Engine
    purpose: Central state machine and pipeline dispatcher
    files:
      - src/core.ts
`;
		const report = validateYamlCheckpoint(validYaml);
		expect(report.valid).toBe(true);
		expect(report.moduleCount).toBe(1);
		expect(report.totalFiles).toBe(1);
		expect(report.plan?.modules[0]?.id).toBe("core");
	});

	it("flags duplicate module IDs", () => {
		const duplicateYaml = `version: 1
modules:
  - id: api
    name: API 1
    purpose: Primary REST API routes
    files: [a.ts]
  - id: api
    name: API 2
    purpose: Secondary endpoints
    files: [b.ts]
`;
		const report = validateYamlCheckpoint(duplicateYaml);
		expect(report.valid).toBe(false);
		expect(report.diagnostics.some((d) => d.message.includes("Duplicate module id"))).toBe(true);
	});

	it("warns about singular file: and string files:", () => {
		const yamlWithTypos = `version: 1
modules:
  - id: utils
    name: Utils
    purpose: Common date and string transformation utilities
    file: src/utils.ts
`;
		const report = validateYamlCheckpoint(yamlWithTypos);
		expect(report.diagnostics.some((d) => d.message.includes('uses singular "file:"'))).toBe(true);
	});

	it("formats a readable checkpoint diagnostic report", () => {
		const yamlWithErrors = `version: 1
modules:
  - id: auth
    name: Auth
    purpose: auth
    files: [auth.ts]
`;
		const report = validateYamlCheckpoint(yamlWithErrors);
		const formatted = formatCheckpointReport(report);
		expect(formatted).toContain("CHECKPOINT");
		expect(formatted).toContain("auth");
	});
});

describe("plan: repairYamlCheckpoint", () => {
	it("repairs singular file: to files: list", () => {
		const input = `version: 1
modules:
  - id: helper
    name: Helper
    purpose: Helper utilities
    file: "src/helper.ts"
`;
		const { repairedYaml, repairs } = repairYamlCheckpoint(input);
		expect(repairs.length).toBeGreaterThan(0);
		expect(repairedYaml).toContain("files:");
	});
});
