import { describe, expect, it } from "vitest";
import {
	computeRangeHash,
	computeSymbolHashes,
	hasSymbolDrifted,
	normalizeSource,
} from "../src/binding.ts";

describe("SymbolProvenanceBinder & Normalization", () => {
	const CODE = `
// Header comment
export function calculate(a: number, b: number): number {
    /* Multi-line
       explanation */
    return a + b; // return sum
}

export function subtract(x: number, y: number): number {
    return x - y;
}
`;

	it("normalizes single-line and multi-line comments when requested", () => {
		const norm = normalizeSource(CODE, { ignoreComments: true });
		expect(norm).not.toContain("Header comment");
		expect(norm).not.toContain("Multi-line");
		expect(norm).not.toContain("return sum");
		expect(norm).toContain("export function calculate");
		expect(norm).toContain("return a + b;");
	});

	it("does not strip # or // inside string literals", () => {
		const codeWithStrings = `const url = "https://example.com/api"; const tag = "#tag";`;
		const norm = normalizeSource(codeWithStrings, { ignoreComments: true });
		expect(norm).toContain("https://example.com/api");
		expect(norm).toContain("#tag");
	});

	it("normalizes whitespace and blank lines", () => {
		const raw = "   function   foo()   {\n\n\n    return 42;\n   }   ";
		const norm = normalizeSource(raw, { ignoreWhitespace: true });
		expect(norm).toBe("function foo() {\nreturn 42;\n}");
	});

	it("computes deterministic range hash for line ranges", () => {
		const hash1 = computeRangeHash(CODE, 3, 7);
		const hash2 = computeRangeHash(CODE, 3, 7);
		expect(hash1).toBe(hash2);
		expect(hash1).toHaveLength(64); // SHA-256 hex
	});

	it("prevents false-alarm staleness when only comments change", () => {
		const codeBefore = `function add(a: number, b: number) {\n    // Old comment\n    return a + b;\n}`;
		const codeAfter = `function add(a: number, b: number) {\n    // Updated explanation with typo fix\n    return a + b;\n}`;

		// Without tolerance, whole code hash changes
		const rawBefore = computeRangeHash(codeBefore);
		const rawAfter = computeRangeHash(codeAfter);
		expect(rawBefore).not.toBe(rawAfter);

		// With comment tolerance, normalized range hashes match exactly!
		const normBefore = computeRangeHash(codeBefore, undefined, undefined, { ignoreComments: true, ignoreWhitespace: true });
		const normAfter = computeRangeHash(codeAfter, undefined, undefined, { ignoreComments: true, ignoreWhitespace: true });
		expect(normBefore).toBe(normAfter);

		const drifted = hasSymbolDrifted(normBefore, codeAfter, 1, 4, { ignoreComments: true, ignoreWhitespace: true });
		expect(drifted).toBe(false);
	});

	it("detects real drift when code logic changes under tolerance", () => {
		const codeBefore = `function add(a: number, b: number) {\n    return a + b;\n}`;
		const codeAfter = `function add(a: number, b: number) {\n    return a * b;\n}`;

		const normBefore = computeRangeHash(codeBefore, undefined, undefined, { ignoreComments: true });
		const drifted = hasSymbolDrifted(normBefore, codeAfter, 1, 3, { ignoreComments: true });
		expect(drifted).toBe(true);
	});

	it("computes symbol hashes for named spans", () => {
		const spans = [
			{ name: "calculate", startLine: 3, endLine: 7 },
			{ name: "subtract", startLine: 9, endLine: 11 },
		];
		const hashes = computeSymbolHashes(CODE, spans);
		expect(hashes.has("calculate")).toBe(true);
		expect(hashes.has("subtract")).toBe(true);
		expect(hashes.get("calculate")).not.toBe(hashes.get("subtract"));
	});
});
