import type { Claim, Defect, VerificationReport } from "./types.ts";

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
		let category: string;
		if (claim.kind === "file") {
			category = "file_path";
		} else if (claim.kind === "symbol") {
			category = "symbol_signature";
		} else if (claim.kind === "anchor" || claim.kind === "excerpt") {
			category = "symbol_signature";
		} else if (claim.kind === "api_param") {
			category = "api_param";
		} else if (claim.kind === "arch_boundary") {
			category = "arch_boundary";
		} else if (claim.kind === "command_example") {
			category = "command_example";
		} else {
			category = "general";
		}

		return { ...claim, category };
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
					annotatedLines.push(`<!-- [UNGROUNDED: ${d.kind} "${d.claim}"${fixHint}] -->`);
				}
			}
			annotatedLines.push(lines[i] as string);
		}

		if (unlocated.length > 0) {
			annotatedLines.push("");
			annotatedLines.push("<!-- [UNGROUNDED CLAIMS AUDIT]");
			for (const u of unlocated) {
				annotatedLines.push(`- ${u.kind}: "${u.claim}" (${u.detail})`);
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

		if (report.defects.length > 0) {
			lines.push("");
			lines.push("#### Defect Breakdown:");
			for (const defect of report.defects) {
				const rep = defect.suggestedReplacement ? ` (suggested: \`${defect.suggestedReplacement}\`)` : "";
				lines.push(`- **${defect.kind}** [${defect.severity ?? "warning"}]: \`${defect.claim}\`${rep}`);
			}
		}

		return lines.join("\n");
	}
}
