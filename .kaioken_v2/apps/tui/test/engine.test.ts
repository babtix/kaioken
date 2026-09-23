import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { defaultEngine, SealedProcessTerminal } from "../src/app.js";

/**
 * The engine runs in the same process as the interface, and it gets there by
 * taking `process.stdout.write` over for the length of a command — that is how
 * the CLI's own output is routed into the transcript. The screen froze for the
 * whole of every run once, because pi-tui resolves `process.stdout.write` at
 * the moment of each call and painted into the capture instead of the
 * terminal: no spinner, no elapsed counter, no streamed line, for minutes at a
 * time. The fix is a terminal whose output path was bound before anyone could
 * take it over, so these tests watch the takeover, not the aftermath — by the
 * time a call returns, a restored global has nothing left to show.
 */
describe("the sealed terminal", () => {
	it("keeps painting through the binding it captured while stdout is taken over", () => {
		const capturedAtConstruction: string[] = [];
		const takenOver: string[] = [];
		const original = process.stdout.write;

		// The binding is captured at construction, so the spy has to be in
		// place first — that is the whole point: whatever sits on the global
		// afterwards is invisible to the terminal.
		process.stdout.write = ((chunk: unknown) => {
			capturedAtConstruction.push(String(chunk));
			return true;
		}) as typeof original;
		let terminal: SealedProcessTerminal;
		try {
			terminal = new SealedProcessTerminal();
		} finally {
			process.stdout.write = original;
		}

		// Mid-run: the engine's capture takes the global over completely.
		process.stdout.write = ((chunk: unknown) => {
			takenOver.push(String(chunk));
			return true;
		}) as typeof original;
		try {
			terminal.write("frame one");
			terminal.hideCursor();
			terminal.showCursor();
			terminal.moveBy(-2);
			terminal.clearLine();
		} finally {
			process.stdout.write = original;
		}

		expect(capturedAtConstruction.join("")).toContain("frame one");
		expect(capturedAtConstruction.join("")).toContain("\x1b[?25l");
		expect(capturedAtConstruction.join("")).toContain("\x1b[?25h");
		expect(capturedAtConstruction.join("")).toContain("\x1b[2A");
		expect(capturedAtConstruction.join("")).toContain("\x1b[K");
		expect(takenOver).toEqual([]);
	});
});

describe("the default engine", () => {
	let root: string;

	beforeAll(async () => {
		root = await mkdtemp(join(tmpdir(), "kaioken-engine-"));
	});

	afterAll(async () => {
		await rm(root, { recursive: true, force: true });
	});

	it("routes the CLI's own output to emit, a line at a time", async () => {
		// `status` on an empty repository scans, writes its artifact and says
		// so on stdout — a real command implementation, with no model and no
		// network, whose output has nowhere else to go but the capture.
		const lines: string[] = [];
		const code = await defaultEngine({ command: "status", args: [], busyText: "status" }, root, (line) =>
			lines.push(line),
		);
		expect(code).toBe(0);
		expect(lines.join("\n")).toContain("nothing generated yet");
		// The capture splits on newlines: a whole run must not arrive as one
		// gigantic line at the end.
		for (const line of lines) expect(line).not.toContain("\n");
	});

	it("still resolves the same path when the CLI is loaded for the second time", async () => {
		// The module import is cached by Node, so a second run exercises the
		// restore path rather than a cold load.
		const lines: string[] = [];
		const code = await defaultEngine({ command: "status", args: ["--json"], busyText: "status" }, root, (line) =>
			lines.push(line),
		);
		expect(code).toBe(0);
		expect(lines.join("\n")).toContain("documents");
	});
});
