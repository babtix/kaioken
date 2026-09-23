import { describe, expect, it } from "vitest";
import { classifyRisk, detectLanguage, languageFromShebang } from "../src/index.ts";

/**
 * The two halves of this suite carry equal weight. Detecting a planted key is
 * the obvious half; leaving ordinary source unflagged is the half that decides
 * whether anyone keeps reading the flags at all.
 */

function classify(path: string, text = "", overrides: Partial<{ size: number; binary: boolean }> = {}) {
	return classifyRisk({
		path,
		size: overrides.size ?? text.length,
		binary: overrides.binary ?? false,
		text,
		largeBinaryBytes: 1024 * 1024,
	});
}

// A syntactically real but functionally worthless key body.
const PLANTED_KEY = [
	"-----BEGIN RSA PRIVATE KEY-----",
	"MIIEowIBAAKCAQEAx7Vn9dQ2mKPZs4TfLmN8vBcXwYqHrJ0aGtEuIoPlKjHgFdSa",
	"QwErTyUiOpAsDfGhJkLzXcVbNmQwErTyUiOpAsDfGhJkLzXcVbNm1234567890ab",
	"-----END RSA PRIVATE KEY-----",
].join("\n");

describe("detects planted secrets", () => {
	it("flags a PEM private key by content, whatever the file is called", () => {
		expect(classify("docs/notes.txt", PLANTED_KEY)).toContain("private_key");
	});

	it("flags a private key by filename before reading a byte of it", () => {
		expect(classify("deploy/id_rsa")).toContain("private_key");
		expect(classify("certs/server.pem")).toContain("private_key");
	});

	it("does not flag a .pem that holds only public certificates", () => {
		const roots = [
			"-----BEGIN CERTIFICATE-----",
			"MIICGjCCAaGgAwIBAgIUALnViVfnU0brJasmRkHrn/UnfaQwCgYIKoZIzj0EAwMw",
			"-----END CERTIFICATE-----",
		].join("\n");
		expect(classify("internal/selfupdate/roots.pem", roots)).toEqual([]);
	});

	it("still flags a .pem that holds a key alongside a certificate", () => {
		expect(
			classify("certs/bundle.pem", `-----BEGIN CERTIFICATE-----\nabc\n-----END CERTIFICATE-----\n${PLANTED_KEY}`),
		).toContain("private_key");
	});

	it("flags PGP and OpenSSH private key blocks", () => {
		const pgpKey = [
			"-----BEGIN PGP PRIVATE KEY BLOCK-----",
			"Version: BCPG C# v1.6.1.0",
			"",
			"lQH+BF2X1234567890abcdefghijklmnopqrstuvwxyz",
			"-----END PGP PRIVATE KEY BLOCK-----",
		].join("\n");
		expect(classify("secring.gpg", pgpKey)).toContain("private_key");

		const opensshKey = [
			"-----BEGIN OPENSSH PRIVATE KEY-----",
			"b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAABlwAAAAdzc2gtcn",
			"-----END OPENSSH PRIVATE KEY-----",
		].join("\n");
		expect(classify("custom_key", opensshKey)).toContain("private_key");
	});

	it("flags provider token shapes", () => {
		// AWS access key ids are AKIA plus exactly 16 characters.
		expect(classify("cfg.ts", 'const k = "AKIAIOSFODNN7EXAMPLE";')).toContain("credentials");
		expect(classify("cfg.ts", 'const k = "ASIAIOSFODNN7EXAMPLE";')).toContain("credentials");
		const ghp = ["ghp", "ABCdef0123456789ABCdef0123456789ABCD"].join("_");
		expect(classify("cfg.ts", `const t = "${ghp}";`)).toContain("credentials");
		expect(classify("cfg.ts", 'const g = "AIzaSyA1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6Q";')).toContain(
			"credentials",
		);
		const slack = ["xoxb", "1234567890", "123456789012", "abcdef1234567890"].join("-");
		expect(classify("cfg.ts", `const s = "${slack}";`)).toContain("credentials");
		const stripeLive = ["sk", "live", "51AbcdefghijklmnopqrstuvwxyZ"].join("_");
		expect(classify("cfg.ts", `const st = "${stripeLive}";`)).toContain("credentials");
		const stripeRk = ["rk", "live", "51AbcdefghijklmnopqrstuvwxyZ"].join("_");
		expect(classify("cfg.ts", `const rk = "${stripeRk}";`)).toContain("credentials");
	});

	it("flags modern provider token shapes", () => {
		const skProj = ["sk", "proj", "abc123DEF456ghi789JKL012mno345PQR678stu901VWX234"].join("-");
		expect(classify("cfg.ts", `const k = "${skProj}";`)).toContain("credentials");
		const skAdmin = ["sk", "admin", "abc123DEF456ghi789JKL012mno345PQR678stu901VWX234"].join("-");
		expect(classify("cfg.ts", `const a = "${skAdmin}";`)).toContain("credentials");
		const skLegacy = ["sk", "1234567890abcdefghijklmnopqrstuvwxyzABCD"].join("-");
		expect(classify("cfg.ts", `const s = "${skLegacy}";`)).toContain("credentials");
		const ghPat = [
			"github",
			"pat",
			"11ABCD012_abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ",
		].join("_");
		expect(classify("cfg.ts", `const g = "${ghPat}";`)).toContain("credentials");
		const antApi = ["sk", "ant", "api03-abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQRSTUV"].join("-");
		expect(classify("cfg.ts", `const ant = "${antApi}";`)).toContain("credentials");
		expect(
			classify(
				"cfg.ts",
				'const gcp = "ya29.a0AfH6SMCx1234567890abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";',
			),
		).toContain("credentials");
		expect(
			classify(
				"cfg.ts",
				'const jwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U";',
			),
		).toContain("credentials");
		const hf = ["hf", "abcdefghijklmnopqrstuvwxyz01234567"].join("_");
		expect(classify("cfg.ts", `const h = "${hf}";`)).toContain("credentials");
		const pypi = ["pypi", "AgEIcHlwaS5vcmcCJDFhMmI0YzZkLWU4ZjAtMTFhYi05OGNkMGVm"].join("-");
		expect(classify("cfg.ts", `const p = "${pypi}";`)).toContain("credentials");
		expect(
			classify(
				"cfg.ts",
				'const az = "DefaultEndpointsProtocol=https;AccountName=myacc;AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;EndpointSuffix=core.windows.net";',
			),
		).toContain("credentials");
		expect(
			classify(
				"cfg.ts",
				'const sas = "SharedAccessSignature sr=res&sig=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6I%3D&se=1800000000";',
			),
		).toContain("credentials");
		expect(
			classify("cfg.ts", 'const b = "Authorization: Bearer abcdef0123456789abcdef0123456789";'),
		).toContain("credentials");
	});

	it("flags a real .env but not a documented template", () => {
		expect(classify(".env")).toContain("credentials");
		expect(classify(".env.production")).toContain("credentials");
		expect(classify(".env.example")).not.toContain("credentials");
		expect(classify(".env.sample")).not.toContain("credentials");
	});

	it("flags a secret-named field assigned a high-entropy literal", () => {
		expect(classify("cfg.ts", 'const c = { password: "Xk92mQpL7vNz4RtY8wBs" };')).toContain(
			"credentials",
		);
	});

	it("flags a real secret even when preceded by a placeholder in the same file", () => {
		expect(
			classify(
				"cfg.ts",
				'const c = { token: "example-token-placeholder-xyz", secret_key: "Xk92mQpL7vNz4RtY8wBs" };',
			),
		).toContain("credentials");
	});
});

describe("leaves ordinary source alone", () => {
	const realSource = [
		"import { readFile } from 'node:fs/promises';",
		"",
		"export interface Options {",
		"  apiKey?: string;",
		"  token?: string;",
		"  password?: string;",
		"}",
		"",
		"export function client(options: Options) {",
		"  const apiKey = options.apiKey ?? process.env.API_KEY;",
		"  const token = process.env['AUTH_TOKEN'];",
		"  return { apiKey, token };",
		"}",
	].join("\n");

	it("does not flag a file that merely names credentials", () => {
		expect(classify("src/client.ts", realSource)).toEqual([]);
	});

	it("does not flag a value read from the environment", () => {
		expect(classify("cfg.ts", 'const secret = "${VAULT_SECRET_REFERENCE_KEY}";')).toEqual([]);
		expect(classify("cfg.py", 'password = os.environ["DATABASE_PASSWORD_VAR"]')).toEqual([]);
	});

	it("does not flag documentation placeholders", () => {
		expect(classify("README.md", 'api_key = "your-api-key-goes-right-here"')).toEqual([]);
		expect(classify("README.md", 'token = "example-token-1234567890abc"')).toEqual([]);
		expect(classify("README.md", 'Authorization: Bearer example-token-1234567890abc')).toEqual([]);
		expect(classify("test.ts", 'const password = "test-password-abcdefgh";')).toEqual([]);
	});

	it("does not flag a long prose string", () => {
		expect(
			classify("copy.ts", 'const message = "Your password must be at least 12 characters";'),
		).toEqual([]);
	});

	it("does not flag a short value below the entropy floor", () => {
		expect(classify("cfg.ts", 'const token = "abc123";')).toEqual([]);
	});
});

describe("generated and lockfiles", () => {
	it("flags a generated banner in the first lines", () => {
		expect(classify("api/types.go", "// Code generated by protoc. DO NOT EDIT.\n\npackage api\n")).toContain(
			"generated",
		);
		expect(classify("schema.ts", "/* @generated */\nexport type X = 1;\n")).toContain("generated");
	});

	it("does not flag a banner buried deep in a file", () => {
		const buried = `${"// ordinary line\n".repeat(60)}// @generated\n`;
		expect(classify("src/a.ts", buried)).not.toContain("generated");
	});

	it("flags generated output directories and minified bundles", () => {
		expect(classify("dist/bundle.js")).toContain("generated");
		expect(classify("web/dist/app.js")).toContain("generated");
		expect(classify("static/app.min.js")).toContain("generated");
	});

	it("does not flag a source directory that merely contains the word", () => {
		expect(classify("src/distance.ts", "export const d = 1;\n")).toEqual([]);
	});

	it("flags lockfiles across ecosystems", () => {
		expect(classify("package-lock.json")).toContain("lockfile");
		expect(classify("go.sum")).toContain("lockfile");
		expect(classify("Cargo.lock")).toContain("lockfile");
		expect(classify("poetry.lock")).toContain("lockfile");
	});
});

describe("language detection", () => {
	it("resolves by extension", () => {
		expect(detectLanguage("src/a.ts", null)).toBe("typescript");
		expect(detectLanguage("src/a.tsx", null)).toBe("tsx");
		expect(detectLanguage("main.go", null)).toBe("go");
	});

	it("falls back to the shebang when there is no extension", () => {
		expect(detectLanguage("bin/tool", Buffer.from("#!/usr/bin/env python3\n"))).toBe("python");
		expect(detectLanguage("bin/tool", Buffer.from("#!/bin/bash\n"))).toBe("shell");
		expect(detectLanguage("bin/tool", Buffer.from("#!/usr/bin/env -S node --flag\n"))).toBe(
			"javascript",
		);
	});

	it("prefers the extension over the shebang", () => {
		expect(detectLanguage("script.py", Buffer.from("#!/bin/bash\n"))).toBe("python");
	});

	it("returns unknown rather than guessing", () => {
		expect(detectLanguage("data.bin", Buffer.from("random"))).toBe("unknown");
		expect(languageFromShebang(Buffer.from("no shebang here"))).toBeNull();
	});

	it("treats a leading dot as a dotfile, not an extension", () => {
		expect(detectLanguage(".env", null)).toBe("dotenv");
		expect(detectLanguage(".gitignore", null)).toBe("gitignore");
	});
});
