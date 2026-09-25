import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import {
	ALL_RISK_ARCHETYPES,
	analyzeCharClasses,
	analyzeStreamWithSlidingChunks,
	defaultWhitelistManager,
	diagnosePaths,
	evaluateArchetypeEntropy,
	formatEntropyGauge,
	formatPathDiagnosticReport,
	formatSuggestionSection,
	generateComprehensiveGitignore,
	inferPathArchetype,
	isRiskArchetype,
	normalizeCanonicalPath,
	renderEntropyCard,
	SlidingChunkAnalyzer,
	sniffMimeAndArchetypes,
	suggestRulesForArchetype,
	type RiskArchetype,
	WhitelistManager,
} from "../src/index.ts";

describe("Step 28: Category 06 — Repo Scan, File Discovery & Risk Shield (UX-0541 to UX-0600)", () => {
	// =========================================================================
	// Risk Archetypes Foundation
	// =========================================================================
	describe("Risk Archetypes Validation", () => {
		it("defines all 10 required risk archetypes", () => {
			expect(ALL_RISK_ARCHETYPES).toHaveLength(10);
			const expected: RiskArchetype[] = [
				"openai",
				"github",
				"aws",
				"huggingface",
				"azure",
				"services",
				"certificates",
				"binaries",
				"vendor",
				"symlinks",
			];
			for (const arch of expected) {
				expect(ALL_RISK_ARCHETYPES).toContain(arch);
				expect(isRiskArchetype(arch)).toBe(true);
			}
			expect(isRiskArchetype("unknown_risk")).toBe(false);
		});
	});

	// =========================================================================
	// Theme 1: Automated .gitignore Rule Suggestions (UX-0541 - UX-0550)
	// =========================================================================
	describe("Theme 1: Automated .gitignore Rule Suggestions (UX-0541 - UX-0550)", () => {
		it("UX-0541: suggests ignore rules for OpenAI project and admin API keys", () => {
			const suggestion = suggestRulesForArchetype("openai");
			expect(suggestion.archetype).toBe("openai");
			expect(suggestion.rules).toContain(".openai.key");
			expect(suggestion.negations).toContain("!.env.openai.example");
			expect(suggestion.rationale).toMatch(/OpenAI/i);
		});

		it("UX-0542: suggests ignore rules for GitHub fine-grained personal access tokens", () => {
			const suggestion = suggestRulesForArchetype("github");
			expect(suggestion.archetype).toBe("github");
			expect(suggestion.rules).toContain(".github/tokens");
			expect(suggestion.negations).toContain("!.github/workflows/*.yml");
		});

		it("UX-0543: suggests ignore rules for AWS temporary and root credentials", () => {
			const suggestion = suggestRulesForArchetype("aws");
			expect(suggestion.archetype).toBe("aws");
			expect(suggestion.rules).toContain(".aws/credentials");
			expect(suggestion.negations).toContain("!.aws/config.example");
		});

		it("UX-0544: suggests ignore rules for HuggingFace and PyPI deployment tokens", () => {
			const suggestion = suggestRulesForArchetype("huggingface");
			expect(suggestion.archetype).toBe("huggingface");
			expect(suggestion.rules).toContain(".huggingface/token");
			expect(suggestion.rules).toContain(".pypirc");
			expect(suggestion.negations).toContain("!.pypirc.example");
		});

		it("UX-0545: suggests ignore rules for Azure connection strings and SAS query tokens", () => {
			const suggestion = suggestRulesForArchetype("azure");
			expect(suggestion.archetype).toBe("azure");
			expect(suggestion.rules).toContain("azure.publishsettings");
			expect(suggestion.rules).toContain("local.settings.json");
			expect(suggestion.negations).toContain("!local.settings.example.json");
		});

		it("UX-0546: suggests ignore rules for Slack, Google, and Stripe service keys", () => {
			const suggestion = suggestRulesForArchetype("services");
			expect(suggestion.archetype).toBe("services");
			expect(suggestion.rules).toContain("service-account*.json");
			expect(suggestion.rules).toContain("stripe-keys.json");
			expect(suggestion.negations).toContain("!service-account.example.json");
		});

		it("UX-0547: suggests ignore rules for embedded RSA/PGP private certificates", () => {
			const suggestion = suggestRulesForArchetype("certificates");
			expect(suggestion.archetype).toBe("certificates");
			expect(suggestion.rules).toContain("*.pem");
			expect(suggestion.rules).toContain("id_rsa");
			expect(suggestion.negations).toContain("!*.pub");
			expect(suggestion.negations).toContain("!cacert.pem");
		});

		it("UX-0548: suggests ignore rules for large binary assets exceeding size budgets", () => {
			const suggestion = suggestRulesForArchetype("binaries");
			expect(suggestion.archetype).toBe("binaries");
			expect(suggestion.rules).toContain("*.exe");
			expect(suggestion.rules).toContain("*.weights");
			expect(suggestion.negations).toContain("!.gitkeep");
		});

		it("UX-0549: suggests ignore rules for deeply nested node_modules and vendor directories", () => {
			const suggestion = suggestRulesForArchetype("vendor");
			expect(suggestion.archetype).toBe("vendor");
			expect(suggestion.rules).toContain("node_modules/");
			expect(suggestion.rules).toContain("vendor/");
			expect(suggestion.negations).toContain("!vendor/licenses/");
		});

		it("UX-0550: suggests ignore rules for symlink loops and circular junction paths", () => {
			const suggestion = suggestRulesForArchetype("symlinks");
			expect(suggestion.archetype).toBe("symlinks");
			expect(suggestion.rules).toContain("*symlink_loop*/");
			expect(suggestion.rules).toContain(".kaioken/circular/");
		});

		it("generates comprehensive .gitignore document across all archetypes", () => {
			const doc = generateComprehensiveGitignore();
			expect(doc).toContain("KAIOKEN RISK SHIELD");
			expect(doc).toContain(".openai.key");
			expect(doc).toContain(".aws/credentials");
			expect(doc).toContain("node_modules/");
			expect(doc).toContain("!.env.openai.example");
		});
	});

	// =========================================================================
	// Theme 2: Sliding-Window Chunk Analyzer (UX-0551 - UX-0560)
	// =========================================================================
	describe("Theme 2: Sliding-Window Chunk Analyzer (UX-0551 - UX-0560)", () => {
		it("UX-0551: detects OpenAI project key split across chunk boundary", () => {
			const analyzer = new SlidingChunkAnalyzer({ overlapBytes: 32 });
			analyzer.feed("const key = \"sk-proj-abc12345");
			analyzer.feed("67890123456789012345\";");
			const result = analyzer.finish();
			expect(result.detectedArchetypes).toContain("openai");
			expect(analyzer.hasFinding("openai")).toBe(true);
			const finding = result.findings.find((f) => f.archetype === "openai");
			expect(finding?.straddledBoundary).toBe(true);
		});

		it("UX-0552: detects GitHub fine-grained PAT split across chunk boundary", () => {
			const analyzer = new SlidingChunkAnalyzer({ overlapBytes: 32 });
			analyzer.feed("export const GITHUB_TOKEN = \"github_pat_11ABCD");
			analyzer.feed("012345678901234567890123456789012345\";");
			const result = analyzer.finish();
			expect(result.detectedArchetypes).toContain("github");
			expect(result.straddledCount).toBeGreaterThanOrEqual(1);
		});

		it("UX-0553: detects AWS access key split across chunk boundary", () => {
			const analyzer = new SlidingChunkAnalyzer({ overlapBytes: 32 });
			analyzer.feed("aws_key = 'AKIA12345");
			analyzer.feed("67890ABCDEF';");
			const result = analyzer.finish();
			expect(result.detectedArchetypes).toContain("aws");
		});

		it("UX-0554: detects HuggingFace and PyPI tokens split across boundary", () => {
			const analyzer = new SlidingChunkAnalyzer({ overlapBytes: 32 });
			analyzer.feed("pypi_pass = \"pypi-AgEIcHl");
			analyzer.feed("waS5vcmcCJDEyMzQ1Njc4OTA\";");
			const result = analyzer.finish();
			expect(result.detectedArchetypes).toContain("huggingface");
		});

		it("UX-0555: detects Azure connection string split across boundary", () => {
			const analyzer = new SlidingChunkAnalyzer({ overlapBytes: 32 });
			analyzer.feed("az_conn = \"DefaultEndpointsProtocol=http");
			analyzer.feed("s;AccountName=prodstorage;AccountKey=abc123xyz==\";");
			const result = analyzer.finish();
			expect(result.detectedArchetypes).toContain("azure");
		});

		it("UX-0556: detects Slack bot token split across boundary", () => {
			const analyzer = new SlidingChunkAnalyzer({ overlapBytes: 32 });
			analyzer.feed("slack = \"xoxb-123456789");
			analyzer.feed("0-abcdefghij-klmnopqrst\";");
			const result = analyzer.finish();
			expect(result.detectedArchetypes).toContain("services");
		});

		it("UX-0557: detects RSA private key banner split across boundary", () => {
			const analyzer = new SlidingChunkAnalyzer({ overlapBytes: 64 });
			analyzer.feed("cert_data = \"-----BEGIN RSA ");
			analyzer.feed("PRIVATE KEY-----\\nMIIEowIBAAKCAQEA0...\";");
			const result = analyzer.finish();
			expect(result.detectedArchetypes).toContain("certificates");
		});

		it("UX-0558: detects binary asset marker split across boundary", () => {
			const analyzer = new SlidingChunkAnalyzer({ overlapBytes: 32 });
			analyzer.feed("header_lead_bytes_MZ\x90");
			analyzer.feed("rest_of_pe_binary_header_bytes");
			const result = analyzer.finish();
			expect(result.detectedArchetypes).toContain("binaries");
		});

		it("UX-0559: detects nested vendor path marker split across boundary", () => {
			const analyzer = new SlidingChunkAnalyzer({ overlapBytes: 64 });
			analyzer.feed("require('node_modules/deep-pkg/");
			analyzer.feed("node_modules/sub-pkg/index.js');");
			const result = analyzer.finish();
			expect(result.detectedArchetypes).toContain("vendor");
		});

		it("UX-0560: detects circular symlink marker split across boundary", () => {
			const analyzer = new SlidingChunkAnalyzer({ overlapBytes: 32 });
			analyzer.feed("PATH_TRAVERSAL = \"CIRCULAR_");
			analyzer.feed("JUNCTION_POINT_LOOP\";");
			const result = analyzer.finish();
			expect(result.detectedArchetypes).toContain("symlinks");
		});

		it("streams and detects boundary tokens via analyzeStreamWithSlidingChunks", async () => {
			const chunks = [
				"function test() {\n",
				"  const token = 'sk-proj-0123456",
				"789012345678901234567890';\n",
				"}\n",
			];
			const stream = Readable.from(chunks);
			const result = await analyzeStreamWithSlidingChunks(stream, { overlapBytes: 32 });
			expect(result.detectedArchetypes).toContain("openai");
			expect(result.hash).toMatch(/^[0-9a-f]{64}$/);
		});
	});

	// =========================================================================
	// Theme 3: False-Positive Whitelist Pattern Manager (UX-0561 - UX-0570)
	// =========================================================================
	describe("Theme 3: False-Positive Whitelist Pattern Manager (UX-0561 - UX-0570)", () => {
		const whitelist = defaultWhitelistManager;

		it("UX-0561: whitelists dummy OpenAI keys and mock fixtures", () => {
			const res = whitelist.check({
				archetype: "openai",
				token: "sk-proj-0000000000000000000000000000",
			});
			expect(res.whitelisted).toBe(true);
			expect(res.ruleId).toBe("openai-example-keys");

			// Test path fixture
			const testRes = whitelist.check({
				archetype: "openai",
				token: "sk-proj-validlookingtoken1234567890",
				path: "test/fixtures/mock_openai.ts",
			});
			expect(testRes.whitelisted).toBe(true);
		});

		it("UX-0562: whitelists dummy GitHub PATs", () => {
			const res = whitelist.check({
				archetype: "github",
				token: "github_pat_EXAMPLE_TOKEN_FOR_DOCS_12345",
			});
			expect(res.whitelisted).toBe(true);
		});

		it("UX-0563: whitelists official AWS documentation sample keys", () => {
			const res = whitelist.check({
				archetype: "aws",
				token: "AKIAIOSFODNN7EXAMPLE",
			});
			expect(res.whitelisted).toBe(true);
			expect(res.ruleId).toBe("aws-standard-dummy");
		});

		it("UX-0564: whitelists sample HuggingFace and PyPI tokens", () => {
			const res = whitelist.check({
				archetype: "huggingface",
				token: "hf_0000000000000000000000000000",
			});
			expect(res.whitelisted).toBe(true);
		});

		it("UX-0565: whitelists Azurite local storage emulator connection string", () => {
			const res = whitelist.check({
				archetype: "azure",
				token: "AccountName=devstoreaccount1;AccountKey=Eby8vdM02xNOcqFlqUwJ+dummykey==",
			});
			expect(res.whitelisted).toBe(true);
		});

		it("UX-0566: whitelists dummy Slack, Google, and Stripe keys", () => {
			const res = whitelist.check({
				archetype: "services",
				token: "AIzaSyDummyKeyForTestingOnly12345678",
			});
			expect(res.whitelisted).toBe(true);
		});

		it("UX-0567: whitelists mock test private key certificates", () => {
			const res = whitelist.check({
				archetype: "certificates",
				token: "-----BEGIN TEST PRIVATE KEY-----",
			});
			expect(res.whitelisted).toBe(true);
		});

		it("UX-0568: whitelists test fixture binary assets in test folders", () => {
			const res = whitelist.check({
				archetype: "binaries",
				token: "binary_payload",
				path: "test/fixtures/sample.png",
			});
			expect(res.whitelisted).toBe(true);
		});

		it("UX-0569: whitelists explicitly approved vendor subtrees", () => {
			const res = whitelist.check({
				archetype: "vendor",
				token: "vendor_tree",
				path: "vendor/internal/package_a",
			});
			expect(res.whitelisted).toBe(true);
		});

		it("UX-0570: whitelists safe non-circular directory symlinks", () => {
			const res = whitelist.check({
				archetype: "symlinks",
				token: "symlink_alias",
				path: "dist/current",
			});
			expect(res.whitelisted).toBe(true);
		});

		it("suppresses findings when inline suppression directive is present", () => {
			const res = whitelist.check({
				archetype: "openai",
				token: "sk-proj-realsecretlivekey1234567890",
				lineContent: "const key = 'sk-proj-realsecretlivekey1234567890'; // kaioken:allow",
			});
			expect(res.whitelisted).toBe(true);
			expect(res.ruleId).toBe("inline-suppression");
		});
	});

	// =========================================================================
	// Theme 4: High-Entropy String Detector & Shannon Visualizer (UX-0571 - UX-0580)
	// =========================================================================
	describe("Theme 4: High-Entropy String Detector & Shannon Visualizer (UX-0571 - UX-0580)", () => {
		it("UX-0571: calculates and visualizes Shannon entropy for OpenAI keys", () => {
			const token = "sk-proj-V5p8K9m2Q1xL7zR4wY0uT3sN6jH1aC4eF9gB2dE5";
			const report = evaluateArchetypeEntropy(token, "openai");
			expect(report.archetype).toBe("openai");
			expect(report.shannonEntropy).toBeGreaterThanOrEqual(4.4);
			expect(report.exceedsThreshold).toBe(true);
			expect(report.visualBar).toContain("█");
			const card = renderEntropyCard(report);
			expect(card).toContain("OpenAI Project");
		});

		it("UX-0572: calculates and visualizes entropy for GitHub PATs", () => {
			const token = "github_pat_11ABCD012_abcdefghijklmnopqrstuvwxyz0123456789";
			const report = evaluateArchetypeEntropy(token, "github");
			expect(report.archetype).toBe("github");
			expect(report.shannonEntropy).toBeGreaterThanOrEqual(4.3);
		});

		it("UX-0573: calculates and visualizes entropy for AWS credentials", () => {
			const token = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY";
			const report = evaluateArchetypeEntropy(token, "aws");
			expect(report.archetype).toBe("aws");
			expect(report.distribution.totalClasses).toBeGreaterThanOrEqual(3);
		});

		it("UX-0574: calculates and visualizes entropy for HuggingFace/PyPI deployment tokens", () => {
			const token = "hf_xYzAbCdEfGhIjKlMnOpQrStUvWxYz0123456";
			const report = evaluateArchetypeEntropy(token, "huggingface");
			expect(report.archetype).toBe("huggingface");
		});

		it("UX-0575: calculates and visualizes entropy for Azure connection strings", () => {
			const token = "Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==";
			const report = evaluateArchetypeEntropy(token, "azure");
			expect(report.archetype).toBe("azure");
			expect(report.shannonEntropy).toBeGreaterThan(4.5);
		});

		it("UX-0576: calculates and visualizes entropy for Slack/Google/Stripe keys", () => {
			const token = "service_key_V5p8K9m2Q1xL7zR4wY0uT3sN6jH1aC4eF9gB2dE5";
			const report = evaluateArchetypeEntropy(token, "services");
			expect(report.archetype).toBe("services");
			expect(report.exceedsThreshold).toBe(true);
		});

		it("UX-0577: calculates and visualizes entropy for embedded RSA/PGP private certs", () => {
			const base64CertBlock = "MIIEowIBAAKCAQEA0q4k0d9Z3uX2m8a1b6c7d8e9f0a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0";
			const report = evaluateArchetypeEntropy(base64CertBlock, "certificates");
			expect(report.archetype).toBe("certificates");
			expect(report.distribution.isBase64Candidate).toBe(true);
		});

		it("UX-0578: calculates and visualizes entropy for large binary assets", () => {
			// High-randomness simulated compressed/encrypted binary block
			const randomChars = Array.from({ length: 64 }, (_, i) => String.fromCharCode((i * 37) % 256)).join("");
			const report = evaluateArchetypeEntropy(randomChars, "binaries");
			expect(report.archetype).toBe("binaries");
		});

		it("UX-0579: calculates and visualizes entropy for vendor obfuscated strings", () => {
			const minifiedCode = "function a(e,t){return e.slice(0,t).join(',')+Math.random()}";
			const report = evaluateArchetypeEntropy(minifiedCode, "vendor");
			expect(report.archetype).toBe("vendor");
		});

		it("UX-0580: calculates and visualizes entropy for generated symlink targets", () => {
			const symlinkTarget = "build_cache_09f26e402586e2eb834b";
			const report = evaluateArchetypeEntropy(symlinkTarget, "symlinks");
			expect(report.archetype).toBe("symlinks");
		});

		it("formats entropy visual progress bar properly", () => {
			const bar = formatEntropyGauge(4.82, 6.0, 10);
			expect(bar).toMatch(/\[█+░*\] 4\.82 bits\/char/);
		});
	});

	// =========================================================================
	// Theme 5: MIME-Type Sniffing Fallback (UX-0581 - UX-0590)
	// =========================================================================
	describe("Theme 5: MIME-Type Sniffing Fallback (UX-0581 - UX-0590)", () => {
		it("UX-0581: sniffs extensionless OpenAI secret configuration", () => {
			const content = Buffer.from("{\"openai_key\": \"sk-proj-0123456789012345678901234567890\"}");
			const sniffed = sniffMimeAndArchetypes(content, "docker_secret");
			expect(sniffed.mimeType).toBe("application/json");
			expect(sniffed.targetArchetypes).toContain("openai");
		});

		it("UX-0582: sniffs extensionless text file with GitHub PAT", () => {
			const content = Buffer.from("TOKEN=github_pat_11ABCD012_abcdefghijklmnopqrstuvwxyz0123456789");
			const sniffed = sniffMimeAndArchetypes(content, "deploy_token");
			expect(sniffed.mimeType).toBe("text/plain");
			expect(sniffed.targetArchetypes).toContain("github");
		});

		it("UX-0583: sniffs extensionless AWS credential file", () => {
			const content = Buffer.from("[default]\naws_access_key_id = AKIA1234567890ABCDEF\naws_secret_access_key = xxx");
			const sniffed = sniffMimeAndArchetypes(content, "credentials");
			expect(sniffed.mimeType).toBe("application/yaml");
			expect(sniffed.targetArchetypes).toContain("aws");
		});

		it("UX-0584: sniffs extensionless HuggingFace token file", () => {
			const content = Buffer.from("hf_xYzAbCdEfGhIjKlMnOpQrStUvWxYz0123456");
			const sniffed = sniffMimeAndArchetypes(content, "hf_token");
			expect(sniffed.targetArchetypes).toContain("huggingface");
		});

		it("UX-0585: sniffs extensionless Azure configuration", () => {
			const content = Buffer.from("DefaultEndpointsProtocol=https;AccountName=prod;AccountKey=abc123xyz==");
			const sniffed = sniffMimeAndArchetypes(content, "azure_settings");
			expect(sniffed.targetArchetypes).toContain("azure");
		});

		it("UX-0586: sniffs extensionless Google Cloud service account JSON key", () => {
			const content = Buffer.from("{\n  \"type\": \"service_account\",\n  \"project_id\": \"prod-proj\"\n}");
			const sniffed = sniffMimeAndArchetypes(content, "gcp_key");
			expect(sniffed.mimeType).toBe("application/json");
			expect(sniffed.targetArchetypes).toContain("services");
		});

		it("UX-0587: sniffs extensionless RSA private key certificate", () => {
			const content = Buffer.from("-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA0q4k0d9Z3uX2m8a1b6c7d8e9f0a1b2c3\n-----END RSA PRIVATE KEY-----");
			const sniffed = sniffMimeAndArchetypes(content, "id_rsa");
			expect(sniffed.mimeType).toBe("application/x-pem-file");
			expect(sniffed.targetArchetypes).toContain("certificates");
		});

		it("UX-0588: sniffs extensionless binary executable (PE & ELF magic bytes)", () => {
			const peHeader = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00]);
			const peSniffed = sniffMimeAndArchetypes(peHeader, "firmware_blob");
			expect(peSniffed.mimeType).toBe("application/x-dosexec");
			expect(peSniffed.isBinary).toBe(true);
			expect(peSniffed.targetArchetypes).toContain("binaries");

			const elfHeader = Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01]);
			const elfSniffed = sniffMimeAndArchetypes(elfHeader, "runner");
			expect(elfSniffed.mimeType).toBe("application/x-executable");
			expect(elfSniffed.targetArchetypes).toContain("binaries");
		});

		it("UX-0589: sniffs extensionless file in vendor directory", () => {
			const content = Buffer.from("{\"name\": \"nested-vendor-pkg\"}");
			const sniffed = sniffMimeAndArchetypes(content, "node_modules/pkg/MANIFEST");
			expect(sniffed.targetArchetypes).toContain("vendor");
		});

		it("UX-0590: sniffs extensionless symlink pointer payload", () => {
			const content = Buffer.from("symlink: ../../../../circular/target");
			const sniffed = sniffMimeAndArchetypes(content, "current_alias");
			expect(sniffed.mimeType).toBe("inode/symlink");
			expect(sniffed.targetArchetypes).toContain("symlinks");
		});
	});

	// =========================================================================
	// Theme 6: Case-Sensitive Platform Path Normalization Diagnostic (UX-0591 - UX-0600)
	// =========================================================================
	describe("Theme 6: Path Normalization Diagnostic (UX-0591 - UX-0600)", () => {
		it("UX-0591: diagnoses case collision and backslashes for OpenAI paths", () => {
			const paths = [".openai.key", ".OPENAI.KEY", "config\\.openai"];
			const report = diagnosePaths(paths);
			expect(report.hasCaseCollisions).toBe(true);
			expect(report.issuesByArchetype.openai.length).toBeGreaterThanOrEqual(1);
			expect(report.issues.some((i) => i.issueType === "SLASH_INCONSISTENCY")).toBe(true);
		});

		it("UX-0592: diagnoses case collision for GitHub token files", () => {
			const paths = [".github/tokens", ".GITHUB/TOKENS"];
			const report = diagnosePaths(paths);
			expect(report.hasCaseCollisions).toBe(true);
			expect(report.issuesByArchetype.github.length).toBeGreaterThanOrEqual(1);
		});

		it("UX-0593: diagnoses Windows backslashes and case collision for AWS credential paths", () => {
			const paths = [".aws\\credentials", ".AWS/CREDENTIALS"];
			const report = diagnosePaths(paths);
			expect(report.issuesByArchetype.aws.length).toBeGreaterThanOrEqual(1);
		});

		it("UX-0594: diagnoses case variations for HuggingFace/PyPI paths", () => {
			const paths = [".pypirc", ".PYPIRC"];
			const report = diagnosePaths(paths);
			expect(report.hasCaseCollisions).toBe(true);
			expect(report.issuesByArchetype.huggingface.length).toBeGreaterThanOrEqual(1);
		});

		it("UX-0595: diagnoses case variations for Azure publish settings", () => {
			const paths = ["azure.publishsettings", "AZURE.PUBLISHSETTINGS"];
			const report = diagnosePaths(paths);
			expect(report.hasCaseCollisions).toBe(true);
			expect(report.issuesByArchetype.azure.length).toBeGreaterThanOrEqual(1);
		});

		it("UX-0596: diagnoses case collision for third-party service account keys", () => {
			const paths = ["service-account.json", "SERVICE-ACCOUNT.JSON"];
			const report = diagnosePaths(paths);
			expect(report.hasCaseCollisions).toBe(true);
			expect(report.issuesByArchetype.services.length).toBeGreaterThanOrEqual(1);
		});

		it("UX-0597: diagnoses case collision for RSA private keys (bypassing lowercase gitignore on Linux)", () => {
			const paths = ["id_rsa", "ID_RSA"];
			const report = diagnosePaths(paths);
			expect(report.hasCaseCollisions).toBe(true);
			expect(report.issuesByArchetype.certificates.length).toBeGreaterThanOrEqual(1);
		});

		it("UX-0598: diagnoses uppercase extension bypass for large binaries", () => {
			const paths = ["model.weights", "MODEL.WEIGHTS"];
			const report = diagnosePaths(paths);
			expect(report.hasCaseCollisions).toBe(true);
			expect(report.issuesByArchetype.binaries.length).toBeGreaterThanOrEqual(1);
		});

		it("UX-0599: diagnoses Windows MAX_PATH (>260 chars) violation in deep vendor trees", () => {
			const deepVendorPath = "node_modules/" + "nested_dependency_directory_level_name/".repeat(9) + "index.js";
			expect(deepVendorPath.length).toBeGreaterThan(260);
			const report = diagnosePaths([deepVendorPath]);
			expect(report.hasMaxPathExceeded).toBe(true);
			expect(report.issuesByArchetype.vendor.some((i) => i.issueType === "MAX_PATH_EXCEEDED")).toBe(true);
		});

		it("UX-0600: diagnoses circular symlink and junction cycle loops", () => {
			const circularPath = "links/symlink_loop/circular_junction/target";
			const report = diagnosePaths([circularPath]);
			expect(report.hasCircularLoops).toBe(true);
			expect(report.issuesByArchetype.symlinks.some((i) => i.issueType === "CIRCULAR_SYMLINK_JUNCTION")).toBe(true);
		});

		it("formats path diagnostic summary report cleanly", () => {
			const report = diagnosePaths(["test\\.aws\\credentials", "test/.AWS/CREDENTIALS"]);
			const summary = formatPathDiagnosticReport(report);
			expect(summary).toContain("PATH NORMALIZATION DIAGNOSTIC REPORT");
			expect(summary).toContain("AWS Temporary & Root Credentials");
		});

		it("normalizes canonical path correctly", () => {
			expect(normalizeCanonicalPath(".\\a\\b\\\\c")).toBe("a/b/c");
		});
	});
});
