import { detectHighEntropyStrings, maskToken } from "./entropy.ts";
import type { SecretFinding } from "./quarantine.ts";
import type { Risk } from "./types.ts";

/**
 * Risk flagging runs inside the scan traversal because the bytes are already in
 * hand. Every downstream consumer — bundling, the wiki, the agent's write
 * approval prompt — inherits the result without paying for another pass.
 *
 * The bias throughout is toward precision over recall. A flag on ordinary source
 * trains the reader to ignore flags, which is worse than missing one.
 */

const PRIVATE_KEY_CONTENT = [
	/-----BEGIN (?:[A-Z0-9_ -]+ )?PRIVATE KEY(?: BLOCK)?-----/,
	/PuTTY-User-Key-File-\d/,
];

const PRIVATE_KEY_FILENAMES = new Set([
	"id_rsa",
	"id_dsa",
	"id_ecdsa",
	"id_ed25519",
	"identity",
	"server.key",
	"privkey.pem",
]);

const PRIVATE_KEY_EXTENSIONS = new Set([".pem", ".key", ".p12", ".pfx", ".jks", ".keystore"]);

const CREDENTIAL_FILENAMES = new Set([
	"credentials",
	"credentials.json",
	"secrets.json",
	"secrets.yaml",
	"secrets.yml",
	".npmrc",
	".pypirc",
	".netrc",
	"_netrc",
	".htpasswd",
]);

/** Suffixes that mark an env file as a documented template rather than a real one. */
const ENV_TEMPLATE_SUFFIXES = [".example", ".sample", ".template", ".dist", ".defaults"];

export interface NamedPattern {
	category: string;
	pattern: RegExp;
	severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
	action: string;
}

/**
 * Provider token shapes. Each of these is specific enough that a match is
 * effectively never a coincidence.
 */
export const PROVIDER_SECRET_PATTERNS: NamedPattern[] = [
	{
		category: "AWS Access Key",
		pattern: /\bAKIA[0-9A-Z]{16}\b/,
		severity: "CRITICAL",
		action: "Quarantine and rotate AWS IAM credentials",
	},
	{
		category: "AWS Temp Key",
		pattern: /\bASIA[0-9A-Z]{16}\b/,
		severity: "HIGH",
		action: "Quarantine temporary AWS credentials",
	},
	{
		category: "GitHub Classic Token",
		pattern: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/,
		severity: "CRITICAL",
		action: "Revoke token and remove from repository",
	},
	{
		category: "GitHub Fine-Grained PAT",
		pattern: /\bgithub_pat_[A-Za-z0-9_]{22,}\b/,
		severity: "CRITICAL",
		action: "Revoke PAT and add to .gitignore",
	},
	{
		category: "Slack Token",
		pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/,
		severity: "HIGH",
		action: "Revoke bot/user token from Slack workspace",
	},
	{
		category: "Google API Key",
		pattern: /\bAIza[0-9A-Za-z_-]{35}\b/,
		severity: "HIGH",
		action: "Restrict API key scope in Google Cloud Console",
	},
	{
		category: "GCP OAuth Token",
		pattern: /\bya29\.[0-9A-Za-z_-]{20,}\b/,
		severity: "CRITICAL",
		action: "Revoke OAuth token and quarantine file",
	},
	{
		category: "Stripe Live Secret Key",
		pattern: /\b[sr]k_live_[0-9a-zA-Z]{24,}\b/,
		severity: "CRITICAL",
		action: "Roll key immediately in Stripe Dashboard",
	},
	{
		category: "Anthropic API Key",
		pattern: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/,
		severity: "CRITICAL",
		action: "Revoke Anthropic console key and quarantine",
	},
	{
		category: "OpenAI Project/Admin Key",
		pattern: /\bsk-(?:proj|admin|svcacct)-[A-Za-z0-9_-]{20,}\b/,
		severity: "CRITICAL",
		action: "Revoke OpenAI organization/project key",
	},
	{
		category: "OpenAI API Key",
		pattern: /\bsk-[A-Za-z0-9]{32,}\b/,
		severity: "CRITICAL",
		action: "Revoke OpenAI platform API key",
	},
	{
		category: "HuggingFace Token",
		pattern: /\bhf_[A-Za-z0-9]{20,}\b/,
		severity: "HIGH",
		action: "Rotate HuggingFace user access token",
	},
	{
		category: "PyPI Deployment Token",
		pattern: /\bpypi-[A-Za-z0-9_-]{20,}\b/,
		severity: "CRITICAL",
		action: "Revoke package deployment token on PyPI",
	},
	{
		category: "Azure Storage Connection String",
		pattern: /\bDefaultEndpointsProtocol=https?;[^\s"']*/,
		severity: "CRITICAL",
		action: "Rotate storage keys in Azure portal",
	},
	{
		category: "Azure Account Access Key",
		pattern: /\b(?:SharedAccessKey|AccountKey)=[A-Za-z0-9+/=]{40,}\b/,
		severity: "CRITICAL",
		action: "Regenerate account key in Azure",
	},
	{
		category: "Azure SAS Token",
		pattern: /\bSharedAccessSignature(?:=|\s+)[^\s"']{20,}/,
		severity: "HIGH",
		action: "Expire SAS token and update storage policy",
	},
	{
		category: "Azure SAS Query Token",
		pattern: /\b(?:sv=\d{4}-\d{2}-\d{2}[^\s"']*sig=|sig=[A-Za-z0-9%+/=]{20,}[^\s"']*sv=\d{4}-\d{2}-\d{2})[A-Za-z0-9%+/=]{20,}/,
		severity: "HIGH",
		action: "Invalidate SAS signature",
	},
	{
		category: "Bearer Authorization Header",
		pattern: /\b[Bb]earer\s+(?!example|sample|test|placeholder|your|dummy|fake)[A-Za-z0-9_\-\.~+/]{20,}\b/,
		severity: "HIGH",
		action: "Remove hardcoded Authorization header",
	},
	{
		category: "GitLab PAT",
		pattern: /\bglpat-[A-Za-z0-9_-]{20,}\b/,
		severity: "CRITICAL",
		action: "Revoke GitLab personal access token",
	},
	{
		category: "JWT Token",
		pattern: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
		severity: "MEDIUM",
		action: "Investigate whether JWT contains sensitive claims",
	},
];

const CREDENTIAL_CONTENT = PROVIDER_SECRET_PATTERNS.map((p) => p.pattern);

/**
 * The generic rule: a secret-ish name assigned a high-entropy literal. This is
 * the only pattern that could plausibly fire on real source, so it is fenced by
 * a placeholder check and an entropy floor.
 */
const GENERIC_SECRET =
	/\b(?:password|passwd|secret|secret_key|token|auth_token|api[_-]?key|access[_-]?key|private[_-]?key|client[_-]?secret)\b\s*[:=]\s*["'`]([^"'`\n]{20,})["'`]/i;

/** Words that mark a literal as documentation rather than a live credential. */
const PLACEHOLDER_WORDS = [
	"example",
	"sample",
	"placeholder",
	"dummy",
	"fake",
	"test",
	"changeme",
	"change_me",
	"your",
	"xxxx",
	"redacted",
	"insert",
	"todo",
	"replace",
	"notreal",
	"secretsecret",
];

const GENERATED_PATH_SEGMENTS = [
	"dist/",
	"build/",
	"out/",
	".next/",
	"coverage/",
	"__generated__/",
	"generated/",
	".output/",
];

const GENERATED_FILENAME = [
	/\.min\.(?:js|css|mjs)$/,
	/\.(?:js|css|mjs)\.map$/,
	/\.pb\.go$/,
	/_pb2\.pyi?$/,
	/\.pb\.cc$/,
	/\.g\.dart$/,
	/\.generated\.[A-Za-z0-9]+$/,
	/\.designer\.cs$/i,
];

const GENERATED_CONTENT = [
	/Code generated by .+ DO NOT EDIT/i,
	/@generated\b/,
	/DO NOT EDIT(?:[.!]| THIS FILE)/i,
	/This file (?:was|is) (?:auto[- ]?)?generated/i,
	/Autogenerated by/i,
];

const LOCKFILES = new Set([
	"package-lock.json",
	"npm-shrinkwrap.json",
	"yarn.lock",
	"pnpm-lock.yaml",
	"bun.lock",
	"bun.lockb",
	"go.sum",
	"cargo.lock",
	"poetry.lock",
	"pdm.lock",
	"uv.lock",
	"gemfile.lock",
	"composer.lock",
	"pubspec.lock",
	"packages.lock.json",
	"mix.lock",
	"flake.lock",
]);

export interface RiskInput {
	/** Repo-relative POSIX path. */
	path: string;
	size: number;
	binary: boolean;
	/** Head of the file, decoded as UTF-8. Empty for binary files. */
	text: string;
	largeBinaryBytes: number;
	checkEntropy?: boolean;
	entropyThreshold?: number;
}

export function classifyRisk(input: RiskInput): Risk[] {
	const risk = new Set<Risk>();
	const base = basename(input.path).toLowerCase();
	const ext = extname(base);

	if (LOCKFILES.has(base)) risk.add("lockfile");

	if (input.binary && input.size >= input.largeBinaryBytes) risk.add("large_binary");

	// A .pem or .key extension is only a hint about what the file *might* hold.
	// Since the content is already in hand, use it: a bundle of public
	// certificate roots is not a private key, and flagging it teaches the reader
	// to ignore the flag on the file that really is one.
	if (PRIVATE_KEY_FILENAMES.has(base) || PRIVATE_KEY_EXTENSIONS.has(ext)) {
		if (!input.binary && input.text && isCertificateOnly(input.text)) {
			// Nothing: the content settles it.
		} else {
			risk.add("private_key");
		}
	}

	if (isCredentialFilename(base)) risk.add("credentials");

	if (isGeneratedPath(input.path) || GENERATED_FILENAME.some((re) => re.test(base))) {
		risk.add("generated");
	}

	// Content rules only apply to text. Scanning binary for these is noise.
	if (!input.binary && input.text) {
		if (hasPrivateKeyContent(input.text)) risk.add("private_key");
		if (hasCredentialContent(input.text)) risk.add("credentials");
		if (hasGeneratedBanner(input.text)) risk.add("generated");

		if (input.checkEntropy) {
			const highEntropy = detectHighEntropyStrings(input.text, {
				minEntropy: input.entropyThreshold,
			});
			if (highEntropy.length > 0) {
				risk.add("high_entropy");
			}
		}
	}

	return [...risk].sort();
}

/**
 * Extracts structured secret findings with category, line number, masked preview, and action.
 */
export function extractSecretFindings(path: string, text: string): SecretFinding[] {
	const findings: SecretFinding[] = [];
	if (!text) return findings;

	const lines = text.split(/\r?\n/);

	// Check private keys
	for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
		const line = lines[lineIdx]!;
		if (hasPrivateKeyContent(line)) {
			findings.push({
				path,
				category: "Private Key Certificate",
				line: lineIdx + 1,
				maskedToken: maskToken(line.trim()),
				severity: "CRITICAL",
				recommendedAction: "Move private key to secure keystore and add to .gitignore",
			});
		}
	}

	// Check provider patterns
	for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
		const line = lines[lineIdx]!;
		for (const prov of PROVIDER_SECRET_PATTERNS) {
			const m = line.match(prov.pattern);
			if (m && m[0]) {
				findings.push({
					path,
					category: prov.category,
					line: lineIdx + 1,
					maskedToken: maskToken(m[0]),
					severity: prov.severity,
					recommendedAction: prov.action,
				});
			}
		}
	}

	return findings;
}

export function hasPrivateKeyContent(text: string): boolean {
	return PRIVATE_KEY_CONTENT.some((re) => re.test(text));
}

/**
 * PEM content that holds certificates and nothing secret. Public roots ship in
 * plenty of repositories and are not a finding.
 */
function isCertificateOnly(text: string): boolean {
	if (hasPrivateKeyContent(text)) return false;
	return /-----BEGIN (?:TRUSTED )?CERTIFICATE(?: REQUEST)?-----/.test(text);
}

function isCredentialFilename(base: string): boolean {
	if (CREDENTIAL_FILENAMES.has(base)) return true;
	if (base.startsWith("service-account") && base.endsWith(".json")) return true;
	if (base === ".env" || base.startsWith(".env.")) {
		// `.env.example` documents the shape; it is not a credential.
		return !ENV_TEMPLATE_SUFFIXES.some((suffix) => base.endsWith(suffix));
	}
	return false;
}

function isGeneratedPath(path: string): boolean {
	const withSlash = `${path}`;
	return GENERATED_PATH_SEGMENTS.some(
		(seg) => withSlash.startsWith(seg) || withSlash.includes(`/${seg}`),
	);
}

/** Only the first lines count — a banner buried on line 900 is not a banner. */
function hasGeneratedBanner(text: string): boolean {
	const head = firstLines(text, 40);
	return GENERATED_CONTENT.some((re) => re.test(head));
}

export function hasCredentialContent(text: string): boolean {
	if (CREDENTIAL_CONTENT.some((re) => re.test(text))) return true;

	const matches = text.matchAll(new RegExp(GENERIC_SECRET.source, "gi"));
	for (const match of matches) {
		const value = match[1];
		if (value !== undefined && looksLikeLiveSecret(value)) return true;
	}
	return false;
}

/**
 * The entropy floor. A live secret mixes character classes and is not a word a
 * human wrote as an illustration.
 */
export function looksLikeLiveSecret(value: string): boolean {
	if (value.length < 20) return false;

	// Interpolation and env lookups are references, not secrets.
	if (/\$\{|\$\(|process\.env|os\.environ|ENV\[|getenv|System\.getenv/.test(value)) return false;

	const lowered = value.toLowerCase();
	if (PLACEHOLDER_WORDS.some((word) => lowered.includes(word))) return false;

	// Repeated filler such as "aaaaaaaa..." or "0000...".
	if (/^(.)\1+$/.test(value)) return false;

	const hasLower = /[a-z]/.test(value);
	const hasUpper = /[A-Z]/.test(value);
	const hasDigit = /\d/.test(value);
	const classes = Number(hasLower) + Number(hasUpper) + Number(hasDigit);

	// Two classes is the floor: "abcdefghijklmnop1234" qualifies, an English
	// sentence in a config string does not.
	if (classes < 2) return false;

	// A value made of dictionary-ish words separated by spaces is prose.
	if (/\s/.test(value)) return false;

	return true;
}

export function isBinary(head: Buffer): boolean {
	return head.includes(0);
}

function firstLines(text: string, count: number): string {
	let index = 0;
	for (let i = 0; i < count; i++) {
		const next = text.indexOf("\n", index);
		if (next === -1) return text;
		index = next + 1;
	}
	return text.slice(0, index);
}

function basename(path: string): string {
	return path.slice(path.lastIndexOf("/") + 1);
}

function extname(base: string): string {
	const dot = base.lastIndexOf(".");
	return dot <= 0 ? "" : base.slice(dot);
}
