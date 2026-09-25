import { describe, expect, it } from "vitest";
import {
	ALL_KEYBOARD_TARGET_VIEWS,
	DedicatedGlobalHotkeyRegistry,
	KEYBOARD_TARGET_METADATA,
	type KeyboardTargetView,
	MultiLevelUndoRedoStack,
	TabCompletionCycler,
} from "../ui/index.ts";

describe("Step 40: Category 04 — Keyboard Navigation, Shortcuts & Command Palette (UX-0351 – UX-0400)", () => {
	it("defines all 20 canonical keyboard target views with metadata", () => {
		expect(ALL_KEYBOARD_TARGET_VIEWS).toHaveLength(20);
		for (const view of ALL_KEYBOARD_TARGET_VIEWS) {
			const meta = KEYBOARD_TARGET_METADATA[view];
			expect(meta).toBeDefined();
			expect(meta.title.length).toBeGreaterThan(0);
			expect(meta.defaultHotkey.length).toBeGreaterThan(0);
			expect(meta.defaultCandidates.length).toBeGreaterThanOrEqual(3);
		}
	});

	/* -------------------------------------------------------------------------- */
	/* Theme 1: Dedicated Global Hotkey Shortcuts (UX-0351 – UX-0360)             */
	/* -------------------------------------------------------------------------- */
	describe("Theme 1: Dedicated global hotkey shortcut to immediately toggle target viewers (UX-0351 – UX-0360)", () => {
		const testCases: Array<{ view: KeyboardTargetView; uxId: string }> = [
			{ view: "test-failure-stack-viewer", uxId: "UX-0351" },
			{ view: "web-research-source-picker", uxId: "UX-0352" },
			{ view: "skill-catalog-explorer", uxId: "UX-0353" },
			{ view: "dependency-graph-node-inspector", uxId: "UX-0354" },
			{ view: "header-telemetry-hud", uxId: "UX-0355" },
			{ view: "interactive-diff-patch-selector", uxId: "UX-0356" },
			{ view: "file-risk-flag-review-modal", uxId: "UX-0357" },
			{ view: "theme-color-picker", uxId: "UX-0358" },
			{ view: "live-web-preview-control-panel", uxId: "UX-0359" },
			{ view: "help-documentation-browser", uxId: "UX-0360" },
		];

		for (const { view, uxId } of testCases) {
			it(`[${uxId}] manages dedicated global hotkey shortcut to toggle ${view}`, () => {
				const registry = new DedicatedGlobalHotkeyRegistry();
				expect(registry.isTargetOpen(view)).toBe(false);

				const hotkey = registry.getHotkeyForTarget(view);
				expect(hotkey).toBe(KEYBOARD_TARGET_METADATA[view].defaultHotkey);

				// First toggle opens
				const toggle1 = registry.toggleTargetView(view);
				expect(toggle1.open).toBe(true);
				expect(registry.isTargetOpen(view)).toBe(true);

				// Second toggle closes
				const toggle2 = registry.toggleTargetView(view);
				expect(toggle2.open).toBe(false);
				expect(registry.isTargetOpen(view)).toBe(false);
			});
		}
	});

	/* -------------------------------------------------------------------------- */
	/* Theme 2: Multi-Level Undo/Redo Keyboard Stack (UX-0361 – UX-0380)           */
	/* -------------------------------------------------------------------------- */
	describe("Theme 2: Multi-level undo/redo keyboard stack across all 20 views (UX-0361 – UX-0380)", () => {
		const testCases: Array<{ view: KeyboardTargetView; uxId: string }> = [
			{ view: "slash-command-palette", uxId: "UX-0361" },
			{ view: "chat-transcript-message-list", uxId: "UX-0362" },
			{ view: "wiki-document-toc", uxId: "UX-0363" },
			{ view: "knowledge-card-browser", uxId: "UX-0364" },
			{ view: "ast-symbol-declaration-search", uxId: "UX-0365" },
			{ view: "drift-report-file-selector", uxId: "UX-0366" },
			{ view: "search-results-ranking-list", uxId: "UX-0367" },
			{ view: "worktree-task-switcher", uxId: "UX-0368" },
			{ view: "module-planning-editor", uxId: "UX-0369" },
			{ view: "spend-confirmation-prompt", uxId: "UX-0370" },
			{ view: "test-failure-stack-viewer", uxId: "UX-0371" },
			{ view: "web-research-source-picker", uxId: "UX-0372" },
			{ view: "skill-catalog-explorer", uxId: "UX-0373" },
			{ view: "dependency-graph-node-inspector", uxId: "UX-0374" },
			{ view: "header-telemetry-hud", uxId: "UX-0375" },
			{ view: "interactive-diff-patch-selector", uxId: "UX-0376" },
			{ view: "file-risk-flag-review-modal", uxId: "UX-0377" },
			{ view: "theme-color-picker", uxId: "UX-0378" },
			{ view: "live-web-preview-control-panel", uxId: "UX-0379" },
			{ view: "help-documentation-browser", uxId: "UX-0380" },
		];

		for (const { view, uxId } of testCases) {
			it(`[${uxId}] pushes state, performs undo and redo for ${view}`, () => {
				const stack = new MultiLevelUndoRedoStack<string>();

				// Initial state
				stack.pushState(view, "state-1");
				expect(stack.canUndo(view)).toBe(false);

				// Second state
				stack.pushState(view, "state-2");
				expect(stack.canUndo(view)).toBe(true);

				// Third state
				stack.pushState(view, "state-3");
				expect(stack.canUndo(view)).toBe(true);

				// Undo back to state-2
				const undone1 = stack.undo(view);
				expect(undone1).toBe("state-2");
				expect(stack.canRedo(view)).toBe(true);

				// Undo back to state-1
				const undone2 = stack.undo(view);
				expect(undone2).toBe("state-1");
				expect(stack.canUndo(view)).toBe(false);

				// Redo forward to state-2
				const redone1 = stack.redo(view);
				expect(redone1).toBe("state-2");
				expect(stack.canUndo(view)).toBe(true);
			});
		}
	});

	/* -------------------------------------------------------------------------- */
	/* Theme 3: Interactive Tab-Completion Cycling (UX-0381 – UX-0400)             */
	/* -------------------------------------------------------------------------- */
	describe("Theme 3: Interactive tab-completion cycling across all 20 views (UX-0381 – UX-0400)", () => {
		const testCases: Array<{ view: KeyboardTargetView; uxId: string }> = [
			{ view: "slash-command-palette", uxId: "UX-0381" },
			{ view: "chat-transcript-message-list", uxId: "UX-0382" },
			{ view: "wiki-document-toc", uxId: "UX-0383" },
			{ view: "knowledge-card-browser", uxId: "UX-0384" },
			{ view: "ast-symbol-declaration-search", uxId: "UX-0385" },
			{ view: "drift-report-file-selector", uxId: "UX-0386" },
			{ view: "search-results-ranking-list", uxId: "UX-0387" },
			{ view: "worktree-task-switcher", uxId: "UX-0388" },
			{ view: "module-planning-editor", uxId: "UX-0389" },
			{ view: "spend-confirmation-prompt", uxId: "UX-0390" },
			{ view: "test-failure-stack-viewer", uxId: "UX-0391" },
			{ view: "web-research-source-picker", uxId: "UX-0392" },
			{ view: "skill-catalog-explorer", uxId: "UX-0393" },
			{ view: "dependency-graph-node-inspector", uxId: "UX-0394" },
			{ view: "header-telemetry-hud", uxId: "UX-0395" },
			{ view: "interactive-diff-patch-selector", uxId: "UX-0396" },
			{ view: "file-risk-flag-review-modal", uxId: "UX-0397" },
			{ view: "theme-color-picker", uxId: "UX-0398" },
			{ view: "live-web-preview-control-panel", uxId: "UX-0399" },
			{ view: "help-documentation-browser", uxId: "UX-0400" },
		];

		for (const { view, uxId } of testCases) {
			it(`[${uxId}] cycles forward and backward through tab-completion candidates for ${view}`, () => {
				const cycler = new TabCompletionCycler();
				const candidates = KEYBOARD_TARGET_METADATA[view].defaultCandidates;
				expect(candidates.length).toBeGreaterThanOrEqual(3);

				// First candidate
				const first = cycler.getCurrentCandidate(view);
				expect(first).toBe(candidates[0]);

				// Cycle next (Tab)
				const second = cycler.cycleNext(view);
				expect(second).toBe(candidates[1]);

				// Cycle prev (Shift+Tab)
				const back = cycler.cyclePrev(view);
				expect(back).toBe(candidates[0]);

				// Wraparound backwards
				const wrapped = cycler.cyclePrev(view);
				expect(wrapped).toBe(candidates[candidates.length - 1]);
			});
		}
	});
});
