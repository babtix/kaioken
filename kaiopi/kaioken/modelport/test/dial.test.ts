import { describe, expect, it } from "vitest";
import {
	describeMultiplierMode,
	formatMultiplierDial,
	formatSpendConfirmationPrompt,
	getMultiplierMode,
	renderDialGauge,
	SpendMultiplierDial,
} from "../src/dial.ts";
import { estimateSpend, estimateTokens } from "../src/spend.ts";

describe("dial: gauge rendering", () => {
	it("renders filled and empty diamonds correctly", () => {
		expect(renderDialGauge(1)).toBe("[◆◇◇◇◇◇◇◇◇◇] ×1");
		expect(renderDialGauge(5)).toBe("[◆◆◆◆◆◇◇◇◇◇] ×5");
		expect(renderDialGauge(10)).toBe("[◆◆◆◆◆◆◆◆◆◆] ×10");
	});

	it("clamps out-of-range values", () => {
		expect(renderDialGauge(0)).toBe("[◆◇◇◇◇◇◇◇◇◇] ×1");
		expect(renderDialGauge(15)).toBe("[◆◆◆◆◆◆◆◆◆◆] ×10");
	});
});

describe("dial: multiplier mode", () => {
	it("detects breadth mode below threshold (x1 to x4)", () => {
		expect(getMultiplierMode(1)).toBe("breadth");
		expect(getMultiplierMode(4)).toBe("breadth");
		expect(describeMultiplierMode("breadth")).toContain("Breadth Expansion");
	});

	it("detects threshold at x5", () => {
		expect(getMultiplierMode(5)).toBe("threshold");
		expect(describeMultiplierMode("threshold")).toContain("Balanced");
	});

	it("detects scrutiny mode above threshold (x6 to x10)", () => {
		expect(getMultiplierMode(6)).toBe("scrutiny");
		expect(getMultiplierMode(10)).toBe("scrutiny");
		expect(describeMultiplierMode("scrutiny")).toContain("Deep Scrutiny");
	});
});

describe("dial: formatMultiplierDial", () => {
	it("includes dial gauge and phase description", () => {
		const out = formatMultiplierDial(5);
		expect(out).toContain("[◆◆◆◆◆◇◇◇◇◇] ×5");
		expect(out).toContain("Balanced");
		expect(out).toContain("Target Modules");
		expect(out).toContain("Correction Passes");
	});

	it("formats optional spend estimate when provided", () => {
		const est = estimateSpend({ input: 0.15, output: 0.60, cacheRead: 0.03, cacheWrite: 0.15 }, estimateTokens(3, 10_000));
		const out = formatMultiplierDial(3, { estimate: est });
		expect(out).toContain("Estimated Consumption:");
		expect(out).toContain("$");
	});
});

describe("dial: formatSpendConfirmationPrompt", () => {
	it("formats complete confirmation box with action, dial, tokens, and cost", () => {
		const est = estimateSpend({ input: 0.15, output: 0.60, cacheRead: 0.03, cacheWrite: 0.15 }, estimateTokens(5, 25_000));
		const prompt = formatSpendConfirmationPrompt("plan", 5, est, "antigravity/gemini-2.5-flash");
		expect(prompt).toContain("Kaioken Spend Confirmation — Stage: plan");
		expect(prompt).toContain("[◆◆◆◆◆◇◇◇◇◇] ×5");
		expect(prompt).toContain("antigravity/gemini-2.5-flash");
		expect(prompt).toContain("Proceed with execution?");
	});

	it("handles missing pricing gracefully in prompt", () => {
		const est = estimateSpend(undefined, estimateTokens(2, 5_000));
		const prompt = formatSpendConfirmationPrompt("wiki", 2, est, "offline-model");
		expect(prompt).toContain("Est. Cost:  unknown");
		expect(prompt).toContain("Proceed with execution?");
	});
});

describe("dial: SpendMultiplierDial controller", () => {
	it("initializes with parsed multiplier and clamps", () => {
		const dial = new SpendMultiplierDial(3);
		expect(dial.multiplier).toBe(3);
		expect(dial.getMode()).toBe("breadth");

		dial.set(12);
		expect(dial.multiplier).toBe(10);

		dial.set(-2);
		expect(dial.multiplier).toBe(1);
	});

	it("increments and decrements within bounds", () => {
		const dial = new SpendMultiplierDial(9);
		expect(dial.increment()).toBe(10);
		expect(dial.increment()).toBe(10); // clamped at max

		expect(dial.decrement()).toBe(9);
		dial.set(1);
		expect(dial.decrement()).toBe(1); // clamped at min
	});

	it("renders formatted breakdown from controller", () => {
		const dial = new SpendMultiplierDial(7);
		const text = dial.render();
		expect(text).toContain("[◆◆◆◆◆◆◆◇◇◇] ×7");
		expect(text).toContain("Deep Scrutiny");
	});
});
