/**
 * Vim-Style Navigation Hotkeys (j/k, g/G, ctrl+d/u) across lists.
 *
 * Implements Step 20.1 (Category 04: #UX-0301 - #UX-0310).
 * Supports zero-allocation list navigation with multi-key sequences,
 * wrapping, clamping, and event notifications.
 */

export interface VimNavOptions {
	wrap?: boolean;
	pageSize?: number;
	ggTimeoutMs?: number;
}

export class VimListNavigator<T> {
	private items: T[];
	private selectedIndex = 0;
	private wrap: boolean;
	private pageSize: number;
	private ggTimeoutMs: number;
	private lastKey = "";
	private lastKeyTime = 0;

	public onSelectionChange?: (item: T, index: number) => void;
	public onSelect?: (item: T, index: number) => void;

	constructor(items: T[] = [], options: VimNavOptions = {}) {
		this.items = items;
		this.wrap = options.wrap ?? true;
		this.pageSize = options.pageSize ?? 5;
		this.ggTimeoutMs = options.ggTimeoutMs ?? 500;
	}

	setItems(items: T[]): void {
		this.items = items;
		if (this.selectedIndex >= items.length) {
			this.selectedIndex = Math.max(0, items.length - 1);
		}
	}

	getItems(): T[] {
		return this.items;
	}

	getSelectedIndex(): number {
		return this.selectedIndex;
	}

	getSelectedItem(): T | undefined {
		return this.items[this.selectedIndex];
	}

	setSelectedIndex(index: number): void {
		if (this.items.length === 0) {
			this.selectedIndex = 0;
			return;
		}
		const prev = this.selectedIndex;
		this.selectedIndex = Math.max(0, Math.min(index, this.items.length - 1));
		if (this.selectedIndex !== prev) {
			this.notifyChange();
		}
	}

	moveDown(step = 1): void {
		if (this.items.length === 0) return;
		const prev = this.selectedIndex;
		if (this.wrap) {
			this.selectedIndex = (this.selectedIndex + step) % this.items.length;
		} else {
			this.selectedIndex = Math.min(this.items.length - 1, this.selectedIndex + step);
		}
		if (this.selectedIndex !== prev) this.notifyChange();
	}

	moveUp(step = 1): void {
		if (this.items.length === 0) return;
		const prev = this.selectedIndex;
		if (this.wrap) {
			this.selectedIndex = (this.selectedIndex - step + this.items.length) % this.items.length;
		} else {
			this.selectedIndex = Math.max(0, this.selectedIndex - step);
		}
		if (this.selectedIndex !== prev) this.notifyChange();
	}

	moveToTop(): void {
		if (this.items.length === 0) return;
		const prev = this.selectedIndex;
		this.selectedIndex = 0;
		if (this.selectedIndex !== prev) this.notifyChange();
	}

	moveToBottom(): void {
		if (this.items.length === 0) return;
		const prev = this.selectedIndex;
		this.selectedIndex = Math.max(0, this.items.length - 1);
		if (this.selectedIndex !== prev) this.notifyChange();
	}

	pageDown(): void {
		this.moveDown(this.pageSize);
	}

	pageUp(): void {
		this.moveUp(this.pageSize);
	}

	/**
	 * Process a keypress string and update navigation state.
	 * Returns true if the key was handled as a navigation command.
	 */
	handleKey(keyData: string): boolean {
		if (this.items.length === 0) return false;
		const now = Date.now();

		// Down: 'j', Down arrow (\x1b[B), Ctrl+N (\x0e)
		if (keyData === "j" || keyData === "\x1b[B" || keyData === "\x0e") {
			this.moveDown();
			this.resetSequence();
			return true;
		}

		// Up: 'k', Up arrow (\x1b[A), Ctrl+P (\x10)
		if (keyData === "k" || keyData === "\x1b[A" || keyData === "\x10") {
			this.moveUp();
			this.resetSequence();
			return true;
		}

		// Page Down: Ctrl+D (\x04), PageDown (\x1b[6~)
		if (keyData === "\x04" || keyData === "\x1b[6~") {
			this.pageDown();
			this.resetSequence();
			return true;
		}

		// Page Up: Ctrl+U (\x15), PageUp (\x1b[5~)
		if (keyData === "\x15" || keyData === "\x1b[5~") {
			this.pageUp();
			this.resetSequence();
			return true;
		}

		// Bottom: 'G', Shift+G, End (\x1b[F or \x1b[4~)
		if (keyData === "G" || keyData === "shift+g" || keyData === "\x1b[F" || keyData === "\x1b[4~") {
			this.moveToBottom();
			this.resetSequence();
			return true;
		}

		// Top: Home (\x1b[H or \x1b[1~)
		if (keyData === "\x1b[H" || keyData === "\x1b[1~") {
			this.moveToTop();
			this.resetSequence();
			return true;
		}

		// 'g' or 'gg' sequence:
		if (keyData === "g") {
			if (this.lastKey === "g" && now - this.lastKeyTime <= this.ggTimeoutMs) {
				this.moveToTop();
				this.resetSequence();
				return true;
			}
			this.lastKey = "g";
			this.lastKeyTime = now;
			return true;
		}

		// Confirm / Select: Enter (\r or \n)
		if (keyData === "\r" || keyData === "\n" || keyData === "enter") {
			const item = this.getSelectedItem();
			if (item !== undefined && this.onSelect) {
				this.onSelect(item, this.selectedIndex);
			}
			this.resetSequence();
			return true;
		}

		this.resetSequence();
		return false;
	}

	private resetSequence(): void {
		this.lastKey = "";
		this.lastKeyTime = 0;
	}

	private notifyChange(): void {
		const item = this.getSelectedItem();
		if (item !== undefined && this.onSelectionChange) {
			this.onSelectionChange(item, this.selectedIndex);
		}
	}
}
