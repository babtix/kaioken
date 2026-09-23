import { normalizeSource } from "./binding.ts";
import { computeLineDiff, formatUnifiedDiff } from "./diff.ts";
import type {
	DocumentDriftReport,
	DriftKind,
	NormalizationOptions,
	Provenance,
	SourceDiff,
	StalenessReport,
} from "./types.ts";

export interface InspectOptions {
	tolerance?: NormalizationOptions;
	contextLines?: number;
}

/**
 * Inspect exact source code drift for a provenance record against current files.
 */
export function inspectDocumentDrift(
	document: Provenance,
	getOldContent: (path: string) => string | null,
	getCurrentContent: (path: string) => string | null,
	options?: InspectOptions,
): DocumentDriftReport {
	const changedSources: SourceDiff[] = [];

	for (const source of document.sources) {
		const oldRaw = getOldContent(source.path);
		const currentRaw = getCurrentContent(source.path);

		if (currentRaw === null) {
			// Source file deleted
			changedSources.push({
				path: source.path,
				symbol: source.symbol,
				startLine: source.startLine,
				endLine: source.endLine,
				driftKind: "source_deleted",
				hunks: [],
				additions: 0,
				deletions: oldRaw ? oldRaw.split("\n").length : 0,
			});
			continue;
		}

		if (oldRaw === null) {
			// Old source was missing or new file
			continue;
		}

		let oldText = oldRaw;
		let currentText = currentRaw;

		// Extract symbol/line range if bound
		if (source.startLine !== undefined && source.endLine !== undefined) {
			const oldLines = oldRaw.replace(/\r\n/g, "\n").split("\n");
			const curLines = currentRaw.replace(/\r\n/g, "\n").split("\n");
			oldText = oldLines.slice(source.startLine - 1, source.endLine).join("\n");
			currentText = curLines.slice(source.startLine - 1, source.endLine).join("\n");
		}

		if (oldText === currentText) continue;

		// Determine drift kind
		let driftKind: DriftKind = source.symbol ? "body_modified" : "whole_file_drift";

		// Check if it's comment-only change
		if (options?.tolerance?.ignoreComments || options?.tolerance?.ignoreWhitespace) {
			const normOld = normalizeSource(oldText, options.tolerance);
			const normCur = normalizeSource(currentText, options.tolerance);
			if (normOld === normCur) {
				driftKind = "comment_only";
			}
		}

		// Check if signature changed (first line of symbol declaration)
		if (source.symbol && driftKind !== "comment_only") {
			const oldFirstLine = oldText.split("\n")[0]?.trim();
			const curFirstLine = currentText.split("\n")[0]?.trim();
			if (oldFirstLine !== curFirstLine) {
				driftKind = "signature_changed";
			}
		}

		const hunks = computeLineDiff(oldText, currentText, options?.contextLines ?? 3);
		let additions = 0;
		let deletions = 0;

		for (const h of hunks) {
			for (const line of h.lines) {
				if (line.type === "add") additions++;
				else if (line.type === "delete") deletions++;
			}
		}

		if (hunks.length > 0) {
			changedSources.push({
				path: source.path,
				symbol: source.symbol,
				startLine: source.startLine,
				endLine: source.endLine,
				driftKind,
				hunks,
				additions,
				deletions,
			});
		}
	}

	const freshness =
		changedSources.length === 0
			? "current"
			: changedSources.every((s) => s.driftKind === "source_deleted") &&
				  changedSources.length === document.sources.length
				? "orphaned"
				: "stale";

	const summary =
		changedSources.length === 0
			? "Document is current."
			: `${changedSources.length} source file(s) drifted (${changedSources.map((s) => `${s.path}${s.symbol ? `#${s.symbol}` : ""}`).join(", ")})`;

	return {
		document: document.document,
		freshness,
		changedSources,
		summary,
	};
}

/**
 * Generate a Markdown compliance audit report showing drift status and exact diffs.
 */
export function generateDriftMarkdownReport(
	report: StalenessReport,
	driftDetails?: ReadonlyMap<string, DocumentDriftReport> | Record<string, DocumentDriftReport>,
): string {
	const detailsMap =
		driftDetails instanceof Map
			? driftDetails
			: driftDetails
				? new Map(Object.entries(driftDetails))
				: new Map<string, DocumentDriftReport>();

	const lines: string[] = [
		"# Documentation Drift & Staleness Compliance Report",
		"",
		`> Generated: ${new Date().toISOString()}`,
		`> Repository Freshness: **${Math.round(report.freshness * 100)}%** (${report.ok ? "PASS" : "DRIFT DETECTED"})`,
		"",
		"| Document | Status | Changed Sources | Deleted Sources |",
		"| :--- | :--- | :--- | :--- |",
	];

	for (const doc of report.documents) {
		const changed = doc.changed.length > 0 ? doc.changed.join(", ") : "—";
		const deleted = doc.deleted.length > 0 ? doc.deleted.join(", ") : "—";
		lines.push(`| \`${doc.document}\` | **${doc.freshness.toUpperCase()}** | ${changed} | ${deleted} |`);
	}

	lines.push("");

	if (report.stale.length > 0) {
		lines.push("## Stale Documents & Invalidating Diffs", "");

		for (const staleDoc of report.stale) {
			lines.push(`### \`${staleDoc.document}\``, "");
			const detail = detailsMap.get(staleDoc.document);

			if (detail && detail.changedSources.length > 0) {
				for (const source of detail.changedSources) {
					const symText = source.symbol ? ` (#${source.symbol})` : "";
					const badge = `[+${source.additions} / -${source.deletions}] (${source.driftKind})`;
					lines.push(`<details>`, `<summary><code>${source.path}${symText}</code> ${badge}</summary>`, "", "```diff");
					lines.push(formatUnifiedDiff(source.path, source.hunks));
					lines.push("```", "", "</details>", "");
				}
			} else {
				lines.push(`- Changed source files: ${staleDoc.changed.map((c) => `\`${c}\``).join(", ")}`, "");
			}
		}
	}

	return lines.join("\n");
}

export interface TerminalDriftOptions {
	maxLines?: number;
	color?: boolean;
}

/**
 * Render colorized terminal drift diff view.
 */
export function renderTerminalDrift(
	drift: DocumentDriftReport,
	options?: TerminalDriftOptions,
): string {
	const useColor = options?.color ?? false;
	const maxLines = options?.maxLines ?? 40;

	const green = (t: string) => (useColor ? `\x1b[32m${t}\x1b[0m` : t);
	const red = (t: string) => (useColor ? `\x1b[31m${t}\x1b[0m` : t);
	const cyan = (t: string) => (useColor ? `\x1b[36m${t}\x1b[0m` : t);
	const bold = (t: string) => (useColor ? `\x1b[1m${t}\x1b[0m` : t);

	const out: string[] = [
		bold(`Drift Inspector: ${drift.document} [${drift.freshness.toUpperCase()}]`),
		drift.summary,
		"",
	];

	let lineCount = 0;
	for (const source of drift.changedSources) {
		if (lineCount >= maxLines) {
			out.push(cyan(`… diff truncated (${drift.changedSources.length} sources total) …`));
			break;
		}

		const symText = source.symbol ? ` (symbol: ${source.symbol})` : "";
		out.push(bold(`--- ${source.path}${symText} [${source.driftKind}] ---`));
		lineCount++;

		for (const hunk of source.hunks) {
			out.push(cyan(`@@ -${hunk.oldStart},${hunk.oldCount} +${hunk.newStart},${hunk.newCount} @@`));
			lineCount++;

			for (const line of hunk.lines) {
				if (lineCount >= maxLines) break;
				if (line.type === "add") {
					out.push(green(`+ ${line.text}`));
				} else if (line.type === "delete") {
					out.push(red(`- ${line.text}`));
				} else {
					out.push(`  ${line.text}`);
				}
				lineCount++;
			}
		}
		out.push("");
	}

	return out.join("\n");
}
