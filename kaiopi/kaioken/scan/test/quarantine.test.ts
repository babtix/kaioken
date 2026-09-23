import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	formatClassificationTable,
	quarantineSecretFile,
	suggestIgnoreRules,
	type SecretFinding,
} from "../src/index.ts";

const roots: string[] = [];

afterEach(async () => {
	await Promise.all(roots.splice(0).map((r) => rm(r, { recursive: true, force: true })));
});

describe("Classification Table Formatting", () => {
	it("returns clean message when zero findings are reported", () => {
		const table = formatClassificationTable([]);
		expect(table).toContain("Zero critical secrets");
	});

	it("formats table with headers, severity, and preview for secret findings", () => {
		const findings: SecretFinding[] = [
			{
				path: "src/config.ts",
				category: "AWS Access Key",
				line: 14,
				maskedToken: "AKIAIOSF********MPLE",
				severity: "CRITICAL",
				recommendedAction: "Rotate AWS IAM key",
			},
			{
				path: ".env",
				category: "OpenAI Project Key",
				line: 2,
				maskedToken: "sk-p********234",
				severity: "CRITICAL",
				recommendedAction: "Revoke OpenAI key",
			},
		];

		const table = formatClassificationTable(findings);
		expect(table).toContain("Severity");
		expect(table).toContain("Category");
		expect(table).toContain("AWS Access Key");
		expect(table).toContain("OpenAI Project Key");
		expect(table).toContain("src/config.ts");
		expect(table).toContain("CRITICAL");
	});
});

describe("Automated .gitignore Rule Suggestions", () => {
	it("suggests .env rules when .env files are found", () => {
		const findings: SecretFinding[] = [
			{
				path: ".env.production",
				category: "Credentials",
				maskedToken: "***",
				severity: "HIGH",
				recommendedAction: "Add to .gitignore",
			},
		];

		const rules = suggestIgnoreRules(findings);
		expect(rules).toContain(".env");
		expect(rules).toContain(".env.*");
		expect(rules).toContain("!.env.example");
	});

	it("suggests certificate rules for private keys", () => {
		const findings: SecretFinding[] = [
			{
				path: "certs/server.key",
				category: "Private Key Certificate",
				maskedToken: "***",
				severity: "CRITICAL",
				recommendedAction: "Quarantine key",
			},
		];

		const rules = suggestIgnoreRules(findings);
		expect(rules).toContain("*.key");
		expect(rules).toContain("*.pem");
		expect(rules).toContain("id_rsa");
	});

	it("filters out rules that are already defined in existing patterns", () => {
		const findings: SecretFinding[] = [
			{
				path: ".env",
				category: "Credentials",
				maskedToken: "***",
				severity: "HIGH",
				recommendedAction: "Add to .gitignore",
			},
		];

		const existing = [".env", ".env.*"];
		const rules = suggestIgnoreRules(findings, existing);
		expect(rules).not.toContain(".env");
		expect(rules).not.toContain(".env.*");
		expect(rules).toContain("!.env.example");
	});
});

describe("Quarantine Secret File", () => {
	it("quarantines a secret file and writes manifest.json", async () => {
		const root = await mkdtemp(join(tmpdir(), "kaioken-quarantine-"));
		roots.push(root);

		const secretPath = join(root, "secret.key");
		const secretContent = "-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA...\n-----END RSA PRIVATE KEY-----\n";
		await writeFile(secretPath, secretContent, "utf8");

		const result = await quarantineSecretFile(root, "secret.key", { createTemplate: true });

		expect(result.quarantined).toBe(true);
		expect(result.quarantinePath).toMatch(/\.kaioken\/quarantine\/.*secret\.key/);

		// Manifest should exist and record entry
		const manifestRaw = await readFile(join(root, ".kaioken", "quarantine", "manifest.json"), "utf8");
		const manifest = JSON.parse(manifestRaw);
		expect(manifest.entries.length).toBe(1);
		expect(manifest.entries[0].originalPath).toBe("secret.key");
		expect(manifest.entries[0].hash).toMatch(/^[0-9a-f]{64}$/);

		// Template should be generated
		expect(result.templatePath).toBeDefined();
	});
});
