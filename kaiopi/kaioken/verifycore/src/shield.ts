import type { Claim, Defect, DomainCategory, VerificationReport } from "./types.ts";

export type ShieldEnforcement = "strict" | "warn" | "permissive";

export interface ShieldOptions {
	enforcement?: ShieldEnforcement;
	minConfidence?: number;
}

export class AntiHallucinationShield {
	readonly enforcement: ShieldEnforcement;
	readonly minConfidence: number;

	constructor(options?: ShieldOptions) {
		this.enforcement = options?.enforcement ?? "strict";
		this.minConfidence = options?.minConfidence ?? (this.enforcement === "strict" ? 90 : 70);
	}

	isAcceptable(report: VerificationReport): boolean {
		if (this.enforcement === "permissive") return true;

		if (this.enforcement === "strict") {
			const hasCritical = report.defects.some((d) => d.severity === "critical");
			return !hasCritical && report.groundingConfidence >= this.minConfidence;
		}

		return report.groundingConfidence >= this.minConfidence;
	}

	classifyClaim(claim: Claim): Claim {
		let domain: DomainCategory;
		if (claim.kind === "file" || claim.kind === "link") {
			domain = "file_path";
		} else if (claim.kind === "symbol" || claim.kind === "anchor" || claim.kind === "excerpt") {
			domain = "symbol_signature";
		} else if (claim.kind === "api_param") {
			domain = "api_param";
		} else if (claim.kind === "arch_boundary") {
			domain = "arch_boundary";
		} else if (claim.kind === "command_example") {
			domain = "command_example";
		} else if (claim.kind === "perf_metric") {
			domain = "perf_metric";
		} else if (claim.kind === "config_key") {
			domain = "config_key";
		} else if (claim.kind === "dependency_claim") {
			domain = "dependency_claim";
		} else if (claim.kind === "commit_quote") {
			domain = "commit_quote";
		} else if (claim.kind === "db_citation") {
			domain = "db_citation";
		} else {
			domain = "file_path";
		}

		return { ...claim, domain, category: domain };
	}

	annotateDocument(body: string, defects: readonly Defect[]): string {
		if (defects.length === 0) return body;

		const lines = body.split(/\r?\n/);
		const defectsByLine = new Map<number, Defect[]>();
		const unlocated: Defect[] = [];

		for (const defect of defects) {
			if (defect.line !== undefined && defect.line >= 1 && defect.line <= lines.length) {
				let list = defectsByLine.get(defect.line);
				if (!list) {
					list = [];
					defectsByLine.set(defect.line, list);
				}
				list.push(defect);
			} else {
				unlocated.push(defect);
			}
		}

		const annotatedLines: string[] = [];
		for (let i = 0; i < lines.length; i++) {
			const lineNum = i + 1;
			const lineDefects = defectsByLine.get(lineNum);
			if (lineDefects) {
				for (const d of lineDefects) {
					const fixHint = d.suggestedReplacement ? ` -> Suggestion: "${d.suggestedReplacement}"` : "";
					const domainTag = d.domain ? ` [${d.domain}]` : "";
					annotatedLines.push(`<!-- [UNGROUNDED${domainTag}: ${d.kind} "${d.claim}"${fixHint}] -->`);
				}
			}
			annotatedLines.push(lines[i] as string);
		}

		if (unlocated.length > 0) {
			annotatedLines.push("");
			annotatedLines.push("<!-- [UNGROUNDED CLAIMS AUDIT]");
			for (const u of unlocated) {
				const dom = u.domain ? ` [${u.domain}]` : "";
				annotatedLines.push(`- ${u.kind}${dom}: "${u.claim}" (${u.detail})`);
			}
			annotatedLines.push("-->");
		}

		return annotatedLines.join("\n");
	}

	auditSummary(report: VerificationReport): string {
		const badge =
			report.score.status === "grounded"
				? "[GROUNDED]"
				: report.score.status === "suspect"
					? "[SUSPECT]"
					: "[HALLUCINATED]";

		const lines = [
			`### Verification Audit: ${badge} (${report.groundingConfidence}%)`,
			`- Total Claims: ${report.score.totalClaims}`,
			`- Grounded: ${report.grounded}`,
			`- Defects: ${report.defects.length}`,
			`- Source Coverage: ${Math.round(report.coverage * 100)}%`,
		];

		if (report.score.categoryBreakdown) {
			lines.push("");
			lines.push("#### Domain Breakdown:");
			for (const [dom, detail] of Object.entries(report.score.categoryBreakdown)) {
				lines.push(`- **${dom}**: ${detail.confidence}% [${detail.grounded}/${detail.claims} grounded, ${detail.defects} defects]`);
			}
		}

		if (report.defects.length > 0) {
			lines.push("");
			lines.push("#### Defect Breakdown:");
			for (const defect of report.defects) {
				const rep = defect.suggestedReplacement ? ` (suggested: \`${defect.suggestedReplacement}\`)` : "";
				const dom = defect.domain ? ` [${defect.domain}]` : "";
				lines.push(`- **${defect.kind}**${dom} [${defect.severity ?? "warning"}]: \`${defect.claim}\`${rep}`);
			}
		}

		return lines.join("\n");
	}
}
