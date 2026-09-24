import { describe, expect, it } from "vitest";
import {
	calculateOfflineSavings,
	formatOfflineModeBadge,
	isOfflineExecution,
} from "../src/offline.ts";
import { estimateTokens } from "../src/spend.ts";

describe("offline: isOfflineExecution", () => {
	it("detects null or undefined as offline", () => {
		expect(isOfflineExecution(null)).toBe(true);
		expect(isOfflineExecution(undefined)).toBe(true);
	});

	it("detects client with offline flags", () => {
		expect(isOfflineExecution({ offline: true })).toBe(true);
		expect(isOfflineExecution({ mode: "offline" })).toBe(true);
		expect(isOfflineExecution({ isOffline: true })).toBe(true);
	});

	it("detects online client as not offline", () => {
		expect(isOfflineExecution({ complete: async () => "" })).toBe(false);
	});
});

describe("offline: calculateOfflineSavings", () => {
	it("calculates dollar savings of avoided tokens against benchmark", () => {
		const tokens = estimateTokens(5, 25_000);
		const savings = calculateOfflineSavings(tokens, { input: 0.15, output: 0.60, cacheRead: 0.03, cacheWrite: 0.15 });
		expect(savings.savedTokens.input).toBe(tokens.input);
		expect(savings.savedTokens.output).toBe(tokens.output);
		expect(savings.savedUsd).toBeGreaterThan(0);
	});
});

describe("offline: formatOfflineModeBadge", () => {
	it("renders zero-cost offline badge with reason and zero spend", () => {
		const badge = formatOfflineModeBadge({
			stage: "plan",
			reason: "deterministic AST directory clustering",
		});
		expect(badge).toContain("ZERO-COST OFFLINE MODE [plan]");
		expect(badge).toContain("deterministic AST directory clustering");
		expect(badge).toContain("Billed Tokens: 0 in / 0 out");
		expect(badge).toContain("Cost: $0.0000 USD");
	});

	it("includes avoided spend when bypassedTokens are provided", () => {
		const tokens = estimateTokens(3, 15_000);
		const badge = formatOfflineModeBadge({
			stage: "wiki",
			bypassedTokens: tokens,
		});
		expect(badge).toContain("Avoided Spend:");
		expect(badge).toContain("$");
	});

	it("supports asciiOnly mode without unicode box drawing", () => {
		const badge = formatOfflineModeBadge({ asciiOnly: true });
		expect(badge).toContain("+");
		expect(badge).toContain("[0-COST OFFLINE MODE]");
	});
});
