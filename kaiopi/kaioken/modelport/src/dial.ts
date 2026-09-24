/**
 * Interactive spend multiplier dial (×1 to ×10) and confirmation prompt formatter.
 *
 * Implements features UX-0411 through UX-0420.
 *
 * Visualizes the critical phase shift at BREADTH_THRESHOLD (×5):
 *  - Below ×5: Breadth Expansion (more modules, more cards, more declarations)
 *  - At ×5: Breadth Threshold where scrutiny begins
 *  - Above ×5: Deep Scrutiny (adversarial self-critique and defect repair passes)
 */
import {
	BREADTH_THRESHOLD,
	depthFor,
	MAX_MULTIPLIER,
	MIN_MULTIPLIER,
	parseMultiplier,
	type Depth,
} from "./port.ts";
import type { SpendEstimate } from "./spend.ts";

export interface DialFormatOptions {
	/** Include depth metrics (target modules, key points, declarations). Default: true */
	showMetrics?: boolean;
	/** Include pass counts (repair passes, critique passes). Default: true */
	showPasses?: boolean;
	/** Include ANSI color codes if terminal supports them. Default: false */
	useColor?: boolean;
	/** Optional spend estimate to show alongside dial. */
	estimate?: SpendEstimate;
}

export type MultiplierMode = "breadth" | "threshold" | "scrutiny";

export function getMultiplierMode(multiplier: number): MultiplierMode {
	const n = Math.min(Math.max(multiplier, MIN_MULTIPLIER), MAX_MULTIPLIER);
	if (n < BREADTH_THRESHOLD) return "breadth";
	if (n === BREADTH_THRESHOLD) return "threshold";
	return "scrutiny";
}

export function describeMultiplierMode(mode: MultiplierMode): string {
	switch (mode) {
		case "breadth":
			return "Breadth Expansion (more modules & surface detail)";
		case "threshold":
			return "Balanced (breadth peak + scrutiny initiation)";
		case "scrutiny":
			return "Deep Scrutiny (adversarial critique & repair passes)";
	}
}

/**
 * Format a visual ASCII/Unicode dial gauge for a given multiplier (1 to 10).
 *
 * Example: `[◆◆◆◆◆◇◇◇◇◇] ×5 (Balanced)`
 */
export function renderDialGauge(multiplier: number): string {
	const n = Math.min(Math.max(multiplier, MIN_MULTIPLIER), MAX_MULTIPLIER);
	const filled = "◆".repeat(n);
	const empty = "◇".repeat(MAX_MULTIPLIER - n);
	return `[${filled}${empty}] ×${n}`;
}

/**
 * Renders the full multiplier dial breakdown card.
 */
export function formatMultiplierDial(multiplier: number, options: DialFormatOptions = {}): string {
	const n = Math.min(Math.max(multiplier, MIN_MULTIPLIER), MAX_MULTIPLIER);
	const depth: Depth = depthFor(n);
	const mode = getMultiplierMode(n);
	const modeLabel = describeMultiplierMode(mode);
	const gauge = renderDialGauge(n);

	const lines: string[] = [
		`Spend Multiplier Dial: ${gauge}`,
		`Phase: ${modeLabel}`,
	];

	if (options.showMetrics !== false) {
		lines.push(
			`Target Modules: ~${depth.targetModules} | Key Points/Card: ${depth.keyPoints} | Decls/File: ${depth.declarationsPerFile}`,
		);
	}

	if (options.showPasses !== false) {
		lines.push(
			`Correction Passes: ${depth.repairPasses} | Critique Passes: ${depth.critiquePasses} | Output Budget: ~${depth.maxOutputTokens.toLocaleString()} tokens/pass`,
		);
	}

	if (options.estimate) {
		const est = options.estimate;
		const cost = est.usd === null ? "unknown" : `$${est.usd.toFixed(4)} USD`;
		lines.push(
			`Estimated Consumption: ~${est.input.toLocaleString()} in / ~${est.output.toLocaleString()} out across ${est.passes} pass(es) [${cost}]`,
		);
	}

	return lines.join("\n");
}

/**
 * Enhanced confirmation prompt integrating the dial, model, tokens, and cost.
 */
export function formatSpendConfirmationPrompt(
	action: string,
	multiplier: number,
	estimate: SpendEstimate,
	modelLabel: string,
): string {
	const n = Math.min(Math.max(multiplier, MIN_MULTIPLIER), MAX_MULTIPLIER);
	const gauge = renderDialGauge(n);
	const mode = describeMultiplierMode(getMultiplierMode(n));
	const costStr =
		estimate.usd === null
			? `unknown (${estimate.unavailableReason ?? "pricing unavailable"})`
			: `~$${estimate.usd.toFixed(4)} USD`;

	const border = "═".repeat(64);

	return [
		`╔${border}╗`,
		`║ Kaioken Spend Confirmation — Stage: ${action.padEnd(41)}║`,
		`╠${border}╣`,
		`║ Multiplier: ${gauge.padEnd(50)}║`,
		`║ Mode:       ${mode.slice(0, 50).padEnd(50)}║`,
		`║ Model:      ${modelLabel.slice(0, 50).padEnd(50)}║`,
		`║ Tokens:     ~${estimate.input.toLocaleString()} in / ~${estimate.output.toLocaleString()} out (${estimate.passes} passes)`.padEnd(65) + "║",
		`║ Est. Cost:  ${costStr.padEnd(50)}║`,
		`║ Notice:     Upper bound estimate, not a contract quote.       ║`,
		`╚${border}╝`,
		"Proceed with execution? [y/N]",
	].join("\n");
}

/**
 * Stateful controller for interactive terminal dial adjustment.
 */
export class SpendMultiplierDial {
	private _multiplier: number;

	constructor(initial: number = MIN_MULTIPLIER) {
		this._multiplier = parseMultiplier(initial) ?? MIN_MULTIPLIER;
	}

	get multiplier(): number {
		return this._multiplier;
	}

	set(val: number): void {
		this._multiplier = Math.min(Math.max(val, MIN_MULTIPLIER), MAX_MULTIPLIER);
	}

	increment(): number {
		if (this._multiplier < MAX_MULTIPLIER) {
			this._multiplier++;
		}
		return this._multiplier;
	}

	decrement(): number {
		if (this._multiplier > MIN_MULTIPLIER) {
			this._multiplier--;
		}
		return this._multiplier;
	}

	getDepth(): Depth {
		return depthFor(this._multiplier);
	}

	getMode(): MultiplierMode {
		return getMultiplierMode(this._multiplier);
	}

	render(options?: DialFormatOptions): string {
		return formatMultiplierDial(this._multiplier, options);
	}
}
