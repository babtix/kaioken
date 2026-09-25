import { describe, expect, it } from "vitest";
import {
	ALL_TELEMETRY_CHANNEL_KINDS,
	TELEMETRY_CHANNEL_METADATA,
	type TelemetryChannelKind,
	evaluateThresholdWarningBadge,
	renderPersistentProgressIndicator,
	triggerTelemetryDetailsModal,
} from "../ui/index.ts";

describe("Step 39: Category 03 — HUD, Status Bar & Dynamic Widgets (UX-0251 – UX-0300)", () => {
	it("defines all 20 canonical telemetry channel kinds with metadata", () => {
		expect(ALL_TELEMETRY_CHANNEL_KINDS).toHaveLength(20);
		for (const channel of ALL_TELEMETRY_CHANNEL_KINDS) {
			const meta = TELEMETRY_CHANNEL_METADATA[channel];
			expect(meta).toBeDefined();
			expect(meta.name.length).toBeGreaterThan(0);
			expect(meta.unit.length).toBeGreaterThan(0);
			expect(meta.description.length).toBeGreaterThan(0);
		}
	});

	/* -------------------------------------------------------------------------- */
	/* Theme 1: Interactive Status Bar Click/Hover Trigger (UX-0251 – UX-0260)     */
	/* -------------------------------------------------------------------------- */
	describe("Theme 1: Interactive status bar click/hover trigger (UX-0251 – UX-0260)", () => {
		const testCases: Array<{ channel: TelemetryChannelKind; uxId: string }> = [
			{ channel: "system-memory-rss", uxId: "UX-0251" },
			{ channel: "model-roundtrip-latency", uxId: "UX-0252" },
			{ channel: "detected-test-framework", uxId: "UX-0253" },
			{ channel: "active-git-hooks", uxId: "UX-0254" },
			{ channel: "discovered-agent-skills", uxId: "UX-0255" },
			{ channel: "generated-wiki-chapters", uxId: "UX-0256" },
			{ channel: "indexed-knowledge-cards", uxId: "UX-0257" },
			{ channel: "secret-scanner-alerts", uxId: "UX-0258" },
			{ channel: "web-research-quota", uxId: "UX-0259" },
			{ channel: "live-sse-clients", uxId: "UX-0260" },
		];

		for (const { channel, uxId } of testCases) {
			it(`[${uxId}] generates interactive telemetry details modal on click/hover for ${channel}`, () => {
				const modal = triggerTelemetryDetailsModal(channel, 42);
				expect(modal.channel).toBe(channel);
				expect(modal.title).toBe(TELEMETRY_CHANNEL_METADATA[channel].name);
				expect(modal.formattedValue).toContain(TELEMETRY_CHANNEL_METADATA[channel].unit);
				expect(modal.popoverBox).toContain(modal.title);
				expect(modal.popoverBox).toContain("Guidance:");
				expect(modal.diagnosticAdvice.length).toBeGreaterThan(0);
			});
		}
	});

	/* -------------------------------------------------------------------------- */
	/* Theme 2: Persistent Background Progress Indicator (UX-0261 – UX-0280)       */
	/* -------------------------------------------------------------------------- */
	describe("Theme 2: Persistent background progress indicator (UX-0261 – UX-0280)", () => {
		const testCases: Array<{ channel: TelemetryChannelKind; uxId: string }> = [
			{ channel: "context-window-utilization", uxId: "UX-0261" },
			{ channel: "token-spend-velocity", uxId: "UX-0262" },
			{ channel: "repo-file-freshness", uxId: "UX-0263" },
			{ channel: "git-working-tree-dirty", uxId: "UX-0264" },
			{ channel: "in-flight-background-tasks", uxId: "UX-0265" },
			{ channel: "http-preview-server-health", uxId: "UX-0266" },
			{ channel: "staleness-index-percentage", uxId: "UX-0267" },
			{ channel: "claim-grounding-ratio", uxId: "UX-0268" },
			{ channel: "worktree-task-branch", uxId: "UX-0269" },
			{ channel: "symbol-index-cache-rate", uxId: "UX-0270" },
			{ channel: "system-memory-rss", uxId: "UX-0271" },
			{ channel: "model-roundtrip-latency", uxId: "UX-0272" },
			{ channel: "detected-test-framework", uxId: "UX-0273" },
			{ channel: "active-git-hooks", uxId: "UX-0274" },
			{ channel: "discovered-agent-skills", uxId: "UX-0275" },
			{ channel: "generated-wiki-chapters", uxId: "UX-0276" },
			{ channel: "indexed-knowledge-cards", uxId: "UX-0277" },
			{ channel: "secret-scanner-alerts", uxId: "UX-0278" },
			{ channel: "web-research-quota", uxId: "UX-0279" },
			{ channel: "live-sse-clients", uxId: "UX-0280" },
		];

		for (const { channel, uxId } of testCases) {
			it(`[${uxId}] renders persistent progress indicator tracking ${channel}`, () => {
				const indicator = renderPersistentProgressIndicator(channel, 50, 100);
				expect(indicator.channel).toBe(channel);
				expect(indicator.normalizedValue).toBe(0.5);
				expect(indicator.renderedGauge).toContain("50%");
				expect(indicator.renderedGauge).toContain("[");
				expect(indicator.renderedGauge).toContain("]");
			});
		}
	});

	/* -------------------------------------------------------------------------- */
	/* Theme 3: Color-Shifting Warning Badge (UX-0281 – UX-0300)                   */
	/* -------------------------------------------------------------------------- */
	describe("Theme 3: Color-shifting warning badge indicating critical threshold (UX-0281 – UX-0300)", () => {
		const testCases: Array<{ channel: TelemetryChannelKind; uxId: string }> = [
			{ channel: "context-window-utilization", uxId: "UX-0281" },
			{ channel: "token-spend-velocity", uxId: "UX-0282" },
			{ channel: "repo-file-freshness", uxId: "UX-0283" },
			{ channel: "git-working-tree-dirty", uxId: "UX-0284" },
			{ channel: "in-flight-background-tasks", uxId: "UX-0285" },
			{ channel: "http-preview-server-health", uxId: "UX-0286" },
			{ channel: "staleness-index-percentage", uxId: "UX-0287" },
			{ channel: "claim-grounding-ratio", uxId: "UX-0288" },
			{ channel: "worktree-task-branch", uxId: "UX-0289" },
			{ channel: "symbol-index-cache-rate", uxId: "UX-0290" },
			{ channel: "system-memory-rss", uxId: "UX-0291" },
			{ channel: "model-roundtrip-latency", uxId: "UX-0292" },
			{ channel: "detected-test-framework", uxId: "UX-0293" },
			{ channel: "active-git-hooks", uxId: "UX-0294" },
			{ channel: "discovered-agent-skills", uxId: "UX-0295" },
			{ channel: "generated-wiki-chapters", uxId: "UX-0296" },
			{ channel: "indexed-knowledge-cards", uxId: "UX-0297" },
			{ channel: "secret-scanner-alerts", uxId: "UX-0298" },
			{ channel: "web-research-quota", uxId: "UX-0299" },
			{ channel: "live-sse-clients", uxId: "UX-0300" },
		];

		for (const { channel, uxId } of testCases) {
			it(`[${uxId}] shifts badge severity and color across thresholds for ${channel}`, () => {
				const meta = TELEMETRY_CHANNEL_METADATA[channel];

				// Normal value
				const normalVal = meta.higherIsWorse ? meta.warningThreshold - 1 : meta.warningThreshold + 1;
				const normalBadge = evaluateThresholdWarningBadge(channel, normalVal);
				expect(normalBadge.severity).toBe("normal");
				expect(normalBadge.isCritical).toBe(false);

				// Warning value
				const warnVal = meta.warningThreshold;
				const warnBadge = evaluateThresholdWarningBadge(channel, warnVal);
				expect(warnBadge.severity).toBe("warning");
				expect(warnBadge.isCritical).toBe(false);

				// Critical value
				const critVal = meta.criticalThreshold;
				const critBadge = evaluateThresholdWarningBadge(channel, critVal);
				expect(critBadge.severity).toBe("critical");
				expect(critBadge.isCritical).toBe(true);
				expect(critBadge.ansiStyledText).toContain("\x1b[31;1m"); // ANSI bold red
			});
		}
	});
});
