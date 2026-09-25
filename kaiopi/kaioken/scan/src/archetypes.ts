/**
 * Risk archetypes representing the 10 distinct security and repository hygiene
 * threat surfaces tracked across Kaioken Risk Shield.
 */

export type RiskArchetype =
	| "openai"
	| "github"
	| "aws"
	| "huggingface"
	| "azure"
	| "services"
	| "certificates"
	| "binaries"
	| "vendor"
	| "symlinks";

export const ALL_RISK_ARCHETYPES: readonly RiskArchetype[] = [
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
] as const;

export interface RiskArchetypeMeta {
	archetype: RiskArchetype;
	label: string;
	description: string;
	defaultSeverity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
	typicalPrefixes: string[];
	commonFilenames: string[];
	minShannonEntropy: number;
}

export const ARCHETYPE_METADATA: Record<RiskArchetype, RiskArchetypeMeta> = {
	openai: {
		archetype: "openai",
		label: "OpenAI Project & Admin Credentials",
		description: "OpenAI project, admin, and service-account API keys",
		defaultSeverity: "CRITICAL",
		typicalPrefixes: ["sk-proj-", "sk-admin-", "sk-svcacct-", "sk-ant-"],
		commonFilenames: [".openai.key", "openai.json", ".env.openai"],
		minShannonEntropy: 4.4,
	},
	github: {
		archetype: "github",
		label: "GitHub Personal Access Tokens",
		description: "GitHub fine-grained and classic personal access tokens",
		defaultSeverity: "CRITICAL",
		typicalPrefixes: ["github_pat_", "ghp_", "gho_", "ghu_", "ghs_", "ghr_"],
		commonFilenames: [".github/tokens", "gh-token.txt", ".gh_token"],
		minShannonEntropy: 4.3,
	},
	aws: {
		archetype: "aws",
		label: "AWS Temporary & Root Credentials",
		description: "AWS IAM access keys, STS temporary session credentials, and secret keys",
		defaultSeverity: "CRITICAL",
		typicalPrefixes: ["AKIA", "ASIA", "ABIA", "ACCA"],
		commonFilenames: [".aws/credentials", ".aws/config", "credentials.csv", "aws-creds.json"],
		minShannonEntropy: 4.2,
	},
	huggingface: {
		archetype: "huggingface",
		label: "HuggingFace & PyPI Deployment Tokens",
		description: "HuggingFace user access tokens and PyPI deployment credentials",
		defaultSeverity: "HIGH",
		typicalPrefixes: ["hf_", "pypi-"],
		commonFilenames: [".huggingface/token", ".pypirc", "pypi_token.txt"],
		minShannonEntropy: 4.3,
	},
	azure: {
		archetype: "azure",
		label: "Azure Connection Strings & SAS Query Tokens",
		description: "Azure Storage connection strings, SharedAccessSignature, and SAS query tokens",
		defaultSeverity: "CRITICAL",
		typicalPrefixes: ["DefaultEndpointsProtocol=", "SharedAccessSignature=", "sig="],
		commonFilenames: ["azure.publishsettings", "local.settings.json", "azurecreds.json"],
		minShannonEntropy: 4.5,
	},
	services: {
		archetype: "services",
		label: "Slack, Google & Stripe Service Keys",
		description: "Slack bot tokens, Google Cloud API/service keys, and Stripe live secrets",
		defaultSeverity: "CRITICAL",
		typicalPrefixes: ["xoxb-", "xoxp-", "AIza", "sk_live_", "rk_live_", "ya29."],
		commonFilenames: ["service-account.json", "stripe-keys.json", "slack-token.txt", "gcp-creds.json"],
		minShannonEntropy: 4.1,
	},
	certificates: {
		archetype: "certificates",
		label: "Embedded RSA & PGP Private Certificates",
		description: "Private cryptographic certificates, RSA, EC, OpenSSH, and PGP private keys",
		defaultSeverity: "CRITICAL",
		typicalPrefixes: ["-----BEGIN RSA PRIVATE KEY", "-----BEGIN OPENSSH PRIVATE KEY", "-----BEGIN PGP PRIVATE KEY"],
		commonFilenames: ["id_rsa", "id_ed25519", "server.key", "privkey.pem"],
		minShannonEntropy: 5.2,
	},
	binaries: {
		archetype: "binaries",
		label: "Large Binary Assets Exceeding Size Budgets",
		description: "Compiled executables, ISO disk images, tar archives, and ML model weight blobs",
		defaultSeverity: "MEDIUM",
		typicalPrefixes: ["MZ", "\x7fELF", "PK\x03\x04"],
		commonFilenames: ["weights.bin", "model.pt", "firmware.bin", "archive.iso"],
		minShannonEntropy: 6.8,
	},
	vendor: {
		archetype: "vendor",
		label: "Deeply Nested Vendor & Dependency Trees",
		description: "Deep node_modules, vendor/, site-packages, and target cache trees",
		defaultSeverity: "LOW",
		typicalPrefixes: ["node_modules/", "vendor/", "site-packages/"],
		commonFilenames: ["node_modules", "vendor", "site-packages", ".venv"],
		minShannonEntropy: 3.5,
	},
	symlinks: {
		archetype: "symlinks",
		label: "Symlink Loops & Circular Directory Junctions",
		description: "Recursive filesystem cycles, reparse point loops, and circular symlink chains",
		defaultSeverity: "HIGH",
		typicalPrefixes: ["symlink:", "junction:"],
		commonFilenames: ["current", "symlink_loop", "junction_point"],
		minShannonEntropy: 3.0,
	},
};

export function isRiskArchetype(val: string): val is RiskArchetype {
	return ALL_RISK_ARCHETYPES.includes(val as RiskArchetype);
}
