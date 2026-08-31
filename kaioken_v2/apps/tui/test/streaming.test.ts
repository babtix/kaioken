import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ChatRunner, EngineRunner, KaiokenTui } from "../src/app.js";
import { createTui } from "../src/app.js";
import { ScriptedTerminal } from "../src/scriptedTerminal.js";
import { stripAnsi } from "../src/theme.js";

/**
 * A chat turn, watched while it happens.
 *
 * Two things used to be wrong with the wait. The reply arrived in one piece
 * when the model finished — so an agentic turn showed a single word, "thinking",
 * for the whole of it, and the same wall-clock turn read as a hang next to
 * every other agent's token feed. And the reply only arrived after the
 * verification gate, which on a turn that wrote a file is the repository's own
 * typecheck, build and test — minutes of silence stacked on silence. Both are
 * properties of the wait, so both are tested while the turn is still in
 * flight, not after it settles.
 */
describe("a streaming chat turn", () => {
	let root: string;

	beforeAll(async () => {
		root = await mkdtemp(join(tmpdir(), "kaioken-stream-"));
	});

	afterAll(async () => {
		await rm(root, { recursive: true, force: true });
	});

	function shellWith(chat: ChatRunner, engine?: EngineRunner): { app: KaiokenTui; terminal: ScriptedTerminal } {
		const terminal = new ScriptedTerminal(100, 40);
		const app = createTui({ root, terminal, motion: false, model: "anthropic/claude-opus-4", chat, engine });
		return { app, terminal };
	}

	function submit(app: KaiokenTui, text: string): Promise<void> {
		return (app as unknown as { submit(text: string): Promise<void> }).submit(text);
	}

	function scrollback(app: KaiokenTui): string {
		return stripAnsi(app.scrollback().join("\n"));
	}

	async function settle(): Promise<void> {
		for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 5));
	}

	it("paints prose and tool calls as they arrive, not after the turn", async () => {
		let release: () => void = () => {};
		const held = new Promise<void>((settleHeld) => {
			release = settleHeld;
		});
		let midTurn = "";
		const chat: ChatRunner = async (request) => {
			request.onText?.("working on ");
			request.onText?.("it now");
			request.onTool?.("bash", { command: "ls src" });
			request.onText?.("\nAll done.");
			midTurn = scrollback(app);
			await held;
			return { reply: "working on it now\nAll done.", verified: null, gateRan: false };
		};
		const { app } = shellWith(chat);
		await app.run();

		const turn = submit(app, "fix it");
		await settle();
		expect(app.isBusy()).toBe(true);
		// Mid-turn: the prose and the tool call had already reached the
		// transcript, token by token.
		expect(midTurn).toContain("working on it now");
		expect(midTurn).toContain("bash");
		expect(midTurn).toContain("ls src");

		release();
		await turn;
		const after = scrollback(app);
		expect(after).toContain("All done.");
		expect(after).toContain("› fix it");
	});

	it("replaces the raw stream with the formatted reply once the text stops moving", async () => {
		const chat: ChatRunner = async (request) => {
			request.onText?.("First paragraph.\n\nSecond paragraph.");
			request.onReply?.("First paragraph.\n\nSecond paragraph.");
			return { reply: "First paragraph.\n\nSecond paragraph.", verified: null, gateRan: false };
		};
		const { app } = shellWith(chat);
		await app.run();

		await submit(app, "write it up");
		const rows = (app as unknown as { renderTranscript(width: number): string[] }).renderTranscript(100);
		const body = rows.map((row) => stripAnsi(row));
		// The prose is there once, formatted: the raw streamed rows are gone.
		expect(body.filter((row) => row.includes("First paragraph."))).toHaveLength(1);
		expect(body.filter((row) => row.includes("Second paragraph."))).toHaveLength(1);
		// A paragraph gap is one row, not the raw stream's two newlines.
		const first = body.findIndex((row) => row.includes("First paragraph."));
		const second = body.findIndex((row) => row.includes("Second paragraph."));
		expect(second - first).toBe(2);
	});

	it("shows the reply while the verification gate is still running", async () => {
		let release: () => void = () => {};
		const gate = new Promise<void>((settleGate) => {
			release = settleGate;
		});
		const chat: ChatRunner = async (request) => {
			request.onReply?.("The change is in.");
			await gate;
			return { reply: "The change is in.", verified: { verdict: "passed" }, gateRan: true };
		};
		const { app } = shellWith(chat);
		await app.run();

		const turn = submit(app, "change it");
		await settle();
		// The gate is running and the turn is busy — but the reply is already
		// on screen, because onReply fired before the gate started.
		expect(app.isBusy()).toBe(true);
		expect(scrollback(app)).toContain("The change is in.");

		release();
		await turn;
		// The gate's verdict is the follow-up line it always was.
		const after = scrollback(app);
		expect(after).toContain("gate:");
		expect(after).toContain("passed");
	});

	it("hands the same conversation cache to every turn and drops it after an engine run", async () => {
		const caches: Array<unknown> = [];
		const chat: ChatRunner = async (request) => {
			caches.push(request.cache);
			return { reply: "ok", verified: null, gateRan: false };
		};
		const engine: EngineRunner = async () => 0;
		const { app } = shellWith(chat, engine);
		await app.run();

		await submit(app, "first");
		await submit(app, "second");
		// The conversation — knowledge, model resolution, the agent session —
		// is one object across turns, not a rebuild per message.
		expect(caches).toHaveLength(2);
		expect(caches[0]).toBeDefined();
		expect(caches[1]).toBe(caches[0]);

		await (app as unknown as { runCommand(raw: string): Promise<void> }).runCommand("/scan");
		await submit(app, "third");
		// An engine run may have rewritten the artifacts the cached knowledge
		// was built from, so the next turn starts fresh rather than answering
		// from an index that no longer describes the repository.
		expect(caches).toHaveLength(3);
		expect(caches[2]).toBeDefined();
		expect(caches[2]).not.toBe(caches[0]);
	});

	it("paints thinking deltas live into the transcript with a thought indicator", async () => {
		let release: () => void = () => {};
		const held = new Promise<void>((settleHeld) => {
			release = settleHeld;
		});
		let midTurn = "";
		const chat: ChatRunner = async (request) => {
			request.onThinking?.("Inspecting dependencies ");
			request.onThinking?.("and structure first.");
			midTurn = scrollback(app);
			request.onText?.("Here is the answer.");
			await held;
			return { reply: "Here is the answer.", verified: null, gateRan: false };
		};
		const { app } = shellWith(chat);
		await app.run();

		const turn = submit(app, "how does this work?");
		await settle();
		expect(midTurn.toLowerCase()).toContain("thinking");
		expect(midTurn).toContain("Inspecting dependencies and structure first.");

		release();
		await turn;
		const after = scrollback(app);
		expect(after.toLowerCase()).toContain("thought");
		expect(after).toContain("Inspecting dependencies and structure first.");
		expect(after).toContain("Here is the answer.");
	});

	it("extracts bold titles into the thought header like OpenCode", async () => {
		const chat: ChatRunner = async (request) => {
			request.onThinking?.("**Analyzing imports**\n\nChecking what modules are present.");
			request.onReply?.("Done analyzing.");
			return { reply: "Done analyzing.", verified: null, gateRan: false };
		};
		const { app } = shellWith(chat);
		await app.run();

		await submit(app, "analyze this");
		const after = scrollback(app);
		expect(after).toContain("Thought: Analyzing imports");
		expect(after).toContain("Checking what modules are present.");
		expect(after).toContain("Done analyzing.");
	});

	it("respects hide mode for thought blocks by showing only the summary banner", async () => {
		const chat: ChatRunner = async (request) => {
			request.onThinking?.("**Quiet planning**\n\nSuper secret internal reasoning details.");
			request.onReply?.("Final answer.");
			return { reply: "Final answer.", verified: null, gateRan: false };
		};
		const { app } = shellWith(chat);
		await app.run();

		await (app as unknown as { runCommand(cmd: string): Promise<void> }).runCommand("/thinking hide");
		await submit(app, "solve problem");
		const after = scrollback(app);
		expect(after).toContain("Thought: Quiet planning");
		expect(after).not.toContain("Super secret internal reasoning details.");
		expect(after).toContain("Final answer.");
	});
});

/**
 * The scrollback is bounded, and the bound is invisible when nothing nears it.
 *
 * Re-wrapping the whole scrollback on every frame is the one cost that grows
 * with a session; even memoised, a transcript with no ceiling eventually costs
 * more to draw than the terminal has rows to show it. The cap drops the front
 * and keeps the rest of the interface exactly as it was.
 */
describe("the scrollback cap", () => {
	it("drops the front of a transcript that grows past the ceiling", async () => {
		const root = await mkdtemp(join(tmpdir(), "kaioken-cap-"));
		try {
			const terminal = new ScriptedTerminal(100, 40);
			const app = createTui({
				root,
				terminal,
				motion: false,
				engine: async (_run, _root, emit) => {
					for (let i = 0; i < 6000; i++) emit(`row ${i}`);
					return 0;
				},
			});
			await app.run();

			await (app as unknown as { runCommand(raw: string): Promise<void> }).runCommand("/scan");
			expect(app.scrollback().length).toBeLessThanOrEqual(5000);
			const log = stripAnsi(app.scrollback().join("\n"));
			// The front is gone…
			expect(log).not.toContain("row 0\n");
			// …and the end is whole, latest row included.
			expect(log).toContain("row 5999");
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("renders the same rows with a warm wrap memo as with a cold one", async () => {
		const root = await mkdtemp(join(tmpdir(), "kaioken-wrap-"));
		try {
			const chat: ChatRunner = async () => ({
				reply:
					"A reasonably long reply, long enough to need wrapping at this width, " +
					"so the memo has something in it worth checking across frames and widths.",
				verified: null,
				gateRan: false,
			});
			const terminal = new ScriptedTerminal(100, 40);
			const app = createTui({ root, terminal, motion: false, model: "anthropic/claude-opus-4", chat });
			await app.run();
			await submitThrough(app, "a question");

			const render = (width: number): string[] =>
				(app as unknown as { renderTranscript(width: number): string[] }).renderTranscript(width);
			const cold = render(100).map((row) => stripAnsi(row));
			const warm = render(100).map((row) => stripAnsi(row));
			expect(warm).toEqual(cold);
			// A different width is a different wrap, not a stale one.
			const narrow = render(60).map((row) => stripAnsi(row));
			expect(narrow.length).toBeGreaterThanOrEqual(cold.length);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	async function submitThrough(app: KaiokenTui, text: string): Promise<void> {
		await (app as unknown as { submit(text: string): Promise<void> }).submit(text);
		for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 5));
	}
});
