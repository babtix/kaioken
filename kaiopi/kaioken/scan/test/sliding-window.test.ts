import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import { analyzeStreamWithWindow, SlidingWindowAnalyzer } from "../src/index.ts";

describe("Sliding Window Stream Analyzer", () => {
	it("detects credential split across chunk boundaries that standard chunking would miss", () => {
		// "AKIAIOSFODNN7EXAMPLE" is a 20-char AWS key
		const part1 = "const awsKey = \"AKIAIOSF";
		const part2 = "ODNN7EXAMPLE\";\n";

		// Direct chunk 1 alone does not have a 20-char key
		// Direct chunk 2 alone does not have "AKIA..."
		const analyzer = new SlidingWindowAnalyzer({ overlapBytes: 64 });
		analyzer.feed(part1);
		expect(analyzer.hasCredentials).toBe(false);

		// Feeding chunk 2 combines with overlap
		analyzer.feed(part2);
		const result = analyzer.finish();

		expect(result.hasCredentials).toBe(true);
		expect(result.totalBytes).toBe(Buffer.byteLength(part1 + part2));
	});

	it("detects multi-line private key banner crossing chunk boundaries", () => {
		const part1 = "Some preceding text...\n-----BEGIN OPENSSH ";
		const part2 = "PRIVATE KEY-----\nb3BlbnNzaC1rZXktdjEAAAAA\n-----END OPENSSH PRIVATE KEY-----\n";

		const analyzer = new SlidingWindowAnalyzer({ overlapBytes: 128 });
		analyzer.feed(part1);
		analyzer.feed(part2);
		const result = analyzer.finish();

		expect(result.hasPrivateKey).toBe(true);
	});

	it("streams via analyzeStreamWithWindow readable stream", async () => {
		const data = [
			"line 1\n",
			"line 2: github_pat_11ABCD012_abcdef",
			"ghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ\n",
			"line 3\n",
		];

		const readable = Readable.from(data);
		const result = await analyzeStreamWithWindow(readable, { overlapBytes: 64 });

		expect(result.hasCredentials).toBe(true);
		expect(result.hash).toMatch(/^[0-9a-f]{64}$/);
	});

	it("respects maxScanBytes limit for stream scanning", () => {
		const padding = "x".repeat(1000);
		const secret = "AKIAIOSFODNN7EXAMPLE";

		const analyzer = new SlidingWindowAnalyzer({ maxScanBytes: 500, overlapBytes: 64 });
		analyzer.feed(padding);
		analyzer.feed(secret);
		const result = analyzer.finish();

		// Exceeded maxScanBytes, secret was not scanned
		expect(result.hasCredentials).toBe(false);
	});
});
