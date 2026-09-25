import { describe, expect, it } from "vitest";
import {
	ALL_TRANSCRIPT_TARGET_KINDS,
	TRANSCRIPT_TARGET_METADATA,
	type TranscriptTargetKind,
	buildCopySnippetButtonModel,
	formatCopySnippetButton,
	renderInlineUnifiedDiffView,
	renderPhaseBreadcrumbTrail,
} from "../commands/index.ts";

describe("Step 37: Category 02 — Chat Transcript & Interactive Output Stream (UX-0151 – UX-0200)", () => {
	it("defines all 20 canonical transcript target kinds", () => {
		expect(ALL_TRANSCRIPT_TARGET_KINDS).toHaveLength(20);
		for (const target of ALL_TRANSCRIPT_TARGET_KINDS) {
			const meta = TRANSCRIPT_TARGET_METADATA[target];
			expect(meta).toBeDefined();
			expect(meta.title.length).toBeGreaterThan(0);
			expect(meta.defaultLanguage.length).toBeGreaterThan(0);
			expect(meta.defaultPhases.length).toBeGreaterThanOrEqual(3);
		}
	});

	/* -------------------------------------------------------------------------- */
	/* Theme 1: One-Click Copy-to-Clipboard Code Snippet Button (UX-0151 – UX-0160) */
	/* -------------------------------------------------------------------------- */
	describe("Theme 1: One-click copy-to-clipboard code snippet button (UX-0151 – UX-0160)", () => {
		const testCases: Array<{ target: TranscriptTargetKind; uxId: string }> = [
			{ target: "repo-scan-risks", uxId: "UX-0151" },
			{ target: "dependency-graph-outlines", uxId: "UX-0152" },
			{ target: "spend-confirmation-breakdowns", uxId: "UX-0153" },
			{ target: "error-diagnostic-backtraces", uxId: "UX-0154" },
			{ target: "background-hook-logs", uxId: "UX-0155" },
			{ target: "token-budgeting-summaries", uxId: "UX-0156" },
			{ target: "multi-language-parse-warnings", uxId: "UX-0157" },
			{ target: "cross-chapter-link-audits", uxId: "UX-0158" },
			{ target: "file-secret-detection-summaries", uxId: "UX-0159" },
			{ target: "interactive-prompt-dialogue", uxId: "UX-0160" },
		];

		for (const { target, uxId } of testCases) {
			it(`[${uxId}] formats copy snippet button and OSC 52 sequence for ${target}`, () => {
				const sampleCode = `console.log("Snippet data for ${target}");`;
				const model = buildCopySnippetButtonModel(target, sampleCode);

				expect(model.target).toBe(target);
				expect(model.cleanCode).toBe(sampleCode);
				expect(model.osc52Sequence).toContain("\x1b]52;c;"); // Valid OSC 52 escape sequence
				expect(model.lineCount).toBe(1);

				const formatted = formatCopySnippetButton(target, sampleCode);
				expect(formatted).toContain(model.buttonLabel);
				expect(formatted).toContain(sampleCode);
				expect(formatted).toContain(model.osc52Sequence);
			});
		}
	});

	/* -------------------------------------------------------------------------- */
	/* Theme 2: Syntax-Highlighted Inline Unified Diff View (UX-0161 – UX-0180)    */
	/* -------------------------------------------------------------------------- */
	describe("Theme 2: Syntax-highlighted inline unified diff view (UX-0161 – UX-0180)", () => {
		const testCases: Array<{ target: TranscriptTargetKind; uxId: string }> = [
			{ target: "module-planning-output", uxId: "UX-0161" },
			{ target: "knowledge-card-logs", uxId: "UX-0162" },
			{ target: "wiki-chapter-streaming", uxId: "UX-0163" },
			{ target: "search-hit-listings", uxId: "UX-0164" },
			{ target: "git-worktree-merges", uxId: "UX-0165" },
			{ target: "verification-test-outputs", uxId: "UX-0166" },
			{ target: "web-research-citations", uxId: "UX-0167" },
			{ target: "skill-compilation-logs", uxId: "UX-0168" },
			{ target: "staleness-drift-audits", uxId: "UX-0169" },
			{ target: "ast-symbol-query-hits", uxId: "UX-0170" },
			{ target: "repo-scan-risks", uxId: "UX-0171" },
			{ target: "dependency-graph-outlines", uxId: "UX-0172" },
			{ target: "spend-confirmation-breakdowns", uxId: "UX-0173" },
			{ target: "error-diagnostic-backtraces", uxId: "UX-0174" },
			{ target: "background-hook-logs", uxId: "UX-0175" },
			{ target: "token-budgeting-summaries", uxId: "UX-0176" },
			{ target: "multi-language-parse-warnings", uxId: "UX-0177" },
			{ target: "cross-chapter-link-audits", uxId: "UX-0178" },
			{ target: "file-secret-detection-summaries", uxId: "UX-0179" },
			{ target: "interactive-prompt-dialogue", uxId: "UX-0180" },
		];

		const sampleDiff = `--- a/file.ts
+++ b/file.ts
@@ -1,3 +1,3 @@
-const oldVal = 1;
+const newVal = 2;
 const unchanged = true;
`;

		for (const { target, uxId } of testCases) {
			it(`[${uxId}] renders syntax-highlighted inline unified diff view for ${target}`, () => {
				const diffView = renderInlineUnifiedDiffView(target, sampleDiff);

				expect(diffView.target).toBe(target);
				expect(diffView.summary.additions).toBe(1);
				expect(diffView.summary.deletions).toBe(1);
				expect(diffView.formattedView).toContain("+1 -1");
				expect(diffView.formattedView).toContain("newVal");
				expect(diffView.formattedView).toContain("oldVal");
			});
		}
	});

	/* -------------------------------------------------------------------------- */
	/* Theme 3: Interactive Breadcrumb Trail Indicating Phase (UX-0181 – UX-0200) */
	/* -------------------------------------------------------------------------- */
	describe("Theme 3: Interactive breadcrumb trail indicating active phase (UX-0181 – UX-0200)", () => {
		const testCases: Array<{ target: TranscriptTargetKind; uxId: string }> = [
			{ target: "module-planning-output", uxId: "UX-0181" },
			{ target: "knowledge-card-logs", uxId: "UX-0182" },
			{ target: "wiki-chapter-streaming", uxId: "UX-0183" },
			{ target: "search-hit-listings", uxId: "UX-0184" },
			{ target: "git-worktree-merges", uxId: "UX-0185" },
			{ target: "verification-test-outputs", uxId: "UX-0186" },
			{ target: "web-research-citations", uxId: "UX-0187" },
			{ target: "skill-compilation-logs", uxId: "UX-0188" },
			{ target: "staleness-drift-audits", uxId: "UX-0189" },
			{ target: "ast-symbol-query-hits", uxId: "UX-0190" },
			{ target: "repo-scan-risks", uxId: "UX-0191" },
			{ target: "dependency-graph-outlines", uxId: "UX-0192" },
			{ target: "spend-confirmation-breakdowns", uxId: "UX-0193" },
			{ target: "error-diagnostic-backtraces", uxId: "UX-0194" },
			{ target: "background-hook-logs", uxId: "UX-0195" },
			{ target: "token-budgeting-summaries", uxId: "UX-0196" },
			{ target: "multi-language-parse-warnings", uxId: "UX-0197" },
			{ target: "cross-chapter-link-audits", uxId: "UX-0198" },
			{ target: "file-secret-detection-summaries", uxId: "UX-0199" },
			{ target: "interactive-prompt-dialogue", uxId: "UX-0200" },
		];

		for (const { target, uxId } of testCases) {
			it(`[${uxId}] renders interactive phase breadcrumb trail for ${target}`, () => {
				const phases = TRANSCRIPT_TARGET_METADATA[target].defaultPhases;
				const activePhase = phases[1] as string; // Second phase active

				const trail = renderPhaseBreadcrumbTrail(target, activePhase);

				expect(trail.target).toBe(target);
				expect(trail.activePhase).toBe(activePhase);
				expect(trail.milestones).toHaveLength(phases.length);
				// First milestone should be completed
				expect(trail.milestones[0]?.status).toBe("completed");
				// Second milestone should be active
				expect(trail.milestones[1]?.status).toBe("active");
				// Third milestone should be pending
				if (phases.length > 2) {
					expect(trail.milestones[2]?.status).toBe("pending");
				}

				expect(trail.renderedTrail).toContain(TRANSCRIPT_TARGET_METADATA[target].title);
				expect(trail.renderedTrail).toContain(activePhase);
			});
		}
	});
});
