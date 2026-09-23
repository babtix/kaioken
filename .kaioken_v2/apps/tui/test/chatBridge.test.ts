import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chatHeadless } from "../src/chatBridge.js";

/**
 * The one property the bridge has to keep: it does not take over stdout.
 *
 * pi-tui repaints by calling `process.stdout.write`, resolved at the moment of
 * the call. A bridge that swaps that function out for the length of a turn —
 * which this one did, to read the reply back out of `--json` output — swallows
 * every frame drawn while the agent is working. The visible result was a screen
 * frozen on "thinking · 0s" with the elapsed counter stuck, and a turn that had
 * asked for approval to write a file waiting forever on a prompt that had been
 * painted into the capture buffer instead of the terminal.
 *
 * Asserting on the reply would not have caught it: the reply was fine. The
 * assignment is the defect, so the assignment is what this watches for.
 */
describe("the chat bridge", () => {
	let root: string;

	beforeAll(async () => {
		root = await mkdtemp(join(tmpdir(), "kaioken-bridge-"));
		await writeFile(join(root, "lib.ts"), "export const add = (a: number, b: number) => a + b;\n");
	});

	afterAll(async () => {
		await rm(root, { recursive: true, force: true });
	});

	it("never replaces process.stdout.write", async () => {
		const original = process.stdout.write;
		let replaced = false;

		// The turn has to be refused before a provider is reached, or this test
		// bills a model and needs a network. No `--model`, no saved choice in a
		// fresh temp root, and this — the three places a spec can come from.
		const envModel = process.env["KAIOKEN_MODEL"];
		delete process.env["KAIOKEN_MODEL"];

		// A setter rather than a comparison after the fact: the old bridge
		// restored the original in a `finally`, so by the time the call returned
		// there was nothing left to see.
		Object.defineProperty(process.stdout, "write", {
			configurable: true,
			get: () => original,
			set: () => {
				replaced = true;
			},
		});

		try {
			// The bridge reports the refusal by throwing what the command wrote
			// to stderr, which is the other half of what it must not swallow.
			await expect(
				chatHeadless({ root, question: "what does this repository do?" }),
			).rejects.toThrow(/no model selected/);
		} finally {
			Object.defineProperty(process.stdout, "write", {
				configurable: true,
				writable: true,
				value: original,
			});
			if (envModel !== undefined) process.env["KAIOKEN_MODEL"] = envModel;
		}

		expect(replaced).toBe(false);
	});

	it("throws captured stderr when chat command fails", async () => {
		// Supplying an invalid model spec will cause runChat to fail during resolution and log to stderr.
		await expect(
			chatHeadless({ root, question: "hi", model: "invalidprovider/nonexistent-model" }),
		).rejects.toThrow();
	});
});
