import { describe, expect, it } from "vitest";
import { Container, ScrollView, TuiAltScreen, VStack } from "@earendil-works/pi-tui";
import { VirtualTerminal } from "../../../../packages/tui/test/virtual-terminal.ts";
import { pinHeader, unpinHeader } from "../ui/layout.ts";

/**
 * The layout module reaches past a TypeScript `private` to rebuild Pi's layout
 * tree, so the tests are mostly about the guards: every shape it does not
 * recognise has to leave Pi's layout exactly as it was. A header that scrolls
 * is cosmetic; a layout this module half-replaced is a broken session.
 */

/** Build the layout Pi actually uses: VStack[ScrollView(document), dock]. */
function piLikeLayout(rows = 40) {
	const terminal = new VirtualTerminal(40, 12);
	const tui = new TuiAltScreen(terminal);
	tui.start();

	const header = new Container();
	header.addChild({ render: () => ["HEADER-ROW-1"], invalidate: () => {} });
	header.addChild({ render: () => ["HEADER-ROW-2"], invalidate: () => {} });

	const document = new Container();
	document.addChild(header);
	for (let i = 1; i <= rows; i++) {
		document.addChild({ render: () => [`line-${String(i).padStart(2, "0")}`], invalidate: () => {} });
	}

	const transcript = new ScrollView(document, { follow: "end", primary: true });
	const dock = new Container();
	dock.addChild({ render: () => ["EDITOR"], invalidate: () => {} });

	tui.addChild(document);
	tui.setLayoutRoot(
		new VStack([
			{ component: transcript, basis: 0, grow: 1, shrink: 1, minSize: 1 },
			{ component: dock, basis: "auto", grow: 0, shrink: 1, minSize: 1 },
		]),
	);

	return { tui, terminal, header, document, transcript, dock };
}

describe("kaioken layout: pinning the header", () => {
	it("holds the header at the top while the transcript scrolls", async () => {
		const { tui, terminal, header } = piLikeLayout();
		const pinned = pinHeader(tui, header);
		expect(pinned).not.toBeNull();

		tui.renderNow(true);
		await terminal.waitForRender();
		tui.renderNow(true);
		await terminal.waitForRender();

		const screen = terminal.getViewport();
		// The banner is where it was put, and the chat has moved underneath.
		expect(screen.slice(0, 2).every((line) => line.includes("HEADER-ROW"))).toBe(true);
		expect(screen.some((line) => line.includes("line-40"))).toBe(true);
		tui.stop();
	});

	it("leaves the editor docked at the bottom", async () => {
		// Only the header moves. Everything else in Pi's layout keeps the place
		// and the sizing it was given.
		const { tui, terminal, header } = piLikeLayout();
		pinHeader(tui, header);

		tui.renderNow(true);
		await terminal.waitForRender();
		tui.renderNow(true);
		await terminal.waitForRender();

		const screen = terminal.getViewport();
		expect(screen[screen.length - 1]).toContain("EDITOR");
		tui.stop();
	});

	it("renders the header exactly once", async () => {
		// It is taken out of the scroll region before being placed above it. If
		// both happened it would appear twice, which is worse than scrolling.
		const { tui, terminal, header } = piLikeLayout();
		pinHeader(tui, header);

		tui.renderNow(true);
		await terminal.waitForRender();
		tui.renderNow(true);
		await terminal.waitForRender();

		const occurrences = terminal.getViewport().filter((line) => line.includes("HEADER-ROW-1"));
		expect(occurrences).toHaveLength(1);
		tui.stop();
	});

	it("declines when the layout root has no entries", () => {
		const { tui, header } = piLikeLayout();
		// A layout root of an unrecognised shape. Returning null is how the
		// caller learns to leave Pi's layout alone.
		(tui as unknown as { layoutRoot: unknown }).layoutRoot = new Container();
		expect(pinHeader(tui, header)).toBeNull();
		tui.stop();
	});

	it("declines when no entry holds the transcript", () => {
		const { tui, header, dock } = piLikeLayout();
		// A VStack with no ScrollView in it: a Pi version this was not written
		// against, so nothing should be rebuilt.
		(tui as unknown as { layoutRoot: unknown }).layoutRoot = new VStack([
			{ component: dock, basis: "auto", grow: 0, shrink: 1, minSize: 1 },
		]);
		expect(pinHeader(tui, header)).toBeNull();
		tui.stop();
	});

	it("declines when the header is not in the tree", () => {
		const { tui } = piLikeLayout();
		const orphan = new Container();
		expect(pinHeader(tui, orphan)).toBeNull();
		tui.stop();
	});

	it("puts the header back and restores Pi's layout on dispose", () => {
		const { tui, header, document } = piLikeLayout();
		const pinned = pinHeader(tui, header);
		expect(document.children.includes(header)).toBe(false);

		unpinHeader(tui, header, pinned);

		// Back where it came from, and the layout root is Pi's again.
		expect(document.children.includes(header)).toBe(true);
		expect((tui as unknown as { layoutRoot: { entries?: unknown[] } }).layoutRoot.entries).toHaveLength(2);
		tui.stop();
	});

	it("does nothing on dispose when it never pinned", () => {
		const { tui, header, document } = piLikeLayout();
		unpinHeader(tui, header, null);
		expect(document.children.includes(header)).toBe(true);
		tui.stop();
	});
});
