import { describe, expect, it } from "vitest";
import { parseKeys, truncate, pad, renderToStringHelper, emptyViewport, fitViewport, sliceVisible, scrollViewport, RESET } from "../src/screen.js";
import { renderDashboard, type DashboardData } from "../src/dashboard.js";
import { emptySearchState, renderSearch } from "../src/searchView.js";
import { emptyChatState, renderChat } from "../src/chatView.js";
import { emptyDocumentsState, renderDocumentsList, renderDocumentOpen } from "../src/documentsView.js";
import { renderHelp } from "../src/helpView.js";
import { renderStatusBar } from "../src/statusBar.js";

describe("parseKeys", () => {
	it("parses plain characters", () => {
		expect(parseKeys("abc")).toEqual([
			{ type: "char", char: "a" },
			{ type: "char", char: "b" },
			{ type: "char", char: "c" },
		]);
	});

	it("parses enter, backspace and escape", () => {
		expect(parseKeys("\r")).toEqual([{ type: "enter" }]);
		expect(parseKeys("\x7f")).toEqual([{ type: "backspace" }]);
		expect(parseKeys("\x1b")).toEqual([{ type: "escape" }]);
	});

	it("parses arrow sequences as one chunk", () => {
		expect(parseKeys("\x1b[A\x1b[B")).toEqual([{ type: "up" }, { type: "down" }]);
	});

	it("ignores control characters that are not keys", () => {
		expect(parseKeys("\x00\x01")).toEqual([]);
	});
});

describe("truncate and pad", () => {
	it("truncates with an ellipsis inside the width", () => {
		expect(truncate("abcdef", 4)).toBe("abc…");
		expect(truncate("ab", 4)).toBe("ab");
	});

	it("pads to width and truncates overflow", () => {
		expect(pad("ab", 4)).toBe("ab  ");
		expect(pad("abcdef", 4)).toBe("abc…");
	});
});

const dashboardData: DashboardData = {
	root: "/repo",
	fileCount: 120,
	symbolCount: 900,
	documentCount: 6,
	cardCount: 4,
	skillCount: 2,
	researchCount: 1,
	freshness: 0.75,
	staleCount: 2,
	orphanCount: 0,
	changedFiles: ["src/a.ts"],
	deletedFiles: [],
};

describe("renderDashboard", () => {
	it("shows counts and a freshness bar", () => {
		const text = renderToStringHelper(renderDashboard(dashboardData));
		expect(text).toContain("files indexed     120");
		expect(text).toContain("wiki documents    6");
		expect(text).toContain("75%");
		expect(text).toContain("2 stale");
		expect(text).toContain("changed: src/a.ts");
	});

	it("says so honestly when nothing is generated", () => {
		const text = renderToStringHelper(
			renderDashboard({ ...dashboardData, freshness: null, staleCount: 0 }),
		);
		expect(text).toContain("nothing generated yet");
	});
});

describe("renderSearch", () => {
	it("shows the query and a hint before the first search", () => {
		const text = renderToStringHelper(renderSearch(emptySearchState()));
		expect(text).toContain("> █");
		expect(text).toContain("no credentials");
	});

	it("lists hits with kind, title and where", () => {
		const state = {
			...emptySearchState(),
			searched: true,
			semantic: true,
			hits: [
				{ kind: "wiki", title: "Retrieval", where: "core/r.md:12", snippet: "BM25 fuses with vectors" },
			],
		};
		const text = renderToStringHelper(renderSearch(state));
		expect(text).toContain("wiki");
		expect(text).toContain("Retrieval");
		expect(text).toContain("core/r.md:12");
		expect(text).toContain("lexically + semantically");
	});

	it("reports an error rather than pretending to have searched", () => {
		const text = renderToStringHelper(renderSearch({ ...emptySearchState(), error: "index missing" }));
		expect(text).toContain("error: index missing");
	});
});

describe("renderChat", () => {
	it("renders the transcript tail and the composer", () => {
		const state = {
			...emptyChatState(),
			turns: [
				{ role: "user" as const, text: "where is retry handled?" },
				{ role: "assistant" as const, text: "In llm/retry.go, with jittered backoff." },
			],
			input: "and the budget?",
		};
		const text = renderToStringHelper(renderChat(state, 20));
		expect(text).toContain("you > where is retry handled?");
		expect(text).toContain("In llm/retry.go");
		expect(text).toContain("> and the budget?█");
	});

	it("shows a thinking marker while busy", () => {
		const text = renderToStringHelper(renderChat({ ...emptyChatState(), busy: true }, 10));
		expect(text).toContain("…thinking");
	});
});

describe("viewport", () => {
	const content = Array.from({ length: 50 }, (_, i) => `line ${i}`);

	it("shows the top window of exactly viewport height", () => {
		const vp = emptyViewport(10);
		fitViewport(vp, content.length);
		expect(sliceVisible(content, vp)).toHaveLength(10);
		expect(sliceVisible(content, vp)[0]).toBe("line 0");
		const small = emptyViewport(10);
		fitViewport(small, 3);
		expect(small.offset).toBe(0);
	});

	it("scrolls and clamps to the last page", () => {
		const vp = emptyViewport(10);
		fitViewport(vp, content.length);
		scrollViewport(vp, 15);
		expect(vp.offset).toBe(15);
		scrollViewport(vp, 1000);
		expect(vp.offset).toBe(40); // 50 - 10
		scrollViewport(vp, -1000);
		expect(vp.offset).toBe(0);
	});

	it("sticks to the bottom when asked, as a chat transcript wants", () => {
		const vp = emptyViewport(10);
		fitViewport(vp, content.length, true);
		expect(vp.offset).toBe(40);
		expect(vp.total).toBe(50);
	});
});

describe("renderDocumentsList", () => {
	it("admits nothing is there before loading", () => {
		const text = renderToStringHelper(renderDocumentsList(emptyDocumentsState()));
		expect(text).toContain("loading documents");
	});

	it("says what to run when nothing is generated", () => {
		const state = { ...emptyDocumentsState(), loaded: true };
		const text = renderToStringHelper(renderDocumentsList(state));
		expect(text).toContain("nothing generated yet");
	});

	it("marks the selected row and shows kind markers", () => {
		const state = {
			...emptyDocumentsState(),
			loaded: true,
			entries: [
				{ kind: "wiki" as const, id: "cli/bin.md", title: "cli/bin.md", detail: "cli" },
				{ kind: "card" as const, id: "search", title: "card: search", detail: "3 src" },
				{ kind: "research" as const, id: "q.md", title: "what is X?", detail: "unverified" },
			],
			selected: 1,
		};
		const text = renderToStringHelper(renderDocumentsList(state));
		expect(text).toContain("cli/bin.md");
		expect(text).toContain("card: search");
		expect(text).toContain("what is X?");
		expect(text).toContain("❯"); // exactly one selection cursor
		expect(text.match(/❯/g)).toHaveLength(1);
	});

	it("reports errors rather than an empty list", () => {
		const text = renderToStringHelper(renderDocumentsList({ ...emptyDocumentsState(), error: "root missing" }));
		expect(text).toContain("error: root missing");
	});
});

describe("renderDocumentOpen", () => {
	it("shows the title and body lines", () => {
		const state = { ...emptyDocumentsState(), open: true, openTitle: "cli/bin.md", openLines: ["# Binary bootstrap", "The entry point."] };
		const text = renderToStringHelper(renderDocumentOpen(state));
		expect(text).toContain("cli/bin.md");
		expect(text).toContain("# Binary bootstrap");
	});
});

describe("renderHelp", () => {
	it("lists the global keys", () => {
		const text = renderToStringHelper(renderHelp());
		expect(text).toContain("dashboard / search / chat / documents");
		expect(text).toContain("this help (any view)");
		expect(text).toContain("ctrl-c quits from anywhere");
	});
});

describe("renderStatusBar", () => {
	it("shows view, context and root at fixed width", () => {
		const bar = renderStatusBar({ view: "chat — thinking", context: "hello", root: "D:/repo/kaioken_tui" }, 80);
		// Visible width is 80; the rest is ANSI escapes (REVERSE, DIM, RESET).
		const visible = bar.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, "");
		expect(visible).toHaveLength(80);
		expect(visible).toContain("chat — thinking");
		expect(visible).toContain("hello");
		expect(visible).toContain("kaioken_tui");
	});

	it("omits the context slot when empty", () => {
		const bar = renderStatusBar({ view: "dashboard", root: "/some/repo" }, 80);
		expect(bar).toContain("dashboard");
		expect(bar).toContain("repo");
	});
});
