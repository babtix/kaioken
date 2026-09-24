/**
 * Interactive milestone breadcrumb trails and multi-stage pipeline status visualizer.
 *
 * Implements Features #UX-0141 – #UX-0150.
 *
 * Displays connected workflow stages (e.g. Scan → Index → Plan → Cards → Wiki → Verify)
 * with real-time status indicators (completed, active, pending, failed) and adaptive glyphs.
 */

import { Box, Text } from "@earendil-works/pi-tui";
import { resolveGlyph } from "../ui/glyphs.ts";
import type { PaintTheme } from "../ui/theme.ts";

export type MilestoneStatus = "pending" | "active" | "completed" | "failed";

export interface Milestone {
	id: string;
	label: string;
	status: MilestoneStatus;
	detail?: string;
}

export const DEFAULT_PIPELINE: readonly string[] = [
	"Scan",
	"Symbols",
	"Plan",
	"Cards",
	"Wiki",
	"Verify",
];

export class MilestoneTrail {
	private milestones: Milestone[];

	constructor(stages: readonly string[] = DEFAULT_PIPELINE) {
		this.milestones = stages.map((label, idx) => ({
			id: label.toLowerCase(),
			label,
			status: idx === 0 ? "active" : "pending",
		}));
	}

	getMilestones(): readonly Milestone[] {
		return this.milestones;
	}

	setStatus(id: string, status: MilestoneStatus, detail?: string): void {
		const target = this.milestones.find((m) => m.id === id.toLowerCase() || m.label.toLowerCase() === id.toLowerCase());
		if (target) {
			target.status = status;
			if (detail !== undefined) target.detail = detail;
		}
	}

	advance(completedId: string, nextActiveId?: string): void {
		this.setStatus(completedId, "completed");
		if (nextActiveId) {
			this.setStatus(nextActiveId, "active");
		} else {
			const idx = this.milestones.findIndex(
				(m) => m.id === completedId.toLowerCase() || m.label.toLowerCase() === completedId.toLowerCase(),
			);
			if (idx >= 0 && idx + 1 < this.milestones.length) {
				const next = this.milestones[idx + 1];
				if (next) next.status = "active";
			}
		}
	}

	fail(failedId: string, reason?: string): void {
		this.setStatus(failedId, "failed", reason);
	}
}

export function formatBreadcrumbsText(
	milestones: readonly Milestone[],
	options: { compact?: boolean; unicode?: boolean } = {},
	theme?: PaintTheme,
): string {
	const fg = (token: any, text: string) => (theme?.fg ? theme.fg(token, text) : text);
	const bold = (text: string) => (theme?.bold ? theme.bold(text) : text);

	const unicode = options.unicode ?? true;
	const arrow = unicode ? resolveGlyph("arrowForward", true) : resolveGlyph("arrowForward", false);
	const sep = ` ${fg("dim", arrow)} `;

	const parts: string[] = [];

	for (const m of milestones) {
		let icon = "";
		let color = "dim";

		switch (m.status) {
			case "completed":
				icon = resolveGlyph("ok", unicode);
				color = "success";
				break;
			case "active":
				icon = resolveGlyph("bullet", unicode);
				color = "accent";
				break;
			case "pending":
				icon = resolveGlyph("circle", unicode);
				color = "dim";
				break;
			case "failed":
				icon = resolveGlyph("fail", unicode);
				color = "error";
				break;
		}

		const renderedIcon = fg(color, icon);
		const label = m.status === "active" ? bold(fg(color, m.label)) : fg(color, m.label);

		parts.push(`${renderedIcon} ${label}`);
	}

	return parts.join(sep);
}

export function renderBreadcrumbs(
	milestones: readonly Milestone[],
	options: { compact?: boolean; unicode?: boolean } = {},
	theme?: PaintTheme,
): Box {
	const text = formatBreadcrumbsText(milestones, options, theme);
	const box = new Box(1, 0);
	box.addChild(new Text(text, 0, 0));
	return box;
}
