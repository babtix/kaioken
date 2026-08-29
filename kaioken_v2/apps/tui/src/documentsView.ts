/**
 * The documents view: every generated artifact, browsable.
 *
 * Lists wiki documents, cards and research answers from the engine's
 * artifacts (plain reads, no model, no network) and opens one at a time in a
 * scrolled reader. This is the surface that makes the knowledge actually
 * consumable inside the interface rather than via `cat .kaioken/...`.
 */
import { truncate, DIM, RESET, BOLD } from "./screen.js";

export type DocumentKind = "wiki" | "card" | "research";

export interface DocumentEntry {
	kind: DocumentKind;
	/** Identifier for opening: file path relative to root, or card moduleId. */
	id: string;
	title: string;
	/** Short right-hand annotation: freshness or source count. */
	detail: string;
}

export interface DocumentsViewState {
	entries: DocumentEntry[];
	selected: number;
	/** Set while a document body is open; `openLines` holds its rendered lines. */
	open: boolean;
	openTitle: string;
	openLines: string[];
	error: string | null;
	loaded: boolean;
}

export function emptyDocumentsState(): DocumentsViewState {
	return { entries: [], selected: 0, open: false, openTitle: "", openLines: [], error: null, loaded: false };
}

export function renderDocumentsList(state: DocumentsViewState): string[] {
	const lines: string[] = [];
	lines.push(`${BOLD}Documents — generated knowledge in this repository${RESET}`);
	lines.push("");
	if (state.error) {
		lines.push(`error: ${state.error}`);
		return lines;
	}
	if (!state.loaded) {
		lines.push(`${DIM}loading documents…${RESET}`);
		return lines;
	}
	if (state.entries.length === 0) {
		lines.push(`${DIM}nothing generated yet — run kaioken cards, kaioken wiki or kaioken research${RESET}`);
		return lines;
	}
	for (let i = 0; i < state.entries.length; i++) {
		const entry = state.entries[i] as DocumentEntry;
		const cursor = i === state.selected ? "❯ " : "  ";
		const marker = entry.kind === "wiki" ? "wiki" : entry.kind === "card" ? "card" : "web ";
		const row = `${cursor}${marker}  ${truncate(entry.title, 58)}  ${DIM}${truncate(entry.detail, 16)}${RESET}`;
		lines.push(i === state.selected ? `${BOLD}${row}${RESET}` : row);
	}
	lines.push("");
	lines.push(`${DIM}enter opens · up/down selects · esc back${RESET}`);
	return lines;
}

export function renderDocumentOpen(state: DocumentsViewState): string[] {
	const lines: string[] = [];
	lines.push(`${BOLD}${truncate(state.openTitle, 74)}${RESET}`);
	lines.push(`${DIM}${"─".repeat(74)}${RESET}`);
	lines.push(...state.openLines);
	return lines;
}
