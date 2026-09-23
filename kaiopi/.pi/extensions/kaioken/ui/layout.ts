/**
 * Pin the header above the scroll region.
 *
 * Pi's header is a child of the document container that the transcript scrolls,
 * so it scrolls away with the conversation — a masthead you lose the moment you
 * read anything. This lifts it out: the layout root is rebuilt with the header
 * as a fixed row above the scrolling transcript, so the banner and the info
 * panel stay put while the chat moves underneath and the editor stays at the
 * bottom.
 *
 * ## The seam
 *
 * `TuiAltScreen` keeps its layout tree on `layoutRoot`, a `VStack` whose first
 * entry is the transcript `ScrollView` and whose remaining entries are the
 * docked components (pending messages, status, editor, footer). Rebuilding that
 * VStack with one extra entry in front is the whole change — no scroll state is
 * touched, because the `ScrollView` is reparented intact rather than unwrapped.
 * Its scroll position and follow behaviour belong to Pi.
 *
 * `layoutRoot` is TypeScript-`private`, which is a compile-time annotation and
 * not a runtime boundary, so it is readable. Reading a private field is a real
 * coupling and is treated as one: every access is guarded, the shape is
 * verified before anything is rebuilt, and every failure path leaves Pi's
 * layout exactly as it was. A header that scrolls is a cosmetic problem; a
 * layout this module half-replaced is a broken session.
 *
 * ## Where it declines
 *
 * - Regular (non-fullscreen) mode has no layout root, so there is nothing to
 *   rebuild and Pi's own placement stands.
 * - A layout root with no entries, or none holding a `ScrollView`, means a Pi
 *   version this was not written against.
 *
 * In both cases `pinHeader` returns null and changes nothing.
 */
import type { Component, TUI } from "@earendil-works/pi-tui";
import { ScrollView, VStack } from "@earendil-works/pi-tui";

/** A VStack entry, as the layout root stores them. */
interface StackEntry {
	component: Component;
	basis?: number | "auto";
	grow?: number;
	shrink?: number;
	minSize?: number;
}

/** The layout tree on a fullscreen renderer, reached past a `private`. */
interface LayoutRoot extends Component {
	entries?: StackEntry[];
}

/** A container that can give up and take back a child. */
type Parent = Component & {
	addChild(child: Component): void;
	removeChild(child: Component): void;
	children?: Component[];
};

/** What `pinHeader` needs in order to undo itself. */
export interface PinnedHeader {
	/** The container the header was taken out of, so it can go back. */
	origin: Parent;
	/** The layout root that was replaced. */
	previous: Component;
}

/**
 * Rebuild the layout so `header` is fixed above the scrolling transcript.
 *
 * Returns what is needed to undo it, or null when the layout was left alone.
 */
export function pinHeader(tui: TUI, header: Component): PinnedHeader | null {
	const layoutRoot = (tui as unknown as { layoutRoot?: LayoutRoot }).layoutRoot;
	if (!layoutRoot || !Array.isArray(layoutRoot.entries)) return null;

	const transcript = layoutRoot.entries.find((entry) => entry.component instanceof ScrollView);
	if (!transcript) return null;

	const origin = findParent(tui.children as Component[], header);
	if (!origin) return null;

	// Out of the scroll region first, so it is not rendered twice — once in the
	// transcript and once above it.
	origin.removeChild(header);

	const rebuilt = new VStack([
		// `basis: "auto"` and no shrink: it asks for exactly the rows it renders
		// and gives none back, which is what "fixed" means in a layout that has
		// no other way to say it.
		{ component: header, basis: "auto", grow: 0, shrink: 0, minSize: 1 },
		...layoutRoot.entries.map((entry) =>
			entry.component === transcript.component
				? { component: entry.component, basis: 0, grow: 1, shrink: 1, minSize: 1 }
				: entry,
		),
	]);

	if (!setLayoutRoot(tui, rebuilt)) {
		// The rebuild is only valid if it can be installed. Put the header back
		// rather than leaving it out of the tree entirely.
		origin.addChild(header);
		return null;
	}
	return { origin, previous: layoutRoot };
}

/** Put the header back and restore the layout Pi built. */
export function unpinHeader(tui: TUI, header: Component, pinned: PinnedHeader | null): void {
	if (!pinned) return;
	if (!pinned.origin.children?.includes(header)) pinned.origin.addChild(header);
	setLayoutRoot(tui, pinned.previous);
}

/**
 * Install a layout root, returning whether it worked.
 *
 * `setLayoutRoot` lives on `ViewportTUI` rather than on `TUI`, and that
 * interface is not exported from the package root, so this is a duck-typed call
 * guarded on the method existing. Absent means a renderer with no layout tree,
 * which is exactly the case where nothing should happen.
 */
function setLayoutRoot(tui: TUI, root: Component): boolean {
	const setter = (tui as unknown as { setLayoutRoot?: (component: Component) => void }).setLayoutRoot;
	if (typeof setter !== "function") return false;
	setter.call(tui, root);
	tui.requestRender();
	return true;
}

/** Depth-first search for the container holding `target`. */
function findParent(nodes: readonly Component[], target: Component): Parent | null {
	for (const node of nodes) {
		const container = node as Component & { children?: Component[]; addChild?: unknown; removeChild?: unknown };
		if (!Array.isArray(container.children)) continue;
		if (typeof container.addChild !== "function" || typeof container.removeChild !== "function") continue;
		const parent = container as Parent;
		if (container.children.includes(target)) return parent;
		const deeper = findParent(container.children, target);
		if (deeper) return deeper;
	}
	return null;
}
