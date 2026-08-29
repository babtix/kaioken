import { createInterface } from "node:readline/promises";
import { resolve } from "node:path";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
	computeStaleness,
	type Provenance,
} from "@kaioken/provenance";
import { readCards } from "@kaioken/plan";
import { readProvenance } from "@kaioken/wiki";
import { SearchIndex, type SearchHit } from "@kaioken/search";
import { readScanArtifact, scan, writeScanArtifact } from "@kaioken/scan";
import {
	readResearchDocuments,
	type ResearchDocument,
} from "@kaioken/research";

import { Screen, parseKeys, sizeOf, pad, emptyViewport, fitViewport, sliceVisible, scrollViewport, DIM, RESET, type Key } from "./screen.js";
import { renderDashboard, type DashboardData } from "./dashboard.js";
import { emptySearchState, renderSearch, type SearchHitView, type SearchViewState } from "./searchView.js";
import { emptyChatState, renderChat, type ChatViewState } from "./chatView.js";
import { emptyDocumentsState, renderDocumentsList, renderDocumentOpen, type DocumentsViewState, type DocumentEntry } from "./documentsView.js";
import { renderHelp } from "./helpView.js";
import { renderStatusBar } from "./statusBar.js";

/**
 * The application: four views over the same engine the CLI serves.
 *
 * Key decisions, stated:
 * - Views own no I/O. Each renders a frame from plain data; the shell loads
 *   data and repaints. That split is what makes the views testable without a
 *   terminal and the shell testable without the engine.
 * - The chat view reuses the CLI's model seam and gate rather than owning a
 *   second path to the provider.
 * - One key loop, one repaint per event. Full-frame repaints are cheap at
 *   this scale and remove the entire class of partial-redraw bugs.
 * - Keys are global first, view-specific second: numbers, tab, ?, scrolling
 *   and ctrl-c behave identically in every view, so the interface has one
 *   grammar instead of four dialects.
 */

type ViewName = "dashboard" | "search" | "chat" | "documents" | "help";

export interface TuiOptions {
	root: string;
	model?: string;
}

export async function runTui(options: TuiOptions): Promise<number> {
	await tuiLoop(options);
	return 0; // reached only when the TUI exits cleanly
}

async function tuiLoop(options: TuiOptions): Promise<never> {
	const root = resolve(options.root);
	const screen = new Screen();
	const rl = createInterface({ input: process.stdin, escapeCodeTimeout: 0 });
	if (process.stdin.isTTY) process.stdin.setRawMode(true);
	process.stdin.resume();

	let view: ViewName = "dashboard";
	let previous: ViewName = "dashboard"; // where `?` returns to
	let model = options.model;
	const searchState = emptySearchState();
	const chatState = emptyChatState();
	const documentsState = emptyDocumentsState();
	const scroll = {
		dashboard: emptyViewport(20),
		documentsList: emptyViewport(20),
		documentsOpen: emptyViewport(20),
		chat: emptyViewport(20),
	};

	screen.enter();

	const loadDashboard = async (): Promise<DashboardData> => {
		let scanResult = await readScanArtifact(root);
		if (!scanResult) {
			scanResult = await scan(root);
			await writeScanArtifact(root, scanResult);
		}

		const records: Provenance[] = [];
		const wiki = await readProvenance(root);
		if (wiki) records.push(...wiki.documents);
		const cards = await readCards(root);
		for (const card of cards) {
			records.push({ document: `card:${card.moduleId}`, generatedAt: card.generatedAt, sources: card.sources });
		}
		// Research sources are URLs, not repository files: mixing them into the
		// file-based staleness report would list web pages as "deleted files".
		// Their aging is handled when a research document is re-run.
		const research: ResearchDocument[] = await readResearchDocuments(root);

		const staleness = records.length > 0 ? computeStaleness(records, scanResult) : null;

		// Symbol count comes from the index artifact when one exists.
		let symbolCount = 0;
		try {
			const { readIndexArtifact } = await import("@kaioken/index");
			const indexArtifact = await readIndexArtifact(root);
			symbolCount = indexArtifact?.symbolCount ?? 0;
		} catch {
			symbolCount = 0;
		}

		return {
			root,
			fileCount: scanResult.files.length,
			symbolCount,
			documentCount: wiki ? wiki.documents.length : 0,
			cardCount: cards.length,
			skillCount: 0,
			researchCount: research.length,
			freshness: staleness ? staleness.freshness : null,
			staleCount: staleness ? staleness.stale.length : 0,
			orphanCount: staleness ? staleness.orphaned.length : 0,
			changedFiles: staleness ? staleness.changedFiles : [],
			deletedFiles: staleness ? staleness.deletedFiles : [],
		};
	};

	// The document list is derived once per visit, from the same artifacts the
	// CLI reads. Plain file reads: no model, no network, works offline.
	const loadDocuments = async (): Promise<void> => {
		documentsState.error = null;
		try {
			const entries: DocumentEntry[] = [];
			const wiki = await readProvenance(root);
			if (wiki) {
				const seen = new Set<string>();
				for (const doc of wiki.documents) {
					const chapter = doc.document.split("/")[0] ?? doc.document;
					if (seen.has(doc.document)) continue;
					seen.add(doc.document);
					entries.push({
						kind: "wiki",
						id: doc.document,
						title: doc.document,
						detail: chapter,
					});
				}
			}
			const cards = await readCards(root);
			for (const card of cards) {
				entries.push({
					kind: "card",
					id: card.moduleId,
					title: `card: ${card.moduleId}`,
					detail: `${card.sources.length} src`,
				});
			}
			const research = await readResearchDocuments(root);
			for (const doc of research) {
				entries.push({
					kind: "research",
					id: doc.path,
					title: doc.title || doc.question || doc.path,
					detail: doc.verification ? `${countSources(doc.sources)} src` : "unverified",
				});
			}
			documentsState.entries = entries;
			documentsState.loaded = true;
			if (documentsState.selected >= entries.length) documentsState.selected = Math.max(0, entries.length - 1);
		} catch (error) {
			documentsState.error = error instanceof Error ? error.message : String(error);
			documentsState.loaded = true;
		}
	};

	// Opening resolves the entry to a real file under the root and renders it
	// as plain lines — the reader scrolls, so long documents stay usable.
	const openDocument = async (entry: DocumentEntry): Promise<void> => {
		try {
			if (entry.kind === "card") {
				const cards = await readCards(root);
				const card = cards.find((c) => c.moduleId === entry.id);
				if (!card) throw new Error(`card not found: ${entry.id}`);
				documentsState.openTitle = entry.title;
				documentsState.openLines = JSON.stringify(card, null, 2).split("\n");
			} else {
				const relative = entry.kind === "wiki" ? join(".kaioken", "wiki", entry.id) : entry.id;
				const body = await readFile(join(root, relative), "utf8");
				documentsState.openTitle = entry.title;
				documentsState.openLines = body.replace(/\r\n/g, "\n").split("\n");
			}
			documentsState.open = true;
			scroll.documentsOpen = emptyViewport(20);
		} catch (error) {
			documentsState.error = error instanceof Error ? error.message : String(error);
		}
	};

	const runSearch = async (query: string): Promise<void> => {
		searchState.searched = true;
		searchState.error = null;
		try {
			await ensureIndexShim(root);
			const index = await SearchIndex.open(root);
			const hits = await index.search({ text: query, limit: 10 });
			searchState.hits = hits.map(toHitView);
			searchState.semantic = index.semantic;
		} catch (error) {
			searchState.error = error instanceof Error ? error.message : String(error);
		}
	};

	const sendChat = async (question: string): Promise<void> => {
		chatState.busy = true;
		chatState.error = null;
		repaint();
		try {
			const { chatHeadless } = await import("./chatBridge.js");
			const reply = await chatHeadless({ root, question, ...(model ? { model } : {}) });
			let text = reply.reply;
			if (reply.gateRan) {
				text += `\n\n(gate: ${JSON.stringify(reply.verified).slice(0, 120)})`;
			}
			chatState.turns.push({ role: "assistant", text });
		} catch (error) {
			chatState.error = error instanceof Error ? error.message : String(error);
		} finally {
			chatState.busy = false;
		}
	};

	const repaint = async (): Promise<void> => {
		const { rows, cols } = sizeOf(process.stdout);
		// Body gets everything except the header row the views draw and the
		// status bar row; scroll viewports re-fit against the real height.
		const bodyRows = Math.max(4, rows - 3);
		const hints = pad(
			"[1] dash  [2] search  [3] chat  [4] docs  [?] help  [q] quit",
			Math.max(0, cols - 1),
		);
		const lines: string[] = [];

		if (view === "dashboard") {
			const data = await loadDashboard();
			const frame = renderDashboard(data);
			fitViewport(scroll.dashboard, frame.length);
			lines.push(...sliceVisible(frame, scroll.dashboard));
		} else if (view === "search") {
			lines.push(...renderSearch(searchState));
		} else if (view === "chat") {
			const frame = renderChat(chatState, bodyRows - 4);
			lines.push(...frame);
		} else if (view === "documents") {
			const frame = documentsState.open ? renderDocumentOpen(documentsState) : renderDocumentsList(documentsState);
			const vp = documentsState.open ? scroll.documentsOpen : scroll.documentsList;
			fitViewport(vp, frame.length, documentsState.open);
			lines.push(...sliceVisible(frame, vp));
		} else {
			const frame = renderHelp();
			fitViewport(scroll.dashboard, frame.length);
			lines.push(...sliceVisible(frame, scroll.dashboard));
		}

		lines.push("");
		lines.push(renderStatusBar(statusData(), cols));
		// A second dim hint line only when the terminal is tall enough; the
		// status bar carries the essentials on short terminals.
		if (rows >= 10) lines.push(`${DIM}${hints}${RESET}`);
		screen.render({ lines });
	};

	function statusData(): { view: string; context?: string; root: string } {
		const name =
			view === "dashboard" ? "dashboard" :
			view === "search" ? "search" :
			view === "chat" ? (chatState.busy ? "chat — thinking" : "chat") :
			view === "documents" ? (documentsState.open ? "document" : "documents") :
			"help";
		const context =
			view === "search" && searchState.query ? `find: ${searchState.query}` :
			view === "chat" && chatState.input ? chatState.input :
			undefined;
		return { view: name, context, root };
	}

	// First paint.
	await repaint();

	process.stdin.on("data", (chunk) => {
		const keys = parseKeys(String(chunk));
		for (const key of keys) {
			void handleKey(key);
		}
	});

	// Repaint on resize so the viewports re-fit instead of leaving a stale frame.
	process.stdout.on("resize", () => {
		void repaint();
	});

	async function handleKey(key: Key): Promise<void> {
		// Global keys: help is a mode, view switching works everywhere except
		// while typing in the composer (where digits are text).
		if (key.type === "escape" && view === "help") {
			view = previous;
			return void repaint();
		}
		if (view === "help") {
			// Any other key leaves help too.
			view = previous;
			return void repaint();
		}

		if (key.type === "char" && (key.char === "1" || key.char === "2" || key.char === "3" || key.char === "4")) {
			if (view !== "chat" && view !== "search") {
				await switchView(key.char === "1" ? "dashboard" : key.char === "2" ? "search" : key.char === "3" ? "chat" : "documents");
				return;
			}
			// In search/chat the digit types into the field; fall through.
		}
		if (key.type === "char" && key.char === "?") {
			if (view !== "chat" && view !== "search") {
				previous = view;
				view = "help";
				return void repaint();
			}
		}
		if (key.type === "tab") {
			const order: ViewName[] = ["dashboard", "search", "chat", "documents"];
			const next = order[(order.indexOf(view) + 1) % order.length] ?? "dashboard";
			await switchView(next);
			return;
		}
		if (key.type === "char" && key.char === "r" && view === "dashboard") {
			return void repaint();
		}

		// Scrolling: every scrollable view honours up/down/pgup/pgdn. In the
		// documents list (not the open reader) up/down moves the selection
		// instead — the list is short and the cursor is the scroll position.
		if (key.type === "up" || key.type === "down" || key.type === "pageup" || key.type === "pagedown") {
			if (view === "documents" && !documentsState.open && (key.type === "up" || key.type === "down")) {
				const max = Math.max(0, documentsState.entries.length - 1);
				documentsState.selected = Math.max(0, Math.min(max, documentsState.selected + (key.type === "down" ? 1 : -1)));
				return void repaint();
			}
			const vp = view === "documents" ? (documentsState.open ? scroll.documentsOpen : scroll.documentsList) : scroll.dashboard;
			const step = key.type === "pageup" ? -vp.height : key.type === "pagedown" ? vp.height : key.type === "up" ? -1 : 1;
			scrollViewport(vp, step);
			return void repaint();
		}

		if (view === "search") {
			if (key.type === "escape") {
				await switchView("dashboard");
				return;
			}
			if (key.type === "enter") {
				if (searchState.query.trim()) await runSearch(searchState.query.trim());
				return void repaint();
			}
			if (key.type === "backspace") {
				searchState.query = searchState.query.slice(0, -1);
				return void repaint();
			}
			if (key.type === "char") {
				searchState.query += key.char;
				return void repaint();
			}
			return;
		}

		if (view === "chat") {
			if (key.type === "escape") {
				await switchView("dashboard");
				return;
			}
			if (key.type === "enter" && !chatState.busy && chatState.input.trim()) {
				const question = chatState.input.trim();
				chatState.input = "";
				chatState.turns.push({ role: "user", text: question });
				await sendChat(question);
				return void repaint();
			}
			if (key.type === "backspace") {
				chatState.input = chatState.input.slice(0, -1);
				return void repaint();
			}
			if (key.type === "char" && !chatState.busy) {
				chatState.input += key.char;
				return void repaint();
			}
			return;
		}

		if (view === "documents") {
			if (documentsState.open) {
				if (key.type === "escape" || key.type === "enter") {
					documentsState.open = false;
					return void repaint();
				}
				return;
			}
			if (key.type === "enter") {
				const entry = documentsState.entries[documentsState.selected];
				if (entry) await openDocument(entry);
				return void repaint();
			}
			return;
		}

		// Dashboard keys: quit.
		if (key.type === "char" && key.char === "q" && view === "dashboard") {
			return quit();
		}
	}

	async function switchView(next: ViewName): Promise<void> {
		view = next;
		if (next === "documents" && !documentsState.loaded) {
			await loadDocuments();
		}
		return void repaint();
	}

	function quit(): void {
		screen.leave();
		process.stdin.pause();
		rl.close();
		process.exit(0);
	}

	// Ctrl-C: leave raw mode and exit cleanly.
	process.on("SIGINT", quit);

	// The loop never resolves while the TUI is open; stdin events drive it,
	// and quitting happens via process.exit inside `quit`.
	await new Promise<never>(() => {});
	throw new Error("unreachable: the TUI event loop cannot resolve");
}

function countSources(sources: unknown[]): number {
	return Array.isArray(sources) ? sources.length : 0;
}

function toHitView(hit: SearchHit): SearchHitView {
	return {
		kind: hit.kind,
		title: hit.title || hit.heading || hit.path,
		where: hit.line > 0 ? `${hit.path}:${hit.line}` : hit.path,
		snippet: hit.snippet,
	};
}

/** Local shim so the TUI does not import the CLI's internals for provenance. */
function asProvenanceShim(doc: ResearchDocument): Provenance {
	return {
		document: doc.path,
		generatedAt: doc.generatedAt,
		sources: doc.sourcesAsProvenance,
	};
}

async function ensureIndexShim(root: string): Promise<void> {
	// The search index opens lazily from the phase-1 artifacts; ensure they
	// exist the same way the CLI does, without importing the CLI package.
	const { scan: runScan, writeScanArtifact, readScanArtifact } = await import("@kaioken/scan");
	const existing = await readScanArtifact(root);
	if (!existing) {
		const fresh = await runScan(root);
		await writeScanArtifact(root, fresh);
	}
	const { SearchIndex } = await import("@kaioken/search");
	await SearchIndex.open(root, { force: false });
}

export { renderDashboard, emptySearchState, emptyChatState, emptyDocumentsState };
