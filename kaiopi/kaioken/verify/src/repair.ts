import type {
	RepairContext,
	RepairIteration,
	RepairLoopState,
	RepairPromptPayload,
	StructuredFailure,
} from "./types.ts";

export const MAX_REPAIR_ITERATIONS = 5;

export const REPAIR_PROTOCOL =
	"REPAIR LOOP: read failure verbatim → minimal fix → re-run kaio_verify.\n" +
	"Max 5 iterations; then stop and present failing output to the human.\n" +
	"Never weaken/delete tests to pass. Never mark done on FAIL.";

export const STRICT_REPAIR_RULES = [
	"1. Read failure verbatim: Focus on the exact file, line number, and assertion difference reported.",
	"2. Minimal fix: Make the smallest surgical change to application code that resolves the defect.",
	"3. Test preservation: NEVER weaken, comment out, skip, or delete failing tests to achieve a pass.",
	"4. Grounded integrity: Re-run verification after every fix attempt.",
	"5. Strict halt: If the defect persists after 5 attempts, halt and escalate to human review.",
];

export function buildRepairPrompt(context: RepairContext): RepairPromptPayload {
	const currentIteration = context.iteration;
	const maxIterations = context.maxIterations || MAX_REPAIR_ITERATIONS;
	const canProceed = currentIteration <= maxIterations;

	const failureLines = context.failures.map((f, idx) => {
		const parts: string[] = [];
		parts.push(`[Failure #${idx + 1}]`);
		if (f.file) parts.push(`File: ${f.file}${f.line ? `:${f.line}` : ""}${f.column ? `:${f.column}` : ""}`);
		if (f.testName) parts.push(`Test: "${f.testName}"${f.suiteName ? ` in "${f.suiteName}"` : ""}`);
		if (f.category) parts.push(`Category: ${f.category}`);
		if (f.message) parts.push(`Error: ${f.message}`);
		if (f.diff) {
			if (f.diff.expected !== undefined) parts.push(`  Expected: ${f.diff.expected}`);
			if (f.diff.actual !== undefined) parts.push(`  Received: ${f.diff.actual}`);
			if (f.diff.operator) parts.push(`  Operator: ${f.diff.operator}`);
		}
		if (f.stack && f.stack.length > 0) {
			const userFrames = f.stack.filter((s) => s.isUserCode);
			const targetFrames = userFrames.length > 0 ? userFrames : f.stack.slice(0, 3);
			parts.push("  Stack frames:");
			for (const frame of targetFrames) {
				parts.push(`    at ${frame.symbol || "<anonymous>"} (${frame.file}:${frame.line})`);
			}
		}
		return parts.join("\n");
	});

	const failuresSummary =
		failureLines.length > 0
			? failureLines.join("\n\n")
			: `Exit code ${context.exitCode} with output tail:\n${context.rawTail}`;

	const previousAttemptsNotice =
		context.previousAttempts && context.previousAttempts.length > 0
			? `\n\n### Previous Unsuccessful Attempts\n` +
				context.previousAttempts
					.map(
						(att) =>
							`- Attempt #${att.iteration}: ${att.summary} (failing: ${att.failingTests.join(", ")})`,
					)
					.join("\n") +
				`\nDO NOT repeat the identical changes from previous attempts.`
			: "";

	const systemPrompt =
		`You are Kaioken's automated verification repair agent.\n` +
		`A verification gate has failed. Your task is to analyze the failure diagnostics and apply a minimal, surgical fix.\n\n` +
		`CRITICAL PROTOCOL RULES:\n` +
		STRICT_REPAIR_RULES.map((r) => `- ${r}`).join("\n");

	const userPrompt =
		`## Verification Failure Report [Iteration ${currentIteration} of ${maxIterations}]\n\n` +
		`Command: \`${context.command}\`\n` +
		`Root: \`${context.root}\`\n\n` +
		`### Structured Diagnostic Failures (${context.failures.length})\n\n` +
		`${failuresSummary}` +
		`${previousAttemptsNotice}\n\n` +
		`### Instructions for Fix\n` +
		`1. Inspect the source file and line number cited above.\n` +
		`2. Implement the minimal fix in source code to satisfy the expectation.\n` +
		`3. Verify that no tests were deleted or assertions relaxed.\n` +
		`4. Once applied, kaio_verify will be re-executed automatically.`;

	return {
		systemPrompt,
		userPrompt,
		strictRules: STRICT_REPAIR_RULES,
		iteration: currentIteration,
		maxIterations,
		failuresSummary,
		canProceed,
	};
}

export class RepairLoopManager {
	private readonly maxIterations: number;
	private currentIteration = 0;
	private history: RepairIteration[] = [];

	constructor(maxIterations = MAX_REPAIR_ITERATIONS) {
		this.maxIterations = maxIterations;
	}

	getIteration(): number {
		return this.currentIteration;
	}

	getMaxIterations(): number {
		return this.maxIterations;
	}

	canContinue(): boolean {
		return this.currentIteration < this.maxIterations;
	}

	nextIteration(): number {
		this.currentIteration++;
		return this.currentIteration;
	}

	recordAttempt(iteration: Omit<RepairIteration, "iteration">): RepairIteration {
		const record: RepairIteration = {
			iteration: this.currentIteration,
			...iteration,
		};
		this.history.push(record);
		return record;
	}

	getHistory(): RepairIteration[] {
		return [...this.history];
	}

	generateEscalationReport(command: string, latestFailures: StructuredFailure[]): string {
		const lines = [
			`=== KAIOKEN VERIFICATION REPAIR ESCALATION ===`,
			`Status: FAILED after ${this.currentIteration} iteration(s) (Maximum: ${this.maxIterations})`,
			`Command: ${command}`,
			`Protocol Invariant: Stopped to avoid looping. Human intervention required.`,
			``,
			`Remaining Failures (${latestFailures.length}):`,
			...latestFailures.map((f, i) => {
				const loc = f.file ? `${f.file}${f.line ? `:${f.line}` : ""}` : "unknown";
				const test = f.testName ? ` [${f.testName}]` : "";
				const msg = f.message ? `: ${f.message}` : "";
				return `  ${i + 1}. ${loc}${test}${msg}`;
			}),
			``,
			`Attempt History:`,
			...this.history.map(
				(h) => `  Iteration #${h.iteration}: ${h.summary} (${h.failures.length} failure(s))`,
			),
			`==============================================`,
		];
		return lines.join("\n");
	}
}
