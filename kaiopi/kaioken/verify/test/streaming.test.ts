import { describe, expect, it } from "vitest";
import {
	LineRingBuffer,
	StreamingTestConsole,
	stripAnsi,
	tail,
} from "../src/index.ts";

describe("LineRingBuffer", () => {
	it("bounds capacity by number of lines", () => {
		const buffer = new LineRingBuffer(3, 1000);
		buffer.push("line 1");
		buffer.push("line 2");
		buffer.push("line 3");
		buffer.push("line 4");

		expect(buffer.getLines()).toEqual(["line 2", "line 3", "line 4"]);
	});

	it("bounds capacity by character count", () => {
		const buffer = new LineRingBuffer(10, 15);
		buffer.push("12345"); // 6 chars with newline
		buffer.push("67890"); // 6 chars with newline
		buffer.push("abcde"); // 6 chars -> total 18 > 15, should drop first line

		expect(buffer.getLines()).toEqual(["67890", "abcde"]);
	});

	it("renders as string with maximum character bounding", () => {
		const buffer = new LineRingBuffer(5, 20);
		buffer.push("hello world");
		buffer.push("second line");
		expect(buffer.toString().length).toBeLessThanOrEqual(20);
	});
});

describe("StreamingTestConsole", () => {
	it("streams real-time chunks and line callbacks", async () => {
		const console = new StreamingTestConsole();
		const chunks: string[] = [];
		const lines: string[] = [];

		const isWin = process.platform === "win32";
		const cmd = isWin ? "echo chunk1 && echo chunk2" : "echo 'chunk1'; echo 'chunk2'";

		const res = await console.execute(cmd, {
			cwd: process.cwd(),
			onChunk: (chunk) => chunks.push(chunk.text),
			onLine: (line) => lines.push(line.trim()),
		});

		expect(res.exitCode).toBe(0);
		expect(chunks.length).toBeGreaterThanOrEqual(1);
		expect(lines).toContain("chunk1");
		expect(lines).toContain("chunk2");
	});

	it("notifies global listeners subscribed via addListener", async () => {
		const console = new StreamingTestConsole();
		const emitted: string[] = [];

		const unsubscribe = console.addListener((chunk) => {
			emitted.push(chunk.text);
		});

		const isWin = process.platform === "win32";
		const cmd = isWin ? "echo emitted" : "echo 'emitted'";

		await console.run(cmd, { cwd: process.cwd(), timeoutMs: 5000 });
		expect(emitted.some((t) => t.includes("emitted"))).toBe(true);

		unsubscribe();
		emitted.length = 0;
		await console.run(cmd, { cwd: process.cwd(), timeoutMs: 5000 });
		expect(emitted.length).toBe(0);
	});

	it("handles process timeout gracefully", async () => {
		const console = new StreamingTestConsole();
		const isWin = process.platform === "win32";
		const cmd = isWin ? "ping 127.0.0.1 -n 4 > nul" : "sleep 2";

		const res = await console.execute(cmd, {
			cwd: process.cwd(),
			timeoutMs: 300,
		});

		expect(res.timedOut).toBe(true);
		expect(res.exitCode).not.toBe(0);
	});

	it("handles AbortSignal cancellation", async () => {
		const console = new StreamingTestConsole();
		const controller = new AbortController();
		const isWin = process.platform === "win32";
		const cmd = isWin ? "ping 127.0.0.1 -n 4 > nul" : "sleep 2";

		setTimeout(() => controller.abort(), 100);

		const res = await console.execute(cmd, {
			cwd: process.cwd(),
			signal: controller.signal,
			timeoutMs: 5000,
		});

		expect(res.exitCode).not.toBe(0);
	});
});
