/**
 * Zero-cost offline mode badge and bypass savings indicator.
 *
 * Implements features UX-0441 through UX-0450.
 *
 * Displays visual badges and calculates financial savings when model
 * inference is bypassed in favor of deterministic local heuristics,
 * AST symbol indexes, or cached verification.
 */
import type { ModelCost } from "@earendil-works/pi-ai";
import { estimateSpend, type SpendEstimate, type TokenEstimate } from "./spend.ts";

export interface OfflineBadgeOptions {
	/** Action or stage being executed offline. */
	stage?: string;
	/** Reason inference was bypassed (e.g. "deterministic AST cluster", "cached fact cards"). */
	reason?: string;
	/** Avoid box drawing characters when true. Default: false */
	asciiOnly?: boolean;
	/** Estimated tokens that would have been consumed if run online. */
	bypassedTokens?: TokenEstimate;
	/** Benchmark model cost to show savings against (e.g. Gemini 2.5 Flash / Claude 3.7). */
	benchmarkCost?: ModelCost;
}

/**
 * Checks whether an execution mode is offline / 0-cost.
 */
export function isOfflineExecution(client?: unknown): boolean {
	if (client === null || client === undefined) return true;
	if (typeof client === "object" && client !== null) {
		const obj = client as Record<string, unknown>;
		if (obj.offline === true || obj.isOffline === true || obj.mode === "offline") {
			return true;
		}
	}
	return false;
}

/**
 * Calculates how much dollar spend was saved by running offline.
 */
export function calculateOfflineSavings(
	bypassedTokens: TokenEstimate,
	benchmarkCost: ModelCost = { input: 0.15, output: 0.60, cacheRead: 0.03, cacheWrite: 0.15 },
): { savedTokens: TokenEstimate; savedUsd: number } {
	const spend: SpendEstimate = estimateSpend(benchmarkCost, bypassedTokens);
	return {
		savedTokens: bypassedTokens,
		savedUsd: spend.usd ?? 0,
	};
}

/**
 * Render a zero-cost offline mode badge.
 */
export function formatOfflineModeBadge(options: OfflineBadgeOptions = {}): string {
	const stageLabel = options.stage ? ` [${options.stage}]` : "";
	const reason = options.reason ?? "deterministic local heuristics / cached artifacts";
	const width = 64;

	if (options.asciiOnly) {
		const border = "-".repeat(width);
		const lines = [
			`+${border}+`,
			`| [0-COST OFFLINE MODE]${stageLabel}`.padEnd(width + 1) + "|",
			`| Model inference bypassed via ${reason.slice(0, 30)}`.padEnd(width + 1) + "|",
			`| Billed Tokens: 0 in / 0 out | Cost: $0.0000 USD`.padEnd(width + 1) + "|",
		];
		if (options.bypassedTokens) {
			const savings = calculateOfflineSavings(options.bypassedTokens, options.benchmarkCost);
			lines.push(`| Avoided Spend: ~$${savings.savedUsd.toFixed(4)} USD (~${savings.savedTokens.input.toLocaleString()} in / ~${savings.savedTokens.output.toLocaleString()} out)`.padEnd(width + 1) + "|");
		}
		lines.push(`+${border}+`);
		return lines.join("\n");
	}

	const border = "─".repeat(width);
	const lines = [
		`┌${border}┐`,
		`│ ⚡ ZERO-COST OFFLINE MODE${stageLabel}`.padEnd(width) + "│",
		`│ Inference bypassed: ${reason.slice(0, 40)}`.padEnd(width) + "│",
		`│ Billed Tokens: 0 in / 0 out  •  Cost: $0.0000 USD`.padEnd(width) + "│",
	];

	if (options.bypassedTokens) {
		const savings = calculateOfflineSavings(options.bypassedTokens, options.benchmarkCost);
		lines.push(`│ Avoided Spend: ~$${savings.savedUsd.toFixed(4)} USD (~${savings.savedTokens.input.toLocaleString()} in / ~${savings.savedTokens.output.toLocaleString()} out)`.padEnd(width) + "│");
	}

	lines.push(`└${border}┘`);
	return lines.join("\n");
}
