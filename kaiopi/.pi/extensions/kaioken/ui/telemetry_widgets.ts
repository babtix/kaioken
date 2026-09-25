/**
 * Step 39: Category 03 — HUD, Status Bar & Dynamic Widgets (UX-0251 – UX-0300).
 *
 * Implements:
 * 1. Interactive status bar click/hover trigger popovers (UX-0251 – UX-0260).
 * 2. Persistent background progress indicators tracking real-time telemetry (UX-0261 – UX-0280).
 * 3. Color-shifting warning badges indicating critical thresholds (UX-0281 – UX-0300).
 */

import { supportsUnicode } from "./glyphs.ts";

/**
 * 20 Canonical Telemetry Channels defined in Step 39 (UX-0251 – UX-0300).
 */
export type TelemetryChannelKind =
	| "system-memory-rss"
	| "model-roundtrip-latency"
	| "detected-test-framework"
	| "active-git-hooks"
	| "discovered-agent-skills"
	| "generated-wiki-chapters"
	| "indexed-knowledge-cards"
	| "secret-scanner-alerts"
	| "web-research-quota"
	| "live-sse-clients"
	| "context-window-utilization"
	| "token-spend-velocity"
	| "repo-file-freshness"
	| "git-working-tree-dirty"
	| "in-flight-background-tasks"
	| "http-preview-server-health"
	| "staleness-index-percentage"
	| "claim-grounding-ratio"
	| "worktree-task-branch"
	| "symbol-index-cache-rate";

export const ALL_TELEMETRY_CHANNEL_KINDS: readonly TelemetryChannelKind[] = [
	"system-memory-rss",
	"model-roundtrip-latency",
	"detected-test-framework",
	"active-git-hooks",
	"discovered-agent-skills",
	"generated-wiki-chapters",
	"indexed-knowledge-cards",
	"secret-scanner-alerts",
	"web-research-quota",
	"live-sse-clients",
	"context-window-utilization",
	"token-spend-velocity",
	"repo-file-freshness",
	"git-working-tree-dirty",
	"in-flight-background-tasks",
	"http-preview-server-health",
	"staleness-index-percentage",
	"claim-grounding-ratio",
	"worktree-task-branch",
	"symbol-index-cache-rate",
] as const;

export interface TelemetryChannelMetadata {
	kind: TelemetryChannelKind;
	name: string;
	unit: string;
	warningThreshold: number;
	criticalThreshold: number;
	higherIsWorse: boolean;
	description: string;
}

export const TELEMETRY_CHANNEL_METADATA: Record<TelemetryChannelKind, TelemetryChannelMetadata> = {
	"system-memory-rss": {
		kind: "system-memory-rss",
		name: "System Memory RSS Overhead",
		unit: "MB",
		warningThreshold: 1024,
		criticalThreshold: 2048,
		higherIsWorse: true,
		description: "Resident set size memory overhead of node process.",
	},
	"model-roundtrip-latency": {
		kind: "model-roundtrip-latency",
		name: "Model Request Round-Trip Latency",
		unit: "ms",
		warningThreshold: 2500,
		criticalThreshold: 5000,
		higherIsWorse: true,
		description: "Round-trip HTTP request latency to model inference provider.",
	},
	"detected-test-framework": {
		kind: "detected-test-framework",
		name: "Detected Test Framework",
		unit: "version",
		warningThreshold: 1,
		criticalThreshold: 0,
		higherIsWorse: false,
		description: "Auto-detected project test runner and version configuration.",
	},
	"active-git-hooks": {
		kind: "active-git-hooks",
		name: "Active Git Hooks Execution State",
		unit: "hooks",
		warningThreshold: 2,
		criticalThreshold: 4,
		higherIsWorse: true,
		description: "Concurrent in-flight git hook execution runners.",
	},
	"discovered-agent-skills": {
		kind: "discovered-agent-skills",
		name: "Discovered Agent Skills",
		unit: "skills",
		warningThreshold: 5,
		criticalThreshold: 1,
		higherIsWorse: false,
		description: "Total executable autonomous procedure recipes discovered.",
	},
	"generated-wiki-chapters": {
		kind: "generated-wiki-chapters",
		name: "Generated Wiki Chapters",
		unit: "chapters",
		warningThreshold: 3,
		criticalThreshold: 0,
		higherIsWorse: false,
		description: "Synthesized markdown documentation chapters.",
	},
	"indexed-knowledge-cards": {
		kind: "indexed-knowledge-cards",
		name: "Indexed Knowledge Cards",
		unit: "cards",
		warningThreshold: 10,
		criticalThreshold: 0,
		higherIsWorse: false,
		description: "Atomic fact cards indexed across symbols and boundaries.",
	},
	"secret-scanner-alerts": {
		kind: "secret-scanner-alerts",
		name: "Secret Scanner Risk Alert Counter",
		unit: "alerts",
		warningThreshold: 1,
		criticalThreshold: 3,
		higherIsWorse: true,
		description: "High-entropy secrets, private keys, or credentials detected.",
	},
	"web-research-quota": {
		kind: "web-research-quota",
		name: "Web Research Quota and Rate Limits",
		unit: "%",
		warningThreshold: 75,
		criticalThreshold: 90,
		higherIsWorse: true,
		description: "Percentage of search provider rate limit quota consumed.",
	},
	"live-sse-clients": {
		kind: "live-sse-clients",
		name: "Live SSE Connected Client Count",
		unit: "clients",
		warningThreshold: 5,
		criticalThreshold: 10,
		higherIsWorse: true,
		description: "Active server-sent events browser preview connections.",
	},
	"context-window-utilization": {
		kind: "context-window-utilization",
		name: "Model Context Window Utilization",
		unit: "%",
		warningThreshold: 70,
		criticalThreshold: 85,
		higherIsWorse: true,
		description: "Fraction of maximum token context window consumed.",
	},
	"token-spend-velocity": {
		kind: "token-spend-velocity",
		name: "Token Spend Velocity",
		unit: "tokens/sec",
		warningThreshold: 100,
		criticalThreshold: 250,
		higherIsWorse: true,
		description: "Instantaneous token consumption burn rate per second.",
	},
	"repo-file-freshness": {
		kind: "repo-file-freshness",
		name: "Repository File Count Freshness Ratio",
		unit: "%",
		warningThreshold: 70,
		criticalThreshold: 50,
		higherIsWorse: false,
		description: "Percentage of repository documents matching active hashes.",
	},
	"git-working-tree-dirty": {
		kind: "git-working-tree-dirty",
		name: "Unverified Git Working Tree Dirty Status",
		unit: "files",
		warningThreshold: 1,
		criticalThreshold: 5,
		higherIsWorse: true,
		description: "Modified or untracked file count in current git worktree.",
	},
	"in-flight-background-tasks": {
		kind: "in-flight-background-tasks",
		name: "In-Flight Background Task Count",
		unit: "tasks",
		warningThreshold: 3,
		criticalThreshold: 6,
		higherIsWorse: true,
		description: "Number of active asynchronous background commands.",
	},
	"http-preview-server-health": {
		kind: "http-preview-server-health",
		name: "HTTP Preview Server Health",
		unit: "status",
		warningThreshold: 1,
		criticalThreshold: 0,
		higherIsWorse: false,
		description: "Local loopback documentation web preview server status.",
	},
	"staleness-index-percentage": {
		kind: "staleness-index-percentage",
		name: "Staleness Index Percentage",
		unit: "%",
		warningThreshold: 20,
		criticalThreshold: 40,
		higherIsWorse: true,
		description: "Truth drift percentage of aged artifacts.",
	},
	"claim-grounding-ratio": {
		kind: "claim-grounding-ratio",
		name: "Grounded vs Ungrounded Claim Ratio",
		unit: "%",
		warningThreshold: 80,
		criticalThreshold: 60,
		higherIsWorse: false,
		description: "Verified citation grounded ratio across generated text.",
	},
	"worktree-task-branch": {
		kind: "worktree-task-branch",
		name: "Active Worktree Task Branch Name",
		unit: "branch",
		warningThreshold: 1,
		criticalThreshold: 0,
		higherIsWorse: false,
		description: "Target isolated git worktree branch name.",
	},
	"symbol-index-cache-rate": {
		kind: "symbol-index-cache-rate",
		name: "AST Symbol Index Cache Hit Rate",
		unit: "%",
		warningThreshold: 75,
		criticalThreshold: 50,
		higherIsWorse: false,
		description: "AST symbol lookup memory cache hit ratio.",
	},
};

/* -------------------------------------------------------------------------- */
/* Theme 1: Interactive Status Bar Click/Hover Trigger (UX-0251 – UX-0260)     */
/* -------------------------------------------------------------------------- */

export interface TelemetryDetailsModal {
	channel: TelemetryChannelKind;
	title: string;
	currentValue: unknown;
	formattedValue: string;
	popoverBox: string;
	diagnosticAdvice: string;
	timestamp: string;
}

export function triggerTelemetryDetailsModal(
	channel: TelemetryChannelKind,
	currentValue: unknown = 0,
): TelemetryDetailsModal {
	const meta = TELEMETRY_CHANNEL_METADATA[channel];
	const formattedValue = `${String(currentValue)} ${meta.unit}`;
	const timestamp = new Date().toISOString();

	const advice = meta.higherIsWorse
		? `Elevated values above ${meta.warningThreshold} ${meta.unit} degrade performance.`
		: `Values below ${meta.warningThreshold} ${meta.unit} indicate missing artifacts or degraded health.`;

	const popoverLines = [
		`╭── [HUD Telemetry Inspector: ${meta.name}] ───`,
		`│ Value:     ${formattedValue}`,
		`│ Channel:   ${channel}`,
		`│ Warning:   ${meta.warningThreshold} ${meta.unit}`,
		`│ Critical:  ${meta.criticalThreshold} ${meta.unit}`,
		`│ Guidance:  ${advice}`,
		`│ Time:      ${timestamp}`,
		`╰───────────────────────────────────────────────────`,
	];

	return {
		channel,
		title: meta.name,
		currentValue,
		formattedValue,
		popoverBox: popoverLines.join("\n"),
		diagnosticAdvice: advice,
		timestamp,
	};
}

/* -------------------------------------------------------------------------- */
/* Theme 2: Persistent Background Progress Indicator (UX-0261 – UX-0280)       */
/* -------------------------------------------------------------------------- */

export interface PersistentProgressIndicator {
	channel: TelemetryChannelKind;
	normalizedValue: number; // 0..1
	renderedGauge: string;
	width: number;
}

export function renderPersistentProgressIndicator(
	channel: TelemetryChannelKind,
	current: number | string | boolean,
	ceiling?: number,
	width = 12,
): PersistentProgressIndicator {
	const meta = TELEMETRY_CHANNEL_METADATA[channel];
	let numValue = 0;

	if (typeof current === "number") {
		numValue = current;
	} else if (typeof current === "boolean") {
		numValue = current ? 1 : 0;
	} else {
		numValue = Number.parseFloat(String(current)) || 0;
	}

	const max = ceiling ?? Math.max(meta.criticalThreshold, meta.warningThreshold, 100);
	const normalized = Math.max(0, Math.min(1, max > 0 ? numValue / max : 0));
	const filled = Math.round(normalized * width);
	const empty = width - filled;

	const useUnicode = supportsUnicode();
	const fillChar = useUnicode ? "■" : "#";
	const emptyChar = useUnicode ? "·" : "-";

	const gaugeBar = `${fillChar.repeat(filled)}${emptyChar.repeat(empty)}`;
	const percentage = Math.round(normalized * 100);
	const renderedGauge = `[${gaugeBar}] ${percentage}%`;

	return {
		channel,
		normalizedValue: normalized,
		renderedGauge,
		width,
	};
}

/* -------------------------------------------------------------------------- */
/* Theme 3: Color-Shifting Warning Badge (UX-0281 – UX-0300)                   */
/* -------------------------------------------------------------------------- */

export type WarningSeverity = "normal" | "warning" | "critical";

export interface TelemetryWarningBadge {
	channel: TelemetryChannelKind;
	severity: WarningSeverity;
	badgeText: string;
	ansiStyledText: string;
	isCritical: boolean;
}

export function evaluateThresholdWarningBadge(
	channel: TelemetryChannelKind,
	value: number | boolean | string,
): TelemetryWarningBadge {
	const meta = TELEMETRY_CHANNEL_METADATA[channel];
	let numValue = 0;

	if (typeof value === "number") {
		numValue = value;
	} else if (typeof value === "boolean") {
		numValue = value ? (meta.higherIsWorse ? 10 : 0) : meta.higherIsWorse ? 0 : 10;
	} else {
		numValue = Number.parseFloat(String(value)) || 0;
	}

	let severity: WarningSeverity = "normal";

	if (meta.higherIsWorse) {
		if (numValue >= meta.criticalThreshold) {
			severity = "critical";
		} else if (numValue >= meta.warningThreshold) {
			severity = "warning";
		}
	} else {
		if (numValue <= meta.criticalThreshold) {
			severity = "critical";
		} else if (numValue <= meta.warningThreshold) {
			severity = "warning";
		}
	}

	const isCritical = severity === "critical";
	const useUnicode = supportsUnicode();

	let icon = "";
	let ansiColor = "";
	switch (severity) {
		case "normal":
			icon = useUnicode ? "✓" : "[OK]";
			ansiColor = "\x1b[32m"; // green
			break;
		case "warning":
			icon = useUnicode ? "▲" : "[!]";
			ansiColor = "\x1b[33m"; // yellow
			break;
		case "critical":
			icon = useUnicode ? "⛔" : "[X]";
			ansiColor = "\x1b[31;1m"; // bold red
			break;
	}

	const badgeText = `${icon} ${meta.name}: ${severity.toUpperCase()}`;
	const ansiStyledText = `${ansiColor}${badgeText}\x1b[0m`;

	return {
		channel,
		severity,
		badgeText,
		ansiStyledText,
		isCritical,
	};
}
