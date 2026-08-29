import { truncate, DIM, RESET, BOLD } from "./screen.js";

/**
 * The search view: the engine's zero-credential surface, in the TUI.
 *
 * Same corpus, same BM25 ranking as `kaioken search` — this view exists so the
 * cheapest question ("what is here about X?") never leaves the interface.
 */

export interface SearchHitView {
	kind: string;
	title: string;
	where: string;
	snippet: string;
}

export interface SearchViewState {
	query: string;
	hits: SearchHitView[];
	semantic: boolean;
	searched: boolean;
	error: string | null;
}

export function emptySearchState(): SearchViewState {
	return { query: "", hits: [], semantic: false, searched: false, error: null };
}

export function renderSearch(state: SearchViewState): string[] {
	const lines: string[] = [];
	lines.push(`${BOLD}Search — type a query, Enter to run${RESET}`);
	lines.push("");
	lines.push(`> ${state.query}█`);
	lines.push("");

	if (state.error) {
		lines.push(`error: ${state.error}`);
		return lines;
	}

	if (!state.searched) {
		lines.push(`${DIM}search works with no credentials and no model${RESET}`);
		return lines;
	}

	if (state.hits.length === 0) {
		lines.push(`${DIM}nothing indexed matches this query${RESET}`);
		return lines;
	}

	lines.push(
		`${DIM}${state.hits.length} hits — ranked ${state.semantic ? "lexically + semantically" : "lexically (BM25)"}${RESET}`,
	);
	lines.push("");
	for (const hit of state.hits) {
		lines.push(`  ${hit.kind.padEnd(7)} ${truncate(hit.title, 60)}`);
		lines.push(`  ${" ".repeat(7)} ${truncate(hit.where, 66)}`);
		if (hit.snippet) lines.push(`  ${DIM}${truncate(hit.snippet, 66)}${RESET}`);
		lines.push("");
	}
	return lines;
}
