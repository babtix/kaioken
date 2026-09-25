import { ARCHETYPE_METADATA, type RiskArchetype } from "./archetypes.ts";

export interface GitignoreSuggestion {
	archetype: RiskArchetype;
	rules: string[];
	negations: string[];
	rationale: string;
	scope: string;
	priority: number;
}

export interface SuggestGitignoreOptions {
	contextPath?: string;
	existingRules?: string[];
	customFileName?: string;
}

/**
 * Generates automated .gitignore suggestions for a specific risk archetype.
 * Covers UX-0541 to UX-0550 across all 10 threat surfaces.
 */
export function suggestRulesForArchetype(
	archetype: RiskArchetype,
	options: SuggestGitignoreOptions = {},
): GitignoreSuggestion {
	const existing = new Set((options.existingRules ?? []).map((r) => r.trim()));

	switch (archetype) {
		// UX-0541: OpenAI project and admin API keys
		case "openai": {
			const candidateRules = [
				".openai.key",
				"openai.json",
				".env.openai",
				".env.openai.*",
				"*openai*key*",
				"*openai*secret*",
			];
			if (options.customFileName) {
				candidateRules.unshift(options.customFileName);
			}
			return {
				archetype: "openai",
				rules: candidateRules.filter((r) => !existing.has(r)),
				negations: ["!.env.openai.example", "!.env.openai.sample"],
				rationale: "Shields OpenAI project, admin, and organization API tokens from source leakage",
				scope: "Security / Secret Shield (OpenAI)",
				priority: 10,
			};
		}

		// UX-0542: GitHub fine-grained personal access tokens
		case "github": {
			const candidateRules = [
				".github/tokens",
				"gh-token.txt",
				".gh_token",
				"*github_pat*",
				"github-pat.env",
			];
			if (options.customFileName) {
				candidateRules.unshift(options.customFileName);
			}
			return {
				archetype: "github",
				rules: candidateRules.filter((r) => !existing.has(r)),
				negations: ["!.github/workflows/*.yml", "!.github/workflows/*.yaml"],
				rationale: "Prevents accidental commit of fine-grained GitHub PATs and repository tokens",
				scope: "Security / Secret Shield (GitHub)",
				priority: 10,
			};
		}

		// UX-0543: AWS temporary and root credentials
		case "aws": {
			const candidateRules = [
				".aws/credentials",
				".aws/config",
				"credentials.csv",
				"aws-creds.json",
				"*aws*credential*",
			];
			if (options.customFileName) {
				candidateRules.unshift(options.customFileName);
			}
			return {
				archetype: "aws",
				rules: candidateRules.filter((r) => !existing.has(r)),
				negations: ["!.aws/config.example"],
				rationale: "Blocks AWS IAM keys, STS session tokens, and root credential files from git index",
				scope: "Security / Secret Shield (AWS)",
				priority: 10,
			};
		}

		// UX-0544: HuggingFace and PyPI deployment tokens
		case "huggingface": {
			const candidateRules = [
				".huggingface/token",
				".huggingface/",
				".pypirc",
				"pypi_token.txt",
				"hf_token*",
			];
			if (options.customFileName) {
				candidateRules.unshift(options.customFileName);
			}
			return {
				archetype: "huggingface",
				rules: candidateRules.filter((r) => !existing.has(r)),
				negations: ["!.pypirc.example", "!.pypirc.sample"],
				rationale: "Protects package distribution tokens and HuggingFace user access credentials",
				scope: "Security / Secret Shield (HuggingFace/PyPI)",
				priority: 20,
			};
		}

		// UX-0545: Azure connection strings and SAS query tokens
		case "azure": {
			const candidateRules = [
				"azure.publishsettings",
				"local.settings.json",
				"azurecreds.json",
				"*.azurecreds",
				"*sas-token*",
			];
			if (options.customFileName) {
				candidateRules.unshift(options.customFileName);
			}
			return {
				archetype: "azure",
				rules: candidateRules.filter((r) => !existing.has(r)),
				negations: ["!local.settings.example.json", "!local.settings.sample.json"],
				rationale: "Prevents exposure of Azure Storage keys, shared access signatures, and function settings",
				scope: "Security / Secret Shield (Azure)",
				priority: 20,
			};
		}

		// UX-0546: Slack, Google, and Stripe service keys
		case "services": {
			const candidateRules = [
				"service-account*.json",
				"stripe-keys.json",
				"slack-token.txt",
				"gcp-creds.json",
				"google-services.json",
			];
			if (options.customFileName) {
				candidateRules.unshift(options.customFileName);
			}
			return {
				archetype: "services",
				rules: candidateRules.filter((r) => !existing.has(r)),
				negations: ["!service-account.example.json", "!google-services.sample.json"],
				rationale: "Isolates third-party service provider API secrets (Slack, Google, Stripe)",
				scope: "Security / Secret Shield (Third-Party Services)",
				priority: 20,
			};
		}

		// UX-0547: Embedded RSA/PGP private certificates
		case "certificates": {
			const candidateRules = [
				"*.pem",
				"*.key",
				"*.p12",
				"*.pfx",
				"*.pkcs12",
				"id_rsa",
				"id_rsa.key",
				"id_ed25519",
				"id_dsa",
			];
			if (options.customFileName) {
				candidateRules.unshift(options.customFileName);
			}
			return {
				archetype: "certificates",
				rules: candidateRules.filter((r) => !existing.has(r)),
				negations: ["!*.pub", "!*.crt", "!cacert.pem"],
				rationale: "Excludes private key certificates and SSH keys while preserving public root bundles",
				scope: "Security / Cryptographic Keys (Certificates)",
				priority: 10,
			};
		}

		// UX-0548: Large binary assets exceeding size budgets
		case "binaries": {
			const candidateRules = [
				"*.exe",
				"*.dll",
				"*.so",
				"*.dylib",
				"*.bin",
				"*.tar",
				"*.tar.gz",
				"*.iso",
				"*.weights",
				"*.pt",
				"*.onnx",
			];
			if (options.customFileName) {
				candidateRules.unshift(options.customFileName);
			}
			return {
				archetype: "binaries",
				rules: candidateRules.filter((r) => !existing.has(r)),
				negations: ["!.gitkeep"],
				rationale: "Prevents git repository bloat caused by committing large binary assets and ML weights",
				scope: "Source Hygiene / Storage Budgets (Binaries)",
				priority: 30,
			};
		}

		// UX-0549: Deeply nested node_modules and vendor directories
		case "vendor": {
			const candidateRules = [
				"node_modules/",
				"vendor/",
				"site-packages/",
				".venv/",
				"target/",
				"dist/",
				"build/",
			];
			if (options.customFileName) {
				candidateRules.unshift(options.customFileName);
			}
			return {
				archetype: "vendor",
				rules: candidateRules.filter((r) => !existing.has(r)),
				negations: ["!vendor/licenses/"],
				rationale: "Ignores heavy dependency trees and ephemeral build compilation outputs",
				scope: "Source Hygiene / Dependency Trees (Vendor)",
				priority: 40,
			};
		}

		// UX-0550: Symlink loops and circular junction paths
		case "symlinks": {
			const candidateRules = [
				"*symlink_loop*/",
				"*junction_point*/",
				".kaioken/circular/",
			];
			if (options.customFileName) {
				candidateRules.unshift(options.customFileName);
			}
			return {
				archetype: "symlinks",
				rules: candidateRules.filter((r) => !existing.has(r)),
				negations: [],
				rationale: "Guards against infinite recursive directory indexing caused by circular filesystem links",
				scope: "Filesystem Safety / Symlink Loops",
				priority: 50,
			};
		}
	}
}

/**
 * Formats a single suggestion into clean .gitignore section markdown.
 */
export function formatSuggestionSection(suggestion: GitignoreSuggestion): string {
	const meta = ARCHETYPE_METADATA[suggestion.archetype];
	const lines: string[] = [
		`# -----------------------------------------------------------------------------`,
		`# [${suggestion.scope}] ${meta.label}`,
		`# Rationale: ${suggestion.rationale}`,
		`# -----------------------------------------------------------------------------`,
		...suggestion.rules,
	];

	if (suggestion.negations.length > 0) {
		lines.push("# Explicit exceptions / templates:");
		lines.push(...suggestion.negations);
	}

	return lines.join("\n");
}

/**
 * Builds a comprehensive .gitignore file for multiple archetypes.
 */
export function generateComprehensiveGitignore(
	archetypes: RiskArchetype[] = [
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
	],
	existingRules: string[] = [],
): string {
	const suggestions = archetypes
		.map((arch) => suggestRulesForArchetype(arch, { existingRules }))
		.filter((s) => s.rules.length > 0)
		.sort((a, b) => a.priority - b.priority);

	const header = [
		"# =============================================================================",
		"# AUTOMATICALLY GENERATED BY KAIOKEN RISK SHIELD (Category 06)",
		"# Rules generated across detected risk archetypes with safe negation patterns.",
		"# =============================================================================",
		"",
	].join("\n");

	const sections = suggestions.map((s) => formatSuggestionSection(s));
	return `${header}${sections.join("\n\n")}\n`;
}
