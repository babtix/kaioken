/**
 * Active git worktree dirty status indicator pill.
 *
 * Implements Step 19.3 (Features #UX-0221 - #UX-0230).
 * Displays git branch names, worktree isolation tags, dirty state counts, and active hook indicators.
 */
import { fg, type Painter } from "./theme.ts";

export interface WorktreeStatus {
	branch: string;
	isWorktree?: boolean;
	isDirty: boolean;
	modifiedCount?: number;
	untrackedCount?: number;
	activeHook?: string;
}

export interface WorktreePillOptions {
	unicode?: boolean;
	compact?: boolean;
	showCounts?: boolean;
}

/**
 * Render a worktree and dirty status badge pill.
 */
export function renderWorktreePill(
	status: WorktreeStatus,
	paint?: Painter,
	options: WorktreePillOptions = {},
): string {
	const unicode = options.unicode ?? true;
	const compact = options.compact ?? false;
	const showCounts = options.showCounts ?? true;

	const branch = status.branch ? status.branch.trim() : "HEAD";
	const isWt = Boolean(status.isWorktree);

	let prefix: string;
	if (unicode) {
		prefix = isWt ? "⎇ (wt)" : "⎇";
	} else {
		prefix = isWt ? "wt" : "git";
	}

	let statusPart = "";
	let role: "ok" | "warn" | "error" | "accent" = "ok";

	if (status.activeHook) {
		statusPart = unicode ? `(${status.activeHook}…)` : `(${status.activeHook}...)`;
		role = "accent";
	} else if (status.isDirty) {
		role = "warn";
		const totalDiff = (status.modifiedCount ?? 0) + (status.untrackedCount ?? 0);
		if (showCounts && totalDiff > 0) {
			statusPart = compact ? `*${totalDiff}` : `*dirty (+${totalDiff})`;
		} else {
			statusPart = unicode ? "*dirty" : "*DIRTY";
		}
	} else {
		statusPart = unicode ? "✓" : "OK";
		role = "ok";
	}

	const pillText = unicode
		? `[${prefix} ${branch} ${statusPart}]`
		: `[${prefix}:${branch} ${statusPart}]`;

	if (!paint) return pillText;
	return fg(paint, role, pillText);
}
