import { type RiskArchetype } from "./archetypes.ts";

export interface WhitelistRule {
	id: string;
	archetype: RiskArchetype;
	description: string;
	pattern?: RegExp;
	tokenPredicate?: (token: string) => boolean;
	pathPredicate?: (path: string) => boolean;
	allowInTestFiles?: boolean;
}

export interface WhitelistCheckInput {
	archetype: RiskArchetype;
	token: string;
	path?: string;
	lineContent?: string;
}

export interface WhitelistCheckResult {
	whitelisted: boolean;
	ruleId?: string;
	reason?: string;
}

const INLINE_SUPPRESSION_REGEX =
	/(?:\/\/|#|\/\*)\s*(?:@?kaioken[-:](?:allow|whitelist|ignore[-_]?(?:risk|secret)?|safe))/i;

/**
 * Built-in known dummy credentials, documentation samples, and test fixture rules.
 */
const DEFAULT_WHITELIST_RULES: WhitelistRule[] = [
	// UX-0561: OpenAI project and admin API keys
	{
		id: "openai-example-keys",
		archetype: "openai",
		description: "Well-known documentation dummy keys and all-zero test fixtures for OpenAI",
		pattern: /\bsk-(?:proj|admin)-(?:0{16,}|(?:EXAMPLE|example|dummy|placeholder|test)[A-Za-z0-9_-]*)\b/,
	},
	{
		id: "openai-test-fixture",
		archetype: "openai",
		description: "OpenAI mock keys inside test directories",
		allowInTestFiles: true,
		pathPredicate: (p) => isTestPath(p),
	},

	// UX-0562: GitHub fine-grained personal access tokens
	{
		id: "github-pat-dummy",
		archetype: "github",
		description: "GitHub dummy PAT tokens (github_pat_EXAMPLE... or ghp_0000...)",
		pattern: /\b(?:github_pat_(?:EXAMPLE|example|dummy|placeholder)[A-Za-z0-9_]*|gh[pousr]_0{30,})\b/,
	},
	{
		id: "github-pat-test-fixture",
		archetype: "github",
		description: "GitHub PAT tokens in test or mock files",
		allowInTestFiles: true,
		pathPredicate: (p) => isTestPath(p),
	},

	// UX-0563: AWS temporary and root credentials
	{
		id: "aws-standard-dummy",
		archetype: "aws",
		description: "Official AWS documentation sample access key (AKIAIOSFODNN7EXAMPLE)",
		pattern: /\b(?:AKIAIOSFODNN7EXAMPLE|ASIAIOSFODNN7EXAMPLE|AKIA0000000000000000)\b/,
	},
	{
		id: "aws-test-fixture",
		archetype: "aws",
		description: "AWS credentials in localstack, test mocks or test fixtures",
		allowInTestFiles: true,
		pathPredicate: (p) => isTestPath(p) || p.includes("localstack"),
	},

	// UX-0564: HuggingFace and PyPI deployment tokens
	{
		id: "huggingface-pypi-dummy",
		archetype: "huggingface",
		description: "HuggingFace and PyPI sample tokens",
		pattern: /\b(?:hf_(?:0{20,}|dummy[A-Za-z0-9]+|example[A-Za-z0-9]+)|pypi-(?:dummy|example|sample)[A-Za-z0-9_-]+)\b/,
	},
	{
		id: "huggingface-test-fixture",
		archetype: "huggingface",
		description: "HuggingFace/PyPI mock tokens in tests",
		allowInTestFiles: true,
		pathPredicate: (p) => isTestPath(p),
	},

	// UX-0565: Azure connection strings and SAS query tokens
	{
		id: "azure-emulator-connection-string",
		archetype: "azure",
		description: "Azure Azurite local storage emulator connection string",
		pattern: /AccountName=devstoreaccount1;AccountKey=Eby8vdM02xNOcqFlqUwJ\+[\w=]+/,
	},
	{
		id: "azure-test-fixture",
		archetype: "azure",
		description: "Azure sample connection strings in test files",
		allowInTestFiles: true,
		pathPredicate: (p) => isTestPath(p),
	},

	// UX-0566: Slack, Google, and Stripe service keys
	{
		id: "services-dummy-keys",
		archetype: "services",
		description: "Slack/Google/Stripe documentation dummy keys",
		pattern: /\b(?:xox[baprs]-(?:0{10,}|dummy-[0-9]+)|AIzaSy(?:Dummy|Example|Placeholder)[A-Za-z0-9_-]{20,}|[sr]k_(?:test|dummy|example)_[0-9a-zA-Z]{24,})\b/,
	},
	{
		id: "services-test-fixture",
		archetype: "services",
		description: "Third-party service keys in test fixtures or mock environments",
		allowInTestFiles: true,
		pathPredicate: (p) => isTestPath(p),
	},

	// UX-0567: Embedded RSA/PGP private certificates
	{
		id: "cert-dummy-or-self-signed",
		archetype: "certificates",
		description: "Test self-signed certificate with TEST/DUMMY banner or in test directory",
		pattern: /-----BEGIN (?:[A-Z0-9_ -]+ )?(?:TEST|DUMMY|SAMPLE) PRIVATE KEY-----/,
	},
	{
		id: "cert-test-fixture",
		archetype: "certificates",
		description: "Cryptographic test keys in test certificates or fixtures",
		allowInTestFiles: true,
		pathPredicate: (p) => isTestPath(p),
	},

	// UX-0568: Large binary assets exceeding size budgets
	{
		id: "binary-test-fixture",
		archetype: "binaries",
		description: "Budgeted binary fixtures explicitly located in test/ or fixture/ folders",
		pathPredicate: (p) => isTestPath(p) && (p.endsWith(".png") || p.endsWith(".ico") || p.endsWith(".bin")),
	},

	// UX-0569: Deeply nested node_modules and vendor directories
	{
		id: "vendor-pinned-allowlist",
		archetype: "vendor",
		description: "Vendored directories explicitly annotated or internal packages",
		pathPredicate: (p) => p.startsWith("vendor/internal/") || p.includes(".allowed_vendor/"),
	},

	// UX-0570: Symlink loops and circular junction paths
	{
		id: "symlink-safe-aliases",
		archetype: "symlinks",
		description: "Verified non-circular directory symlink aliases (e.g. dist/current -> v1.0.0)",
		pathPredicate: (p) => p.endsWith("/current") || p.endsWith("/latest"),
	},
];

function isTestPath(path?: string): boolean {
	if (!path) return false;
	const lower = path.toLowerCase();
	return (
		lower.includes("test/") ||
		lower.includes("tests/") ||
		lower.includes("fixtures/") ||
		lower.includes("__tests__/") ||
		lower.includes("/mock/") ||
		lower.includes("/mocks/") ||
		lower.endsWith(".test.ts") ||
		lower.endsWith(".test.js") ||
		lower.endsWith(".spec.ts") ||
		lower.endsWith(".spec.js")
	);
}

/**
 * False-positive whitelist pattern manager across the 10 risk archetypes (UX-0561 to UX-0570).
 */
export class WhitelistManager {
	private readonly rules: WhitelistRule[];

	constructor(customRules: WhitelistRule[] = []) {
		this.rules = [...DEFAULT_WHITELIST_RULES, ...customRules];
	}

	/**
	 * Registers an additional custom whitelist rule.
	 */
	registerRule(rule: WhitelistRule): void {
		this.rules.push(rule);
	}

	/**
	 * Checks if a candidate secret or finding is suppressed via inline comments,
	 * dummy token patterns, or test fixture bypass.
	 */
	check(input: WhitelistCheckInput): WhitelistCheckResult {
		// 1. Check for inline suppression comment on the source line
		if (input.lineContent && INLINE_SUPPRESSION_REGEX.test(input.lineContent)) {
			return {
				whitelisted: true,
				ruleId: "inline-suppression",
				reason: "Suppressed via inline kaioken directive comment",
			};
		}

		// 2. Evaluate archetype rules
		for (const rule of this.rules) {
			if (rule.archetype !== input.archetype) continue;

			// Check test file predicate
			if (rule.allowInTestFiles && input.path && isTestPath(input.path)) {
				return {
					whitelisted: true,
					ruleId: rule.id,
					reason: `Whitelisted in test fixture (${rule.description})`,
				};
			}

			// Check regex pattern match
			if (rule.pattern && rule.pattern.test(input.token)) {
				return {
					whitelisted: true,
					ruleId: rule.id,
					reason: rule.description,
				};
			}

			// Check token predicate
			if (rule.tokenPredicate && rule.tokenPredicate(input.token)) {
				return {
					whitelisted: true,
					ruleId: rule.id,
					reason: rule.description,
				};
			}

			// Check path predicate
			if (rule.pathPredicate && input.path && rule.pathPredicate(input.path)) {
				return {
					whitelisted: true,
					ruleId: rule.id,
					reason: rule.description,
				};
			}
		}

		return { whitelisted: false };
	}

	/**
	 * Convenient helper to check if a line contains inline suppression.
	 */
	hasInlineSuppression(line: string): boolean {
		return INLINE_SUPPRESSION_REGEX.test(line);
	}

	/**
	 * Returns all registered rules for an archetype.
	 */
	getRulesForArchetype(archetype: RiskArchetype): WhitelistRule[] {
		return this.rules.filter((r) => r.archetype === archetype);
	}
}

export const defaultWhitelistManager = new WhitelistManager();
