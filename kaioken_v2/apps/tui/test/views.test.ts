import { describe, expect, it } from "vitest";
import { truncate, pad, visibleWidth, renderToStringHelper } from "../src/screen.js";
import { setTheme, stripAnsi, THEME_NAMES, PALETTES } from "../src/theme.js";
import {
	blockWidth,
	compactHeader,
	displayModel,
	joinHorizontal,
	kv,
	logoPlain,
	renderLogo,
	repoLabel,
	shortPath,
	statusPanel,
	stickyHeader,
	welcomeBanner,
	LOGO_WIDTH,
	type HeaderInfo,
} from "../src/logo.js";
import { looksLikeMarkdown, renderMarkdown } from "../src/markdown.js";
import { COMMANDS, filterCommands, findCommand, matchScore } from "../src/commands.js";
import { CHAPTERS, explainLines, helpLines, tutorialLines, wrapText } from "../src/manual.js";
import {
	approvalLines,
	compactArgs,
	lastOutputLine,
	preview,
	toolCallLine,
	toolResultLine,
	userLine,
	TOOL_GLYPHS,
} from "../src/transcript.js";
import { elapsed, humanTokens, renderStatusLine, shortModel } from "../src/statusLine.js";
import {
	emptyPalette,
	movePalette,
	refreshPalette,
	renderComposer,
	renderPalette,
} from "../src/composer.js";
import { dispatch, type Session } from "../src/dispatch.js";
import { credentialHint, pickDefaultModel, providerLines, resolveModelSpec, type ProviderInfo } from "../src/providers.js";

/**
 * Every assertion here runs without a pty and without an API key.
 *
 * The interface is built from pure `(data, width) => string[]` functions, so
 * what it renders and what a command means are both reachable from a plain
 * test. `text()` strips the escapes so assertions read as what a human would
 * see on screen.
 */
function text(lines: readonly string[]): string {
	return stripAnsi(renderToStringHelper(lines));
}

const INFO: HeaderInfo = {
	version: "2.0.0",
	repo: "/home/dev/kaioken",
	model: "anthropic/claude-opus-4",
	provider: "anthropic",
	hasKey: true,
};

describe("truncate and pad", () => {
	it("truncates with an ellipsis inside the width", () => {
		expect(stripAnsi(truncate("abcdef", 4))).toBe("abc…");
		expect(truncate("ab", 4)).toBe("ab");
	});

	it("pads to width and truncates overflow", () => {
		expect(pad("ab", 4)).toBe("ab  ");
		expect(stripAnsi(pad("abcdef", 4))).toBe("abc…");
	});

	it("measures display columns, not code units", () => {
		// Two ideographs occupy four columns. Counting `.length` gave two, which
		// tore every row that contained one.
		expect(visibleWidth("你好")).toBe(4);
		expect(visibleWidth(pad("你好", 8))).toBe(8);
		expect(visibleWidth(truncate("你好世界", 4))).toBeLessThanOrEqual(4);
	});
});

describe("theme", () => {
	it("ships the three v1 palettes, each filling every role", () => {
		expect(THEME_NAMES).toEqual(["default", "light", "highcontrast"]);
		const roles = Object.keys(PALETTES.default as object).sort();
		for (const name of THEME_NAMES) {
			expect(setTheme(name)).toBe(true);
			expect(Object.keys(PALETTES[name] as object).sort()).toEqual(roles);
		}
		expect(setTheme("nonesuch")).toBe(false);
		setTheme("default");
	});

	it("keeps v1's ANSI codes, which DESIGN.md derives the web tokens from", () => {
		const dark = PALETTES.default as Record<string, string>;
		expect(dark.accent).toBe("208");
		expect(dark.warn).toBe("214");
		expect(dark.user).toBe("117");
		expect(dark.tool).toBe("180");
		expect(dark.toolResult).toBe("108");
		expect(dark.prompt).toBe("63");
	});
});

describe("the banner", () => {
	it("renders six rows of block art at full width", () => {
		expect(logoPlain()).toHaveLength(6);
		expect(renderLogo(100)).toHaveLength(6);
		expect(stripAnsi(renderLogo(100)[0] ?? "")).toContain("██");
	});

	it("falls back to a one-liner rather than mangling the art", () => {
		const narrow = renderLogo(LOGO_WIDTH - 10);
		expect(narrow).toHaveLength(1);
		expect(stripAnsi(narrow[0] ?? "")).toBe("KAIOKEN");
	});

	it("puts the status panel beside the wordmark when there is room", () => {
		const banner = text(welcomeBanner(INFO, 120));
		expect(banner).toContain("██");
		expect(banner).toContain("kaioken@kaioken");
		expect(banner).toContain("Model");
		expect(banner).toContain("saved ✓");
		// Side by side: art and panel share a row.
		expect(banner.split("\n").some((l) => l.includes("██") && l.includes("kaioken@"))).toBe(true);
	});

	it("stacks instead of squeezing when the terminal is too narrow for two columns", () => {
		const banner = text(welcomeBanner(INFO, 60));
		expect(banner.split("\n").some((l) => l.includes("██") && l.includes("kaioken@"))).toBe(false);
		expect(banner).toContain("kaioken@kaioken");
	});

	it("says plainly when there is no key", () => {
		expect(text(statusPanel({ ...INFO, hasKey: false }))).toContain("not set — /key to add one");
	});

	it("omits redundant provider prefix in the model row when provider is shown", () => {
		expect(displayModel("openrouter/z-ai/glm-5.3-flash", "openrouter")).toBe("z-ai/glm-5.3-flash");
		expect(displayModel("anthropic/claude-3-7-sonnet", "anthropic")).toBe("claude-3-7-sonnet");
		expect(displayModel("gpt-4o", "openai")).toBe("gpt-4o");

		const panel = text(
			statusPanel({
				...INFO,
				model: "openrouter/z-ai/glm-5.3-flash",
				provider: "openrouter",
			}),
		);
		expect(panel).toContain("Model:    z-ai/glm-5.3-flash");
		expect(panel).toContain("Provider: openrouter");
		expect(panel).not.toContain("openrouter/z-ai/glm-5.3-flash");
	});

	it("trades the art for a strip rather than swallowing a short terminal", () => {
		const short = text(stickyHeader(INFO, 120, 12));
		expect(short).not.toContain("██╗");
		expect(short).toContain("KAIOKEN");
		expect(short).toContain("Model:");
	});

	it("shows the agent mode only when it is not the default", () => {
		expect(text(stickyHeader(INFO, 120, 40))).not.toContain("mode ");
		expect(text(stickyHeader({ ...INFO, mode: "plan" }, 120, 40))).toContain("mode plan");
	});

	it("aligns the panel's colons, neofetch-style", () => {
		const rows = kv([
			["Version", "2.0.0"],
			["Repo", "/x"],
			["API Key", "saved"],
		]).map(stripAnsi);
		const columns = rows.map((row) => row.indexOf(":"));
		expect(new Set(rows.map((r) => r.length - r.trimStart().length)).size).toBe(1);
		expect(Math.max(...columns)).toBeGreaterThan(0);
	});

	it("joins two blocks at one column for every row", () => {
		const joined = joinHorizontal(["aa", "b"], ["1", "2"], " | ").map(stripAnsi);
		expect(joined).toEqual(["aa | 1", "b  | 2"]);
	});

	it("names the repository from either separator", () => {
		expect(repoLabel("/home/dev/kaioken")).toBe("kaioken");
		expect(repoLabel("D:\\project\\kaioken_v2")).toBe("kaioken_v2");
		expect(repoLabel("/")).toBe("repo");
		expect(shortPath("/a/b")).toBe("/a/b");
		expect(shortPath(`/${"x".repeat(80)}`)).toHaveLength(40);
	});

	it("measures a block by its widest row, escapes excluded", () => {
		expect(blockWidth(["ab", "\x1b[31mabcd\x1b[0m"])).toBe(4);
		expect(compactHeader(INFO, 200)).toHaveLength(2);
	});
});

describe("markdown", () => {
	it("renders headings, lists and fences rather than their source", () => {
		const rendered = text(renderMarkdown("# Title\n\n- one\n- two\n\n```ts\nconst x = 1;\n```", 40));
		expect(rendered).toContain("Title");
		expect(rendered).toContain("one");
		expect(rendered).toContain("const x = 1;");
		// The heading marker is styling now, not literal text.
		expect(rendered).not.toContain("# Title");
	});

	it("only claims structure when there is some", () => {
		expect(looksLikeMarkdown("just a sentence")).toBe(false);
		expect(looksLikeMarkdown("- a\n- b")).toBe(true);
		expect(looksLikeMarkdown("```\ncode\n```")).toBe(true);
	});

	/**
	 * The renderer pads every row to the width it was given. That padding is
	 * invisible on its own, and downstream it was not: the transcript indents a
	 * wrapped row's continuations by the leading whitespace of the row they
	 * came from, and a blank row padded to full width is *all* leading
	 * whitespace. One blank line between two paragraphs came back as twenty-six
	 * blank rows, which is why a four-paragraph reply had to be scrolled to
	 * read and why the transcript being re-wrapped every frame was ten times
	 * the size it should have been.
	 *
	 * A blank row is the empty string. Nothing else measures it correctly.
	 */
	it("leaves no padding on a row for the transcript to mistake for indent", () => {
		const rendered = renderMarkdown("## One\n\nFirst.\n\n## Two\n\nSecond.", 80, 0);

		for (const line of rendered) {
			expect(stripAnsi(line)).toBe(stripAnsi(line).trimEnd());
		}
		expect(rendered.filter((line) => line === "")).toHaveLength(3);
		expect(rendered.filter((line) => stripAnsi(line).trim() === "" && line !== "")).toEqual([]);
	});
});

describe("the command registry", () => {
	it("carries v1's whole command surface plus v2's graph", () => {
		expect(COMMANDS.length).toBe(57);
		for (const name of ["wiki", "research", "skills", "prism", "impact", "mode", "yolo", "quit", "graph"]) {
			expect(findCommand(name), name).toBeDefined();
		}
	});

	it("resolves aliases the way dispatch does", () => {
		expect(findCommand("h")?.name).toBe("help");
		expect(findCommand("gen")?.name).toBe("cards");
		expect(findCommand("q")?.name).toBe("quit");
		expect(findCommand("nonesuch")).toBeUndefined();
	});

	it("ranks a name prefix above an alias or a mid-name hit", () => {
		const help = findCommand("help");
		const cards = findCommand("cards");
		expect(matchScore(help as never, "he")).toBe(2);
		expect(matchScore(cards as never, "gen")).toBe(1);
		expect(matchScore(help as never, "zz")).toBe(0);
	});

	it("needs three characters before a mid-name match counts", () => {
		// Without the floor, `/w` would offer `new`.
		expect(filterCommands("w").map((c) => c.name)).not.toContain("new");
		expect(filterCommands("date").map((c) => c.name)).toContain("update");
	});

	it("puts the everyday commands first, since registry order breaks ties", () => {
		expect(filterCommands("")[0]?.name).toBe("help");
		expect(filterCommands("co").map((c) => c.name).slice(0, 2)).toEqual(["compact", "cost"]);
	});

	it("gives every command a summary, and most of them worked examples", () => {
		for (const command of COMMANDS) {
			expect(command.summary, command.name).toBeTruthy();
		}
		const withExamples = COMMANDS.filter((c) => (c.examples?.length ?? 0) > 0);
		expect(withExamples.length).toBeGreaterThan(50);
	});
});

describe("the manual", () => {
	it("lists every chapter's commands, and every chapter names real ones", () => {
		for (const chapter of CHAPTERS) {
			for (const name of chapter.commands) {
				expect(findCommand(name), `${chapter.name}/${name}`).toBeDefined();
			}
		}
	});

	it("/help is the compact reference", () => {
		const rendered = text(helpLines());
		expect(rendered).toContain("Chat: type anything to talk to the model");
		expect(rendered).toContain("/wiki [xN] [force]");
		expect(rendered).toContain("Knowledge engine:");
		expect(rendered).toContain("/tutorial explains each of these");
	});

	it("/tutorial opens on the tour and lists its chapters", () => {
		const rendered = text(tutorialLines(""));
		expect(rendered).toContain("KAIOKEN — a guided tour");
		expect(rendered).toContain("First run");
		for (const chapter of CHAPTERS) expect(rendered).toContain(chapter.title);
	});

	it("/tutorial <chapter> and /tutorial <command> both resolve", () => {
		expect(text(tutorialLines("knowledge"))).toContain("The knowledge engine");
		expect(text(tutorialLines("wiki"))).toContain("deep multi-pass wiki");
		expect(text(tutorialLines("/wiki"))).toContain("deep multi-pass wiki");
	});

	it("/explain gives one command its full page", () => {
		const rendered = text(explainLines("research"));
		expect(rendered).toContain("/research [xN] <question>");
		expect(rendered).toContain("What:");
		expect(rendered).toContain("When & why");
		expect(rendered).toContain("Examples");
		expect(rendered).toContain("/research x1 is htmx still maintained?");
	});

	it("offers near misses instead of a bare failure", () => {
		const rendered = text(explainLines("wik"));
		expect(rendered).toContain("no command called wik");
		expect(rendered).toContain("did you mean");
		expect(rendered).toContain("/wiki");
	});

	it("wraps prose at word boundaries", () => {
		const wrapped = wrapText("one two three four five six", 12);
		expect(wrapped.every((line) => line.length <= 12)).toBe(true);
		expect(wrapped.join(" ")).toBe("one two three four five six");
	});
});

describe("the transcript", () => {
	it("echoes the user's own words with the prompt glyph", () => {
		expect(stripAnsi(userLine("where is retry handled?"))).toBe("› where is retry handled?");
	});

	it("gives each tool its own silhouette", () => {
		expect(TOOL_GLYPHS.read_file).toBe("◇");
		expect(TOOL_GLYPHS.write_file).toBe("◆");
		expect(TOOL_GLYPHS.run_command).toBe("▶");
		expect(stripAnsi(toolCallLine("read_file", '{"path":"src/a.ts"}'))).toBe("◇ read_file  src/a.ts");
		// An unknown tool still gets a mark rather than a ragged left edge.
		expect(stripAnsi(toolCallLine("mystery", "{}"))).toBe("◇ mystery");
	});

	it("hangs a tool result under its call, and colours a failure differently", () => {
		expect(stripAnsi(toolResultLine("3 hits"))).toBe("  └ 3 hits");
		expect(toolResultLine("no such file", true)).not.toBe(toolResultLine("no such file", false));
	});

	it("identifies a call by whichever argument names it", () => {
		expect(compactArgs('{"command":"go test ./..."}')).toBe("go test ./...");
		expect(compactArgs('{"query":"retry"}')).toBe("retry");
		expect(compactArgs('{"unknown":1}')).toBe("");
		// Not JSON at all: show it anyway rather than nothing.
		expect(compactArgs("raw text")).toBe("raw text");
	});

	it("flattens multi-line output with a visible break marker", () => {
		expect(preview("a\nb\nc\nd", 3, 240)).toBe("a ⏎ b ⏎ c …");
		expect(preview("only", 3, 240)).toBe("only");
		expect(preview("x".repeat(300), 3, 10)).toHaveLength(11);
		expect(lastOutputLine("first\nlast\n\n")).toBe("last");
	});

	it("blocks a proposed diff behind a gutter and counts the change", () => {
		const rendered = text(
			approvalLines({
				action: "edit",
				target: "internal/wiki/update.go",
				preview: "@@ -42,3 +42,5 @@\n-  old\n+  new\n+  more\n",
			}),
		);
		expect(rendered).toContain("● edit");
		expect(rendered).toContain("internal/wiki/update.go");
		expect(rendered).toContain("+2 -1");
		// Every body row carries the gutter, so the diff reads as one block.
		const body = rendered.split("\n").filter((l) => l.includes("old") || l.includes("new"));
		expect(body.every((l) => l.startsWith("│ "))).toBe(true);
	});
});

describe("the status line", () => {
	it("shows the key hints when idle", () => {
		const line = stripAnsi(renderStatusLine({}, 80));
		expect(line).toContain("/ commands");
		expect(line).toContain("alt+enter newline");
		expect(line).toContain("ctrl+d quit");
	});

	it("replaces them with live progress while a task runs", () => {
		const line = stripAnsi(
			renderStatusLine({ busy: { text: "generating the wiki", elapsedMs: 64_000, tick: 0 } }, 80),
		);
		expect(line).toContain("generating the wiki");
		expect(line).toContain("1m04s");
		expect(line).toContain("esc to stop");
	});

	it("never renders auto-approve subtly", () => {
		expect(stripAnsi(renderStatusLine({ autoApprove: true }, 80))).toContain("yolo");
	});

	it("hides the context meter below halfway and warns above 80%", () => {
		expect(stripAnsi(renderStatusLine({ contextFill: 0.2 }, 80))).not.toContain("ctx");
		expect(stripAnsi(renderStatusLine({ contextFill: 0.85 }, 80))).toContain("ctx 85%");
	});

	it("never overflows, and drops the readout before the keys", () => {
		for (const width of [120, 80, 60, 40, 20]) {
			const line = stripAnsi(renderStatusLine({ model: "anthropic/claude-opus-4", tokens: 15_400 }, width));
			expect(visibleWidth(line), `width ${width}`).toBeLessThanOrEqual(width);
		}
		expect(stripAnsi(renderStatusLine({ model: "anthropic/claude-opus-4" }, 20))).toContain("/ commands");
	});

	it("keeps readouts to a bounded width so the line cannot jitter", () => {
		expect(shortModel("anthropic/claude-opus-4-20250514-preview")).toHaveLength(22);
		expect(shortModel("gpt-4o")).toBe("gpt-4o");
		expect(humanTokens(999)).toBe("999");
		expect(humanTokens(15_400)).toBe("15.4k");
		expect(humanTokens(2_500_000)).toBe("2.5M");
		expect(elapsed(9_000)).toBe("9s");
		expect(elapsed(64_000)).toBe("1m04s");
		expect(elapsed(3_720_000)).toBe("1h02m");
	});
});

describe("the composer and its palette", () => {
	it("opens only while the command name is being typed", () => {
		const state = emptyPalette();
		refreshPalette(state, "/", COMMANDS);
		expect(state.active).toBe(true);
		// A space means the name is settled and arguments are being typed.
		refreshPalette(state, "/wiki x3", COMMANDS);
		expect(state.active).toBe(false);
		refreshPalette(state, "hello", COMMANDS);
		expect(state.active).toBe(false);
	});

	it("stays closed after a dismissal until the input changes", () => {
		const state = emptyPalette();
		refreshPalette(state, "/wi", COMMANDS);
		state.dismissed = "/wi";
		state.active = false;
		refreshPalette(state, "/wi", COMMANDS);
		expect(state.active).toBe(false);
		refreshPalette(state, "/wik", COMMANDS);
		expect(state.active).toBe(true);
	});

	it("wraps the selection at both ends", () => {
		const state = emptyPalette();
		refreshPalette(state, "/w", COMMANDS);
		movePalette(state, -1);
		expect(state.selected).toBe(state.items.length - 1);
		movePalette(state, 1);
		expect(state.selected).toBe(0);
	});

	it("marks exactly one row, and says where you are in a long list", () => {
		const state = emptyPalette();
		refreshPalette(state, "/", COMMANDS);
		const rendered = renderPalette(state, 80);
		expect(rendered.filter((line) => stripAnsi(line).startsWith("▌"))).toHaveLength(1);
		expect(stripAnsi(rendered[rendered.length - 1] ?? "")).toContain(`1/${COMMANDS.length}`);
		expect(stripAnsi(rendered[rendered.length - 1] ?? "")).toContain("tab complete");
	});

	it("shows the placeholder only while empty", () => {
		const chrome = { busy: false, autoApprove: false, placeholder: "ask something", empty: true };
		expect(text(renderComposer([""], chrome, 40))).toContain("ask something");
		expect(text(renderComposer(["typed"], { ...chrome, empty: false }, 40))).toContain("typed");
	});

	it("makes the prompt glyph a state light", () => {
		const base = { autoApprove: false, busy: false, placeholder: "", empty: false };
		const idle = renderComposer(["x"], base, 40)[0] as string;
		const busy = renderComposer(["x"], { ...base, busy: true }, 40)[0] as string;
		const yolo = renderComposer(["x"], { ...base, autoApprove: true }, 40)[0] as string;
		expect(new Set([idle, busy, yolo]).size).toBe(3);
	});

	it("puts the prompt glyph beside the text, not on the editor's rule", () => {
		const chrome = { busy: false, autoApprove: false, placeholder: "", empty: false };
		const lines = renderComposer(["──────────", "typed", "──────────"], chrome, 40).map(stripAnsi);
		expect(lines).toHaveLength(2);
		expect(lines[0]).toMatch(/^─+$/);
		expect(lines[1]).toBe("› typed");
	});

	it("aligns continuation rows under the first, as one block", () => {
		const chrome = { busy: false, autoApprove: false, placeholder: "", empty: false };
		expect(renderComposer(["one", "two"], chrome, 40).map(stripAnsi)).toEqual(["› one", "  two"]);
	});
});

describe("dispatch", () => {
	function session(): Session {
		return {
			root: "/repo",
			version: "2.0.0",
			model: "anthropic/claude-opus-4",
			provider: "anthropic",
			hasKey: true,
			autoApprove: false,
			mode: "build",
			thinking: "off",
			notes: [],
			queued: [],
			serveUrl: null,
		};
	}

	it("accepts every name and alias the registry advertises", () => {
		// The registry drives the palette; a command it offers that dispatch
		// does not accept is a completion that leads nowhere.
		for (const command of COMMANDS) {
			for (const name of [command.name, ...(command.aliases ?? [])]) {
				const result = dispatch(`/${name}`, session());
				const rendered = text(result.lines);
				expect(rendered, `/${name}`).not.toContain("unknown command");
			}
		}
	});

	it("routes the commands this engine backs to the engine", () => {
		for (const [name, verb] of [
			["wiki", "wiki"],
			["cards", "cards"],
			["status", "status"],
			["research", "research"],
			["publish", "export"],
			["graph", "graph"],
			["init", "init"],
			["onboard", "onboard"],
			["hook", "hook"],
			["draft", "draft"],
			["handoff", "handoff"],
			["learn", "learn"],
			["skills", "skills"],
			["impact", "impact"],
			["fetcher", "fetcher"],
		] as const) {
			expect(dispatch(`/${name}`, session()).run?.command, name).toBe(verb);
		}
	});

	it("shows the config panel rather than a not-wired notice", () => {
		// /config was listed both as a real switch case and in NOT_WIRED; the
		// switch always wins, so the NOT_WIRED entry was dead and misleading.
		const rendered = text(dispatch("/config", session()).lines);
		expect(rendered).toContain("Mode:");
		expect(rendered).not.toContain("not in this engine yet");
	});

	it("passes arguments through to the engine", () => {
		const result = dispatch("/wiki x3 force", session());
		expect(result.run?.args).toEqual(["x3", "force"]);
	});

	it("leaves no command in the registry without a capability behind it", () => {
		// This used to be a test that the placeholder notice read well. Every
		// command the palette offers is now backed by something that runs, so
		// what is worth guarding is that none of them regress to a notice.
		for (const command of COMMANDS) {
			const rendered = text(dispatch(`/${command.name}`, session()).lines);
			expect(rendered, `/${command.name}`).not.toContain("is not in this engine yet");
		}
	});

	it("asks the engine to read the conversation for the commands that brief it", () => {
		// The engine reads sessions off disk, so the shell has to save the one
		// it means and name it. Without the marker, /handoff would brief
		// whatever session happened to be newest.
		expect(dispatch("/handoff", session()).run?.needsSession).toBe(true);
		expect(dispatch("/learn", session()).run?.needsSession).toBe(true);
		expect(dispatch("/draft", session()).run?.needsSession).toBeUndefined();
		expect(dispatch("/draft", session()).run?.withNotes).toBe(true);
	});

	it("toggles auto-approve and announces it loudly", () => {
		const state = session();
		expect(text(dispatch("/yolo", state).lines)).toContain("auto-approve ON");
		expect(state.autoApprove).toBe(true);
		expect(text(dispatch("/yolo", state).lines)).toContain("auto-approve OFF");
		expect(state.autoApprove).toBe(false);
	});

	it("switches mode and thinking, and rejects unknown values", () => {
		const state = session();
		dispatch("/mode plan", state);
		expect(state.mode).toBe("plan");
		expect(text(dispatch("/mode nonesuch", state).lines)).toContain("unknown mode");
		expect(state.mode).toBe("plan");
		dispatch("/thinking high", state);
		expect(state.thinking).toBe("high");
		dispatch("/thinking max", state);
		expect(state.thinking).toBe("max");
		dispatch("/thinking hide", state);
		expect(state.thinkingVisibility).toBe("hide");
		dispatch("/thinking show", state);
		expect(state.thinkingVisibility).toBe("show");
		expect(text(dispatch("/thinking", state).lines)).toContain("thinking: max");
		expect(text(dispatch("/thinking invalid", state).lines)).toContain("unknown level or mode");
	});

	it("keeps steering notes and queued messages", () => {
		const state = session();
		dispatch("/notes add prefer table-driven tests", state);
		expect(state.notes).toEqual(["prefer table-driven tests"]);
		expect(text(dispatch("/notes", state).lines)).toContain("prefer table-driven tests");
		dispatch("/btw the CI runs on node 22", state);
		expect(state.queued).toEqual(["the CI runs on node 22"]);
		dispatch("/queue clear", state);
		expect(state.queued).toEqual([]);
	});

	it("switches theme, flashing rather than logging the change", () => {
		const state = session();
		expect(text(dispatch("/theme", state).lines)).toContain("theme: default");
		expect(dispatch("/theme light", state).flash).toBe("theme → light");
		expect(text(dispatch("/theme nonesuch", state).lines)).toContain("unknown theme");
		setTheme("default");
	});

	it("opens the hidden prompt for a bare /key and never echoes an inline one", () => {
		expect(dispatch("/key", session()).promptKey).toBe(true);
		const inline = dispatch("/key sk-secret-value", session());
		expect(inline.promptKey).toBeUndefined();
		expect(text(inline.lines)).not.toContain("sk-secret-value");
		// The value reaches the shell so it can be stored, rather than being
		// acknowledged and dropped.
		expect(inline.inlineKey).toBe("sk-secret-value");
	});

	it("sends /provider's listing to the shell and guards the switch's shape", () => {
		// Listing and switching need pi-ai's catalog, which dispatch must not
		// touch — but a malformed provider id can be refused here, where the
		// catalog would only be reached to say no.
		const state = session();
		expect(dispatch("/provider", state).providers).toEqual({ kind: "list" });
		expect(dispatch("/provider list", state).providers).toEqual({ kind: "list" });
		expect(dispatch("/provider groq", state).providers).toEqual({ kind: "switch", name: "groq" });
		expect(text(dispatch("/provider open/router", state).lines)).toContain("not a provider id");
		expect(text(dispatch("/provider has space", state).lines)).toContain("not a provider id");
		expect(state.provider).toBe("anthropic");
	});

	it("sends a /model spec to the shell, which owns the catalog", () => {
		// Whether a spec's first segment names the provider or a model
		// namespace needs the catalog, so dispatch only settles the shape.
		const state = session();
		const result = dispatch("/model openrouter/z-ai/glm-5.3-flash", state);
		expect(result.providers).toEqual({ kind: "model", spec: "openrouter/z-ai/glm-5.3-flash" });
		// Nothing is decided here — the shell applies, persists and reprints.
		expect(state.model).toBe("anthropic/claude-opus-4");
		expect(state.provider).toBe("anthropic");
		expect(result.persistModel).toBeUndefined();
	});

	it("sends a namespace spec to the shell untouched", () => {
		// `z-ai/...` is an OpenRouter id typed without its prefix; deciding
		// that is the shell's job, with the catalog in hand.
		const result = dispatch("/model z-ai/glm-5.3-flash", session());
		expect(result.providers).toEqual({ kind: "model", spec: "z-ai/glm-5.3-flash" });
	});

	it("sends /models to the shell with the filter it was given", () => {
		expect(dispatch("/models", session()).providers).toEqual({ kind: "models", filter: "" });
		expect(dispatch("/models free", session()).providers).toEqual({ kind: "models", filter: "free" });
	});

	it("refuses a bare model id rather than guessing where it belongs", () => {
		// An OpenRouter id carries slashes of its own, so a one-word argument
		// could be either a short spec or an id under the current provider.
		// Both readings cannot be right; refusing names the correct shape.
		const state = session();
		state.provider = "openrouter";
		const rendered = text(dispatch("/model glm-5.3-flash", state).lines);
		expect(rendered).toContain("<provider>/<model-id>");
		expect(rendered).toContain("openrouter/glm-5.3-flash");
		// A refusal changes nothing.
		expect(state.model).toBe("anthropic/claude-opus-4");
		expect(state.provider).toBe("openrouter");
	});

	it("reports the active model when given nothing to set", () => {
		const state = session();
		const rendered = text(dispatch("/model", state).lines);
		expect(rendered).toContain(state.model);
		expect(rendered).toContain("/model <provider>/<model-id>");
	});

	it("routes /model list to the catalog the shell already renders", () => {
		// It used to say the catalog was not in this engine, while /models
		// printed it. One of those was wrong, and it was not /models.
		expect(dispatch("/model list", session()).providers).toEqual({ kind: "models", filter: "" });
	});

	it("clears, quits and stops", () => {
		expect(dispatch("/clear", session()).clear).toBe(true);
		expect(dispatch("/quit", session()).quit).toBe(true);
		expect(dispatch("/stop", session()).stop).toBe(true);
	});

	it("reports an unknown command with the palette's own near misses", () => {
		const rendered = text(dispatch("/nonesuch", session()).lines);
		expect(rendered).toContain("unknown command: /nonesuch");
		expect(rendered).toContain("/help for the list");
	});
});

describe("the provider list", () => {
	const infos: ProviderInfo[] = [
		{ id: "groq", name: "Groq", models: ["llama-3.3-70b", "kimi-k2"] },
		{ id: "openrouter", name: "openrouter", authSource: "OPENROUTER_API_KEY", models: ["a", "b", "c"] },
		{ id: "anthropic", name: "anthropic", authSource: "ANTHROPIC_API_KEY", models: [] },
	];

	it("lists everyone, configured first, and names the active one", () => {
		const rendered = text(providerLines(infos, "openrouter"));
		const rows = rendered.split("\n");
		// Configured before unconfigured: "what can I switch to right now" is
		// answered at the top, not by hunting for a checkmark.
		expect(rows.findIndex((r) => r.includes("openrouter"))).toBeLessThan(rows.findIndex((r) => r.includes("groq")));
		expect(rendered).toContain("✓ openrouter");
		expect(rendered).toContain("· active");
		expect(rendered).toContain("OPENROUTER_API_KEY");
		expect(rendered).toContain("3 models");
		expect(rendered).toContain("set GROQ_API_KEY");
		// An active provider with no credentials is a mismatch worth seeing.
		expect(text(providerLines(infos.map((i) => ({ ...i, authSource: undefined })), "groq"))).toContain("✗ groq");
	});

	it("says what to do when nobody is configured", () => {
		const bare = infos.map((info) => ({ ...info, authSource: undefined }));
		expect(text(providerLines(bare, ""))).toContain("/key sets one for this session");
	});

	it("hints at the credential each provider wants", () => {
		// A resolved auth names its own source; the well-known ones fall back
		// to their conventional variable, and the rest stay honest about the
		// vagueness rather than inventing a variable name.
		expect(credentialHint(infos[1] as ProviderInfo)).toBe("OPENROUTER_API_KEY");
		expect(credentialHint(infos[0] as ProviderInfo)).toBe("GROQ_API_KEY");
		expect(credentialHint({ id: "nonesuch", name: "nonesuch", models: [] })).toContain("API key");
	});

	it("picks the catalog's first model as a switch's default", () => {
		expect(pickDefaultModel(["llama-3.3-70b", "kimi-k2"])).toBe("llama-3.3-70b");
	});
});

describe("resolving what a model spec names", () => {
	const infos: ProviderInfo[] = [
		{ id: "openrouter", name: "openrouter", authSource: "OPENROUTER_API_KEY", models: ["z-ai/glm-4.5", "z-ai/glm-4.6", "qwen/qwen3-coder"] },
		{ id: "zai", name: "zai", models: ["glm-4.6"] },
	];

	it("leaves a spec that already names a registered provider alone", () => {
		// `openai/...` means the openai provider even when OpenRouter catalogs
		// the same family — a registered first segment is never second-guessed.
		expect(resolveModelSpec(infos, "openrouter/z-ai/glm-4.5", "openrouter/a")).toBeNull();
		expect(resolveModelSpec(infos, "zai/glm-4.5", "openrouter/a")).toBeNull();
	});

	it("adds the provider prefix to an id typed without it", () => {
		// `z-ai/glm-4.5` is an OpenRouter model id; its first segment names a
		// namespace, not a provider, and the header must not claim otherwise.
		expect(resolveModelSpec(infos, "z-ai/glm-4.5", "openrouter/other")).toEqual({
			provider: "openrouter",
			model: "z-ai/glm-4.5",
		});
	});

	it("expands a namespace even when the exact id is newer than the catalog", () => {
		// The catalog is a snapshot; an id released after it still belongs to
		// the provider that carries the family.
		expect(resolveModelSpec(infos, "z-ai/glm-9-nine", "openrouter/a")).toEqual({
			provider: "openrouter",
			model: "z-ai/glm-9-nine",
		});
	});

	it("prefers the active provider when several carry the namespace", () => {
		const both: ProviderInfo[] = [
			{ id: "first", name: "first", authSource: "A_KEY", models: ["ns/m1", "ns/m2"] },
			{ id: "second", name: "second", authSource: "SECOND_API_KEY", models: ["ns/m2"] },
		];
		expect(resolveModelSpec(both, "ns/m2", "second/other")).toEqual({ provider: "second", model: "ns/m2" });
		// The active provider wins even when it is not the first configured.
		expect(resolveModelSpec(both, "ns/m2", "first/other")?.provider).toBe("first");
		// Nobody configured: no opinion is offered.
		expect(resolveModelSpec(both.map((i) => ({ ...i, authSource: undefined })), "ns/m2")).toBeNull();
	});

	it("gives up on a spec no configured provider can name", () => {
		expect(resolveModelSpec(infos, "nonesuch/model", "openrouter/a")).toBeNull();
	});
});
