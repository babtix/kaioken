import { describe, expect, it } from "vitest";
import {
	VimListNavigator,
	CommandPalette,
	DEFAULT_KAIOKEN_COMMANDS,
	fuzzyMatchWithIndices,
	GlobalShortcutManager,
	ContextualQuickActionMenu,
	createSymbolActions,
	createCardActions,
	createDocumentActions,
	KeyboardCheatSheet,
	DEFAULT_CHEAT_SHEET_SECTIONS,
} from "../ui/index.ts";

describe("Step 20.1: Vim-style navigation hotkeys (UX-0301 - UX-0310)", () => {
	it("navigates down with 'j' and wraps to start", () => {
		const nav = new VimListNavigator(["first", "second", "third"], { wrap: true });
		expect(nav.getSelectedIndex()).toBe(0);
		expect(nav.getSelectedItem()).toBe("first");

		expect(nav.handleKey("j")).toBe(true);
		expect(nav.getSelectedIndex()).toBe(1);

		expect(nav.handleKey("j")).toBe(true);
		expect(nav.getSelectedIndex()).toBe(2);

		// Wraps to 0
		expect(nav.handleKey("j")).toBe(true);
		expect(nav.getSelectedIndex()).toBe(0);
	});

	it("navigates up with 'k' and wraps to end", () => {
		const nav = new VimListNavigator(["first", "second", "third"], { wrap: true });
		expect(nav.handleKey("k")).toBe(true);
		expect(nav.getSelectedIndex()).toBe(2);

		expect(nav.handleKey("k")).toBe(true);
		expect(nav.getSelectedIndex()).toBe(1);
	});

	it("respects wrap: false boundary clamping", () => {
		const nav = new VimListNavigator(["a", "b", "c"], { wrap: false });
		nav.handleKey("k");
		expect(nav.getSelectedIndex()).toBe(0); // clamped at 0

		nav.handleKey("j");
		nav.handleKey("j");
		nav.handleKey("j");
		expect(nav.getSelectedIndex()).toBe(2); // clamped at 2
	});

	it("jumps to bottom with 'G' and top with 'g'/'gg'", () => {
		const nav = new VimListNavigator(["one", "two", "three", "four", "five"]);
		nav.handleKey("G");
		expect(nav.getSelectedIndex()).toBe(4);

		nav.handleKey("g");
		nav.handleKey("g"); // gg sequence
		expect(nav.getSelectedIndex()).toBe(0);
	});

	it("supports page down (Ctrl+D) and page up (Ctrl+U)", () => {
		const items = Array.from({ length: 20 }, (_, i) => `item-${i}`);
		const nav = new VimListNavigator(items, { pageSize: 5 });

		nav.handleKey("\x04"); // Ctrl+D
		expect(nav.getSelectedIndex()).toBe(5);

		nav.handleKey("\x04");
		expect(nav.getSelectedIndex()).toBe(10);

		nav.handleKey("\x15"); // Ctrl+U
		expect(nav.getSelectedIndex()).toBe(5);
	});

	it("fires onSelectionChange and onSelect callbacks", () => {
		let changedItem = "";
		let selectedItem = "";
		const nav = new VimListNavigator(["alpha", "beta", "gamma"]);
		nav.onSelectionChange = (item) => {
			changedItem = item;
		};
		nav.onSelect = (item) => {
			selectedItem = item;
		};

		nav.handleKey("j");
		expect(changedItem).toBe("beta");

		nav.handleKey("\r"); // Enter
		expect(selectedItem).toBe("beta");
	});
});

describe("Step 20.2: Fuzzy search quick selector command palette (UX-0311 - UX-0320)", () => {
	it("scores matches with fuzzyMatchWithIndices", () => {
		const res = fuzzyMatchWithIndices("ver", "/kaio-verify");
		expect(res.matches).toBe(true);
		expect(res.indices.length).toBe(3);
		expect(res.score).toBeLessThan(0);

		const nonMatch = fuzzyMatchWithIndices("xyz", "/kaio-verify");
		expect(nonMatch.matches).toBe(false);
	});

	it("initializes command palette with default Kaioken commands", () => {
		const palette = new CommandPalette();
		expect(palette.getFilteredItems().length).toBe(DEFAULT_KAIOKEN_COMMANDS.length);
		expect(palette.isPaletteOpen()).toBe(true);
	});

	it("filters items by fuzzy query and updates selection", () => {
		const palette = new CommandPalette();
		palette.setQuery("ver");
		const items = palette.getFilteredItems();
		expect(items.some((i) => i.title === "/kaio-verify")).toBe(true);
	});

	it("handles arrow navigation and typing inputs", () => {
		const palette = new CommandPalette();
		palette.handleKey("w");
		palette.handleKey("i");
		palette.handleKey("k");
		palette.handleKey("i");
		expect(palette.getQuery()).toBe("wiki");

		const filtered = palette.getFilteredItems();
		expect(filtered[0]?.title).toBe("/kaio-wiki");

		palette.handleKey("down");
		expect(palette.getSelectedIndex()).toBeLessThanOrEqual(filtered.length - 1);

		palette.handleKey("backspace");
		expect(palette.getQuery()).toBe("wik");
	});

	it("executes selected action on Enter", () => {
		let executed = false;
		const custom = [
			{
				id: "custom",
				title: "Custom Action",
				action: () => {
					executed = true;
				},
			},
		];
		const palette = new CommandPalette(custom);
		const res = palette.handleKey("enter");
		expect(res.executed).toBe(true);
		expect(executed).toBe(true);
		expect(palette.isPaletteOpen()).toBe(false);
	});

	it("renders palette with box borders and prompt", () => {
		const palette = new CommandPalette();
		const lines = palette.render(80);
		expect(lines.length).toBeGreaterThan(5);
		expect(lines[0]).toMatch(/^[+┌]/);
		expect(lines.some((l) => l.includes(">"))).toBe(true);
		expect(lines[lines.length - 1]).toMatch(/^[+└]/);
	});
});

describe("Step 20.3: Global hotkey shortcuts & panel toggles (UX-0321 - UX-0330)", () => {
	it("registers default shortcuts (HUD, drawer, palette, cheatsheet)", () => {
		const mgr = new GlobalShortcutManager();
		const shortcuts = mgr.getShortcuts();
		expect(shortcuts.some((s) => s.id === "toggle_hud")).toBe(true);
		expect(shortcuts.some((s) => s.id === "toggle_drawer")).toBe(true);
		expect(shortcuts.some((s) => s.id === "toggle_palette")).toBe(true);
		expect(shortcuts.some((s) => s.id === "toggle_cheatsheet")).toBe(true);
	});

	it("toggles HUD state and triggers onToggleHud", () => {
		let reported = true;
		const mgr = new GlobalShortcutManager();
		mgr.onToggleHud = (vis) => {
			reported = vis;
		};

		expect(mgr.isHudVisible()).toBe(true);
		const next = mgr.toggleHud();
		expect(next).toBe(false);
		expect(reported).toBe(false);
		expect(mgr.isHudVisible()).toBe(false);
	});

	it("dispatches hotkey handlers via handleKey", () => {
		const mgr = new GlobalShortcutManager();
		expect(mgr.isHudVisible()).toBe(true);
		expect(mgr.handleKey("ctrl+h")).toBe(true);
		expect(mgr.isHudVisible()).toBe(false);

		expect(mgr.handleKey("ctrl+b")).toBe(true);
		expect(mgr.isDrawerOpen()).toBe(true);
	});

	it("loads custom keymap overrides from JSON", () => {
		const mgr = new GlobalShortcutManager();
		const json = JSON.stringify({
			toggle_hud: ["ctrl+alt+h", "f9"],
		});
		const res = mgr.loadKeymapsJson(json);
		expect(res.success).toBe(true);
		expect(mgr.handleKey("f9")).toBe(true);
	});

	it("reports no default conflicts in clean state", () => {
		const mgr = new GlobalShortcutManager();
		const conflicts = mgr.detectConflicts();
		expect(conflicts.length).toBe(0);
	});
});

describe("Step 20.4: Contextual quick-action menu (Alt+Enter) (UX-0331 - UX-0340)", () => {
	it("creates symbol-specific quick actions", () => {
		let inspected = false;
		const actions = createSymbolActions("buildGraph", "src/graph.ts", 42, {
			onInspect: () => {
				inspected = true;
			},
		});
		expect(actions.length).toBe(4);
		expect(actions[0]?.label).toContain("buildGraph");

		actions[0]?.action();
		expect(inspected).toBe(true);
	});

	it("creates card-specific quick actions", () => {
		const actions = createCardActions("card-101", "AST Symbol Anchor");
		expect(actions.length).toBe(4);
		expect(actions[0]?.label).toContain("AST Symbol Anchor");
	});

	it("creates document-specific quick actions", () => {
		const actions = createDocumentActions("docs/architecture.md");
		expect(actions.length).toBe(4);
		expect(actions[0]?.label).toContain("docs/architecture.md");
	});

	it("triggers action directly with numeric key shortcut '1'", () => {
		let ran = false;
		const actions = [
			{
				id: "action-1",
				label: "First Action",
				shortcutKey: "1",
				description: "Runs first action",
				action: () => {
					ran = true;
				},
			},
		];
		const menu = new ContextualQuickActionMenu("Symbol Target", "symbol", actions);
		const result = menu.handleKey("1");
		expect(result.executed).toBe(true);
		expect(ran).toBe(true);
		expect(menu.isOpenMenu()).toBe(false);
	});

	it("renders quick-action menu overlay frame", () => {
		const actions = createSymbolActions("Oracle", "index.ts");
		const menu = new ContextualQuickActionMenu("Oracle", "symbol", actions);
		const rendered = menu.render(70);
		expect(rendered.length).toBeGreaterThan(5);
		expect(rendered[0]).toMatch(/^[+┌]/);
		expect(rendered.some((l) => l.includes("Quick Actions"))).toBe(true);
		expect(rendered.some((l) => l.includes("[1]"))).toBe(true);
	});
});

describe("Step 20.5: Visual keyboard cheat-sheet overlay (UX-0341 - UX-0350)", () => {
	it("contains default categories in cheat sheet", () => {
		const sheet = new KeyboardCheatSheet();
		expect(DEFAULT_CHEAT_SHEET_SECTIONS.length).toBeGreaterThanOrEqual(4);
		expect(sheet.isOpenSheet()).toBe(true);
	});

	it("dismisses cheat-sheet on 'q', '?', or 'escape'", () => {
		const sheet = new KeyboardCheatSheet();
		expect(sheet.isOpenSheet()).toBe(true);

		const res = sheet.handleKey("q");
		expect(res.closed).toBe(true);
		expect(sheet.isOpenSheet()).toBe(false);

		sheet.open();
		expect(sheet.isOpenSheet()).toBe(true);
		sheet.handleKey("escape");
		expect(sheet.isOpenSheet()).toBe(false);
	});

	it("renders formatted cheat-sheet card with border and sections", () => {
		const sheet = new KeyboardCheatSheet();
		const lines = sheet.render(80, 25);
		expect(lines.length).toBeGreaterThan(10);
		expect(lines[0]).toMatch(/^[+┌]/);
		expect(lines.some((l) => l.includes("KAIOKEN KEYBOARD SHORTCUTS"))).toBe(true);
		expect(lines[lines.length - 1]).toMatch(/^[+└]/);
	});
});
