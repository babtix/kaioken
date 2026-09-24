/**
 * Session hard budget ceiling and post-execution token expenditure audit reports.
 *
 * Implements features UX-0431 through UX-0440.
 *
 * Prevents runaway prompt loops by enforcing strict user-defined budget caps
 * and maintaining a chronological session spend ledger.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { TokenEstimate } from "./spend.ts";

export class BudgetExceededError extends Error {
	readonly stage: string;
	readonly currentSpendUsd: number;
	readonly requestedSpendUsd: number;
	readonly ceilingUsd: number;

	constructor(
		stage: string,
		currentSpendUsd: number,
		requestedSpendUsd: number,
		ceilingUsd: number,
	) {
		super(
			`Budget ceiling exceeded on stage "${stage}": current session spend is $${currentSpendUsd.toFixed(4)} USD, ` +
			`dispatch would add ~$${requestedSpendUsd.toFixed(4)} USD, exceeding hard ceiling of $${ceilingUsd.toFixed(4)} USD.`,
		);
		this.name = "BudgetExceededError";
		this.stage = stage;
		this.currentSpendUsd = currentSpendUsd;
		this.requestedSpendUsd = requestedSpendUsd;
		this.ceilingUsd = ceilingUsd;
	}
}

export interface SpendRecord {
	timestamp: string;
	stage: string;
	inputTokens: number;
	outputTokens: number;
	passes: number;
	usd: number;
	model?: string;
}

export interface BudgetCheckResult {
	allowed: boolean;
	currentSpendUsd: number;
	projectedSpendUsd: number;
	ceilingUsd: number | null;
	remainingUsd: number | null;
	warning?: string;
	reason?: string;
}

export interface BudgetSummary {
	totalInputTokens: number;
	totalOutputTokens: number;
	totalPasses: number;
	totalSpendUsd: number;
	recordCount: number;
	ceilingUsd: number | null;
	remainingBudgetUsd: number | null;
	budgetConsumedRatio: number | null;
}

export interface BudgetOptions {
	/** Hard ceiling in USD. When null, budget is unconstrained. */
	hardCeilingUsd?: number | null;
	/** Warning threshold ratio before ceiling (default: 0.8 -> 80%). */
	warningRatio?: number;
	/** Optional directory or file path to persist spend ledger. */
	ledgerPath?: string;
}

/**
 * Manages session spend limits and guards against runaway pipeline loops.
 */
export class BudgetCeilingManager {
	private _hardCeilingUsd: number | null = null;
	private _warningRatio: number = 0.8;
	private _records: SpendRecord[] = [];
	private _ledgerPath?: string;

	constructor(options: BudgetOptions = {}) {
		if (options.hardCeilingUsd !== undefined && options.hardCeilingUsd !== null) {
			this._hardCeilingUsd = Math.max(0, options.hardCeilingUsd);
		}
		if (options.warningRatio !== undefined) {
			this._warningRatio = Math.min(Math.max(options.warningRatio, 0.1), 0.99);
		}
		this._ledgerPath = options.ledgerPath;
	}

	get hardCeilingUsd(): number | null {
		return this._hardCeilingUsd;
	}

	setHardCeiling(usd: number | null): void {
		this._hardCeilingUsd = usd !== null ? Math.max(0, usd) : null;
	}

	get records(): readonly SpendRecord[] {
		return this._records;
	}

	/**
	 * Pre-flight budget check before a model call is dispatched.
	 */
	checkBudget(estimatedSpendUsd: number, stage = "unknown"): BudgetCheckResult {
		const currentSpend = this.getCurrentSpend();
		const projected = currentSpend + Math.max(0, estimatedSpendUsd);
		const ceiling = this._hardCeilingUsd;

		if (ceiling === null) {
			return {
				allowed: true,
				currentSpendUsd: currentSpend,
				projectedSpendUsd: projected,
				ceilingUsd: null,
				remainingUsd: null,
			};
		}

		const remaining = Math.max(0, ceiling - currentSpend);

		if (projected > ceiling) {
			return {
				allowed: false,
				currentSpendUsd: currentSpend,
				projectedSpendUsd: projected,
				ceilingUsd: ceiling,
				remainingUsd: remaining,
				reason: `Dispatch estimated at $${estimatedSpendUsd.toFixed(4)} would exceed hard ceiling ($${ceiling.toFixed(4)}).`,
			};
		}

		let warning: string | undefined;
		if (projected >= ceiling * this._warningRatio) {
			const pct = Math.round((projected / ceiling) * 100);
			warning = `Session budget near capacity: projected spend $${projected.toFixed(4)} reaches ${pct}% of $${ceiling.toFixed(4)} limit.`;
		}

		return {
			allowed: true,
			currentSpendUsd: currentSpend,
			projectedSpendUsd: projected,
			ceilingUsd: ceiling,
			remainingUsd: Math.max(0, ceiling - projected),
			warning,
		};
	}

	/**
	 * Enforces the budget: throws BudgetExceededError if limit is breached.
	 */
	enforceBudget(estimatedSpendUsd: number, stage = "unknown"): void {
		const check = this.checkBudget(estimatedSpendUsd, stage);
		if (!check.allowed && this._hardCeilingUsd !== null) {
			throw new BudgetExceededError(stage, check.currentSpendUsd, estimatedSpendUsd, this._hardCeilingUsd);
		}
	}

	/**
	 * Record an executed dispatch.
	 */
	record(stage: string, tokens: TokenEstimate, usd: number, model?: string): SpendRecord {
		const record: SpendRecord = {
			timestamp: new Date().toISOString(),
			stage,
			inputTokens: tokens.input,
			outputTokens: tokens.output,
			passes: tokens.passes,
			usd: Math.max(0, usd),
			model,
		};
		this._records.push(record);
		return record;
	}

	getCurrentSpend(): number {
		return this._records.reduce((acc, r) => acc + r.usd, 0);
	}

	getRemainingBudget(): number | null {
		if (this._hardCeilingUsd === null) return null;
		return Math.max(0, this._hardCeilingUsd - this.getCurrentSpend());
	}

	summary(): BudgetSummary {
		const totalSpend = this.getCurrentSpend();
		const totalInput = this._records.reduce((acc, r) => acc + r.inputTokens, 0);
		const totalOutput = this._records.reduce((acc, r) => acc + r.outputTokens, 0);
		const totalPasses = this._records.reduce((acc, r) => acc + r.passes, 0);
		const ceiling = this._hardCeilingUsd;
		const remaining = ceiling !== null ? Math.max(0, ceiling - totalSpend) : null;
		const ratio = ceiling !== null && ceiling > 0 ? Math.min(1, totalSpend / ceiling) : null;

		return {
			totalInputTokens: totalInput,
			totalOutputTokens: totalOutput,
			totalPasses: totalPasses,
			totalSpendUsd: totalSpend,
			recordCount: this._records.length,
			ceilingUsd: ceiling,
			remainingBudgetUsd: remaining,
			budgetConsumedRatio: ratio,
		};
	}

	async saveLedger(path?: string): Promise<void> {
		const target = path ?? this._ledgerPath;
		if (!target) return;
		await mkdir(dirname(target), { recursive: true });
		const payload = {
			ceilingUsd: this._hardCeilingUsd,
			summary: this.summary(),
			records: this._records,
		};
		await writeFile(target, JSON.stringify(payload, null, 2), "utf8");
	}

	async loadLedger(path?: string): Promise<boolean> {
		const target = path ?? this._ledgerPath;
		if (!target) return false;
		try {
			const data = await readFile(target, "utf8");
			const parsed = JSON.parse(data);
			if (Array.isArray(parsed.records)) {
				this._records = parsed.records;
			}
			if (typeof parsed.ceilingUsd === "number") {
				this._hardCeilingUsd = parsed.ceilingUsd;
			}
			return true;
		} catch {
			return false;
		}
	}
}

/**
 * Format a post-execution token expenditure audit report.
 */
export function formatSpendAuditReport(records: readonly SpendRecord[], budgetLimit?: number | null): string {
	if (records.length === 0) {
		return "Kaioken Spend Audit Ledger: No recorded model dispatches in current session.";
	}

	const header = "=== Kaioken Session Spend Audit Ledger ===";
	const wTime = 20;
	const wStage = 16;
	const wIn = 12;
	const wOut = 12;
	const wPasses = 8;
	const wCost = 12;
	const wTotal = 12;

	const colHeader = `${"Timestamp".padEnd(wTime)} ${"Stage".padEnd(wStage)} ${"In Tokens".padEnd(wIn)} ${"Out Tokens".padEnd(wOut)} ${"Passes".padEnd(wPasses)} ${"Cost ($)".padEnd(wCost)} ${"Running ($)".padEnd(wTotal)}`;
	const divider = "─".repeat(colHeader.length);

	let running = 0;
	let totalIn = 0;
	let totalOut = 0;
	let totalPasses = 0;

	const rows = records.map((r) => {
		running += r.usd;
		totalIn += r.inputTokens;
		totalOut += r.outputTokens;
		totalPasses += r.passes;
		const timeStr = r.timestamp.slice(11, 19);
		return `${timeStr.padEnd(wTime)} ${r.stage.padEnd(wStage)} ${r.inputTokens.toLocaleString().padEnd(wIn)} ${r.outputTokens.toLocaleString().padEnd(wOut)} ${String(r.passes).padEnd(wPasses)} ${`$${r.usd.toFixed(4)}`.padEnd(wCost)} ${`$${running.toFixed(4)}`.padEnd(wTotal)}`;
	});

	const summaryLines = [
		divider,
		`Total Dispatches: ${records.length} | In: ~${totalIn.toLocaleString()} | Out: ~${totalOut.toLocaleString()} | Total Cost: $${running.toFixed(4)} USD`,
	];

	if (budgetLimit !== undefined && budgetLimit !== null && budgetLimit > 0) {
		const pct = Math.min(100, Math.round((running / budgetLimit) * 100));
		const remaining = Math.max(0, budgetLimit - running);
		summaryLines.push(
			`Budget Ceiling:   $${budgetLimit.toFixed(4)} USD | Consumed: ${pct}% | Remaining: $${remaining.toFixed(4)} USD`,
		);
	}

	return [header, divider, colHeader, divider, ...rows, ...summaryLines].join("\n");
}
