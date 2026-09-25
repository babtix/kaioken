/**
 * Step 40: Category 04 — Keyboard Navigation, Shortcuts & Command Palette (UX-0351 – UX-0400).
 *
 * Implements:
 * 1. Dedicated global hotkey shortcuts to immediately toggle target viewers (UX-0351 – UX-0360).
 * 2. Multi-level undo/redo keyboard stacks across 20 views (UX-0361 – UX-0380).
 * 3. Interactive tab-completion cycling across 20 views (UX-0381 – UX-0400).
 */

/**
 * 20 Canonical Keyboard Navigation Targets defined in Step 40 (UX-0351 – UX-0400).
 */
export type KeyboardTargetView =
	| "test-failure-stack-viewer"
	| "web-research-source-picker"
	| "skill-catalog-explorer"
	| "dependency-graph-node-inspector"
	| "header-telemetry-hud"
	| "interactive-diff-patch-selector"
	| "file-risk-flag-review-modal"
	| "theme-color-picker"
	| "live-web-preview-control-panel"
	| "help-documentation-browser"
	| "slash-command-palette"
	| "chat-transcript-message-list"
	| "wiki-document-toc"
	| "knowledge-card-browser"
	| "ast-symbol-declaration-search"
	| "drift-report-file-selector"
	| "search-results-ranking-list"
	| "worktree-task-switcher"
	| "module-planning-editor"
	| "spend-confirmation-prompt";

export const ALL_KEYBOARD_TARGET_VIEWS: readonly KeyboardTargetView[] = [
	"test-failure-stack-viewer",
	"web-research-source-picker",
	"skill-catalog-explorer",
	"dependency-graph-node-inspector",
	"header-telemetry-hud",
	"interactive-diff-patch-selector",
	"file-risk-flag-review-modal",
	"theme-color-picker",
	"live-web-preview-control-panel",
	"help-documentation-browser",
	"slash-command-palette",
	"chat-transcript-message-list",
	"wiki-document-toc",
	"knowledge-card-browser",
	"ast-symbol-declaration-search",
	"drift-report-file-selector",
	"search-results-ranking-list",
	"worktree-task-switcher",
	"module-planning-editor",
	"spend-confirmation-prompt",
] as const;

export interface KeyboardTargetMetadata {
	view: KeyboardTargetView;
	title: string;
	defaultHotkey: string;
	description: string;
	defaultCandidates: readonly string[];
}

export const KEYBOARD_TARGET_METADATA: Record<KeyboardTargetView, KeyboardTargetMetadata> = {
	"test-failure-stack-viewer": {
		view: "test-failure-stack-viewer",
		title: "Test Failure Stack Trace Viewer",
		defaultHotkey: "Ctrl+Alt+T",
		description: "Quick toggle to inspect failed test backtraces.",
		defaultCandidates: ["failed-tests", "rerun-suite", "filter-stack", "show-context"],
	},
	"web-research-source-picker": {
		view: "web-research-source-picker",
		title: "Web Research Source Picker",
		defaultHotkey: "Ctrl+Alt+W",
		description: "Toggle list of discovered web evidence sources.",
		defaultCandidates: ["select-all", "filter-official", "exclude-domain", "inspect-raw"],
	},
	"skill-catalog-explorer": {
		view: "skill-catalog-explorer",
		title: "Skill Catalog Explorer",
		defaultHotkey: "Ctrl+Alt+S",
		description: "Toggle autonomous agent skill procedure selector.",
		defaultCandidates: ["db-migration", "code-lint", "deploy-checklist", "git-rebase"],
	},
	"dependency-graph-node-inspector": {
		view: "dependency-graph-node-inspector",
		title: "Dependency Graph Node Inspector",
		defaultHotkey: "Ctrl+Alt+G",
		description: "Toggle graph node inspect panel and blast radius.",
		defaultCandidates: ["node-metadata", "upstream-deps", "downstream-dependents", "cycles"],
	},
	"header-telemetry-hud": {
		view: "header-telemetry-hud",
		title: "Header Telemetry HUD",
		defaultHotkey: "Ctrl+Alt+H",
		description: "Toggle header status bar and sparkline telemetry.",
		defaultCandidates: ["toggle-sparkline", "view-tokens", "view-memory", "reset-counters"],
	},
	"interactive-diff-patch-selector": {
		view: "interactive-diff-patch-selector",
		title: "Interactive Diff Patch Chunk Selector",
		defaultHotkey: "Ctrl+Alt+D",
		description: "Toggle interactive hunk-by-hunk patch selector.",
		defaultCandidates: ["stage-hunk", "discard-hunk", "split-hunk", "invert-diff"],
	},
	"file-risk-flag-review-modal": {
		view: "file-risk-flag-review-modal",
		title: "File Risk Flag Review Modal",
		defaultHotkey: "Ctrl+Alt+R",
		description: "Toggle repo scanner file risk review modal.",
		defaultCandidates: ["approve-file", "block-file", "view-entropy", "show-secret-diff"],
	},
	"theme-color-picker": {
		view: "theme-color-picker",
		title: "Theme Color Picker",
		defaultHotkey: "Ctrl+Alt+C",
		description: "Toggle theme saturation and color palette picker.",
		defaultCandidates: ["theme-dark", "theme-light", "saturation-monochrome", "saturation-vivid"],
	},
	"live-web-preview-control-panel": {
		view: "live-web-preview-control-panel",
		title: "Live Web Preview Control Panel",
		defaultHotkey: "Ctrl+Alt+P",
		description: "Toggle local serve web documentation preview server.",
		defaultCandidates: ["open-browser", "restart-server", "notify-sse", "export-bundle"],
	},
	"help-documentation-browser": {
		view: "help-documentation-browser",
		title: "Help Documentation Browser",
		defaultHotkey: "Ctrl+Alt+?",
		description: "Toggle built-in help cheat-sheet and keymap reference.",
		defaultCandidates: ["cheatsheet", "shortcuts", "slash-commands", "roadmap-overview"],
	},
	"slash-command-palette": {
		view: "slash-command-palette",
		title: "Slash Command Palette",
		defaultHotkey: "Ctrl+K",
		description: "Interactive slash command launcher.",
		defaultCandidates: ["/scan", "/symbols", "/plan", "/wiki", "/verify", "/serve"],
	},
	"chat-transcript-message-list": {
		view: "chat-transcript-message-list",
		title: "Chat Transcript Message List",
		defaultHotkey: "Ctrl+T",
		description: "Transcript message history and turn selector.",
		defaultCandidates: ["jump-to-first", "jump-to-last", "filter-errors", "export-transcript"],
	},
	"wiki-document-toc": {
		view: "wiki-document-toc",
		title: "Wiki Document Table of Contents",
		defaultHotkey: "Ctrl+O",
		description: "Table of contents navigation for current chapter.",
		defaultCandidates: ["intro", "architecture", "data-structures", "verification", "summary"],
	},
	"knowledge-card-browser": {
		view: "knowledge-card-browser",
		title: "Knowledge Card Browser",
		defaultHotkey: "Ctrl+J",
		description: "Fact card search and inspection list.",
		defaultCandidates: ["filter-current", "filter-stale", "sort-symbol", "search-claim"],
	},
	"ast-symbol-declaration-search": {
		view: "ast-symbol-declaration-search",
		title: "AST Symbol Declaration Search",
		defaultHotkey: "Ctrl+Shift+F",
		description: "Lookup AST symbols across project files.",
		defaultCandidates: ["classes", "interfaces", "functions", "types", "constants"],
	},
	"drift-report-file-selector": {
		view: "drift-report-file-selector",
		title: "Drift Report File Selector",
		defaultHotkey: "Ctrl+Shift+D",
		description: "Selector for files exhibiting truth drift.",
		defaultCandidates: ["stale-wiki", "stale-cards", "orphan-facts", "refresh-all"],
	},
	"search-results-ranking-list": {
		view: "search-results-ranking-list",
		title: "Search Results Ranking List",
		defaultHotkey: "Ctrl+F",
		description: "Ranked BM25 search hit results list.",
		defaultCandidates: ["sort-bm25", "filter-repo", "filter-wiki", "exact-match"],
	},
	"worktree-task-switcher": {
		view: "worktree-task-switcher",
		title: "Worktree Task Switcher",
		defaultHotkey: "Ctrl+W",
		description: "Switcher across isolated git worktree branches.",
		defaultCandidates: ["switch-master", "new-worktree", "merge-branch", "prune-clean"],
	},
	"module-planning-editor": {
		view: "module-planning-editor",
		title: "Module Planning Editor",
		defaultHotkey: "Ctrl+M",
		description: "Architecture module decomposition editor.",
		defaultCandidates: ["add-step", "remove-step", "reorder-steps", "validate-plan"],
	},
	"spend-confirmation-prompt": {
		view: "spend-confirmation-prompt",
		title: "Spend Confirmation Prompt",
		defaultHotkey: "Ctrl+Y",
		description: "Token budget confirmation modal prompt.",
		defaultCandidates: ["confirm-spend", "cancel-spend", "decrease-power", "switch-model"],
	},
};

/* -------------------------------------------------------------------------- */
/* Theme 1: Dedicated Global Hotkey Shortcut Registry (UX-0351 – UX-0360)      */
/* -------------------------------------------------------------------------- */

export class DedicatedGlobalHotkeyRegistry {
	private targetStates = new Map<KeyboardTargetView, boolean>();
	private customHotkeys = new Map<KeyboardTargetView, string>();

	constructor() {
		// Initialize state for all targets as closed
		for (const target of ALL_KEYBOARD_TARGET_VIEWS) {
			this.targetStates.set(target, false);
		}
	}

	getHotkeyForTarget(target: KeyboardTargetView): string {
		return this.customHotkeys.get(target) || KEYBOARD_TARGET_METADATA[target].defaultHotkey;
	}

	setCustomHotkey(target: KeyboardTargetView, hotkey: string): void {
		this.customHotkeys.set(target, hotkey);
	}

	isTargetOpen(target: KeyboardTargetView): boolean {
		return this.targetStates.get(target) ?? false;
	}

	setTargetOpen(target: KeyboardTargetView, open: boolean): void {
		this.targetStates.set(target, open);
	}

	toggleTargetView(target: KeyboardTargetView): {
		target: KeyboardTargetView;
		open: boolean;
		hotkey: string;
	} {
		const nextState = !this.isTargetOpen(target);
		this.setTargetOpen(target, nextState);
		return {
			target,
			open: nextState,
			hotkey: this.getHotkeyForTarget(target),
		};
	}
}

/* -------------------------------------------------------------------------- */
/* Theme 2: Multi-Level Undo/Redo Keyboard Stack (UX-0361 – UX-0380)           */
/* -------------------------------------------------------------------------- */

export interface UndoRedoState<T = unknown> {
	value: T;
	timestamp: number;
}

export class MultiLevelUndoRedoStack<T = unknown> {
	private undoStacks = new Map<KeyboardTargetView, UndoRedoState<T>[]>();
	private redoStacks = new Map<KeyboardTargetView, UndoRedoState<T>[]>();
	readonly maxDepth: number;

	constructor(maxDepth = 50) {
		this.maxDepth = maxDepth;
		for (const target of ALL_KEYBOARD_TARGET_VIEWS) {
			this.undoStacks.set(target, []);
			this.redoStacks.set(target, []);
		}
	}

	pushState(target: KeyboardTargetView, value: T): void {
		const stack = this.undoStacks.get(target) || [];
		stack.push({ value, timestamp: Date.now() });
		if (stack.length > this.maxDepth) {
			stack.shift();
		}
		this.undoStacks.set(target, stack);
		// Pushing a new state clears redo
		this.redoStacks.set(target, []);
	}

	canUndo(target: KeyboardTargetView): boolean {
		return (this.undoStacks.get(target)?.length ?? 0) > 1;
	}

	canRedo(target: KeyboardTargetView): boolean {
		return (this.redoStacks.get(target)?.length ?? 0) > 0;
	}

	undo(target: KeyboardTargetView): T | undefined {
		const undoStack = this.undoStacks.get(target);
		if (!undoStack || undoStack.length <= 1) return undefined;

		const current = undoStack.pop() as UndoRedoState<T>;
		const redoStack = this.redoStacks.get(target) || [];
		redoStack.push(current);
		this.redoStacks.set(target, redoStack);

		const previous = undoStack[undoStack.length - 1];
		return previous?.value;
	}

	redo(target: KeyboardTargetView): T | undefined {
		const redoStack = this.redoStacks.get(target);
		if (!redoStack || redoStack.length === 0) return undefined;

		const next = redoStack.pop() as UndoRedoState<T>;
		const undoStack = this.undoStacks.get(target) || [];
		undoStack.push(next);
		this.undoStacks.set(target, undoStack);

		return next.value;
	}

	getDepth(target: KeyboardTargetView): { undoCount: number; redoCount: number } {
		return {
			undoCount: this.undoStacks.get(target)?.length ?? 0,
			redoCount: this.redoStacks.get(target)?.length ?? 0,
		};
	}
}

/* -------------------------------------------------------------------------- */
/* Theme 3: Interactive Tab-Completion Cycling (UX-0381 – UX-0400)             */
/* -------------------------------------------------------------------------- */

export class TabCompletionCycler {
	private candidateSets = new Map<KeyboardTargetView, string[]>();
	private currentIndices = new Map<KeyboardTargetView, number>();

	constructor() {
		for (const target of ALL_KEYBOARD_TARGET_VIEWS) {
			this.candidateSets.set(target, [...KEYBOARD_TARGET_METADATA[target].defaultCandidates]);
			this.currentIndices.set(target, 0);
		}
	}

	setCandidates(target: KeyboardTargetView, candidates: string[]): void {
		this.candidateSets.set(target, [...candidates]);
		this.currentIndices.set(target, 0);
	}

	getCandidates(target: KeyboardTargetView): readonly string[] {
		return this.candidateSets.get(target) || [];
	}

	getCurrentIndex(target: KeyboardTargetView): number {
		return this.currentIndices.get(target) || 0;
	}

	getCurrentCandidate(target: KeyboardTargetView): string | undefined {
		const list = this.getCandidates(target);
		if (list.length === 0) return undefined;
		const idx = this.getCurrentIndex(target);
		return list[idx % list.length];
	}

	cycleNext(target: KeyboardTargetView): string | undefined {
		const list = this.getCandidates(target);
		if (list.length === 0) return undefined;
		const nextIdx = (this.getCurrentIndex(target) + 1) % list.length;
		this.currentIndices.set(target, nextIdx);
		return list[nextIdx];
	}

	cyclePrev(target: KeyboardTargetView): string | undefined {
		const list = this.getCandidates(target);
		if (list.length === 0) return undefined;
		const prevIdx = (this.getCurrentIndex(target) - 1 + list.length) % list.length;
		this.currentIndices.set(target, prevIdx);
		return list[prevIdx];
	}
}
