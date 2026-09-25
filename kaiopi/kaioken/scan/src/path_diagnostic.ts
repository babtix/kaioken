import { ARCHETYPE_METADATA, type RiskArchetype } from "./archetypes.ts";

export type PathIssueType =
	| "CASE_COLLISION"
	| "SLASH_INCONSISTENCY"
	| "MAX_PATH_EXCEEDED"
	| "UNICODE_NFD_MISMATCH"
	| "CIRCULAR_SYMLINK_JUNCTION";

export interface PathDiagnosticIssue {
	archetype: RiskArchetype;
	issueType: PathIssueType;
	originalPath: string;
	normalizedPath: string;
	message: string;
	recommendation: string;
	severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
}

export interface PathDiagnosticReport {
	scannedPathCount: number;
	issues: PathDiagnosticIssue[];
	hasCaseCollisions: boolean;
	hasMaxPathExceeded: boolean;
	hasCircularLoops: boolean;
	issuesByArchetype: Record<RiskArchetype, PathDiagnosticIssue[]>;
}

const WINDOWS_MAX_PATH = 260;

/**
 * Normalizes a path to canonical POSIX format with Unicode NFC normalization.
 */
export function normalizeCanonicalPath(p: string): string {
	let normalized = p.replace(/\\/g, "/");
	// Collapse multiple slashes
	normalized = normalized.replace(/\/+/g, "/");
	// Remove leading './'
	if (normalized.startsWith("./")) {
		normalized = normalized.slice(2);
	}
	// Unicode canonical normalization
	return normalized.normalize("NFC");
}

/**
 * Infers likely archetype for a given path based on filename or directory segments.
 */
export function inferPathArchetype(path: string): RiskArchetype {
	const lower = path.toLowerCase();
	const base = lower.slice(lower.lastIndexOf("/") + 1);

	if (lower.includes("openai") || lower.includes("sk-proj")) return "openai";
	if (lower.includes("github") || lower.includes("gh_token") || lower.includes("pat")) return "github";
	if (lower.includes("aws") || lower.includes("credential") || base === "credentials.csv") return "aws";
	if (lower.includes("huggingface") || lower.includes("pypi") || lower.includes("hf_")) return "huggingface";
	if (lower.includes("azure") || lower.includes("local.settings")) return "azure";
	if (lower.includes("service-account") || lower.includes("slack") || lower.includes("stripe") || lower.includes("gcp")) return "services";
	if (lower.includes("id_rsa") || lower.includes("id_ed25519") || lower.includes("cert") || base.endsWith(".pem") || base.endsWith(".key") || base.endsWith(".p12")) return "certificates";
	if (base.endsWith(".exe") || base.endsWith(".tar") || base.endsWith(".iso") || base.endsWith(".bin") || base.endsWith(".weights")) return "binaries";
	if (lower.includes("node_modules/") || lower.includes("vendor/") || lower.includes("site-packages/")) return "vendor";
	if (lower.includes("symlink") || lower.includes("junction") || lower.includes("circular")) return "symlinks";

	return "services";
}

/**
 * Runs cross-platform case-sensitive path diagnostic across all 10 threat surfaces (UX-0591 to UX-0600).
 */
export function diagnosePaths(paths: string[]): PathDiagnosticReport {
	const issues: PathDiagnosticIssue[] = [];
	const seenLower = new Map<string, string>();
	const issuesByArchetype: Record<RiskArchetype, PathDiagnosticIssue[]> = {
		openai: [],
		github: [],
		aws: [],
		huggingface: [],
		azure: [],
		services: [],
		certificates: [],
		binaries: [],
		vendor: [],
		symlinks: [],
	};

	for (const originalPath of paths) {
		const archetype = inferPathArchetype(originalPath);
		const normalized = normalizeCanonicalPath(originalPath);

		// 1. Slash inconsistency check (Windows backslash vs POSIX forward slash)
		if (originalPath.includes("\\")) {
			const issue: PathDiagnosticIssue = {
				archetype,
				issueType: "SLASH_INCONSISTENCY",
				originalPath,
				normalizedPath: normalized,
				message: `Path contains Windows backslashes ('\\'). Git and gitignore patterns expect canonical forward slashes ('/').`,
				recommendation: `Normalize path to '${normalized}' to ensure reliable matching across Linux and Windows.`,
				severity: "LOW",
			};
			issues.push(issue);
			issuesByArchetype[archetype].push(issue);
		}

		// 2. Unicode normalization check (NFD vs NFC)
		if (originalPath !== originalPath.normalize("NFC")) {
			const issue: PathDiagnosticIssue = {
				archetype,
				issueType: "UNICODE_NFD_MISMATCH",
				originalPath,
				normalizedPath: normalized,
				message: `Path is encoded in decomposed Unicode (NFD). Linux filesystems will treat this as distinct from precomposed NFC.`,
				recommendation: `Normalize filenames to Unicode NFC before git checkout/indexing.`,
				severity: "MEDIUM",
			};
			issues.push(issue);
			issuesByArchetype[archetype].push(issue);
		}

		// 3. Case collision check across case-sensitive (Linux) vs case-insensitive (Windows/macOS) platforms
		const lowerKey = normalized.toLowerCase();
		if (seenLower.has(lowerKey)) {
			const priorPath = seenLower.get(lowerKey)!;
			if (priorPath !== normalized) {
				const issue: PathDiagnosticIssue = {
					archetype,
					issueType: "CASE_COLLISION",
					originalPath,
					normalizedPath: normalized,
					message: `Case collision detected between '${priorPath}' and '${normalized}'. This causes silent file overwrites on Windows/macOS.`,
					recommendation: `Rename file to avoid case collision and verify gitignore rules cover both variations.`,
					severity: "CRITICAL",
				};
				issues.push(issue);
				issuesByArchetype[archetype].push(issue);
			}
		} else {
			seenLower.set(lowerKey, normalized);
		}

		// 4. Windows MAX_PATH limit check (> 260 chars), common in deeply nested vendor trees (UX-0599)
		if (normalized.length >= WINDOWS_MAX_PATH) {
			const issue: PathDiagnosticIssue = {
				archetype,
				issueType: "MAX_PATH_EXCEEDED",
				originalPath,
				normalizedPath: normalized,
				message: `Path length (${normalized.length} chars) reaches or exceeds Windows MAX_PATH limit (260 chars).`,
				recommendation: `Add directory to .gitignore or flatten tree structure to prevent checkout failure on Windows.`,
				severity: "HIGH",
			};
			issues.push(issue);
			issuesByArchetype[archetype].push(issue);
		}

		// 5. Circular symlink / junction loop diagnostic (UX-0600)
		const segments = normalized.split("/");
		const segmentCounts = new Map<string, number>();
		for (const seg of segments) {
			if (!seg || seg === ".") continue;
			segmentCounts.set(seg, (segmentCounts.get(seg) ?? 0) + 1);
			if (segmentCounts.get(seg)! >= 3 || normalized.includes("symlink_loop") || normalized.includes("circular_junction")) {
				const issue: PathDiagnosticIssue = {
					archetype: "symlinks",
					issueType: "CIRCULAR_SYMLINK_JUNCTION",
					originalPath,
					normalizedPath: normalized,
					message: `Circular directory cycle detected: repeated segment '${seg}' in path indicates recursive symlink/junction cycle.`,
					recommendation: `Add '${seg}/' to .gitignore or unlink circular junction point immediately.`,
					severity: "CRITICAL",
				};
				issues.push(issue);
				issuesByArchetype.symlinks.push(issue);
				break;
			}
		}
	}

	return {
		scannedPathCount: paths.length,
		issues,
		hasCaseCollisions: issues.some((i) => i.issueType === "CASE_COLLISION"),
		hasMaxPathExceeded: issues.some((i) => i.issueType === "MAX_PATH_EXCEEDED"),
		hasCircularLoops: issues.some((i) => i.issueType === "CIRCULAR_SYMLINK_JUNCTION"),
		issuesByArchetype,
	};
}

/**
 * Formats a terminal-friendly summary table of the path diagnostic results.
 */
export function formatPathDiagnosticReport(report: PathDiagnosticReport): string {
	if (report.issues.length === 0) {
		return `✓ Cross-Platform Path Diagnostic: All ${report.scannedPathCount} paths are canonical, case-safe, and within MAX_PATH limits.`;
	}

	const header = [
		`╔═══════════════════════════════════════════════════════════════════════════════╗`,
		`║          KAIOKEN RISK SHIELD: PATH NORMALIZATION DIAGNOSTIC REPORT            ║`,
		`╠═══════════════════════════════════════════════════════════════════════════════╣`,
		`║ Total Scanned: ${report.scannedPathCount.toString().padEnd(6)} | Issues: ${report.issues.length.toString().padEnd(6)} | Case Collisions: ${report.hasCaseCollisions ? "YES" : "NO "} ║`,
		`╚═══════════════════════════════════════════════════════════════════════════════╝`,
	].join("\n");

	const lines = report.issues.map((issue) => {
		const meta = ARCHETYPE_METADATA[issue.archetype];
		return `[${issue.severity}] [${meta.label}] [${issue.issueType}]\n  Path:   ${issue.originalPath}\n  Fix:    ${issue.recommendation}`;
	});

	return `${header}\n\n${lines.join("\n\n")}`;
}
