import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { VERSION, createTui, engineArgv, type ChatRunner, type EngineRunner, type KaiokenTui, type ShellRunner } from "../src/app.js";
import { CURTAIN } from "../src/curtain.js";
import { ScriptedTerminal } from "../src/scriptedTerminal.js";
import { listSessions } from "@kaioken/session";
import { setTheme, stripAnsi } from "../src/theme.js";

/**
 * The shell, driven by keystrokes, with no pty and no credentials.
 *
 * pi-tui takes its terminal as a constructor argument and the shell takes its
 * engine as one, so the whole event loop — key grammar, palette, command
 * dispatch, the approval prompt, the busy queue — runs against doubles that
 * record what happened. This is the half of the interface the pure-function
 * tests cannot reach.
 *
 * The root is an empty temporary directory, so the test touches no repository
 * and no network.
 */
describe("the shell", () => {
	let root: string;
	let terminal: ScriptedTerminal;
	let app: KaiokenTui;
	let engineCalls: Array<{ command: string; args: string[] }>;

	const engine: EngineRunner = async (run, _root, emit) => {
		engineCalls.push({ command: run.command, args: run.args });
		emit(`ran ${run.command}`);
		return 0;
	};

	beforeAll(async () => {
		root = await mkdtemp(join(tmpdir(), "kaioken-tui-"));
		terminal = new ScriptedTerminal(100, 40);
		engineCalls = [];
		// Motion off: every effect is a pure function of elapsed milliseconds and
		// is tested as one. Letting the wall clock into the shell tests would
		// make them depend on how fast the machine ran them.
		app = createTui({ root, terminal, engine, model: "anthropic/claude-opus-4", motion: false });
		await app.run();
	});

	afterAll(async () => {
		await rm(root, { recursive: true, force: true });
	});

	/** Type a line and submit it, the way a person would. */
	function type(line: string): void {
		for (const ch of line) terminal.send(ch);
		terminal.send("\r");
	}

	/** Let the pending microtasks and the scripted engine finish. */
	async function settle(): Promise<void> {
		for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 5));
	}

	function painted(): string {
		terminal.clear();
		app.paint();
		return terminal.frames();
	}

	/** The composer row: the second-from-last painted row. */
	function composerRow(): string {
		return terminal.bottomRows(2)[0] ?? "";
	}

	/**
	 * The sticky header: everything painted above the transcript.
	 *
	 * Its height is not fixed — the banner stacks into one column on a narrow
	 * terminal and collapses to a strip on a short one — so the boundary is
	 * found rather than assumed: the transcript starts at the first echoed
	 * command, which is the only thing that carries the prompt glyph.
	 */
	function header(): string {
		const rows = terminal.rowsPainted().filter((row) => row !== undefined);
		const firstEcho = rows.findIndex((row) => row.startsWith("› "));
		return (firstEcho === -1 ? rows : rows.slice(0, firstEcho)).join("\n");
	}

	function scrollback(): string {
		return stripAnsi(app.scrollback().join("\n"));
	}

	it("opens on the wordmark, the status panel and the status line", () => {
		const frame = painted();
		expect(frame).toContain("██");
		expect(frame).toContain("kaioken@");
		expect(frame).toContain("Model");
		expect(frame).toContain("/ commands");
		// The banner carries the invitation; the transcript stays empty.
		expect(frame).toContain("type to chat · press / for commands");
	});

	it("echoes what was typed and answers /help from the transcript", () => {
		type("/help");
		const log = scrollback();
		expect(log).toContain("› /help");
		expect(log).toContain("Chat: type anything to talk to the model");
		expect(log).toContain("Knowledge engine:");
	});

	it("opens the palette on / and completes with tab", () => {
		terminal.send("/");
		terminal.send("w");
		terminal.send("i");
		const frame = painted();
		expect(frame).toContain("/wiki");
		expect(frame).toContain("tab complete");
		terminal.send("\t");
		// Completing a command that takes arguments leaves a trailing space to
		// keep typing into.
		expect(painted()).toContain("/wiki ");
	});

	it("clears a half-typed prompt on escape", () => {
		terminal.send("\x1b");
		painted();
		// Assert on the composer row, not the whole frame: the scrollback above
		// still quotes "/wiki [xN] [force]" from the earlier /help.
		expect(composerRow()).toContain("chat with the model");
		expect(composerRow()).not.toContain("/wiki ");
	});

	it("routes a backed command to the engine and streams its output", async () => {
		type("/status");
		await settle();
		expect(engineCalls.at(-1)).toEqual({ command: "status", args: [] });
		expect(scrollback()).toContain("ran status");
	});

	it("passes the multiplier and flags through to the engine", async () => {
		type("/wiki x3 force");
		await settle();
		expect(engineCalls.at(-1)).toEqual({ command: "wiki", args: ["x3", "force"] });
	});

	it("holds a high-power run behind an explicit yes, and cancels on n", async () => {
		const before = engineCalls.length;
		type("/wiki x9");
		painted();
		// The meter is in the transcript and the gate is on the composer row,
		// so the cost is visible at the moment the decision is being made.
		expect(scrollback()).toContain("POWER ×9");
		// The gate is a two-row block above the status row, so address the
		// block rather than the single row a bare composer occupies.
		expect(terminal.bottomRows(3).join("\n")).toContain("high power");
		expect(engineCalls).toHaveLength(before);

		terminal.send("n");
		await settle();
		expect(engineCalls).toHaveLength(before);
		expect(scrollback()).toContain("cancelled — nothing ran");

		type("/wiki x9");
		terminal.send("y");
		await settle();
		expect(engineCalls.at(-1)).toEqual({ command: "wiki", args: ["x9"] });
		// Leave nothing running: a turn still in flight would swallow the next
		// test's keystrokes into the steering queue.
		expect(app.isBusy()).toBe(false);
	});

	it("changes session state from a command", () => {
		type("/mode plan");
		expect(app.state().mode).toBe("plan");
		// A non-default mode is worth a header row; the default is not. The
		// header, not the frame: the scrollback holds the echoed command.
		painted();
		expect(header()).toContain("mode plan");
		type("/mode build");
		painted();
		expect(header()).not.toContain("mode build");
	});

	it("announces auto-approve in the status line, never subtly", () => {
		type("/yolo");
		expect(app.state().autoApprove).toBe(true);
		expect(painted()).toContain("yolo");
		type("/yolo");
		expect(app.state().autoApprove).toBe(false);
	});

	it("flashes a theme switch rather than logging it", () => {
		type("/theme light");
		// A palette change is visible the instant it happens; a permanent line
		// about it is clutter, so it goes to the status row and expires.
		expect(scrollback()).not.toContain("theme → light");
		expect(painted()).toContain("theme → light");
		expect(painted()).toContain("kaioken@");
		type("/theme default");
	});

	it("hides an API key from the screen and from the scrollback", () => {
		// The key lands in the active provider's variable — this session's
		// model spec names anthropic — and the environment may legitimately
		// carry other providers' credentials, so it is pinned and restored
		// rather than assumed empty.
		const saved = {
			ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
			OPENAI_API_KEY: process.env.OPENAI_API_KEY,
			OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
		};
		try {
			delete process.env.ANTHROPIC_API_KEY;
			delete process.env.OPENAI_API_KEY;
			delete process.env.OPENROUTER_API_KEY;

			type("/key sk-live-secret-value");
			expect(scrollback()).not.toContain("sk-live-secret-value");
			expect(scrollback()).toContain("/key ********");
			// An inline key is actually stored, not merely acknowledged: the
			// session's provider comes from its model spec, so that is the
			// variable the key is stored in, and the header must stop
			// claiming "not set".
			expect(app.state().hasKey).toBe(true);
			expect(process.env.ANTHROPIC_API_KEY).toBe("sk-live-secret-value");

			// The bare form opens a prompt that echoes only the length, and
			// its key reaches the same place the inline one did.
			type("/key");
			expect(app.isPromptingForKey()).toBe(true);
			for (const ch of "sk-another-secret") terminal.send(ch);
			const frame = painted();
			expect(frame).not.toContain("sk-another-secret");
			expect(frame).toContain("***");
			terminal.send("\r");
			expect(app.isPromptingForKey()).toBe(false);
			expect(scrollback()).not.toContain("sk-another-secret");
			expect(process.env.ANTHROPIC_API_KEY).toBe("sk-another-secret");
		} finally {
			for (const [name, value] of Object.entries(saved)) {
				if (value === undefined) delete process.env[name];
				else process.env[name] = value;
			}
		}
	});

	it("routes a command with no arguments rather than reporting it missing", () => {
		type("/prism");
		expect(scrollback()).not.toContain("not in this engine yet");
		expect(scrollback()).not.toContain("unknown command");
	});

	it("clears the transcript on /clear", () => {
		type("/clear");
		expect(app.scrollback()).toHaveLength(0);
		painted();
		expect(composerRow()).toContain("chat with the model");
	});

	it("queues input typed while a task is running, then sends it", async () => {
		let release: () => void = () => {};
		const slow = new Promise<void>((resolve) => {
			release = resolve;
		});
		const blocked = createTui({
			root,
			terminal: new ScriptedTerminal(100, 40),
			motion: false,
			engine: async (run, _root, emit) => {
				await slow;
				emit(`ran ${run.command}`);
				return 0;
			},
		});
		await blocked.run();

		const pending = (blocked as unknown as { runCommand(raw: string): Promise<void> }).runCommand("/scan");
		await Promise.resolve();
		expect(blocked.isBusy()).toBe(true);

		await (blocked as unknown as { submit(text: string): Promise<void> }).submit("a question");
		expect(blocked.state().queued).toEqual(["a question"]);
		expect(stripAnsi(blocked.scrollback().join("\n"))).toContain("queued");

		release();
		await pending;
	});

	it("stops a running task on escape rather than quitting", async () => {
		let release: () => void = () => {};
		const slow = new Promise<void>((resolve) => {
			release = resolve;
		});
		const scriptedTerminal = new ScriptedTerminal(100, 40);
		const blocked = createTui({
			root,
			terminal: scriptedTerminal,
			motion: false,
			engine: async (run, _root, emit) => {
				await slow;
				emit(`ran ${run.command}`);
				return 0;
			},
		});
		await blocked.run();

		const pending = (blocked as unknown as { runCommand(raw: string): Promise<void> }).runCommand("/scan");
		await Promise.resolve();
		expect(blocked.isBusy()).toBe(true);

		scriptedTerminal.send("\x1b");
		// Stopping is not instantaneous: the run is still in flight until the
		// engine call settles, so the spinner keeps turning and the transcript
		// only promises that the stop was asked for.
		expect(blocked.isBusy(), "the spinner must not stop before the run settles").toBe(true);
		expect(stripAnsi(blocked.scrollback().join("\n"))).toContain("stopping");

		// `scan` has no cancellation path into the engine call it already
		// started — this double engine has no signal to react to, so it keeps
		// running until `release()`, exactly like the real one would. Once it
		// resolves, the transcript should say so plainly rather than silently
		// dropping it or claiming twice that a stop was processed.
		release();
		await pending;
		const after = stripAnsi(blocked.scrollback().join("\n"));
		expect(after).toContain("stopped");
		expect(after).toContain("scan kept running in the background and has now finished");
		expect(after.match(/stopped/g)).toHaveLength(1);
		expect(blocked.isBusy()).toBe(false);
	});

	it("stops a running task on ctrl+c instead of warning or quitting", async () => {
		// ctrl+c is overloaded: with nothing running it is the quit gesture
		// (warn once, quit on the second press within the window); with a task
		// in flight it must stop that task instead, on the first press, without
		// touching the quit-warning state at all.
		let release: () => void = () => {};
		const slow = new Promise<void>((resolve) => {
			release = resolve;
		});
		const scriptedTerminal = new ScriptedTerminal(100, 40);
		const blocked = createTui({
			root,
			terminal: scriptedTerminal,
			motion: false,
			engine: async (run, _root, emit) => {
				await slow;
				emit(`ran ${run.command}`);
				return 0;
			},
		});
		await blocked.run();

		const pending = (blocked as unknown as { runCommand(raw: string): Promise<void> }).runCommand("/scan");
		await Promise.resolve();
		expect(blocked.isBusy()).toBe(true);

		scriptedTerminal.send("\x03");
		// One ctrl+c must stop the run rather than warn about quitting — the
		// stop is in flight, so the spinner holds until the run settles.
		expect(blocked.isBusy(), "one ctrl+c must stop the run, not just warn").toBe(true);
		expect(stripAnsi(blocked.scrollback().join("\n"))).toContain("stopping");
		expect(stripAnsi(blocked.scrollback().join("\n"))).not.toContain("press ctrl+c again");

		release();
		await pending;
		expect(blocked.isBusy()).toBe(false);
		expect(stripAnsi(blocked.scrollback().join("\n"))).toContain("stopped");
	});

	it("interrupts /serve through the engine's cancel channel on escape", async () => {
		// serve is the one engine command that can actually be stopped: the
		// engine registers a cancel function when it starts and only resolves
		// once it is invoked — the same shape the real in-process serve runs
		// under. The double below mirrors that contract so the fix — reaching
		// the server through that channel, with no process signal involved —
		// is what is under test.
		const scriptedTerminal = new ScriptedTerminal(100, 40);
		let cancelledServe = false;
		const blocked = createTui({
			root,
			terminal: scriptedTerminal,
			motion: false,
			engine: (run, _root, _emit, onCancel) =>
				new Promise<number>((resolve) => {
					if (run.command !== "serve") {
						resolve(0);
						return;
					}
					onCancel?.(() => {
						cancelledServe = true;
						resolve(0);
					});
				}),
		});
		await blocked.run();

		const pending = (blocked as unknown as { runCommand(raw: string): Promise<void> }).runCommand("/serve");
		await Promise.resolve();
		expect(blocked.isBusy()).toBe(true);

		scriptedTerminal.send("\x1b");
		await pending;

		expect(cancelledServe, "esc must reach the server through the cancel channel, not a synthetic SIGINT").toBe(true);
		expect(blocked.isBusy()).toBe(false);
		const after = stripAnsi(blocked.scrollback().join("\n"));
		expect(after).toContain("stopped");
		// serve is genuinely stopped, not merely hidden — no background-finish note.
		expect(after).not.toContain("kept running in the background");
	});

	it("gives chat write tools only in a write-capable mode", async () => {
		// /mode plan is read-only by its own description in commands.ts; chat
		// must actually honour that rather than only displaying it.
		const requests: Array<{ write?: boolean; approve?: unknown }> = [];
		const chat: ChatRunner = async (request) => {
			requests.push({ write: request.write, approve: request.approve });
			return { reply: "ok", verified: null, gateRan: false };
		};
		const scriptedTerminal = new ScriptedTerminal(100, 40);
		const withChat = createTui({ root, terminal: scriptedTerminal, motion: false, chat });
		await withChat.run();

		const dispatchFn = (raw: string) => (withChat as unknown as { runCommand(raw: string): Promise<void> }).runCommand(raw);
		const submitFn = (text: string) => (withChat as unknown as { submit(text: string): Promise<void> }).submit(text);

		await dispatchFn("/mode plan");
		await submitFn("a question");
		expect(requests.at(-1)).toEqual({ write: false, approve: undefined });

		await dispatchFn("/mode build");
		await submitFn("a question");
		expect(requests.at(-1)?.write).toBe(true);
		expect(typeof requests.at(-1)?.approve).toBe("function");
	});

	/**
	 * The gap between two paragraphs is one row.
	 *
	 * It was twenty-six. The markdown renderer pads every row to the width it
	 * is given, the transcript indents a wrapped row's continuations by that
	 * row's leading whitespace, and a padded blank row is nothing but leading
	 * whitespace — so each gap was wrapped at the four-column floor and came
	 * back as a row per four columns. A reply this size occupied 132 rows
	 * instead of 10: the second half was below the fold, and every frame
	 * re-wrapped ten times the text it needed to.
	 *
	 * Counting rendered rows rather than eyeballing a frame, because the
	 * defect was invisible in any single screenful — it looked like spacing.
	 */
	it("spends one row on the gap between two paragraphs", async () => {
		const chat: ChatRunner = async () => ({
			reply: "First paragraph.\n\n## A heading\n\nSecond paragraph.\n\n## Another\n\nThird paragraph.",
			verified: null,
			gateRan: false,
		});
		const scriptedTerminal = new ScriptedTerminal(100, 40);
		const withChat = createTui({ root, terminal: scriptedTerminal, motion: false, chat });
		await withChat.run();

		await (withChat as unknown as { submit(text: string): Promise<void> }).submit("a question");
		const rows = (
			withChat as unknown as { renderTranscript(width: number): string[] }
		).renderTranscript(100);

		// The echoed question, five prose rows, four gaps.
		expect(rows).toHaveLength(10);
		expect(rows.filter((row) => row === "")).toHaveLength(4);
		// A gap is the empty string. A row of spaces is the shape that caused
		// this, and it must not survive anywhere in the render.
		expect(rows.filter((row) => row !== "" && stripAnsi(row).trim() === "")).toEqual([]);
	});

	/**
	 * A turn that wrote a file is followed by the repository's own typecheck,
	 * build and test commands. On this repository that is a minute of work,
	 * and it happens after the model has stopped — so a status row still
	 * saying "thinking" is describing something that finished, and the wait
	 * reads as a hang. The row has to name the phase it is actually in.
	 */
	it("says it is verifying once the model is done and the gate takes over", async () => {
		let release: (() => void) | undefined;
		const gateRunning = new Promise<void>((settle) => {
			release = settle;
		});
		const chat: ChatRunner = async (request) => {
			request.onVerify?.("npm run typecheck, npm run test");
			await gateRunning;
			return { reply: "done", verified: { verdict: "passed" }, gateRan: true };
		};
		const scriptedTerminal = new ScriptedTerminal(100, 40);
		const withChat = createTui({ root, terminal: scriptedTerminal, motion: false, chat });
		await withChat.run();

		const turn = (withChat as unknown as { submit(text: string): Promise<void> }).submit("write a note");
		await new Promise((r) => setTimeout(r, 5));

		scriptedTerminal.clear();
		withChat.paint();
		const during = stripAnsi(scriptedTerminal.frames());
		expect(during).toContain("verifying");
		expect(during).toContain("npm run typecheck");

		release?.();
		await turn;
		expect(withChat.isBusy()).toBe(false);
	});

	it("routes a chat write request through the same y/n prompt engine diffs use", async () => {
		let capturedApprove: ((name: string, args: unknown) => Promise<boolean>) | undefined;
		const chat: ChatRunner = async (request) => {
			capturedApprove = request.approve;
			const allowed = await request.approve?.("edit", { path: "src/a.ts", edits: [{ oldText: "x", newText: "y" }] });
			return { reply: allowed ? "changed it" : "you said no", verified: null, gateRan: false };
		};
		const scriptedTerminal = new ScriptedTerminal(100, 40);
		const withChat = createTui({ root, terminal: scriptedTerminal, motion: false, chat });
		await withChat.run();

		const pending = (withChat as unknown as { submit(text: string): Promise<void> }).submit("edit something");
		await new Promise((r) => setTimeout(r, 5));
		expect(capturedApprove, "the approve hook must reach the tool call").toBeDefined();

		const frame = (() => {
			scriptedTerminal.clear();
			withChat.paint();
			return scriptedTerminal.frames();
		})();
		expect(frame).toContain("● edit");
		expect(frame).toContain("src/a.ts");

		scriptedTerminal.send("y");
		await pending;
		expect(stripAnsi(withChat.scrollback().join("\n"))).toContain("changed it");
	});

	it("cycles thinking level with ctrl+t", async () => {
		const session = (app as unknown as { session: { thinking: string } }).session;
		session.thinking = "off";
		terminal.send("\x14"); // ctrl+t
		await settle();
		expect(session.thinking).toBe("minimal");
		terminal.send("\x14");
		await settle();
		expect(session.thinking).toBe("low");
		terminal.send("\x14");
		await settle();
		expect(session.thinking).toBe("medium");
		terminal.send("\x14");
		await settle();
		expect(session.thinking).toBe("high");
		terminal.send("\x14");
		await settle();
		expect(session.thinking).toBe("xhigh");
		terminal.send("\x14");
		await settle();
		expect(session.thinking).toBe("max");
		terminal.send("\x14");
		await settle();
		expect(session.thinking).toBe("off");
	});

	it("stops a chat turn on escape by aborting it, not just hiding the reply", async () => {
		let sawAbort = false;
		let release: () => void = () => {};
		const slow = new Promise<void>((r) => {
			release = r;
		});
		const chat: ChatRunner = (request) =>
			new Promise((settle) => {
				request.signal?.addEventListener("abort", () => {
					sawAbort = true;
					settle({ reply: "", verified: null, gateRan: false });
				});
				void slow.then(() => settle({ reply: "too late", verified: null, gateRan: false }));
			});
		const scriptedTerminal = new ScriptedTerminal(100, 40);
		const withChat = createTui({ root, terminal: scriptedTerminal, motion: false, chat });
		await withChat.run();

		const pending = (withChat as unknown as { submit(text: string): Promise<void> }).submit("a question");
		await Promise.resolve();
		expect(withChat.isBusy()).toBe(true);

		scriptedTerminal.send("\x1b");
		expect(withChat.isBusy()).toBe(true);
		expect(withChat.isStopArmed()).toBe(true);
		scriptedTerminal.send("\x1b");
		await pending;
		release();

		expect(sawAbort, "second esc must abort the in-flight turn's signal").toBe(true);
		expect(stripAnsi(withChat.scrollback().join("\n"))).not.toContain("too late");
	});

	it("keeps the spinner until an aborted chat turn actually settles", async () => {
		// Aborting asks the model call to stop; it has not stopped until the
		// runner's promise resolves. Between Esc and that moment the spinner
		// must keep turning, and "stopped" must land only once it has.
		let release: () => void = () => {};
		const gate = new Promise<void>((r) => {
			release = r;
		});
		const chat: ChatRunner = (request) =>
			new Promise((settle) => {
				request.signal?.addEventListener("abort", () => {
					void gate.then(() => settle({ reply: "", verified: null, gateRan: false }));
				});
			});
		const scriptedTerminal = new ScriptedTerminal(100, 40);
		const withChat = createTui({ root, terminal: scriptedTerminal, motion: false, chat });
		await withChat.run();

		const pending = (withChat as unknown as { submit(text: string): Promise<void> }).submit("a question");
		await Promise.resolve();
		expect(withChat.isBusy()).toBe(true);

		scriptedTerminal.send("\x1b");
		expect(withChat.isBusy()).toBe(true);
		expect(withChat.isStopArmed()).toBe(true);
		scriptedTerminal.send("\x1b");
		expect(withChat.isBusy(), "the spinner must not stop before the turn settles").toBe(true);
		expect(stripAnsi(withChat.scrollback().join("\n"))).toContain("stopping");
		expect(stripAnsi(withChat.scrollback().join("\n"))).not.toContain("stopped");

		release();
		await pending;
		expect(withChat.isBusy()).toBe(false);
		const after = stripAnsi(withChat.scrollback().join("\n"));
		expect(after).toContain("stopped");
		expect(after.match(/stopped/g)).toHaveLength(1);
	});

	it("requires two-step verification to stop a running chat turn", async () => {
		let sawAbort = false;
		let release: () => void = () => {};
		const gate = new Promise<void>((r) => {
			release = r;
		});
		const chat: ChatRunner = (request) =>
			new Promise((settle) => {
				request.signal?.addEventListener("abort", () => {
					sawAbort = true;
					settle({ reply: "aborted", verified: null, gateRan: false });
				});
				void gate.then(() => settle({ reply: "finished", verified: null, gateRan: false }));
			});
		const scriptedTerminal = new ScriptedTerminal(100, 40);
		const withChat = createTui({ root, terminal: scriptedTerminal, motion: false, chat });
		await withChat.run();

		const pending = (withChat as unknown as { submit(text: string): Promise<void> }).submit("a question");
		await Promise.resolve();
		expect(withChat.isBusy()).toBe(true);

		// First press of Esc: arms stop confirmation without aborting
		scriptedTerminal.send("\x1b");
		expect(withChat.isBusy()).toBe(true);
		expect(withChat.isStopArmed()).toBe(true);
		expect(sawAbort).toBe(false);

		// Second press of Esc: confirms stop and aborts
		scriptedTerminal.send("\x1b");
		await pending;
		release();

		expect(sawAbort).toBe(true);
		expect(withChat.isBusy()).toBe(false);
	});

	it("renders an error in the transcript when a chat turn throws", async () => {
		const chat: ChatRunner = async () => {
			throw new Error("Reasoning is mandatory for this endpoint");
		};
		const scriptedTerminal = new ScriptedTerminal(100, 40);
		const withChat = createTui({ root, terminal: scriptedTerminal, motion: false, chat, model: "openrouter/z-ai/glm-5.3-flash" });
		await withChat.run();

		await (withChat as unknown as { submit(text: string): Promise<void> }).submit("hi");
		await settle();

		const scroll = stripAnsi(withChat.scrollback().join("\n"));
		expect(scroll).toContain("Reasoning is mandatory for this endpoint");
	});

	it("renders an error immediately when no model is configured", async () => {
		const envModel = process.env["KAIOKEN_MODEL"];
		delete process.env["KAIOKEN_MODEL"];
		try {
			const scriptedTerminal = new ScriptedTerminal(100, 40);
			const noModelApp = createTui({ root, terminal: scriptedTerminal, motion: false });
			await noModelApp.run();

			await (noModelApp as unknown as { submit(text: string): Promise<void> }).submit("hi");
			await settle();

			const scroll = stripAnsi(noModelApp.scrollback().join("\n"));
			expect(scroll).toContain("no model selected");
		} finally {
			if (envModel !== undefined) process.env["KAIOKEN_MODEL"] = envModel;
		}
	});

	it("blocks on approval, denies on n, and says nothing was written", async () => {
		const decision = app.requestApproval({
			action: "edit",
			target: "packages/wiki/src/update.ts",
			preview: "@@ -1 +1 @@\n-old\n+new\n",
		});
		expect(app.pendingApproval()?.target).toBe("packages/wiki/src/update.ts");

		const frame = painted();
		expect(frame).toContain("● edit");
		expect(frame).toContain("+1 -1");
		expect(frame).toContain("apply edit");

		terminal.send("n");
		expect(await decision).toBe(false);
		expect(app.pendingApproval()).toBeNull();
		expect(scrollback()).toContain("denied — nothing was written");
	});

	it("approves on y", async () => {
		const decision = app.requestApproval({ action: "write", target: "a.ts", preview: "+x" });
		terminal.send("y");
		expect(await decision).toBe(true);
		expect(scrollback()).toContain("approved");
	});

	it("skips the prompt entirely once auto-approve is on", async () => {
		type("/yolo");
		expect(await app.requestApproval({ action: "write", target: "b.ts", preview: "+x" })).toBe(true);
		expect(app.pendingApproval()).toBeNull();
		type("/yolo");
	});

	it("re-lays out on resize rather than leaving a stale frame", () => {
		// A differential renderer paints with cursor moves, not newlines, so
		// there are no lines here to measure — the per-row width contract is
		// the pure tests' job. What the shell owes is a fresh frame that still
		// carries the chrome, including the narrow-terminal header fallback.
		terminal.resizeTo(50, 14);
		painted();
		// The chrome that must survive any size: the header collapses to its
		// strip, the composer keeps its row, and the status row keeps its own.
		// Not the hint text — a live flash legitimately takes that row over.
		expect(header()).toContain("KAIOKEN");
		const [composer, status] = terminal.bottomRows(2);
		expect(composer).toContain("chat with the model");
		expect(status?.trim().length ?? 0).toBeGreaterThan(0);

		terminal.resizeTo(100, 40);
		expect(painted()).toContain("██");
	});

	it("hands the session's model to every engine run", async () => {
		// A TUI launched with --model must generate on that model. The engine
		// used to fall back to $KAIOKEN_MODEL or the CLI's own default, so the
		// header named one model while the engine billed another.
		const runs: Array<{ command: string; model?: string }> = [];
		const scriptedTerminal = new ScriptedTerminal(100, 40);
		const withModel = createTui({
			root,
			terminal: scriptedTerminal,
			motion: false,
			model: "openrouter/z-ai/glm-5.3-flash",
			engine: async (run) => {
				runs.push({ command: run.command, model: run.model });
				return 0;
			},
		});
		await withModel.run();
		await (withModel as unknown as { runCommand(raw: string): Promise<void> }).runCommand("/cards x1");
		expect(runs.at(-1)).toEqual({ command: "cards", model: "openrouter/z-ai/glm-5.3-flash" });
	});

	it("builds the engine argv with the model when it has one", () => {
		expect(engineArgv({ command: "wiki", args: ["x3"], busyText: "w" }, "/repo")).toEqual([
			"wiki",
			"--root",
			"/repo",
			"x3",
		]);
		expect(
			engineArgv({ command: "wiki", args: ["x3"], busyText: "w", model: "openrouter/z-ai/glm-5.3-flash" }, "/repo"),
		).toEqual(["wiki", "--root", "/repo", "--model", "openrouter/z-ai/glm-5.3-flash", "x3"]);
	});

	it("runs a queued slash command as a command once the task finishes", async () => {
		// Steering text goes to the model; a slash command keeps its meaning.
		// Draining everything through chat turned a hurried /stop into a
		// question about stopping.
		let release: () => void = () => {};
		const slow = new Promise<void>((resolve) => {
			release = resolve;
		});
		const chatQuestions: string[] = [];
		const scriptedTerminal = new ScriptedTerminal(100, 40);
		const blocked = createTui({
			root,
			terminal: scriptedTerminal,
			motion: false,
			engine: async () => {
				await slow;
				return 0;
			},
			chat: async (request) => {
				chatQuestions.push(request.question);
				return { reply: "ok", verified: null, gateRan: false };
			},
		});
		await blocked.run();

		const pending = (blocked as unknown as { runCommand(raw: string): Promise<void> }).runCommand("/scan");
		await Promise.resolve();
		await (blocked as unknown as { submit(text: string): Promise<void> }).submit("/help");
		expect(blocked.state().queued).toEqual(["/help"]);

		release();
		await pending;
		for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 5));

		const after = stripAnsi(blocked.scrollback().join("\n"));
		expect(after).toContain("Chat: type anything to talk to the model");
		expect(chatQuestions, "a queued command must never reach the model").toEqual([]);
		expect(blocked.state().queued).toEqual([]);
	});

	it("marks the session as serving while serve runs, and only then", async () => {
		const scriptedTerminal = new ScriptedTerminal(100, 40);
		let cancelledServe = false;
		const blocked = createTui({
			root,
			terminal: scriptedTerminal,
			motion: false,
			engine: (run, _root, emit, onCancel) =>
				new Promise<number>((resolve) => {
					if (run.command !== "serve") {
						resolve(0);
						return;
					}
					emit("serving /repo");
					emit("  http://127.0.0.1:7777");
					onCancel?.(() => {
						cancelledServe = true;
						resolve(0);
					});
				}),
		});
		await blocked.run();

		const pending = (blocked as unknown as { runCommand(raw: string): Promise<void> }).runCommand("/serve");
		await Promise.resolve();
		expect(blocked.state().serveUrl).toBe("http://127.0.0.1:7777");

		scriptedTerminal.send("\x1b");
		await pending;
		expect(cancelledServe).toBe(true);
		expect(blocked.state().serveUrl, "the serving marker must die with the server").toBeNull();
	});

	describe("/provider", () => {
		// The catalog double stands in for pi-ai's registry: same shape, no
		// provider layer installed, no credential store touched.
		const catalog = () => [
			{ id: "openrouter", name: "openrouter", authSource: "OPENROUTER_API_KEY", models: ["z-ai/glm-5.3-flash", "other/model"] },
			{ id: "groq", name: "Groq", authSource: "GROQ_API_KEY", models: ["llama-3.3-70b"] },
			{ id: "mistral", name: "mistral", models: [] },
		];

		function withProviders(overrides?: Partial<Parameters<typeof createTui>[0]>) {
			const scriptedTerminal = new ScriptedTerminal(100, 40);
			const app = createTui({
				root,
				terminal: scriptedTerminal,
				motion: false,
				providers: catalog,
				...overrides,
			});
			const run = (raw: string) => (app as unknown as { runCommand(raw: string): Promise<void> }).runCommand(raw);
			return { app, scriptedTerminal, run };
		}

		it("derives the provider from the model spec when none is given", async () => {
			const { app } = withProviders({ model: "openrouter/z-ai/glm-5.3-flash" });
			await app.run();
			expect(app.state().provider).toBe("openrouter");
		});

		it("lists who is configured and marks the active provider", async () => {
			const { app, run } = withProviders({ model: "openrouter/z-ai/glm-5.3-flash" });
			await app.run();
			await run("/provider");
			const log = stripAnsi(app.scrollback().join("\n"));
			expect(log).toContain("✓ openrouter");
			expect(log).toContain("OPENROUTER_API_KEY");
			expect(log).toContain("active");
			expect(log).toContain("✗ mistral");
			expect(log).toContain("2 models");
		});

		it("switches provider and retargets the model from the new catalog", async () => {
			const { app, run } = withProviders({ model: "openrouter/z-ai/glm-5.3-flash" });
			await app.run();
			await run("/provider groq");
			expect(app.state().provider).toBe("groq");
			expect(app.state().model).toBe("groq/llama-3.3-70b");
			const log = stripAnsi(app.scrollback().join("\n"));
			expect(log).toContain("provider → groq");
			expect(log).toContain("model → groq/llama-3.3-70b (first of 1 in the catalog)");
		});

		it("keeps the model when it already runs on the target provider", async () => {
			const { app, run } = withProviders({ model: "groq/llama-3.3-70b" });
			await app.run();
			await run("/provider groq");
			expect(app.state().provider).toBe("groq");
			expect(app.state().model).toBe("groq/llama-3.3-70b");
			expect(stripAnsi(app.scrollback().join("\n"))).toContain("model stays groq/llama-3.3-70b");
		});

		it("refuses a provider with no credentials and changes nothing", async () => {
			const { app, run } = withProviders({ model: "openrouter/z-ai/glm-5.3-flash" });
			await app.run();
			await run("/provider mistral");
			expect(app.state().provider).toBe("openrouter");
			expect(app.state().model).toBe("openrouter/z-ai/glm-5.3-flash");
			expect(stripAnsi(app.scrollback().join("\n"))).toContain("mistral has no credentials");
		});

		it("refuses a provider the catalog has never heard of", async () => {
			const { app, run } = withProviders();
			await app.run();
			await run("/provider nonesuch");
			// No model option was passed, so the session's provider starts
			// unset rather than guessed.
			expect(app.state().provider).toBe("");
			expect(stripAnsi(app.scrollback().join("\n"))).toContain('no provider called "nonesuch"');
		});

		it("names the fallback when the new catalog has nothing to pick", async () => {
			// A configured provider whose catalog is empty: keeping the old
			// spec would run the provider the user just left, so the model is
			// cleared and the fallback is named instead of implied.
			const scriptedTerminal = new ScriptedTerminal(100, 40);
			const app = createTui({
				root,
				terminal: scriptedTerminal,
				motion: false,
				model: "openrouter/z-ai/glm-5.3-flash",
				providers: () => [
					{ id: "openrouter", name: "openrouter", authSource: "OPENROUTER_API_KEY", models: ["z-ai/glm-5.3-flash"] },
					{ id: "empty", name: "empty", authSource: "EMPTY_API_KEY", models: [] },
				],
			});
			await app.run();
			await (app as unknown as { runCommand(raw: string): Promise<void> }).runCommand("/provider empty");
			expect(app.state().provider).toBe("empty");
			expect(app.state().model).toBe("");
			const log = stripAnsi(app.scrollback().join("\n"));
			expect(log).toContain("no empty models in the catalog");
			expect(log).toContain("falls back to the engine default");
		});

		it("sends the next chat turn on the retargeted spec", async () => {
			const requests: Array<string | undefined> = [];
			const { app, run } = withProviders({
				model: "openrouter/z-ai/glm-5.3-flash",
				chat: async (request) => {
					requests.push(request.model);
					return { reply: "ok", verified: null, gateRan: false };
				},
			});
			await app.run();
			await run("/provider groq");
			await (app as unknown as { submit(text: string): Promise<void> }).submit("hello");
			expect(requests.at(-1)).toBe("groq/llama-3.3-70b");
		});

		it("lists the active provider's models, marking the running one", async () => {
			const { app, run } = withProviders({ model: "openrouter/z-ai/glm-5.3-flash" });
			await app.run();
			await run("/models");
			const log = stripAnsi(app.scrollback().join("\n"));
			expect(log).toContain("models openrouter");
			expect(log).toContain("openrouter/z-ai/glm-5.3-flash · active");
			// Unfiltered means this provider's catalog — the others stay out.
			expect(log).not.toContain("groq/llama-3.3-70b");
		});

		it("sweeps every configured provider when a filter is given", async () => {
			const { app, run } = withProviders({ model: "openrouter/z-ai/glm-5.3-flash" });
			await app.run();
			await run("/models llama");
			const log = stripAnsi(app.scrollback().join("\n"));
			expect(log).toContain('matching "llama" across 2 configured provider(s)');
			expect(log).toContain("groq/llama-3.3-70b");
		});

		it("says so plainly when no configured provider has a matching model", async () => {
			const { app, run } = withProviders({ model: "openrouter/z-ai/glm-5.3-flash" });
			await app.run();
			await run("/models nonesuch");
			expect(stripAnsi(app.scrollback().join("\n"))).toContain('nothing matching "nonesuch"');
		});
	});

	it("saves a /model choice to the repository", async () => {
		// The choice has to outlive the session or it is not a choice — it is
		// a preference to re-type every day. The file is the same one the
		// CLI's own model resolution reads.
		const { app, run } = (() => {
			const scriptedTerminal = new ScriptedTerminal(100, 40);
			const app = createTui({
				root,
				terminal: scriptedTerminal,
				motion: false,
				model: "openrouter/z-ai/glm-5.3-flash",
				providers: () => [
					{ id: "groq", name: "Groq", authSource: "GROQ_API_KEY", models: ["llama-3.3-70b"] },
				],
			});
			return { app, run: (raw: string) => (app as unknown as { runCommand(raw: string): Promise<void> }).runCommand(raw) };
		})();
		await app.run();
		await run("/model groq/llama-3.3-70b");
		const saved = JSON.parse(await readFile(join(root, ".kaioken", "model.json"), "utf8")) as { model: string };
		expect(saved.model).toBe("groq/llama-3.3-70b");
	});

	it("adds the provider prefix to an id typed without it", async () => {
		// `z-ai/...` is an OpenRouter id, not a provider: trusting the first
		// slash keyed and billed the session against a provider that does not
		// exist, and the header claimed the model's namespace as the provider.
		const seeded = await mkdtemp(join(tmpdir(), "kaioken-prefix-"));
		try {
			const scriptedTerminal = new ScriptedTerminal(100, 40);
			const app = createTui({
				root: seeded,
				terminal: scriptedTerminal,
				motion: false,
				providers: () => [
					{
						id: "openrouter",
						name: "openrouter",
						authSource: "OPENROUTER_API_KEY",
						models: ["z-ai/glm-5.3-flash", "other/model"],
					},
				],
			});
			await app.run();
			await (app as unknown as { runCommand(raw: string): Promise<void> }).runCommand("/model z-ai/glm-5.3-flash");
			expect(app.state().model).toBe("openrouter/z-ai/glm-5.3-flash");
			// The header names the credential's provider, not the model's.
			expect(app.state().provider).toBe("openrouter");
			const log = stripAnsi(app.scrollback().join("\n"));
			expect(log).toContain("model → openrouter/z-ai/glm-5.3-flash");
			expect(log).toContain('"z-ai/glm-5.3-flash" is openrouter\'s id');
			// The canonical form is what gets saved.
			const saved = JSON.parse(await readFile(join(seeded, ".kaioken", "model.json"), "utf8")) as { model: string };
			expect(saved.model).toBe("openrouter/z-ai/glm-5.3-flash");
		} finally {
			await rm(seeded, { recursive: true, force: true });
		}
	});

	it("says so when a spec's first segment names no provider", async () => {
		const seeded = await mkdtemp(join(tmpdir(), "kaioken-nosuch-"));
		try {
			const scriptedTerminal = new ScriptedTerminal(100, 40);
			const app = createTui({
				root: seeded,
				terminal: scriptedTerminal,
				motion: false,
				providers: () => [
					{ id: "openrouter", name: "openrouter", authSource: "OPENROUTER_API_KEY", models: ["z-ai/glm-5.3-flash"] },
				],
			});
			await app.run();
			await (app as unknown as { runCommand(raw: string): Promise<void> }).runCommand("/model nosuch/model");
			expect(app.state().model).toBe("nosuch/model");
			expect(stripAnsi(app.scrollback().join("\n"))).toContain('no provider called "nosuch"');
		} finally {
			await rm(seeded, { recursive: true, force: true });
		}
	});

	it("starts on the model the repository saved", async () => {
		const seeded = await mkdtemp(join(tmpdir(), "kaioken-seed-"));
		try {
			await mkdir(join(seeded, ".kaioken"), { recursive: true });
			await writeFile(join(seeded, ".kaioken", "model.json"), '{"model": "groq/llama-3.3-70b"}\n');
			const terminal = new ScriptedTerminal(100, 40);
			const app = createTui({ root: seeded, terminal, motion: false });
			await app.run();
			expect(app.state().model).toBe("groq/llama-3.3-70b");
			// The provider prefix derives from the saved spec, so /key lands in
			// the right variable from the first frame.
			expect(app.state().provider).toBe("groq");
		} finally {
			await rm(seeded, { recursive: true, force: true });
		}
	});

	it("settles a saved spec that wears no provider prefix", async () => {
		// A model.json written as `z-ai/glm-5.3-flash` (the id without its
		// prefix) must not open a session that claims provider `z-ai` — the
		// catalog knows who really serves it, and the header says so before
		// the first turn.
		const seeded = await mkdtemp(join(tmpdir(), "kaioken-reconcile-"));
		try {
			await mkdir(join(seeded, ".kaioken"), { recursive: true });
			await writeFile(join(seeded, ".kaioken", "model.json"), '{"model": "z-ai/glm-5.3-flash"}\n');
			const terminal = new ScriptedTerminal(100, 40);
			const app = createTui({
				root: seeded,
				terminal,
				motion: false,
				providers: () => [
					{
						id: "openrouter",
						name: "openrouter",
						authSource: "OPENROUTER_API_KEY",
						models: ["z-ai/glm-5.3-flash"],
					},
				],
			});
			await app.run();
			expect(app.state().model).toBe("openrouter/z-ai/glm-5.3-flash");
			expect(app.state().provider).toBe("openrouter");
			const log = stripAnsi(app.scrollback().join("\n"));
			expect(log).toContain("the provider prefix was added");
			// The saved file is left as written: the CLI's resolution makes the
			// same call, and a startup should not write to the repository.
			const saved = JSON.parse(await readFile(join(seeded, ".kaioken", "model.json"), "utf8")) as { model: string };
			expect(saved.model).toBe("z-ai/glm-5.3-flash");
		} finally {
			await rm(seeded, { recursive: true, force: true });
		}
	});

	it("answers a turn with no model chosen by explaining how to choose", async () => {
		const seeded = await mkdtemp(join(tmpdir(), "kaioken-nomodel-"));
		const savedModel = process.env.KAIOKEN_MODEL;
		delete process.env.KAIOKEN_MODEL;
		try {
			const chatQuestions: string[] = [];
			const terminal = new ScriptedTerminal(100, 40);
			const app = createTui({
				root: seeded,
				terminal,
				motion: false,
				chat: async (request) => {
					chatQuestions.push(request.question);
					return { reply: "ok", verified: null, gateRan: false };
				},
			});
			await app.run();
			await (app as unknown as { submit(text: string): Promise<void> }).submit("hello");
			const log = stripAnsi(app.scrollback().join("\n"));
			expect(log).toContain("no model selected");
			expect(log).toContain("/model <provider>/<id>");
			// The turn must not reach the model layer at all.
			expect(chatQuestions).toEqual([]);
		} finally {
			if (savedModel === undefined) delete process.env.KAIOKEN_MODEL;
			else process.env.KAIOKEN_MODEL = savedModel;
			await rm(seeded, { recursive: true, force: true });
		}
	});
});

/**
 * Leaving.
 *
 * The exit is the one path the shared shell above cannot exercise: it stops
 * the terminal, so a test that quit would take every test after it with it.
 * Each of these gets its own shell and its own scripted terminal, and every
 * one of them is headless — a headless shell says goodbye but does not take
 * the process down, which is exactly what makes the exit assertable.
 */
describe("leaving", () => {
	let root: string;

	beforeAll(async () => {
		root = await mkdtemp(join(tmpdir(), "kaioken-quit-"));
	});

	afterAll(async () => {
		await rm(root, { recursive: true, force: true });
	});

	async function open(): Promise<{ app: KaiokenTui; terminal: ScriptedTerminal }> {
		const terminal = new ScriptedTerminal(100, 40);
		const app = createTui({ root, terminal, motion: false, model: "anthropic/claude-opus-4" });
		await app.run();
		terminal.clear();
		return { app, terminal };
	}

	/** Let the asynchronous exit finish. */
	async function settle(): Promise<void> {
		for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 5));
	}

	it("says goodbye on ctrl+d", async () => {
		const { terminal } = await open();
		terminal.send("\x04");
		await settle();
		expect(stripAnsi(terminal.output())).toMatch(/▎ \S/);
	});

	it("says goodbye on /quit", async () => {
		const { terminal } = await open();
		for (const ch of "/quit") terminal.send(ch);
		terminal.send("\r");
		await settle();
		expect(stripAnsi(terminal.output())).toMatch(/▎ \S/);
	});

	it("gives the cursor back", async () => {
		const { terminal } = await open();
		terminal.send("\x04");
		await settle();
		// pi-tui restores the cursor on the way out, and the curtain must not
		// hide it again on the way past.
		expect(terminal.isCursorHidden()).toBe(false);
	});

	it("says goodbye once, however many times the quit key is pressed", async () => {
		const { terminal } = await open();
		terminal.send("\x04");
		terminal.send("\x04");
		await settle();
		const said = stripAnsi(terminal.output()).match(/▎ /g) ?? [];
		expect(said).toHaveLength(1);
	});

	it("still says goodbye with motion off — silence was not what --no-motion asked for", async () => {
		const terminal = new ScriptedTerminal(100, 40);
		const app = createTui({ root, terminal, motion: false });
		await app.run();
		terminal.clear();
		terminal.send("\x04");
		await settle();
		const out = stripAnsi(terminal.output());
		expect(out).toMatch(/▎ \S/);
		// No curtain: the wordmark's spaced-out form never appears.
		expect(out).not.toContain("K A I O K E N");
	});
});

describe("direct powershell execution mode (!)", () => {
	let root: string;
	let terminal: ScriptedTerminal;
	let app: KaiokenTui;
	let shellCalls: Array<{ command: string; root: string }>;

	const scriptedShell: ShellRunner = async (command, rootDir, emit, onCancel) => {
		shellCalls.push({ command, root: rootDir });
		if (command === "slow") {
			let cancelled = false;
			onCancel?.(() => {
				cancelled = true;
			});
			await new Promise((r) => setTimeout(r, 200));
			if (cancelled) return 130;
			emit("slow finished");
			return 0;
		}
		if (command === "fail") {
			emit("error: failed to execute");
			return 1;
		}
		emit(`PS output: ${command}`);
		return 0;
	};

	beforeAll(async () => {
		root = await mkdtemp(join(tmpdir(), "kaioken-shell-mode-"));
	});

	afterAll(async () => {
		await rm(root, { recursive: true, force: true });
	});

	function setupApp(): KaiokenTui {
		terminal = new ScriptedTerminal(100, 40);
		shellCalls = [];
		app = createTui({
			root,
			terminal,
			shell: scriptedShell,
			motion: false,
		});
		return app;
	}

	async function settle(): Promise<void> {
		for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 5));
	}

	it("switches to powershell mode when '!' is pressed on an empty editor", async () => {
		const tui = setupApp();
		await tui.run();
		expect(tui.isShellMode()).toBe(false);

		terminal.send("!");
		expect(tui.isShellMode()).toBe(true);

		terminal.clear();
		tui.paint();
		const frame = stripAnsi(terminal.frames());
		expect(frame).toContain("! powershell ›");
		expect(frame).toContain("run powershell command directly");
		expect(frame).toContain("! powershell");
	});

	it("exits powershell mode when backspace is pressed on an empty editor", async () => {
		const tui = setupApp();
		await tui.run();

		terminal.send("!");
		expect(tui.isShellMode()).toBe(true);

		terminal.send("\x7f"); // Backspace
		expect(tui.isShellMode()).toBe(false);

		terminal.clear();
		tui.paint();
		const frame = stripAnsi(terminal.frames());
		expect(frame).not.toContain("! powershell ›");
		expect(frame).toContain("› chat with the model");
	});

	it("exits powershell mode when escape is pressed", async () => {
		const tui = setupApp();
		await tui.run();

		terminal.send("!");
		expect(tui.isShellMode()).toBe(true);

		terminal.send("\x1b"); // Escape
		expect(tui.isShellMode()).toBe(false);
	});

	it("runs a powershell command entered in shell mode and streams output", async () => {
		const tui = setupApp();
		await tui.run();

		terminal.send("!");
		for (const ch of "Get-ChildItem") terminal.send(ch);
		terminal.send("\r");
		await settle();

		expect(shellCalls).toEqual([{ command: "Get-ChildItem", root }]);
		const scroll = stripAnsi(tui.scrollback().join("\n"));
		expect(scroll).toContain("! powershell");
		expect(scroll).toContain("Get-ChildItem");
		expect(scroll).toContain("PS output: Get-ChildItem");
		expect(tui.isShellMode()).toBe(false);
	});

	it("runs a command prefixed with '!' directly from normal mode", async () => {
		const tui = setupApp();
		await tui.run();

		for (const ch of "!dir") terminal.send(ch);
		terminal.send("\r");
		await settle();

		expect(shellCalls).toEqual([{ command: "dir", root }]);
		const scroll = stripAnsi(tui.scrollback().join("\n"));
		expect(scroll).toContain("PS output: dir");
	});

	it("reports command failure when exit code is non-zero", async () => {
		const tui = setupApp();
		await tui.run();

		terminal.send("!");
		for (const ch of "fail") terminal.send(ch);
		terminal.send("\r");
		await settle();

		const scroll = stripAnsi(tui.scrollback().join("\n"));
		expect(scroll).toContain("error: failed to execute");
		expect(scroll).toContain("powershell exited 1");
	});

	it("cancels running powershell command with ctrl+c", async () => {
		const tui = setupApp();
		await tui.run();

		terminal.send("!");
		for (const ch of "slow") terminal.send(ch);
		terminal.send("\r");
		await new Promise((r) => setTimeout(r, 20));

		expect(tui.isBusy()).toBe(true);
		terminal.send("\x03"); // Ctrl+C
		await new Promise((r) => setTimeout(r, 250));

		const scroll = stripAnsi(tui.scrollback().join("\n"));
		expect(scroll).toContain("powershell command stopped");
		expect(tui.isBusy()).toBe(false);
	});
});

/**
 * The curtain, in the shell.
 *
 * The pure-frame tests in `curtain.test.ts` cover what it looks like; these
 * two cover that the shell actually plays it — once on the way in, once on the
 * way out. They are the only tests in the file that let the wall clock in, and
 * they cost the two durations in `CURTAIN`.
 */
describe("the curtain", () => {
	let root: string;

	beforeAll(async () => {
		root = await mkdtemp(join(tmpdir(), "kaioken-curtain-"));
	});

	afterAll(async () => {
		await rm(root, { recursive: true, force: true });
	});

	it("boots full screen on the way in, before the interface appears", async () => {
		const terminal = new ScriptedTerminal(100, 40);
		const app = createTui({ root, terminal, motion: true, color: true });
		await app.run();
		const out = terminal.frames();
		// The typed boot text, and the version taken from the shell rather than
		// from a second copy of the string inside the curtain.
		expect(out).toContain("$ kaioken");
		expect(out).toContain(`KAIOKEN v${VERSION} · the knowledge engine`);
		expect(out).toContain("type to chat · press / for commands");
		// It borrows the alternate screen and gives it back before pi-tui takes
		// it, so the shell's scrollback is never blanked.
		expect(terminal.output()).toContain("\x1b[?1049h");
		expect(terminal.output()).toContain("\x1b[?1049l");
	});

	it("plays on the way out, and leaves the goodbye behind it", async () => {
		const terminal = new ScriptedTerminal(100, 40);
		const app = createTui({ root, terminal, motion: true, color: true });
		await app.run();
		terminal.clear();
		terminal.send("\x04");
		// The closing curtain plus a margin. Derived rather than hard-coded, so
		// retuning the durations does not silently start asserting on a
		// half-played animation.
		await new Promise((r) => setTimeout(r, CURTAIN.close + 400));
		const out = stripAnsi(terminal.output());
		// The power-off says nothing: the wordmark it collapses, the beam it
		// collapses into, and then the goodbye on the main screen underneath.
		expect(out).toContain("█".repeat(54));
		expect(out).toMatch(/▎ \S/);
		// The order that makes the exit work: pi-tui hands the transcript back
		// to the main screen first, then the curtain borrows the alternate
		// screen over the top of it, then gives it back — so the session is
		// still there underneath, with the goodbye written under it.
		const raw = terminal.output();
		expect(raw.indexOf("\x1b[?1049l")).toBeLessThan(raw.indexOf("\x1b[?1049h"));
		expect(raw.lastIndexOf("\x1b[?1049l")).toBeGreaterThan(raw.indexOf("\x1b[?1049h"));
		expect(terminal.isCursorHidden()).toBe(false);
	});
});

/**
 * Silence.
 *
 * Three paths used to end with the transcript unchanged: an engine command
 * that exited clean without emitting a line, `/stop` with nothing to stop, and
 * a lone slash. Each looked exactly like a keystroke the interface had
 * swallowed. None of them may leave an echoed prompt with nothing under it.
 */
describe("commands that used to say nothing", () => {
	let root: string;

	beforeAll(async () => {
		root = await mkdtemp(join(tmpdir(), "kaioken-silence-"));
	});

	afterAll(async () => {
		await rm(root, { recursive: true, force: true });
	});

	/** A shell whose engine succeeds and emits nothing at all. */
	async function silentShell(): Promise<{ app: KaiokenTui; type: (line: string) => void }> {
		const terminal = new ScriptedTerminal(100, 40);
		const engine: EngineRunner = async () => 0;
		const app = createTui({ root, terminal, engine, model: "anthropic/claude-opus-4", motion: false });
		await app.run();
		return {
			app,
			type: (line: string) => {
				for (const ch of line) terminal.send(ch);
				terminal.send("\r");
			},
		};
	}

	async function settle(): Promise<void> {
		for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 5));
	}

	it("marks an engine command that exited clean without a word", async () => {
		const { app, type } = await silentShell();
		type("/scan");
		await settle();
		expect(stripAnsi(app.scrollback().join("\n"))).toContain("scan completed — no output");
	});

	it("says nothing is running rather than swallowing an idle /stop", async () => {
		const { app, type } = await silentShell();
		type("/stop");
		await settle();
		expect(stripAnsi(app.scrollback().join("\n"))).toContain("nothing running");
	});

	it("answers a bare slash with where to look", async () => {
		const { app, type } = await silentShell();
		type("/");
		await settle();
		expect(stripAnsi(app.scrollback().join("\n"))).toContain("/help lists what this engine runs");
	});

	it("shows current session info on /session", async () => {
		const { app, type } = await silentShell();
		type("/session");
		await settle();
		const text = stripAnsi(app.scrollback().join("\n"));
		expect(text).toContain("CURRENT SESSION");
		expect(text).toContain("Session ID:");
		expect(text).toContain("Turns:");
	});

	it("lists saved sessions on /sessions", async () => {
		const { app, type } = await silentShell();
		type("/sessions");
		await settle();
		const text = stripAnsi(app.scrollback().join("\n"));
		expect(text).toMatch(/no saved sessions|SAVED SESSIONS/);
	});

	it("resets context and transcript on /new", async () => {
		const { app, type } = await silentShell();
		type("/new");
		await settle();
		const text = stripAnsi(app.scrollback().join("\n"));
		expect(text).toContain("started fresh session");
	});

	it("shows usage on /cost", async () => {
		const { app, type } = await silentShell();
		type("/cost");
		await settle();
		const text = stripAnsi(app.scrollback().join("\n"));
		expect(text).toContain("USAGE & COST");
		// No reply has been metered, so no cost is claimed — not even an
		// invented per-token one.
		expect(text).toContain("no metered replies yet");
	});

	it("runs git diff on /diff", async () => {
		const { app, type } = await silentShell();
		type("/diff");
		for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 20));
		const text = stripAnsi(app.scrollback().join("\n"));
		expect(text).toMatch(/GIT DIFF|working tree clean|git diff error/);
	});
});

/**
 * `/repo` and `/templates` are the two commands that reach outside the current
 * repository — one changes which repository the session is about, the other
 * reads prompts out of it. Both are driven here through the real shell.
 */
describe("the repository switch and prompt templates", () => {
	const roots: string[] = [];

	afterAll(async () => {
		await Promise.all(roots.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
	});

	async function tempRepo(files: Record<string, string> = {}): Promise<string> {
		const dir = await mkdtemp(join(tmpdir(), "kaioken-repo-"));
		roots.push(dir);
		for (const [path, content] of Object.entries(files)) {
			const abs = join(dir, path);
			await mkdir(join(abs, ".."), { recursive: true });
			await writeFile(abs, content, "utf8");
		}
		return dir;
	}

	async function shell(root: string, chat?: ChatRunner) {
		const terminal = new ScriptedTerminal(100, 40);
		const app = createTui({
			root,
			terminal,
			engine: async () => 0,
			model: "anthropic/claude-opus-4",
			motion: false,
			...(chat ? { chat } : {}),
		});
		await app.run();
		const run = (raw: string) =>
			(app as unknown as { runCommand(raw: string): Promise<void> }).runCommand(raw);
		return { app, run, text: () => stripAnsi(app.scrollback().join("\n")) };
	}

	it("retargets the session at another directory", async () => {
		const from = await tempRepo();
		const to = await tempRepo({ "package.json": "{}" });
		const { run, text } = await shell(from);

		await run(`/repo ${to}`);
		expect(text()).toContain("repository →");
		expect(text()).toContain(to);
	});

	it("refuses a path that is not a directory, and stays where it was", async () => {
		const from = await tempRepo();
		const { app, run, text } = await shell(from);

		await run("/repo ./nowhere-at-all");
		expect(text()).toContain("not a directory");
		// The session must not half-move: a failed switch that still dropped
		// the root would leave every later command pointed at nothing.
		expect((app as unknown as { session: { root: string } }).session.root).toBe(from);
	});

	it("adopts the new repository's own recorded model", async () => {
		const from = await tempRepo();
		const to = await tempRepo({ ".kaioken/model.json": '{"model":"openai/gpt-5"}' });
		const { app, run } = await shell(from);

		await run(`/repo ${to}`);
		const session = (app as unknown as { session: { model: string; provider: string } }).session;
		expect(session.model).toBe("openai/gpt-5");
		expect(session.provider).toBe("openai");
	});

	it("lists the repository's templates", async () => {
		const root = await tempRepo({
			".kaioken/templates/review.md": "Review {{file}} for {{concern}}.",
		});
		const { run, text } = await shell(root);

		await run("/templates");
		expect(text()).toContain("/t:review");
		expect(text()).toContain("<file>");
	});

	it("says how to write one when there are none", async () => {
		const { run, text } = await shell(await tempRepo());
		await run("/templates");
		expect(text()).toContain(".kaioken/templates/");
	});

	it("expands /t:<name> and sends it as an ordinary message", async () => {
		const root = await tempRepo({ ".kaioken/templates/review.md": "Review {{file}} for {{args}}." });
		const asked: string[] = [];
		const chat: ChatRunner = async (request) => {
			asked.push(request.question);
			return { reply: "ok", verified: null, gateRan: false };
		};
		const { run } = await shell(root, chat);

		await run("/t:review file=src/app.ts races and allocation");
		expect(asked.at(-1)).toBe("Review src/app.ts for races and allocation.");
	});

	it("refuses to send a template with a hole still in it", async () => {
		const root = await tempRepo({ ".kaioken/templates/review.md": "Review {{file}} for {{concern}}." });
		const asked: string[] = [];
		const chat: ChatRunner = async (request) => {
			asked.push(request.question);
			return { reply: "ok", verified: null, gateRan: false };
		};
		const { run, text } = await shell(root, chat);

		await run("/t:review file=src/app.ts");
		// Sending it anyway would get an answer to a subtly different question,
		// and nothing on screen would say why.
		expect(asked).toEqual([]);
		expect(text()).toContain("still needs concern=");
	});

	it("names the file it looked for when the template does not exist", async () => {
		const { run, text } = await shell(await tempRepo());
		await run("/t:nope");
		expect(text()).toContain(".kaioken/templates/nope.md");
	});
});

/**
 * `/draft`, `/handoff`, `/learn`, `/tree` and `/undo` — the commands about the
 * conversation itself. The engine is a double here: what is being tested is
 * what the shell hands it, and what it does with its own state.
 */
describe("the conversation commands", () => {
	const roots: string[] = [];

	afterAll(async () => {
		await Promise.all(roots.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
	});

	async function tempRepo(files: Record<string, string> = {}): Promise<string> {
		const dir = await mkdtemp(join(tmpdir(), "kaioken-conv-"));
		roots.push(dir);
		for (const [path, content] of Object.entries(files)) {
			const abs = join(dir, path);
			await mkdir(join(abs, ".."), { recursive: true });
			await writeFile(abs, content, "utf8");
		}
		return dir;
	}

	async function shell(root: string) {
		const calls: Array<{ command: string; args: string[] }> = [];
		const terminal = new ScriptedTerminal(100, 40);
		const app = createTui({
			root,
			terminal,
			engine: async (run) => {
				calls.push({ command: run.command, args: [...run.args] });
				return 0;
			},
			// The real bridge returns the agent's message list; the shell keeps
			// it as the conversation, and /fork and /tree operate on it.
			chat: async (request) => ({
				reply: "ok",
				verified: null,
				gateRan: false,
				messages: [
					...(request.initialMessages ?? []),
					{ role: "user", content: [{ type: "text", text: request.question }] },
					{ role: "assistant", content: [{ type: "text", text: "ok" }] },
				],
			}),
			model: "anthropic/claude-opus-4",
			motion: false,
		});
		await app.run();
		return {
			app,
			calls,
			run: (raw: string) => (app as unknown as { runCommand(raw: string): Promise<void> }).runCommand(raw),
			ask: (text: string) => (app as unknown as { submit(text: string): Promise<void> }).submit(text),
			text: () => stripAnsi(app.scrollback().join("\n")),
		};
	}

	it("sends /draft to the engine as the draft command", async () => {
		const { run, calls } = await shell(await tempRepo());
		await run("/draft");
		expect(calls.at(-1)?.command).toBe("draft");
	});

	it("forwards the session's steering notes to a command that uses them", async () => {
		const { run, calls } = await shell(await tempRepo());
		await run("/notes add prefer the builder in src/factory.ts");
		await run("/draft");
		// /notes promises the notes steer generation; this is where it is kept.
		expect(calls.at(-1)?.args).toContain("--note");
		expect(calls.at(-1)?.args).toContain("prefer the builder in src/factory.ts");
	});

	it("refuses to hand off a session with no turns instead of briefing another one", async () => {
		const { run, calls, text } = await shell(await tempRepo());
		await run("/handoff");
		// Falling through would brief whatever session happened to be newest on
		// disk, which after a /new is a different conversation entirely.
		expect(calls).toEqual([]);
		expect(text()).toContain("no turns");
	});

	it("saves the conversation and names it when handing off", async () => {
		const { run, ask, calls } = await shell(await tempRepo());
		await ask("do a thing");
		await run("/handoff");

		const call = calls.at(-1);
		expect(call?.command).toBe("handoff");
		expect(call?.args).toContain("--session");
	});

	it("says there is nothing to undo rather than nothing at all", async () => {
		const { run, text } = await shell(await tempRepo());
		await run("/undo");
		expect(text()).toContain("nothing to undo");
	});

	it("restores a file the agent changed", async () => {
		const root = await tempRepo({ "src/app.ts": "original\n" });
		const { run, app, text } = await shell(root);

		// The journal is written at approval time, which is where the file's
		// prior bytes are still the prior bytes.
		await (app as unknown as {
			journalUndo(tool: string, path: string): Promise<void>;
		}).journalUndo("edit", "src/app.ts");
		await writeFile(join(root, "src/app.ts"), "changed by the agent\n", "utf8");

		await run("/undo");
		expect(await readFile(join(root, "src/app.ts"), "utf8")).toBe("original\n");
		expect(text()).toContain("restored");
	});

	it("journals the file an approved bash command names", async () => {
		const root = await tempRepo({ "src/app.ts": "original\n" });
		const { run, app, text } = await shell(root);
		(app as unknown as { session: { autoApprove: boolean } }).session.autoApprove = true;

		// Approval journals the named file's prior bytes; the mutation itself
		// is the agent runtime's to perform, which the write below stands in for.
		await (app as unknown as {
			approveToolCall(name: string, args: unknown): Promise<boolean>;
		}).approveToolCall("bash", { command: "sed -i 's/original/rewritten/' src/app.ts" });
		await writeFile(join(root, "src/app.ts"), "rewritten\n", "utf8");

		await run("/undo");
		expect(await readFile(join(root, "src/app.ts"), "utf8")).toBe("original\n");
		expect(text()).toContain("restored");
	});

	it("journals a file an approved bash command created", async () => {
		const root = await tempRepo();
		const { run, app } = await shell(root);
		(app as unknown as { session: { autoApprove: boolean } }).session.autoApprove = true;

		await (app as unknown as {
			approveToolCall(name: string, args: unknown): Promise<boolean>;
		}).approveToolCall("bash", { command: "echo written by the agent > scratch.txt" });
		await writeFile(join(root, "scratch.txt"), "written by the agent\n", "utf8");

		await run("/undo");
		await expect(readFile(join(root, "scratch.txt"), "utf8")).rejects.toThrow();
	});

	it("journals nothing for a bash command whose writes it cannot see", async () => {
		const root = await tempRepo();
		const { run, app, text } = await shell(root);
		(app as unknown as { session: { autoApprove: boolean } }).session.autoApprove = true;

		await (app as unknown as {
			approveToolCall(name: string, args: unknown): Promise<boolean>;
		}).approveToolCall("bash", { command: "node scripts/does-the-thing.js" });

		await run("/undo");
		// The honest answer for an unreadable command is "nothing recorded",
		// not a restore invented from a guessed-at token.
		expect(text()).toContain("nothing to undo");
		void root;
	});

	it("compacts with a briefing the model actually wrote", async () => {
		const root = await tempRepo();
		const compactTerminal = new ScriptedTerminal(100, 40);
		const compactApp = createTui({
			root,
			terminal: compactTerminal,
			// The engine double stands in for `kaioken handoff`: it writes the
			// briefing document the command would, next to the session it names.
			engine: async (run) => {
				const id = run.args[run.args.indexOf("--session") + 1] ?? "";
				await mkdir(join(root, ".kaioken", "handoffs"), { recursive: true });
				await writeFile(
					join(root, ".kaioken", "handoffs", `${id}.md`),
					"## Goal\nship the thing\n\n## Decisions\n- chose plan A\n\n---\n\n## Transcript\n...",
					"utf8",
				);
				return 0;
			},
			chat: async (request) => ({
				reply: "ok",
				verified: null,
				gateRan: false,
				messages: [
					...(request.initialMessages ?? []),
					{ role: "user", content: [{ type: "text", text: request.question }] },
					{ role: "assistant", content: [{ type: "text", text: "ok" }] },
				],
			}),
			model: "anthropic/claude-opus-4",
			motion: false,
		});
		await compactApp.run();
		const run = (raw: string) =>
			(compactApp as unknown as { runCommand(raw: string): Promise<void> }).runCommand(raw);
		const ask = (text: string) =>
			(compactApp as unknown as { submit(text: string): Promise<void> }).submit(text);

		await ask("first question");
		await ask("second question");
		await run("/compact");

		const messages = (compactApp as unknown as { sessionMessages: unknown[] }).sessionMessages;
		const summary = JSON.stringify(messages[0]);
		expect(summary).toContain("ship the thing");
		// The fabricated title-as-summary is gone even when a briefing exists.
		expect(summary).not.toContain("Compacted summary of");
		// The retained tail survives the compaction.
		expect(messages).toHaveLength(3);
	});

	it("compacts honestly when no model is available to summarise", async () => {
		const { run, ask, app } = await shell(await tempRepo());
		await ask("first question");
		await ask("second question");
		await run("/compact");

		const messages = (app as unknown as { sessionMessages: unknown[] }).sessionMessages;
		const summary = JSON.stringify(messages[0]);
		expect(summary).toContain("elided");
		expect(summary).toContain("preserved in session");
		expect(summary).not.toContain("Compacted summary of");
	});

	it("costs a session from the usage the provider reported", async () => {
		const { run, app, text } = await shell(await tempRepo());
		(app as unknown as { sessionMessages: unknown[] }).sessionMessages = [
			{
				role: "assistant",
				content: [],
				usage: { input: 1500, output: 40, cacheRead: 1000, cacheWrite: 0, cost: { total: 0.00123 } },
			},
			{ role: "assistant", content: [], usage: { input: 100, output: 10, cost: { total: 0.00077 } } },
		];
		await run("/cost");

		expect(text()).toContain("1,600 in");
		expect(text()).toContain("50 out");
		expect(text()).toContain("1,000 cached");
		// 0.00123 + 0.00077 — the sum of what each reply said it cost, not a
		// per-token rate this process invented.
		expect(text()).toContain("$0.0020");
		expect(text()).toContain("reported by the provider");
	});

	it("says nothing about cost when no reply carried usage", async () => {
		const { run, text } = await shell(await tempRepo());
		await run("/cost");
		expect(text()).toContain("no metered replies yet");
		expect(text()).not.toContain("USD");
	});

	it("has no branches until the conversation is rewound", async () => {
		const { run, text } = await shell(await tempRepo());
		await run("/tree");
		expect(text()).toContain("no saved conversations yet");
	});

	it("leaves the old conversation on disk when /fork rewinds", async () => {
		const root = await tempRepo();
		const { run, ask, app } = await shell(root);
		await ask("first question");
		const before = (app as unknown as { activeSessionId: string }).activeSessionId;

		await run("/fork");
		const after = (app as unknown as { activeSessionId: string }).activeSessionId;

		// A fork that rewound in place would destroy the very turns it exists
		// to let you come back to.
		expect(after).not.toBe(before);
		const saved = await listSessions(root);
		expect(saved.map((s) => s.id)).toContain(before);
	});

	it("lists the branch it is standing on", async () => {
		const root = await tempRepo();
		const { run, ask, text } = await shell(root);
		await ask("first question");
		await run("/fork");
		await run("/tree");

		expect(text()).toContain("CONVERSATION TREE");
		expect(text()).toContain("fork at turn");
	});
});

/**
 * `/theme` has always said in its own help that the choice is remembered. It
 * was the one setting that silently was not.
 */
describe("the saved theme", () => {
	const roots: string[] = [];

	afterAll(async () => {
		await Promise.all(roots.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
	});

	async function tempRepo(): Promise<string> {
		const dir = await mkdtemp(join(tmpdir(), "kaioken-theme-"));
		roots.push(dir);
		return dir;
	}

	async function shell(root: string, theme?: string) {
		const terminal = new ScriptedTerminal(100, 40);
		const app = createTui({
			root,
			terminal,
			engine: async () => 0,
			model: "anthropic/claude-opus-4",
			motion: false,
			...(theme ? { theme } : {}),
		});
		await app.run();
		return {
			app,
			run: (raw: string) => (app as unknown as { runCommand(raw: string): Promise<void> }).runCommand(raw),
		};
	}

	it("writes the choice where the next session will find it", async () => {
		const root = await tempRepo();
		const { run } = await shell(root);
		await run("/theme light");

		const saved = JSON.parse(await readFile(join(root, ".kaioken", "theme.json"), "utf8"));
		expect(saved.theme).toBe("light");
	});

	it("does not save a theme it refused", async () => {
		const root = await tempRepo();
		const { run } = await shell(root);
		await run("/theme dracula");
		await expect(readFile(join(root, ".kaioken", "theme.json"), "utf8")).rejects.toThrow();
	});

	it("applies the saved theme on the next start", async () => {
		const root = await tempRepo();
		const first = await shell(root);
		await first.run("/theme highcontrast");

		await shell(root);
		// Read through the module the shell itself sets, so this measures what
		// the interface will actually paint with.
		await new Promise((resolve) => setTimeout(resolve, 20));
		const { themeName } = await import("../src/theme.js");
		expect(themeName()).toBe("highcontrast");
		setTheme("default");
	});
});
