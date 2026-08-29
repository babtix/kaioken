import { pad, truncate, BOLD, DIM, RESET, REVERSE } from "./screen.js";

/**
 * The dashboard: what does this repository's knowledge look like right now?
 *
 * One frame, computed fresh from the phase-1/5 artifacts on every repaint.
 * Deliberately numbers-first: counts, freshness and staleness dominate, prose
 * is secondary. It answers "is the knowledge here usable" at a glance.
 */

export interface DashboardData {
	root: string;
	fileCount: number;
	symbolCount: number;
	documentCount: number;
	cardCount: number;
	skillCount: number;
	researchCount: number;
	freshness: number | null;
	staleCount: number;
	orphanCount: number;
	changedFiles: string[];
	deletedFiles: string[];
}

export function renderDashboard(data: DashboardData): string[] {
	const lines: string[] = [];

	lines.push(header("Kaioken — repository knowledge"));
	lines.push("");
	lines.push(`${DIM}${data.root}${RESET}`);
	lines.push("");

	lines.push(section("Repository"));
	lines.push(`  files indexed     ${data.fileCount}`);
	lines.push(`  symbols indexed   ${data.symbolCount}`);
	lines.push("");

	lines.push(section("Knowledge"));
	lines.push(`  wiki documents    ${data.documentCount}`);
	lines.push(`  cards             ${data.cardCount}`);
	lines.push(`  skills            ${data.skillCount}`);
	lines.push(`  research answers  ${data.researchCount}`);
	lines.push("");

	lines.push(section("Freshness"));
	if (data.freshness === null) {
		lines.push(`  nothing generated yet — run kaioken cards or kaioken wiki`);
	} else {
		const pct = Math.round(data.freshness * 100);
		const bar = barFor(data.freshness, 24);
		lines.push(`  ${bar} ${pct}% of documents match their sources`);
		if (data.staleCount > 0) lines.push(`  ${data.staleCount} stale`);
		if (data.orphanCount > 0) lines.push(`  ${data.orphanCount} orphaned`);
		for (const file of data.changedFiles.slice(0, 3)) {
			lines.push(`  changed: ${truncate(file, 56)}`);
		}
		for (const file of data.deletedFiles.slice(0, 3)) {
			lines.push(`  deleted: ${truncate(file, 56)}`);
		}
	}
	lines.push("");

	return lines;
}

export function header(title: string): string {
	return `${REVERSE}${BOLD} ${pad(title, 76)} ${RESET}`;
}

function section(title: string): string {
	return `${BOLD}${title}${RESET}`;
}

function barFor(ratio: number, width: number): string {
	const filled = Math.round(ratio * width);
	return `${"█".repeat(filled)}${DIM}${"░".repeat(width - filled)}${RESET}`;
}
