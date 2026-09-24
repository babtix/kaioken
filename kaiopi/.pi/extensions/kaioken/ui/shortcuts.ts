/**
 * Global Hotkey Shortcuts & Panel Toggles.
 *
 * Implements Step 20.3 (Category 04: #UX-0321 - #UX-0330).
 * Manages global keyboard shortcuts to toggle HUD, drawer panes,
 * command palette, and cheat-sheet with custom JSON keymaps and conflict detection.
 */

export interface KeyShortcut {
	id: string;
	name: string;
	description: string;
	defaultKeys: string[];
	action: () => void;
}

export interface KeyConflict {
	key: string;
	shortcutIds: string[];
}

export class GlobalShortcutManager {
	private shortcuts = new Map<string, KeyShortcut>();
	private keyToShortcut = new Map<string, string>();
	private hudVisible = true;
	private drawerOpen = false;
	private paletteOpen = false;
	private cheatSheetOpen = false;

	public onToggleHud?: (visible: boolean) => void;
	public onToggleDrawer?: (open: boolean) => void;
	public onTogglePalette?: (open: boolean) => void;
	public onToggleCheatSheet?: (open: boolean) => void;

	constructor() {
		this.registerDefaults();
	}

	private registerDefaults(): void {
		// Toggle Telemetry HUD
		this.register({
			id: "toggle_hud",
			name: "Toggle HUD",
			description: "Toggle telemetry HUD sparklines & freshness status",
			defaultKeys: ["\x08", "ctrl+h", "\x1b[12~"], // \x08 is ctrl+h, F2 is \x1b[12~ or \x1bOQ
			action: () => this.toggleHud(),
		});

		// Toggle Drawer / Sidebar
		this.register({
			id: "toggle_drawer",
			name: "Toggle Drawer",
			description: "Toggle side drawer / secondary inspection pane",
			defaultKeys: ["\x02", "ctrl+b", "\x1b[13~"], // \x02 is ctrl+b, F3 is \x1b[13~ or \x1bOR
			action: () => this.toggleDrawer(),
		});

		// Toggle Command Palette
		this.register({
			id: "toggle_palette",
			name: "Toggle Command Palette",
			description: "Open or dismiss fuzzy search command palette",
			defaultKeys: ["\x10", "ctrl+p"], // \x10 is ctrl+p
			action: () => this.togglePalette(),
		});

		// Toggle Keyboard Cheat-Sheet
		this.register({
			id: "toggle_cheatsheet",
			name: "Toggle Cheat-Sheet",
			description: "Display visual keyboard cheat-sheet overlay",
			defaultKeys: ["?", "\x1b[11~", "f1"], // \x1b[11~ is F1
			action: () => this.toggleCheatSheet(),
		});
	}

	register(shortcut: KeyShortcut): void {
		this.shortcuts.set(shortcut.id, shortcut);
		for (const key of shortcut.defaultKeys) {
			this.keyToShortcut.set(key.toLowerCase(), shortcut.id);
		}
	}

	unregister(id: string): void {
		const shortcut = this.shortcuts.get(id);
		if (!shortcut) return;
		for (const key of shortcut.defaultKeys) {
			if (this.keyToShortcut.get(key.toLowerCase()) === id) {
				this.keyToShortcut.delete(key.toLowerCase());
			}
		}
		this.shortcuts.delete(id);
	}

	getShortcuts(): KeyShortcut[] {
		return Array.from(this.shortcuts.values());
	}

	isHudVisible(): boolean {
		return this.hudVisible;
	}

	setHudVisible(visible: boolean): void {
		this.hudVisible = visible;
		this.onToggleHud?.(visible);
	}

	toggleHud(): boolean {
		this.hudVisible = !this.hudVisible;
		this.onToggleHud?.(this.hudVisible);
		return this.hudVisible;
	}

	isDrawerOpen(): boolean {
		return this.drawerOpen;
	}

	setDrawerOpen(open: boolean): void {
		this.drawerOpen = open;
		this.onToggleDrawer?.(open);
	}

	toggleDrawer(): boolean {
		this.drawerOpen = !this.drawerOpen;
		this.onToggleDrawer?.(this.drawerOpen);
		return this.drawerOpen;
	}

	isPaletteOpen(): boolean {
		return this.paletteOpen;
	}

	togglePalette(): boolean {
		this.paletteOpen = !this.paletteOpen;
		this.onTogglePalette?.(this.paletteOpen);
		return this.paletteOpen;
	}

	isCheatSheetOpen(): boolean {
		return this.cheatSheetOpen;
	}

	toggleCheatSheet(): boolean {
		this.cheatSheetOpen = !this.cheatSheetOpen;
		this.onToggleCheatSheet?.(this.cheatSheetOpen);
		return this.cheatSheetOpen;
	}

	/**
	 * Load custom keymap mappings from JSON.
	 * Overrides or augments existing defaultKeys.
	 */
	loadKeymapsJson(jsonString: string): { success: boolean; error?: string } {
		try {
			const config = JSON.parse(jsonString);
			if (typeof config !== "object" || config === null) {
				return { success: false, error: "Invalid keymap JSON: root must be object" };
			}

			for (const [id, keys] of Object.entries(config)) {
				const shortcut = this.shortcuts.get(id);
				if (!shortcut) continue;
				const keyList = Array.isArray(keys) ? keys : [keys];
				for (const k of keyList) {
					if (typeof k === "string") {
						this.keyToShortcut.set(k.toLowerCase(), id);
					}
				}
			}
			return { success: true };
		} catch (err) {
			return { success: false, error: String(err) };
		}
	}

	/**
	 * Detect conflicts where a single key mapping maps to multiple shortcuts.
	 */
	detectConflicts(): KeyConflict[] {
		const keyMap = new Map<string, Set<string>>();
		for (const shortcut of this.shortcuts.values()) {
			for (const key of shortcut.defaultKeys) {
				const k = key.toLowerCase();
				const existing = keyMap.get(k) ?? new Set<string>();
				existing.add(shortcut.id);
				keyMap.set(k, existing);
			}
		}

		const conflicts: KeyConflict[] = [];
		for (const [key, ids] of keyMap.entries()) {
			if (ids.size > 1) {
				conflicts.push({ key, shortcutIds: Array.from(ids) });
			}
		}
		return conflicts;
	}

	/**
	 * Handle an incoming key event. Returns true if handled.
	 */
	handleKey(keyData: string): boolean {
		const shortcutId = this.keyToShortcut.get(keyData.toLowerCase());
		if (!shortcutId) return false;

		const shortcut = this.shortcuts.get(shortcutId);
		if (shortcut) {
			try {
				shortcut.action();
				return true;
			} catch {
				return false;
			}
		}
		return false;
	}
}
