import type { KAIOKEN_DIR } from "@kaioken/scan";

export type SupportedRuntime = "node" | "python" | "go" | "rust" | "deno" | "make";

export type PackageManager = "pnpm" | "yarn" | "bun" | "npm" | "deno";

export type GateVerdict = "passed" | "failed" | "unverifiable";

export interface GateCommand {
	id: string;
	label: string;
	command: string;
	source: string;
	runtime?: SupportedRuntime;
	cwd?: string;
	timeoutMs?: number;
	env?: Record<string, string>;
	optional?: boolean;
}

export interface RunOutcome {
	exitCode: number;
	stdout: string;
	stderr: string;
	durationMs: number;
	timedOut?: boolean;
}

export interface CommandRunner {
	run(
		command: string,
		options: {
			cwd: string;
			timeoutMs: number;
			signal?: AbortSignal;
			env?: Record<string, string>;
		},
	): Promise<RunOutcome>;
}

export interface GateResult extends GateCommand {
	ok: boolean;
	exitCode: number;
	durationMs: number;
	timedOut: boolean;
	output: string;
	failures?: (TestFailure | StructuredFailure)[];
}

export interface GateReport {
	verdict: GateVerdict;
	results: GateResult[];
	failed: GateResult[];
	reason?: string;
	durationMs?: number;
}

export interface DetectedCommandsResult {
	commands: GateCommand[];
	source: string;
	runtime: SupportedRuntime | "mixed" | "unknown";
	packageManager?: PackageManager;
}

export type FailureCategory =
	| "assertion"
	| "syntax"
	| "type"
	| "timeout"
	| "panic"
	| "runtime"
	| "unknown";

export interface AssertionDiff {
	expected?: string;
	actual?: string;
	operator?: string;
	rawDiff?: string;
}

export interface StackFrame {
	file: string;
	line: number;
	col?: number;
	symbol?: string;
	isUserCode: boolean;
	raw: string;
}

export interface StructuredFailure {
	file?: string;
	testName?: string;
	suiteName?: string;
	line?: number;
	column?: number;
	message?: string;
	category: FailureCategory;
	diff?: AssertionDiff;
	stack?: StackFrame[];
	rawOutput?: string;
}

export interface TestFailure {
	file?: string;
	testName?: string;
	message?: string;
}

export type StreamChunkType = "stdout" | "stderr" | "status";

export interface StreamChunk {
	type: StreamChunkType;
	text: string;
	timestamp: number;
	commandId?: string;
}

export type StreamListener = (chunk: StreamChunk) => void;

export interface StreamExecutionOptions {
	cwd: string;
	timeoutMs?: number;
	signal?: AbortSignal;
	env?: Record<string, string>;
	onChunk?: StreamListener;
	onLine?: (line: string, type: "stdout" | "stderr") => void;
	maxTailLines?: number;
	maxTailChars?: number;
}

export interface StreamRunResult extends RunOutcome {
	chunksCount: number;
	lineCount: number;
}

export type FlakyClassification = "deterministic_pass" | "deterministic_fail" | "flaky";

export interface FlakyRunAttempt {
	runIndex: number;
	exitCode: number;
	passed: boolean;
	durationMs: number;
	errorSnippet?: string;
}

export interface FlakyTestResult {
	command: string;
	testTarget?: string;
	classification: FlakyClassification;
	totalRuns: number;
	passedRuns: number;
	failedRuns: number;
	flakinessScore: number; // 0.0 (deterministic) to 1.0 (highly intermittent)
	durationVarianceMs: number;
	attempts: FlakyRunAttempt[];
	quarantineHint?: QuarantineHint;
}

export interface QuarantineHint {
	command: string;
	testTarget?: string;
	reason: string;
	recommendedAction: "quarantine" | "fix_timeout" | "investigate_leak";
	suggestedConfigSnippet: string;
}

export interface FlakyAnalysisReport {
	scannedCommands: number;
	flakyCommands: FlakyTestResult[];
	hasFlakes: boolean;
	summary: string;
}

export interface RepairContext {
	root: string;
	command: string;
	exitCode: number;
	failures: StructuredFailure[];
	rawTail: string;
	iteration: number;
	maxIterations: number;
	previousAttempts?: Array<{
		iteration: number;
		summary: string;
		failingTests: string[];
	}>;
}

export interface RepairPromptPayload {
	systemPrompt: string;
	userPrompt: string;
	strictRules: string[];
	iteration: number;
	maxIterations: number;
	failuresSummary: string;
	canProceed: boolean;
}

export interface RepairIteration {
	iteration: number;
	timestamp: number;
	passed: boolean;
	failures: StructuredFailure[];
	summary: string;
	fixedCount?: number;
}

export interface RepairLoopState {
	currentIteration: number;
	maxIterations: number;
	canContinue: boolean;
	history: RepairIteration[];
}

export interface CustomVerifyCommand {
	id?: string;
	label: string;
	command: string;
	runtime?: SupportedRuntime;
	cwd?: string;
	timeoutMs?: number;
	env?: Record<string, string>;
	optional?: boolean;
}

export interface VerifyConfigFile {
	version?: number;
	commands: CustomVerifyCommand[];
	ignoreFlaky?: string[];
	maxFlakyReruns?: number;
	timeoutMs?: number;
	env?: Record<string, string>;
}

export interface VerifyConfigValidationResult {
	valid: boolean;
	errors: string[];
	config?: VerifyConfigFile;
}
