import { describe, expect, it, vi } from "vitest";
import {
	computeBackoff,
	DEFAULT_CONCURRENCY,
	depthFor,
	effectiveConcurrency,
	FREE_TIER_CONCURRENCY,
	isFreeModel,
	isRetryable,
	mapLimit,
	mapLimitSettled,
	type ModelClient,
	type ModelRequest,
	parseMultiplier,
	parseRetryAfter,
	withRetry,
} from "../dist/index.js";

describe("isRetryable", () => {
	it("does not retry 401, 402, 400 or credential/quota errors", () => {
		expect(isRetryable(new Error("401 Unauthorized: invalid api key"))).toBe(false);
		expect(isRetryable(new Error("user not found"))).toBe(false);
		expect(isRetryable(new Error("402 Payment Required: insufficient_quota"))).toBe(false);
		expect(isRetryable(new Error("400 Bad Request: context_length_exceeded"))).toBe(false);
	});

	it("prefers permanent classification when both permanent and transient patterns appear", () => {
		expect(isRetryable(new Error("401 rate limit exceeded for unauthenticated requests"))).toBe(false);
	});

	it("retries 429, 5xx, timeouts, socket and fetch errors", () => {
		expect(isRetryable(new Error("429 Too Many Requests"))).toBe(true);
		expect(isRetryable(new Error("rate limit exceeded"))).toBe(true);
		expect(isRetryable(new Error("500 Internal Server Error"))).toBe(true);
		expect(isRetryable(new Error("503 Service Unavailable: overloaded"))).toBe(true);
		expect(isRetryable(new Error("504 Gateway Timeout"))).toBe(true);
		expect(isRetryable(new Error("connect ETIMEDOUT 1.2.3.4:443"))).toBe(true);
		expect(isRetryable(new Error("read ECONNRESET"))).toBe(true);
		expect(isRetryable(new Error("getaddrinfo EAI_AGAIN api.openai.com"))).toBe(true);
		expect(isRetryable(new Error("socket hang up"))).toBe(true);
		expect(isRetryable(new Error("fetch failed"))).toBe(true);
	});

	it("does not retry unparseable JSON or other application errors", () => {
		expect(isRetryable(new Error("model reply contained no parseable JSON"))).toBe(false);
		expect(isRetryable(new Error("syntax error: unexpected token"))).toBe(false);
	});
});

describe("withRetry", () => {
	it("returns immediate success without retrying", async () => {
		const client: ModelClient = {
			complete: vi.fn().mockResolvedValue("hello"),
		};
		const wrapped = withRetry(client, { sleep: async () => {} });
		const res = await wrapped.complete({ purpose: "test", system: "", prompt: "hi" });
		expect(res).toBe("hello");
		expect(client.complete).toHaveBeenCalledTimes(1);
	});

	it("retries a rate-limited call and returns the eventual success", async () => {
		let attempts = 0;
		const sleepFn = vi.fn().mockResolvedValue(undefined);
		const onRetry = vi.fn();
		const client: ModelClient = {
			complete: async () => {
				attempts++;
				if (attempts < 3) {
					throw new Error("429 rate limit exceeded");
				}
				return "eventual success";
			},
		};

		const wrapped = withRetry(client, {
			maxAttempts: 4,
			sleep: sleepFn,
			onRetry,
			random: () => 0.5,
		});

		const res = await wrapped.complete({ purpose: "wiki-chapter", system: "", prompt: "hi" });
		expect(res).toBe("eventual success");
		expect(attempts).toBe(3);
		expect(sleepFn).toHaveBeenCalledTimes(2);
		expect(onRetry).toHaveBeenCalledTimes(2);
	});

	it("does not retry a rejected credential", async () => {
		const client: ModelClient = {
			complete: vi.fn().mockRejectedValue(new Error("401 Unauthorized")),
		};
		const sleepFn = vi.fn().mockResolvedValue(undefined);
		const wrapped = withRetry(client, { sleep: sleepFn });

		await expect(
			wrapped.complete({ purpose: "test", system: "", prompt: "hi" }),
		).rejects.toThrow("401 Unauthorized");
		expect(client.complete).toHaveBeenCalledTimes(1);
		expect(sleepFn).not.toHaveBeenCalled();
	});

	it("gives up after max attempts and re-throws the last error", async () => {
		const client: ModelClient = {
			complete: vi.fn().mockRejectedValue(new Error("503 overloaded")),
		};
		const sleepFn = vi.fn().mockResolvedValue(undefined);
		const wrapped = withRetry(client, {
			maxAttempts: 3,
			sleep: sleepFn,
			random: () => 0.5,
		});

		await expect(
			wrapped.complete({ purpose: "test", system: "", prompt: "hi" }),
		).rejects.toThrow("503 overloaded");
		expect(client.complete).toHaveBeenCalledTimes(3);
		expect(sleepFn).toHaveBeenCalledTimes(2);
	});

	it("honours an extractable Retry-After header/message", () => {
		expect(parseRetryAfter(new Error("rate limited, retry after 5s"))).toBe(5000);
		expect(parseRetryAfter(new Error("Retry-After: 12 seconds"))).toBe(12000);
		expect(parseRetryAfter(new Error("random error"))).toBeNull();

		const policy = {
			maxAttempts: 4,
			baseDelayMs: 500,
			maxDelayMs: 20000,
			sleep: async () => {},
			random: () => 0.5,
		};
		const backoff = computeBackoff(1, policy, new Error("rate limited; retry-after: 8s"));
		expect(backoff).toBe(8000);
	});

	it("backs off with increasing delays under the ceiling", () => {
		const policy = {
			maxAttempts: 4,
			baseDelayMs: 1000,
			maxDelayMs: 10000,
			sleep: async () => {},
			random: () => 1.0, // multiplier 1.0
		};
		const d1 = computeBackoff(1, policy); // 1000 * 1 = 1000
		const d2 = computeBackoff(2, policy); // 2000 * 1 = 2000
		const d3 = computeBackoff(3, policy); // 4000 * 1 = 4000
		const d4 = computeBackoff(4, policy); // 8000 * 1 = 8000
		const d5 = computeBackoff(5, policy); // min(10000, 16000) = 10000

		expect(d1).toBe(1000);
		expect(d2).toBe(2000);
		expect(d3).toBe(4000);
		expect(d4).toBe(8000);
		expect(d5).toBe(10000);
	});
});

describe("pool: mapLimit & mapLimitSettled", () => {
	it("never exceeds the concurrency limit and runs in parallel", async () => {
		let currentInFlight = 0;
		let peakInFlight = 0;

		const items = Array.from({ length: 10 }, (_, i) => i);
		const results = await mapLimit(items, 3, async (n) => {
			currentInFlight++;
			peakInFlight = Math.max(peakInFlight, currentInFlight);
			await new Promise((r) => setTimeout(r, 10));
			currentInFlight--;
			return n * 2;
		});

		expect(results).toEqual([0, 2, 4, 6, 8, 10, 12, 14, 16, 18]);
		expect(peakInFlight).toBe(3);
		expect(peakInFlight).toBeGreaterThan(1);
	});

	it("preserves input order even under variable resolution time", async () => {
		const items = [10, 1, 5, 2];
		const results = await mapLimit(items, 4, async (ms, index) => {
			await new Promise((r) => setTimeout(r, ms));
			return `item-${index}`;
		});

		expect(results).toEqual(["item-0", "item-1", "item-2", "item-3"]);
	});

	it("mapLimitSettled reports individual worker failures without aborting others", async () => {
		const items = [1, 2, 3, 4];
		const results = await mapLimitSettled(items, 2, async (n) => {
			if (n === 2) throw new Error("failed on 2");
			return n * 10;
		});

		expect(results[0]).toEqual({ status: "fulfilled", value: 10 });
		expect(results[1]).toEqual({ status: "rejected", reason: expect.any(Error) });
		expect(results[2]).toEqual({ status: "fulfilled", value: 30 });
		expect(results[3]).toEqual({ status: "fulfilled", value: 40 });
	});
});

describe("effectiveConcurrency and isFreeModel", () => {
	it("detects free tier models", () => {
		expect(isFreeModel("openrouter/google/gemini-2.0-flash:free")).toBe(true);
		expect(isFreeModel("openrouter/free/test")).toBe(true);
		expect(isFreeModel("anthropic/claude-3-7-sonnet")).toBe(false);
	});

	it("clamps free models and returns clamped = true", () => {
		const res = effectiveConcurrency(4, "openrouter/google/gemini-2.0-flash:free");
		expect(res).toEqual({ limit: FREE_TIER_CONCURRENCY, clamped: true });
	});

	it("does not clamp paid models", () => {
		const res = effectiveConcurrency(6, "anthropic/claude-3-7-sonnet");
		expect(res).toEqual({ limit: 6, clamped: false });
	});

	it("defaults concurrency to DEFAULT_CONCURRENCY when unspecified", () => {
		const res = effectiveConcurrency(undefined, "anthropic/claude-3-7-sonnet");
		expect(res).toEqual({ limit: DEFAULT_CONCURRENCY, clamped: false });
	});
});

describe("depthFor pass split", () => {
	it("provides repairPasses at x1 and zero critiquePasses", () => {
		const d1 = depthFor(1);
		expect(d1.repairPasses).toBe(1);
		expect(d1.critiquePasses).toBe(0);
		expect(d1.refinementPasses).toBe(1);
	});

	it("provides repair and critique passes above threshold", () => {
		const d5 = depthFor(5);
		expect(d5.repairPasses).toBe(1);
		expect(d5.critiquePasses).toBe(1);
		expect(d5.refinementPasses).toBe(2);

		const d8 = depthFor(8);
		expect(d8.repairPasses).toBe(4);
		expect(d8.critiquePasses).toBe(4);
		expect(d8.refinementPasses).toBe(8);

		const d10 = depthFor(10);
		expect(d10.repairPasses).toBe(6);
		expect(d10.critiquePasses).toBe(6);
		expect(d10.refinementPasses).toBe(12);
	});
});
