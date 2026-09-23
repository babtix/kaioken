import { describe, expect, it } from "vitest";
import {
	calculateMetricEntropy,
	calculateShannonEntropy,
	detectHighEntropyStrings,
	formatEntropyBar,
	maskToken,
	visualizeEntropyProfile,
} from "../src/index.ts";

describe("Shannon Entropy Engine", () => {
	it("calculates 0 entropy for empty or single repeated character string", () => {
		expect(calculateShannonEntropy("")).toBe(0);
		expect(calculateShannonEntropy("aaaaaaaaaa")).toBe(0);
		expect(calculateShannonEntropy("111111111111")).toBe(0);
	});

	it("calculates exactly 1 bit per character for balanced binary string", () => {
		expect(calculateShannonEntropy("01010101")).toBe(1);
		expect(calculateShannonEntropy("aabb")).toBe(1);
	});

	it("calculates higher entropy for high-diversity cryptographic keys", () => {
		const prose = "this is a standard sentence with english words";
		const secret = "xK9#vL2$mQ8@zP1*wR5&bT4!yN7";
		const proseEntropy = calculateShannonEntropy(prose);
		const secretEntropy = calculateShannonEntropy(secret);

		expect(secretEntropy).toBeGreaterThan(4.2);
		expect(proseEntropy).toBeLessThan(secretEntropy);
	});

	it("calculates metric entropy normalized by length", () => {
		expect(calculateMetricEntropy("")).toBe(0);
		expect(calculateMetricEntropy("a")).toBe(0);
		const metric = calculateMetricEntropy("abcdefghijklmnop");
		expect(metric).toBeGreaterThan(0.9);
		expect(metric).toBeLessThanOrEqual(1.0);
	});
});

describe("High-Entropy String Detection", () => {
	it("detects high-entropy secret token embedded in code", () => {
		const code = `
const apiKey = "xK92mQpL7vNz4RtY8wBs";
const normalText = "welcome to our homepage";
`;
		const findings = detectHighEntropyStrings(code, { minEntropy: 4.0 });
		expect(findings.length).toBeGreaterThanOrEqual(1);
		expect(findings[0]?.token).toBe("xK92mQpL7vNz4RtY8wBs");
		expect(findings[0]?.line).toBe(2);
		expect(findings[0]?.severity).toBeDefined();
	});

	it("filters out repeated patterns and low-entropy sequences", () => {
		const code = `
const zeros = "00000000000000000000";
const pattern = "abababababababababab";
`;
		const findings = detectHighEntropyStrings(code);
		expect(findings).toEqual([]);
	});

	it("ignores documentation placeholders and whitelisted terms", () => {
		const code = `
const dummy = "dummy-placeholder-token-value-123456";
const example = "your-api-key-goes-here-sample-test";
`;
		const findings = detectHighEntropyStrings(code);
		expect(findings).toEqual([]);
	});

	it("whitelists standard UUIDs", () => {
		const code = `
const id = "123e4567-e89b-12d3-a456-426614174000";
`;
		const findings = detectHighEntropyStrings(code);
		expect(findings).toEqual([]);
	});

	it("whitelists standard 40-character and 64-character hex hashes", () => {
		const code = `
const gitCommit = "da39a3ee5e6b4b0d3255bfef95601890afd80709";
const sha256 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
`;
		const findings = detectHighEntropyStrings(code);
		expect(findings).toEqual([]);
	});
});

describe("Visual Bar & Profile Formatting", () => {
	it("masks token retaining head and tail characters", () => {
		expect(maskToken("short")).toBe("*****");
		expect(maskToken("sk-proj-1234567890abcdef")).toBe("sk-p********cdef");
	});

	it("formats terminal entropy bar", () => {
		const bar = formatEntropyBar(4.8, 6.0, 10);
		expect(bar).toContain("4.80 b/c");
		expect(bar).toContain("█");
	});

	it("visualizes entropy profile card", () => {
		const emptySummary = visualizeEntropyProfile([]);
		expect(emptySummary).toContain("Zero");

		const findings = [
			{
				token: "xK92mQpL7vNz4RtY8wBs",
				masked: "xK92********8wBs",
				entropy: 4.95,
				metricEntropy: 0.88,
				line: 12,
				column: 16,
				severity: "CRITICAL" as const,
			},
		];
		const card = visualizeEntropyProfile(findings);
		expect(card).toContain("Line   12");
		expect(card).toContain("CRITICAL");
		expect(card).toContain("4.95 b/c");
	});
});
