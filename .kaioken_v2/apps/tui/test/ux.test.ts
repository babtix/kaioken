import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createTui, type KaiokenTui } from "../src/app.js";
import { ScriptedTerminal } from "../src/scriptedTerminal.js";
import { colorFromEnv, fg, keycap, setColor, stripAnsi } from "../src/theme.js";
import {
	ARGUMENT_VALUES,
	argumentSuggestions,
	looksLikePath,
	pathSuggestions,
	tokenAt,
} from "../src/autocomplete.js";
import { HELP_TEXT } from "../src/manual.js";

/**
 * The interaction defects, and the behaviour that replaced them.
 *
 * Each block here corresponds to something that was actually broken and was
 * found by driving the interface rather than reading it: text clipped off the
 * right of a narrow terminal, a long answer that opened at its own end, a
 * session lost to one stray keystroke, and `NO_COLOR` honoured only halfway.
 */

describe("the transcript wraps rather than clipping", () => {
	let root: string;
	let terminal: ScriptedTerminal;
	let app: KaiokenTui;

	beforeAll(async () => {
		root = await mkdtemp(join(tmpdir(), "kaioken-ux-"));
		// Narrow on purpose: this is the width at which the surface used to
		// throw away everything past the last column, silently.
		terminal = new ScriptedTerminal(44, 30);
		app = createTui({ root, terminal, motion: false, engine: async () => 0 });
		await app.run();
	});

	afterAll(async () => {
		await rm(root, { recursive: true, force: true });
	});

	it("keeps text that runs past the last column", () => {
		for (const ch of "/help") terminal.send(ch);
		terminal.send("\r");
		terminal.clear();
		app.paint();

		// A row from the top of /help that is twice the terminal's width. Its
		// tail used to be thrown away; now it appears on a continuation row.
		const long = HELP_TEXT.find((line) => line.includes("read_file · list_files"));
		expect(long, "the fixture line still exists in /help").toBeDefined();
		expect((long as string).length).toBeGreaterThan(60);

		const painted = terminal.frames();
		expect(painted).toContain("read_file · list_files");
		expect(painted).toContain("run_command");
	});

	it("never paints a row wider than the terminal", () => {
		for (const row of terminal.rowsPainted()) {
			if (row !== undefined) expect(row.length).toBeLessThanOrEqual(45);
		}
	});

	it("opens a long answer at its start, not its end", () => {
		// Following the end is right for a streaming reply and wrong for a
		// block you asked to read: /help used to open two-thirds down itself.
		const rows = terminal.rowsPainted().filter((row) => row !== undefined);
		const firstEcho = rows.findIndex((row) => row.startsWith("› "));
		const body = rows.slice(firstEcho).join("\n");
		expect(body).toContain("Chat: type anything to talk to the model");
	});
});

describe("detects a key already in the environment", () => {
	const saved = {
		ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
		OPENAI_API_KEY: process.env.OPENAI_API_KEY,
		OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
	};

	afterEach(() => {
		for (const [name, value] of Object.entries(saved)) {
			if (value === undefined) delete process.env[name];
			else process.env[name] = value;
		}
	});

	it("reports a key is set when only OPENROUTER_API_KEY is present", async () => {
		delete process.env.ANTHROPIC_API_KEY;
		delete process.env.OPENAI_API_KEY;
		process.env.OPENROUTER_API_KEY = "sk-or-v1-test";

		const root = await mkdtemp(join(tmpdir(), "kaioken-key-"));
		const terminal = new ScriptedTerminal(80, 24);
		const app = createTui({ root, terminal, motion: false, engine: async () => 0 });
		await app.run();

		expect(app.state().hasKey, "OpenRouter is this project's own default provider").toBe(true);
		await rm(root, { recursive: true, force: true });
	});
});

describe("quitting takes two", () => {
	it("warns on the first ctrl+c and only leaves on the second", async () => {
		const root = await mkdtemp(join(tmpdir(), "kaioken-ux-"));
		const terminal = new ScriptedTerminal(80, 24);
		const app = createTui({ root, terminal, motion: false, engine: async () => 0 });
		await app.run();

		let stopped = false;
		const original = terminal.stop.bind(terminal);
		terminal.stop = () => {
			stopped = true;
			original();
		};

		terminal.send("\x03");
		expect(stopped, "one keystroke must not end the session").toBe(false);
		terminal.clear();
		app.paint();
		expect(terminal.frames()).toContain("press ctrl+c again to quit");

		terminal.send("\x03");
		expect(stopped).toBe(true);
		await rm(root, { recursive: true, force: true });
	});
});

describe("NO_COLOR", () => {
	afterEach(() => setColor(true));

	it("is read from the environment", () => {
		expect(colorFromEnv({})).toBe(true);
		expect(colorFromEnv({ NO_COLOR: "1" })).toBe(false);
		expect(colorFromEnv({ TERM: "dumb" })).toBe(false);
	});

	it("removes the escapes rather than only the animation", () => {
		setColor(false);
		// Honouring it halfway is worse than not at all: the user asked for
		// plain text and used to get escape codes anyway.
		expect(fg("accent", "x")).toBe("x");
		// A keycap still reads as a key without a background to fill.
		expect(keycap("y")).toBe("[y]");
	});

	it("keeps the brand art plain, which used to bypass the switch", async () => {
		// The wordmark gradient and the palette's selection bar write raw
		// 256-colour escapes because they are brand art rather than themed
		// text — the two places the colour switch has to be checked by hand.
		const root = await mkdtemp(join(tmpdir(), "kaioken-ux-"));
		const terminal = new ScriptedTerminal(100, 30);
		const app = createTui({ root, terminal, motion: false, color: false, engine: async () => 0 });
		await app.run();
		terminal.send("/");
		terminal.send("w");
		terminal.clear();
		app.paint();
		// The frame carries the banner and an open palette with a selection
		// bar — every piece that used to escape the switch. Assert on the raw
		// output: frames() strips escapes, which would make this vacuous. The
		// renderer's own inert resets and the reverse-video cursor are pi-tui's
		// and stay; what may not return is a colour.
		expect(terminal.output()).not.toMatch(/\x1b\[(?:38|48);5;\d+m/);
		await rm(root, { recursive: true, force: true });
	});
});

describe("the scripted terminal", () => {
	it("strips every escape family pi-tui emits", () => {
		const terminal = new ScriptedTerminal(80, 24);
		terminal.write("\x1b_Ga=d,d=A,q=2\x1b\\"); // kitty graphics query, ST-terminated
		terminal.write("\x1b]0;title\x07"); // OSC title, BEL-terminated
		terminal.write("\x1b[38;5;208mtext\x1b[0m"); // SGR
		expect(terminal.frames()).toBe("text");
	});
});

describe("completion", () => {
	it("finds the token under the cursor", () => {
		expect(tokenAt("run src/a")).toBe("src/a");
		expect(tokenAt("run ")).toBe("");
		expect(tokenAt("@pack")).toBe("@pack");
	});

	it("offers paths only where one is plausibly being typed", () => {
		// An explicit @ always asks; otherwise it has to already look like one,
		// so ordinary prose never opens a file menu mid-sentence.
		expect(looksLikePath("@src")).toBe(true);
		expect(looksLikePath("src/app")).toBe(true);
		expect(looksLikePath("./x")).toBe(true);
		expect(looksLikePath("where")).toBe(false);
		expect(looksLikePath("a")).toBe(false);
	});

	it("completes a command's argument once the name is settled", () => {
		// The `/` palette owns the name and closes on the space; this takes
		// over from there, so the two menus never fight over a keystroke.
		expect(argumentSuggestions("/theme ")?.items.map((i) => i.value)).toEqual([
			"default",
			"light",
			"highcontrast",
		]);
		expect(argumentSuggestions("/theme li")?.items.map((i) => i.value)).toEqual(["light"]);
		expect(argumentSuggestions("/mode pl")?.items.map((i) => i.value)).toEqual(["plan"]);
		// No menu while the name itself is still being typed.
		expect(argumentSuggestions("/the")).toBeNull();
		// Nor for a command whose argument is free text.
		expect(argumentSuggestions("/research what is ")).toBeNull();
	});

	it("only offers argument values it can actually accept", () => {
		for (const value of ARGUMENT_VALUES.theme ?? []) {
			expect(["default", "light", "highcontrast"]).toContain(value);
		}
	});

	it("lists a directory, folders first, skipping the noise", async () => {
		const root = await mkdtemp(join(tmpdir(), "kaioken-fs-"));
		await mkdir(join(root, "packages"));
		await mkdir(join(root, "node_modules"));
		await writeFile(join(root, "README.md"), "x");
		await writeFile(join(root, ".hidden"), "x");

		const items = await pathSuggestions(root, "");
		const values = items.map((i) => i.label);
		expect(values[0]).toBe("packages/");
		expect(values).toContain("README.md");
		// Never worth completing into, and never offered unasked.
		expect(values).not.toContain("node_modules/");
		expect(values).not.toContain(".hidden");

		// Filtering by a partial name.
		expect((await pathSuggestions(root, "READ")).map((i) => i.label)).toEqual(["README.md"]);
		// A missing directory is not an error, just nothing to offer.
		expect(await pathSuggestions(root, "nope/x")).toEqual([]);
		await rm(root, { recursive: true, force: true });
	});
});

describe("discoverability", () => {
	it("documents the keys that already worked but were invisible", () => {
		const help = HELP_TEXT.join("\n");
		// pi-tui binds all of these; none of them was written down anywhere.
		expect(help).toContain("pageup / pagedown");
		expect(help).toContain("ctrl+shift+f");
		expect(help).toContain("mouse wheel");
		expect(help).toContain("ctrl+up / ctrl+down");
		expect(help).toContain("alt+enter");
		expect(help).toContain("press twice to quit");
		expect(help).toContain("complete a path");
	});
});

describe("failures point somewhere", () => {
	it("follows a non-zero exit with the two things that usually fix it", async () => {
		const root = await mkdtemp(join(tmpdir(), "kaioken-ux-"));
		const terminal = new ScriptedTerminal(90, 24);
		const app = createTui({
			root,
			terminal,
			motion: false,
			engine: async () => 1,
		});
		await app.run();

		for (const ch of "/status") terminal.send(ch);
		terminal.send("\r");
		for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 5));

		const log = stripAnsi(app.scrollback().join("\n"));
		expect(log).toContain("status exited 1");
		expect(log).toContain("/explain status");
		expect(log).toContain("/status checks the artifacts");
		await rm(root, { recursive: true, force: true });
	});
});
