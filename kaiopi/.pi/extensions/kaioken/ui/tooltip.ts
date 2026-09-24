/**
 * Floating hover tooltip popover explaining HUD telemetry status metrics.
 *
 * Implements Step 19.4 (Features #UX-0231 - #UX-0240).
 * Formats multi-line bordered popover cards with threshold explanations and shortcut hints.
 */
import { bold, dim, fg, type Painter, type Role } from "./theme.ts";
import { visibleWidth, pad } from "./logo.ts";

export interface StatusTooltip {
	id: string;
	title: string;
	value: string;
	description: string;
	threshold?: string;
	shortcut?: string;
	severity?: "ok" | "warn" | "error" | "info";
}

export interface TooltipBoxOptions {
	maxWidth?: number;
	unicode?: boolean;
	minWidth?: number;
}

/** Standard dictionary of telemetry metric explanations. */
export const METRIC_TOOLTIPS: Record<string, Omit<StatusTooltip, "value">> = {
	tokenVelocity: {
		id: "tokenVelocity",
		title: "Token Spend Velocity",
		description: "Real-time rate of model token consumption per second across active streams.",
		threshold: "Nominal: <200 tok/s | Warning: >200 tok/s | Throttle: >500 tok/s",
		shortcut: "Run /kaio-status or adjust multiplier with ×N",
	},
	freshnessRatio: {
		id: "freshnessRatio",
		title: "Repository Freshness Ratio",
		description: "Percentage of living documentation whose source code hashes remain unmodified.",
		threshold: "Optimal: >=80% | Drift: 50%-79% | Critical: <50%",
		shortcut: "Run /kaio-provenance or /kaio-update to refresh stale docs",
	},
	worktreeStatus: {
		id: "worktreeStatus",
		title: "Git Worktree & Working Tree",
		description: "Active git branch, scratch worktree isolation state, and uncommitted edits.",
		threshold: "Clean: 0 changes | Dirty: unverified modifications present",
		shortcut: "Run /kaio-delegate to run in isolated worktree",
	},
	contextWindow: {
		id: "contextWindow",
		title: "Model Context Utilization",
		description: "Percentage of active model context window consumed by conversation & files.",
		threshold: "Safe: <70% | Warning: 70%-90% | Overflow risk: >90%",
		shortcut: "Use /kaio-search or /kaio-card for bounded symbol excerpts",
	},
	knowledgeCards: {
		id: "knowledgeCards",
		title: "Atomic Fact Base",
		description: "Pre-indexed knowledge cards citing verified symbols and ground-truth line ranges.",
		threshold: "Grounding target: 100% verified citations",
		shortcut: "Run /kaio-cards to re-index cards",
	},
	agentSkills: {
		id: "agentSkills",
		title: "Agent Skills & Procedures",
		description: "Discovered automation procedures loaded from package scripts, Makefiles, and .agents.",
		threshold: "Validation: YAML frontmatter and schema verification",
		shortcut: "Run /kaio-skills to generate new procedures",
	},
};

/**
 * Retrieve a populated status tooltip definition with optional value overrides.
 */
export function getMetricTooltip(
	id: string,
	value = "N/A",
	overrides: Partial<StatusTooltip> = {},
): StatusTooltip | undefined {
	const base = METRIC_TOOLTIPS[id];
	if (!base) return undefined;
	return {
		...base,
		value,
		...overrides,
	};
}

/**
 * Wrap a single text string into multiple lines fitting inside `width`.
 */
function wrapText(text: string, width: number): string[] {
	if (width <= 0) return [text];
	const words = text.split(/\s+/);
	const lines: string[] = [];
	let current = "";

	for (const word of words) {
		if (!word) continue;
		if (!current) {
			current = word;
		} else if (current.length + 1 + word.length <= width) {
			current += ` ${word}`;
		} else {
			lines.push(current);
			current = word;
		}
	}
	if (current) lines.push(current);
	return lines.length > 0 ? lines : [""];
}

/**
 * Render a bordered floating tooltip card.
 */
export function renderTooltipBox(
	tooltip: StatusTooltip,
	paint?: Painter,
	options: TooltipBoxOptions = {},
): string[] {
	const unicode = options.unicode ?? true;
	const maxWidth = Math.max(30, options.maxWidth ?? 60);
	const minWidth = Math.max(20, options.minWidth ?? 36);

	const bTopLeft = unicode ? "╭─" : "+-";
	const bTopRight = unicode ? "╮" : "+";
	const bBottomLeft = unicode ? "╰─" : "+-";
	const bBottomRight = unicode ? "╯" : "+";
	const bHoriz = unicode ? "─" : "-";
	const bVert = unicode ? "│" : "|";

	const headerLabel = `[${tooltip.title}]`;
	const valLabel = `Value: ${tooltip.value}`;

	// Collect raw text rows to determine required inner width
	const rawRows: string[] = [valLabel];

	const innerWidthLimit = maxWidth - 4;
	const descLines = wrapText(tooltip.description, innerWidthLimit);
	rawRows.push(...descLines);

	if (tooltip.threshold) {
		rawRows.push(...wrapText(`Alert: ${tooltip.threshold}`, innerWidthLimit));
	}
	if (tooltip.shortcut) {
		rawRows.push(...wrapText(`Hint: ${tooltip.shortcut}`, innerWidthLimit));
	}

	let innerWidth = minWidth;
	for (const row of rawRows) {
		innerWidth = Math.max(innerWidth, visibleWidth(row));
	}
	innerWidth = Math.max(innerWidth, visibleWidth(headerLabel) + 2);
	innerWidth = Math.min(innerWidth, innerWidthLimit);

	// Construct top border
	const topHeader = `${bTopLeft} ${headerLabel} `;
	const topRemaining = Math.max(0, innerWidth + 2 - visibleWidth(topHeader));
	const topBorder = `${topHeader}${bHoriz.repeat(topRemaining)}${bTopRight}`;

	// Construct bottom border
	const bottomBorder = `${bBottomLeft}${bHoriz.repeat(Math.max(0, innerWidth + 2 - visibleWidth(bBottomLeft)))}${bBottomRight}`;

	const output: string[] = [];

	if (paint) {
		output.push(bold(paint, fg(paint, "accent", topBorder)));
	} else {
		output.push(topBorder);
	}

	// Value row
	const valPadded = pad(` ${valLabel}`, innerWidth + 2);
	if (paint) {
		const severityToRole: Record<string, Role> = { ok: "ok", warn: "warn", error: "error", info: "accent" };
		const valRole: Role = severityToRole[tooltip.severity ?? "ok"] ?? "ok";
		output.push(`${dim(paint, bVert)}${fg(paint, valRole, valPadded)}${dim(paint, bVert)}`);
	} else {
		output.push(`${bVert}${valPadded}${bVert}`);
	}

	// Divider
	const divider = `${bVert}${bHoriz.repeat(innerWidth + 2)}${bVert}`;
	output.push(paint ? dim(paint, divider) : divider);

	// Description lines
	for (const line of descLines) {
		const padded = pad(` ${line}`, innerWidth + 2);
		output.push(paint ? `${dim(paint, bVert)}${fg(paint, "text", padded)}${dim(paint, bVert)}` : `${bVert}${padded}${bVert}`);
	}

	// Optional threshold lines
	if (tooltip.threshold) {
		const threshLines = wrapText(`Alert: ${tooltip.threshold}`, innerWidth);
		for (const line of threshLines) {
			const padded = pad(` ${line}`, innerWidth + 2);
			output.push(paint ? `${dim(paint, bVert)}${fg(paint, "warn", padded)}${dim(paint, bVert)}` : `${bVert}${padded}${bVert}`);
		}
	}

	// Optional hint lines
	if (tooltip.shortcut) {
		const hintLines = wrapText(`Hint: ${tooltip.shortcut}`, innerWidth);
		for (const line of hintLines) {
			const padded = pad(` ${line}`, innerWidth + 2);
			output.push(paint ? `${dim(paint, bVert)}${dim(paint, padded)}${dim(paint, bVert)}` : `${bVert}${padded}${bVert}`);
		}
	}

	if (paint) {
		output.push(bold(paint, fg(paint, "accent", bottomBorder)));
	} else {
		output.push(bottomBorder);
	}

	return output;
}
