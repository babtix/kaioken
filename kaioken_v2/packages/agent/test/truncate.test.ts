import { describe, expect, it } from "vitest";
import {
	formatTruncatedHead,
	formatTruncatedTail,
	truncateHead,
	truncateLine,
	truncateTail,
} from "../dist/index.js";

describe("truncateHead", () => {
	it("returns the input unchanged when under both limits", () => {
		const text = "line 1\nline 2\nline 3";
		const result = truncateHead(text);
		expect(result.truncated).toBe(false);
		expect(result.content).toBe(text);
		expect(result.marker).toBe("");
	});

	it("truncates by line count", () => {
		const lines = Array.from({ length: 50 }, (_, i) => `line ${i}`);
		const text = lines.join("\n");
		const result = truncateHead(text, { maxLines: 10, maxBytes: 100_000 });
		expect(result.truncated).toBe(true);
		expect(result.outputLines).toBe(10);
		expect(result.marker).toContain("40 lines");
		expect(result.marker).toContain("showing first 10");
	});

	it("truncates by byte limit", () => {
		// Each line is 6 bytes ("line X") + 1 newline separator
		const lines = Array.from({ length: 10 }, (_, i) => `line ${i}`);
		const text = lines.join("\n");
		const result = truncateHead(text, { maxLines: 100, maxBytes: 20 });
		expect(result.truncated).toBe(true);
		expect(result.outputLines).toBeLessThan(10);
	});

	it("handles empty input", () => {
		const result = truncateHead("");
		expect(result.truncated).toBe(false);
		expect(result.content).toBe("");
		expect(result.totalLines).toBe(0);
	});

	it("handles multi-byte UTF-8 correctly", () => {
		// Each emoji is 4 bytes
		const lines = Array.from({ length: 5 }, () => "🎉");
		const text = lines.join("\n");
		const result = truncateHead(text, { maxLines: 100, maxBytes: 10 });
		expect(result.truncated).toBe(true);
		// Should keep at most 2 emoji lines (4 bytes + 1 newline + 4 bytes = 9)
		expect(result.outputLines).toBeLessThanOrEqual(2);
	});

	it("marker line is appended by formatTruncatedHead", () => {
		const lines = Array.from({ length: 20 }, (_, i) => `line ${i}`);
		const result = truncateHead(lines.join("\n"), { maxLines: 5 });
		const display = formatTruncatedHead(result);
		expect(display).toContain("line 0");
		expect(display).toContain("… [truncated:");
	});
});

describe("truncateTail", () => {
	it("returns the input unchanged when under both limits", () => {
		const text = "line 1\nline 2";
		const result = truncateTail(text);
		expect(result.truncated).toBe(false);
		expect(result.content).toBe(text);
	});

	it("keeps the last N lines", () => {
		const lines = Array.from({ length: 50 }, (_, i) => `line ${i}`);
		const text = lines.join("\n");
		const result = truncateTail(text, { maxLines: 10, maxChars: 100_000 });
		expect(result.truncated).toBe(true);
		expect(result.content).toContain("line 49");
		expect(result.content).not.toContain("line 0\n");
	});

	it("truncates by character limit", () => {
		const lines = Array.from({ length: 10 }, (_, i) => `line ${i}`);
		const text = lines.join("\n");
		const result = truncateTail(text, { maxLines: 100, maxChars: 25 });
		expect(result.truncated).toBe(true);
		expect(result.content.length).toBeLessThanOrEqual(25);
	});

	it("marker line is prepended by formatTruncatedTail", () => {
		const lines = Array.from({ length: 20 }, (_, i) => `line ${i}`);
		const result = truncateTail(lines.join("\n"), { maxLines: 5 });
		const display = formatTruncatedTail(result);
		expect(display).toContain("line 19");
		expect(display.startsWith("… [truncated:")).toBe(true);
	});

	it("handles empty input", () => {
		const result = truncateTail("");
		expect(result.truncated).toBe(false);
		expect(result.content).toBe("");
	});
});

describe("truncateLine", () => {
	it("leaves a short line unchanged", () => {
		const { text, wasTruncated } = truncateLine("hello world", 500);
		expect(wasTruncated).toBe(false);
		expect(text).toBe("hello world");
	});

	it("truncates a long line and appends marker", () => {
		const { text, wasTruncated } = truncateLine("x".repeat(600), 500);
		expect(wasTruncated).toBe(true);
		expect(text.length).toBeLessThan(600);
		expect(text).toContain("[truncated]");
	});
});
