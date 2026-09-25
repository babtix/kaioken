/**
 * rename_simulation.ts — Safe-rename simulation reporter (UX-0961–UX-0970).
 * Simulates symbol renames across files with exact 1-based line coordinates and refactoring previews.
 *
 * Invariant: Fail-soft error boundaries; never throws on unreadable or missing files.
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
	type ImpactTargetType,
	type TargetCallsiteEntry,
	type TargetRenameOptions,
	type TargetRenameReport,
	TARGET_METADATA_REGISTRY,
} from "./types.ts";

const MAX_FILE_SIZE = 512 * 1024;

function escapeRegex(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Target-specific safety verification checklists */
const SAFETY_CHECKLISTS: Record<ImpactTargetType, string[]> = {
	database_model: [
		"Verify database schema migration script updates table/field references.",
		"Check query builders and repository methods for unescaped string column names.",
		"Update serialization DTOs and API contract schemas.",
		"Ensure backward compatibility for cached session records.",
	],
	auth_middleware: [
		"Audit all protected route definitions for updated middleware identifier.",
		"Verify JWT payload validation and claims extraction functions.",
		"Check RPC handler authentication decorators and wrappers.",
		"Run automated unauthorized access gate check (401/403).",
	],
	http_client: [
		"Inspect catch blocks across API client calls for updated error class name.",
		"Verify retry policy interceptors and backoff logic.",
		"Ensure logging formatters extract error message and status code correctly.",
		"Check mock HTTP fixtures in test suites.",
	],
	string_utils: [
		"Verify template string rendering and slug generation across wiki docs.",
		"Ensure terminal formatting helpers retain correct width computations.",
		"Check internationalization and multibyte unicode test cases.",
		"Audit regex patterns that reference escaped string identifiers.",
	],
	telemetry_logger: [
		"Ensure span context propagation remains unbroken across async calls.",
		"Verify log level configuration mappings in environment variables.",
		"Check automated alert triggers relying on structured log field names.",
		"Validate that test suites mocking logger instances receive updated calls.",
	],
	session_store: [
		"Verify SQLite schema checkpoint migration scripts.",
		"Check in-memory session cache reconciliation logic.",
		"Ensure undo/redo event tree serialization handles renamed store methods.",
		"Run crash-recovery simulation test.",
	],
	event_bus: [
		"Check all event subscriber registrations for renamed topic/dispatcher.",
		"Verify event envelope serialization and deserialization.",
		"Audit dead-letter queue handlers and timeout policies.",
		"Ensure test harnesses verifying bus events subscribe to updated names.",
	],
	config_parser: [
		"Verify CLI argument parsing flags match updated configuration key names.",
		"Update default .kaioken/config.json schema definitions.",
		"Ensure environment variable prefix mappings are aligned.",
		"Add deprecation warning for the old configuration identifier.",
	],
	crypto_exchange: [
		"Verify key agreement protocol handshake state machine.",
		"Ensure signature verification routines match newly derived session keys.",
		"Audit wire protocol message headers for encryption envelope flags.",
		"Test against legacy clients for coordinated grace period fallback.",
	],
	external_adapter: [
		"Verify all third-party provider dispatchers implement renamed adapter interface.",
		"Check error mapping transpositions for HTTP 429 and 500 status codes.",
		"Ensure model pricing and token calculation bridges point to updated adapter.",
		"Run offline provider mock suite to confirm parity.",
	],
};

/**
 * Simulate renaming an identifier across a target component's candidates.
 */
export async function simulateTargetRename(
	root: string,
	target: ImpactTargetType,
	oldIdentifier: string,
	newIdentifier: string,
	options?: TargetRenameOptions,
): Promise<TargetRenameReport> {
	const meta = TARGET_METADATA_REGISTRY[target];
	const candidateFiles = new Set<string>([
		meta.defaultPath,
		...meta.affectedSubsystems.map((s) => `${s.path}/src/index.ts`),
		...meta.affectedSubsystems.map((s) => `${s.path}/src/client.ts`),
		...(options?.additionalFiles ?? []),
	]);

	const callsites: TargetCallsiteEntry[] = [];
	let totalOccurrences = 0;

	const escaped = escapeRegex(oldIdentifier);
	const regex = new RegExp(`(?<![A-Za-z0-9_$])${escaped}(?![A-Za-z0-9_$])`, "g");

	for (const relPath of candidateFiles) {
		try {
			const absPath = join(root, relPath);
			const content = await readFile(absPath, "utf8");

			if (content.length > MAX_FILE_SIZE) continue;

			const lines = content.split("\n");
			const matchedLines: number[] = [];
			const matchedSnippets: string[] = [];
			const proposedChanges: Array<{ line: number; before: string; after: string }> = [];

			for (let i = 0; i < lines.length; i++) {
				const line = lines[i] ?? "";
				regex.lastIndex = 0;

				if (regex.test(line)) {
					const lineNo = i + 1;
					matchedLines.push(lineNo);
					matchedSnippets.push(line.trim());

					regex.lastIndex = 0;
					const matchCount = (line.match(regex) ?? []).length;
					totalOccurrences += matchCount;

					if (options?.includeDryRunReplacements !== false) {
						regex.lastIndex = 0;
						const replaced = line.replace(regex, newIdentifier);
						proposedChanges.push({
							line: lineNo,
							before: line.trim(),
							after: replaced.trim(),
						});
					}
				}
			}

			if (matchedLines.length > 0) {
				callsites.push({
					path: relPath,
					lines: matchedLines,
					snippets: matchedSnippets,
					proposedChanges,
				});
			}
		} catch {
			// Fail-soft: ignore unreadable or absent files
			continue;
		}
	}

	callsites.sort((a, b) => a.path.localeCompare(b.path));

	// Baseline estimation: 2 minutes per file + 0.5 minutes per callsite
	const estimatedMinutes = Math.max(5, Math.ceil(callsites.length * 2 + totalOccurrences * 0.5));

	return {
		target,
		uxId: meta.uxRange.safeRename,
		targetName: options?.customTargetName ?? meta.name,
		oldIdentifier,
		newIdentifier,
		totalFiles: callsites.length,
		totalOccurrences,
		callsites,
		safetyChecklist: SAFETY_CHECKLISTS[target] ?? [],
		estimatedMigrationTimeMinutes: estimatedMinutes,
	};
}

// ---------------------------------------------------------------------------
// Dedicated helpers for UX-0961 to UX-0970
// ---------------------------------------------------------------------------

/** [UX-0961] Safe-rename simulation for shared database model interface */
export async function simulateDatabaseModelRename(
	root: string,
	oldId: string,
	newId: string,
	opts?: TargetRenameOptions,
): Promise<TargetRenameReport> {
	return simulateTargetRename(root, "database_model", oldId, newId, opts);
}

/** [UX-0962] Safe-rename simulation for central authentication middleware handler */
export async function simulateAuthMiddlewareRename(
	root: string,
	oldId: string,
	newId: string,
	opts?: TargetRenameOptions,
): Promise<TargetRenameReport> {
	return simulateTargetRename(root, "auth_middleware", oldId, newId, opts);
}

/** [UX-0963] Safe-rename simulation for core HTTP client error handling signature */
export async function simulateHttpClientRename(
	root: string,
	oldId: string,
	newId: string,
	opts?: TargetRenameOptions,
): Promise<TargetRenameReport> {
	return simulateTargetRename(root, "http_client", oldId, newId, opts);
}

/** [UX-0964] Safe-rename simulation for utility string formatting library */
export async function simulateStringUtilsRename(
	root: string,
	oldId: string,
	newId: string,
	opts?: TargetRenameOptions,
): Promise<TargetRenameReport> {
	return simulateTargetRename(root, "string_utils", oldId, newId, opts);
}

/** [UX-0965] Safe-rename simulation for global telemetry logger and tracer */
export async function simulateTelemetryLoggerRename(
	root: string,
	oldId: string,
	newId: string,
	opts?: TargetRenameOptions,
): Promise<TargetRenameReport> {
	return simulateTargetRename(root, "telemetry_logger", oldId, newId, opts);
}

/** [UX-0966] Safe-rename simulation for session state management store */
export async function simulateSessionStoreRename(
	root: string,
	oldId: string,
	newId: string,
	opts?: TargetRenameOptions,
): Promise<TargetRenameReport> {
	return simulateTargetRename(root, "session_store", oldId, newId, opts);
}

/** [UX-0967] Safe-rename simulation for event bus message dispatcher and topics */
export async function simulateEventBusRename(
	root: string,
	oldId: string,
	newId: string,
	opts?: TargetRenameOptions,
): Promise<TargetRenameReport> {
	return simulateTargetRename(root, "event_bus", oldId, newId, opts);
}

/** [UX-0968] Safe-rename simulation for configuration parser and validation schema */
export async function simulateConfigParserRename(
	root: string,
	oldId: string,
	newId: string,
	opts?: TargetRenameOptions,
): Promise<TargetRenameReport> {
	return simulateTargetRename(root, "config_parser", oldId, newId, opts);
}

/** [UX-0969] Safe-rename simulation for cryptographic key exchange protocol */
export async function simulateCryptoExchangeRename(
	root: string,
	oldId: string,
	newId: string,
	opts?: TargetRenameOptions,
): Promise<TargetRenameReport> {
	return simulateTargetRename(root, "crypto_exchange", oldId, newId, opts);
}

/** [UX-0970] Safe-rename simulation for third-party external API integration adapter */
export async function simulateExternalAdapterRename(
	root: string,
	oldId: string,
	newId: string,
	opts?: TargetRenameOptions,
): Promise<TargetRenameReport> {
	return simulateTargetRename(root, "external_adapter", oldId, newId, opts);
}

/**
 * Render safe-rename simulation report for terminal output.
 */
export function renderTargetRenameReportTerminal(report: TargetRenameReport): string[] {
	const lines: string[] = [];
	lines.push(`🔍 Safe-Rename Simulation [${report.uxId}]: "${report.oldIdentifier}" → "${report.newIdentifier}"`);
	lines.push(`Target: ${report.targetName}`);
	lines.push(`Impact: ${report.totalOccurrences} callsite(s) across ${report.totalFiles} file(s)`);
	lines.push(`Estimated Migration Effort: ~${report.estimatedMigrationTimeMinutes} minutes`);
	lines.push("");

	if (report.callsites.length === 0) {
		lines.push("  ✓ No callsites found matching identifier boundaries.");
	} else {
		for (const entry of report.callsites) {
			lines.push(`  📄 ${entry.path} (${entry.lines.length} callsite(s)):`);
			for (const change of entry.proposedChanges.slice(0, 5)) {
				lines.push(`     L${change.line} - Before: ${change.before}`);
				lines.push(`     L${change.line} + After:  ${change.after}`);
			}
			if (entry.proposedChanges.length > 5) {
				lines.push(`     ... +${entry.proposedChanges.length - 5} more callsites in this file`);
			}
		}
	}

	lines.push("");
	lines.push("📋 Safety Checklist:");
	for (const check of report.safetyChecklist) {
		lines.push(`  [ ] ${check}`);
	}

	return lines;
}

/**
 * Render safe-rename simulation report as markdown.
 */
export function renderTargetRenameReportMarkdown(report: TargetRenameReport): string {
	const sections: string[] = [
		`### [${report.uxId}] Safe-Rename Simulation Report: \`${report.oldIdentifier}\` → \`${report.newIdentifier}\``,
		`- **Target**: ${report.targetName}`,
		`- **Callsites**: ${report.totalOccurrences} across ${report.totalFiles} file(s)`,
		`- **Estimated Migration Time**: ~${report.estimatedMigrationTimeMinutes} minutes`,
		"",
		"#### Impacted Files & Callsites",
	];

	if (report.callsites.length === 0) {
		sections.push("_No callsites found matching identifier boundaries._");
	} else {
		for (const call of report.callsites) {
			sections.push(`##### \`${call.path}\` (${call.lines.length} occurrences)`);
			sections.push("```diff");
			for (const change of call.proposedChanges) {
				sections.push(`- L${change.line}: ${change.before}`);
				sections.push(`+ L${change.line}: ${change.after}`);
			}
			sections.push("```");
		}
	}

	sections.push("", "#### Safety Pre-Commit Checklist");
	for (const item of report.safetyChecklist) {
		sections.push(`- [ ] ${item}`);
	}

	return sections.join("\n");
}
