import type { DomainCategory, VerificationReport } from "./types.ts";

export interface AuditViewOptions {
	useAnsi?: boolean;
	showDefects?: boolean;
	showBreakdown?: boolean;
	targetDomain?: DomainCategory;
	title?: string;
}

const DOMAIN_LABELS: Record<DomainCategory, string> = {
	file_path: "File Path References (Wiki)",
	symbol_signature: "Symbol Signature Quotes (Cards)",
	api_param: "API Parameter Documentation",
	arch_boundary: "Architectural Boundaries",
	command_example: "Command Examples (Skills)",
	perf_metric: "Performance Metric Assertions",
	config_key: "Configuration Key Citations",
	dependency_claim: "Third-Party Dependencies",
	commit_quote: "Historical Commit Quotes",
	db_citation: "Database Columns & Indexes",
};

export function renderAuditView(report: VerificationReport, options?: AuditViewOptions): string {
	const useAnsi = options?.useAnsi ?? (process.env.TERM !== "dumb" && Boolean(process.stdout?.isTTY));
	const showBreakdown = options?.showBreakdown !== false;
	const showDefects = options?.showDefects !== false;

	const green = (s: string) => (useAnsi ? `\x1b[32m${s}\x1b[0m` : s);
	const yellow = (s: string) => (useAnsi ? `\x1b[33m${s}\x1b[0m` : s);
	const red = (s: string) => (useAnsi ? `\x1b[31m${s}\x1b[0m` : s);
	const bold = (s: string) => (useAnsi ? `\x1b[1m${s}\x1b[0m` : s);
	const cyan = (s: string) => (useAnsi ? `\x1b[36m${s}\x1b[0m` : s);
	const dim = (s: string) => (useAnsi ? `\x1b[2m${s}\x1b[0m` : s);

	const statusBadge = (status: "grounded" | "suspect" | "hallucinated") => {
		switch (status) {
			case "grounded":
				return green("✓ [GROUNDED]");
			case "suspect":
				return yellow("⚠ [SUSPECT]");
			case "hallucinated":
				return red("✗ [HALLUCINATED]");
		}
	};

	const lines: string[] = [];
	const title = options?.title ?? "Claim Verification & Grounding Audit";

	lines.push(bold(`${cyan("===")} ${title} ${cyan("===")}`));
	lines.push(`Overall Status: ${statusBadge(report.score.status)} (${bold(`${report.groundingConfidence}%`)})`);
	lines.push(
		`Claims Checked: ${report.score.totalClaims} | Grounded: ${green(String(report.grounded))} | Defects: ${report.defects.length > 0 ? red(String(report.defects.length)) : green("0")} | Coverage: ${Math.round(report.coverage * 100)}%`,
	);
	lines.push("");

	// UX-1141 to UX-1150: Domain category audit table breakdown
	if (showBreakdown && report.score.categoryBreakdown) {
		lines.push(bold("--- Category Grounding Breakdown (10 Domains) ---"));
		for (const [domKey, detail] of Object.entries(report.score.categoryBreakdown)) {
			const domain = domKey as DomainCategory;
			if (options?.targetDomain && options.targetDomain !== domain) continue;

			const label = DOMAIN_LABELS[domain] ?? domain;
			const badge = statusBadge(detail.status);
			const pctStr = `${detail.confidence}%`.padStart(4);
			const claimsStr = `[${detail.grounded}/${detail.claims} claims grounded]`.padEnd(25);

			lines.push(`  • ${label.padEnd(35)} ${pctStr} ${badge} ${dim(claimsStr)}`);
		}
		lines.push("");
	}

	// Highlighting verified citations and defects
	if (showDefects && report.defects.length > 0) {
		lines.push(bold("--- Detected Verification Defects ---"));
		const filteredDefects = options?.targetDomain
			? report.defects.filter((d) => d.domain === options.targetDomain)
			: report.defects;

		if (filteredDefects.length === 0) {
			lines.push(green("  No defects detected in this scope."));
		} else {
			for (const defect of filteredDefects) {
				const lineInfo = defect.line !== undefined ? `Line ${defect.line}` : "Artifact";
				const sevBadge =
					defect.severity === "critical"
						? red("[CRITICAL]")
						: defect.severity === "warning"
							? yellow("[WARNING]")
							: dim("[INFO]");

				const rep = defect.suggestedReplacement
					? ` -> Suggestion: ${cyan(`"${defect.suggestedReplacement}"`)}`
					: "";
				const dom = defect.domain ? ` (${dim(defect.domain)})` : "";

				lines.push(`  ${sevBadge} ${lineInfo}: \`${defect.claim}\`${dom}`);
				lines.push(`         ${dim(defect.detail)}${rep}`);
			}
		}
		lines.push("");
	}

	return lines.join("\n");
}
