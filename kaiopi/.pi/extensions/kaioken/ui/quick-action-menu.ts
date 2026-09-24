/**
 * Contextual Quick-Action Menu (Alt+Enter) on Symbols, Cards, and Documents.
 *
 * Implements Step 20.4 (Category 04: #UX-0331 - #UX-0340).
 * Context-sensitive popups providing instant actions for active symbols,
 * knowledge cards, and documentation chapters.
 */

import { supportsUnicode } from "./glyphs.ts";
import { truncateAnsi, visibleWidth } from "./reflow.ts";

export interface ContextualQuickAction {
	id: string;
	label: string;
	shortcutKey: string;
	description: string;
	action: () => void | Promise<void>;
}

export type TargetKind = "symbol" | "card" | "document" | "generic";

export function createSymbolActions(
	symbolName: string,
	filePath: string,
	line = 1,
	callbacks?: {
		onInspect?: () => void;
		onImpact?: () => void;
		onRename?: () => void;
		onVerify?: () => void;
	},
): ContextualQuickAction[] {
	return [
		{
			id: "inspect-ast",
			label: `Inspect '${symbolName}' Definition`,
			shortcutKey: "1",
			description: `View AST scope & declaration context in ${filePath}:${line}`,
			action: () => callbacks?.onInspect?.(),
		},
		{
			id: "blast-radius",
			label: `Calculate Blast Radius`,
			shortcutKey: "2",
			description: `Trace all transitive dependent call-sites across repository`,
			action: () => callbacks?.onImpact?.(),
		},
		{
			id: "safe-rename",
			label: `Safe-Rename Simulation`,
			shortcutKey: "3",
			description: `Simulate semantic renaming with AST reference guarantees`,
			action: () => callbacks?.onRename?.(),
		},
		{
			id: "verify-anchor",
			label: `Verify AST Anchor`,
			shortcutKey: "4",
			description: `Ensure quote anchor and line boundaries match source code`,
			action: () => callbacks?.onVerify?.(),
		},
	];
}

export function createCardActions(
	cardId: string,
	cardTitle: string,
	callbacks?: {
		onOpen?: () => void;
		onRegenerate?: () => void;
		onExport?: () => void;
		onVerify?: () => void;
	},
): ContextualQuickAction[] {
	return [
		{
			id: "open-card",
			label: `Open Card: ${cardTitle}`,
			shortcutKey: "1",
			description: `View full atomic knowledge card facts and citations`,
			action: () => callbacks?.onOpen?.(),
		},
		{
			id: "regenerate-card",
			label: `Regenerate Knowledge Card`,
			shortcutKey: "2",
			description: `Re-synthesize fact sheet against latest source code`,
			action: () => callbacks?.onRegenerate?.(),
		},
		{
			id: "export-obsidian",
			label: `Export to Obsidian`,
			shortcutKey: "3",
			description: `Convert card to Markdown frontmatter with wikilinks`,
			action: () => callbacks?.onExport?.(),
		},
		{
			id: "verify-card",
			label: `Check Grounding Score`,
			shortcutKey: "4",
			description: `Verify cited symbols and lines against AST Oracle`,
			action: () => callbacks?.onVerify?.(),
		},
	];
}

export function createDocumentActions(
	docPath: string,
	callbacks?: {
		onCheckDrift?: () => void;
		onRegenerate?: () => void;
		onValidateLinks?: () => void;
		onVerify?: () => void;
	},
): ContextualQuickAction[] {
	return [
		{
			id: "check-drift",
			label: `Check Truth Drift: ${docPath}`,
			shortcutKey: "1",
			description: `Compare source SHA256 hashes against provenance record`,
			action: () => callbacks?.onCheckDrift?.(),
		},
		{
			id: "regen-chapter",
			label: `Regenerate Stale Chapter`,
			shortcutKey: "2",
			description: `Re-run model inference only for this stale document`,
			action: () => callbacks?.onRegenerate?.(),
		},
		{
			id: "validate-links",
			label: `Validate Relative Links`,
			shortcutKey: "3",
			description: `Check cross-chapter links to ensure no 404 targets`,
			action: () => callbacks?.onValidateLinks?.(),
		},
		{
			id: "run-gate",
			label: `Run Verification Gate`,
			shortcutKey: "4",
			description: `Execute native test runner suite & defect scoring`,
			action: () => callbacks?.onVerify?.(),
		},
	];
}

export class ContextualQuickActionMenu {
	private title: string;
	private targetKind: TargetKind;
	private actions: ContextualQuickAction[];
	private selectedIndex = 0;
	private isOpen = true;

	constructor(title: string, targetKind: TargetKind, actions: ContextualQuickAction[]) {
		this.title = title;
		this.targetKind = targetKind;
		this.actions = actions;
	}

	isOpenMenu(): boolean {
		return this.isOpen;
	}

	open(): void {
		this.isOpen = true;
	}

	close(): void {
		this.isOpen = false;
	}

	getActions(): ContextualQuickAction[] {
		return this.actions;
	}

	getSelectedIndex(): number {
		return this.selectedIndex;
	}

	handleKey(keyData: string): { executed?: boolean; closed?: boolean; render?: boolean; action?: ContextualQuickAction } {
		if (!this.isOpen) return {};

		// Dismiss on Escape
		if (keyData === "\x1b" || keyData === "escape") {
			this.close();
			return { closed: true, render: true };
		}

		// Direct number shortcut (1..9)
		for (let i = 0; i < this.actions.length; i++) {
			const action = this.actions[i]!;
			if (keyData === action.shortcutKey) {
				this.selectedIndex = i;
				try {
					action.action();
				} catch {
					// fail-soft
				}
				this.close();
				return { executed: true, closed: true, action, render: true };
			}
		}

		// Down: 'j' or Down arrow
		if (keyData === "j" || keyData === "\x1b[B" || keyData === "down") {
			if (this.actions.length > 0) {
				this.selectedIndex = (this.selectedIndex + 1) % this.actions.length;
				return { render: true };
			}
		}

		// Up: 'k' or Up arrow
		if (keyData === "k" || keyData === "\x1b[A" || keyData === "up") {
			if (this.actions.length > 0) {
				this.selectedIndex = (this.selectedIndex - 1 + this.actions.length) % this.actions.length;
				return { render: true };
			}
		}

		// Enter: execute selected
		if (keyData === "\r" || keyData === "\n" || keyData === "enter") {
			const action = this.actions[this.selectedIndex];
			if (action) {
				try {
					action.action();
				} catch {
					// fail-soft
				}
				this.close();
				return { executed: true, closed: true, action, render: true };
			}
		}

		return {};
	}

	render(width = 70): string[] {
		const lines: string[] = [];
		const useUni = supportsUnicode();
		const tl = useUni ? "┌" : "+";
		const tr = useUni ? "┐" : "+";
		const bl = useUni ? "└" : "+";
		const br = useUni ? "┘" : "+";
		const hz = useUni ? "─" : "-";
		const vt = useUni ? "│" : "|";

		const innerW = Math.max(26, width - 4);
		const borderHz = hz.repeat(innerW);

		// Header
		lines.push(`${tl}${borderHz}${tr}`);
		const headerText = ` Quick Actions · ${this.title} (${this.targetKind.toUpperCase()})`;
		lines.push(`${vt} ${truncateAnsi(headerText.padEnd(innerW - 2), innerW - 2)} ${vt}`);
		lines.push(`${vt}${borderHz}${vt}`);

		// Actions
		for (let i = 0; i < this.actions.length; i++) {
			const act = this.actions[i]!;
			const isSel = i === this.selectedIndex;
			const cursor = isSel ? "→ " : "  ";
			const badge = `[${act.shortcutKey}]`;
			const label = act.label;
			const desc = act.description ? ` (${act.description})` : "";
			let row = `${cursor}${badge} ${label}${desc}`;
			if (isSel) {
				row = `\x1b[1;38;5;208m${row}\x1b[0m`;
			}
			lines.push(`${vt} ${truncateAnsi(row.padEnd(innerW - 2), innerW - 2)} ${vt}`);
		}

		// Footer
		lines.push(`${vt}${borderHz}${vt}`);
		const footer = ` [1-${this.actions.length}] Quick Key  [j/k] Move  [Enter] Run  [Esc] Cancel`;
		lines.push(`${vt} ${truncateAnsi(footer.padEnd(innerW - 2), innerW - 2)} ${vt}`);
		lines.push(`${bl}${borderHz}${br}`);

		return lines;
	}
}
