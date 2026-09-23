import { describe, expect, it } from "vitest";
import {
	BREADTH_THRESHOLD,
	depthFor,
	extractJson,
	MAX_MULTIPLIER,
	MIN_MULTIPLIER,
	parseMultiplier,
} from "../src/index.ts";

describe("modelport: multiplier parsing", () => {
	it("accepts bare integers and x-prefixed forms", () => {
		expect(parseMultiplier("1")).toBe(1);
		expect(parseMultiplier("3")).toBe(3);
		expect(parseMultiplier("x7")).toBe(7);
		expect(parseMultiplier("X10")).toBe(10);
		expect(parseMultiplier(4)).toBe(4);
	});

	it("defaults to the minimum when omitted", () => {
		expect(parseMultiplier(undefined)).toBe(MIN_MULTIPLIER);
	});

	it("rejects out-of-range, malformed and fractional input", () => {
		expect(parseMultiplier("0")).toBeNull();
		expect(parseMultiplier("11")).toBeNull();
		expect(parseMultiplier("2.5")).toBeNull();
		expect(parseMultiplier("x")).toBeNull();
		expect(parseMultiplier("many")).toBeNull();
	});
});

describe("modelport: depth dial", () => {
	it("clamps out-of-range multipliers into the legal band", () => {
		expect(depthFor(0).multiplier).toBe(MIN_MULTIPLIER);
		expect(depthFor(99).multiplier).toBe(MAX_MULTIPLIER);
	});

	it("buys breadth below the threshold", () => {
		const low = depthFor(1);
		const mid = depthFor(4);
		expect(mid.targetModules).toBeGreaterThan(low.targetModules);
		expect(mid.keyPoints).toBeGreaterThan(low.keyPoints);
		expect(mid.declarationsPerFile).toBeGreaterThan(low.declarationsPerFile);
		expect(mid.maxOutputTokens).toBeGreaterThan(low.maxOutputTokens);
	});

	it("stops buying breadth at the threshold", () => {
		const at = depthFor(BREADTH_THRESHOLD);
		const beyond = depthFor(MAX_MULTIPLIER);
		expect(beyond.targetModules).toBe(at.targetModules);
		expect(beyond.keyPoints).toBe(at.keyPoints);
		expect(beyond.maxOutputTokens).toBe(at.maxOutputTokens);
	});

	it("buys scrutiny above the threshold instead", () => {
		const at = depthFor(BREADTH_THRESHOLD);
		const beyond = depthFor(MAX_MULTIPLIER);
		expect(beyond.critiquePasses).toBeGreaterThan(at.critiquePasses);
		expect(beyond.repairPasses).toBeGreaterThan(at.repairPasses);
	});

	it("always runs at least one repair pass", () => {
		for (let n = MIN_MULTIPLIER; n <= MAX_MULTIPLIER; n++) {
			expect(depthFor(n).repairPasses).toBeGreaterThanOrEqual(1);
		}
	});

	it("never produces a negative critique budget", () => {
		for (let n = MIN_MULTIPLIER; n <= MAX_MULTIPLIER; n++) {
			expect(depthFor(n).critiquePasses).toBeGreaterThanOrEqual(0);
		}
	});
});

describe("modelport: extractJson tolerance", () => {
	it("parses a bare object", () => {
		expect(extractJson<{ a: number }>('{"a":1}')).toEqual({ a: 1 });
	});

	it("parses a fenced block wrapped in prose", () => {
		const reply = 'Sure! Here you go:\n```json\n{"a":2}\n```\nHope that helps.';
		expect(extractJson<{ a: number }>(reply)).toEqual({ a: 2 });
	});

	it("parses a fenced block without a language tag", () => {
		expect(extractJson<{ a: number }>('```\n{"a":3}\n```')).toEqual({ a: 3 });
	});

	it("parses a bare array", () => {
		expect(extractJson<number[]>("[1,2,3]")).toEqual([1, 2, 3]);
	});

	it("finds the outermost balanced object inside surrounding prose", () => {
		const reply = 'The modules are {"modules":[{"id":"a"}]} as requested.';
		expect(extractJson<{ modules: { id: string }[] }>(reply)).toEqual({ modules: [{ id: "a" }] });
	});

	it("does not stop at a brace inside a string literal", () => {
		const reply = '{"note":"use {curly} braces","ok":true}';
		expect(extractJson<{ note: string; ok: boolean }>(reply)).toEqual({
			note: "use {curly} braces",
			ok: true,
		});
	});

	it("throws when the reply contains no JSON at all", () => {
		expect(() => extractJson("I could not determine the modules.")).toThrow(
			/model reply contained no parseable JSON/,
		);
	});
});
