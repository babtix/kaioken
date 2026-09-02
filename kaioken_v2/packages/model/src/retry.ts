import type { ModelClient, ModelRequest } from "./index.js";

/**
 * Transport retry for model calls.
 *
 * Catches transient rate limits, 5xx server errors, timeouts, and network blips
 * at the client seam with exponential backoff and jitter. Content errors (such
 * as unparseable JSON or bad answers) are deliberately excluded — those belong
 * to the content repair loop.
 */

export interface RetryPolicy {
	maxAttempts: number;
	baseDelayMs: number;
	maxDelayMs: number;
	sleep: (ms: number) => Promise<void>;
	random: () => number;
	onRetry?: (attempt: number, delayMs: number, error: unknown, purpose: string) => void;
	isRetryable?: (error: unknown) => boolean;
}

const DEFAULT_POLICY: RetryPolicy = {
	maxAttempts: 4,
	baseDelayMs: 500,
	maxDelayMs: 20_000,
	sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
	random: () => Math.random(),
};

/**
 * Determine if an error represents a transient transport failure.
 *
 * Permanent errors (401 invalid credentials, 402 out of quota, 400 context length)
 * win outright and are never retried, even if they contain strings like "rate limit".
 */
export function isRetryable(error: unknown): boolean {
	const text = error instanceof Error ? `${error.name}: ${error.message}` : String(error ?? "");

	// Permanent rejection patterns — checked first and winning outright.
	if (
		/\b401\b|unauthor|user not found|invalid api key|invalid_api_key|\b402\b|credit|quota|billing|insufficient_quota|\b400\b|context[_ ]length|context_window_exceeded/i.test(
			text,
		)
	) {
		return false;
	}

	// Transient failure patterns.
	if (
		/\b429\b|rate limit|rate_limit|\b50[0234]\b|overloaded|temporarily|timed out|timeout|ETIMEDOUT|ECONNRESET|ECONNREFUSED|EAI_AGAIN|socket hang up|fetch failed/i.test(
			text,
		)
	) {
		return true;
	}

	return false;
}

export function parseRetryAfter(error: unknown): number | null {
	const text = error instanceof Error ? `${error.name}: ${error.message}` : String(error ?? "");
	// Look for Retry-After patterns, e.g. "retry-after: 5", "retry after 5s", "retry after 5 seconds"
	const match = /(?:retry-after|retry after)[:\s]+(\d+(?:\.\d+)?)\s*(?:s|sec|seconds)?\b/i.exec(text);
	if (match) {
		const seconds = Number.parseFloat(match[1] as string);
		if (Number.isFinite(seconds) && seconds > 0) {
			return Math.round(seconds * 1000);
		}
	}
	return null;
}

export function computeBackoff(attempt: number, policy: RetryPolicy, error?: unknown): number {
	const retryAfterMs = error ? parseRetryAfter(error) : null;
	if (retryAfterMs !== null) {
		return Math.min(policy.maxDelayMs, retryAfterMs);
	}
	const exp = policy.baseDelayMs * 2 ** Math.max(0, attempt - 1);
	const capped = Math.min(policy.maxDelayMs, exp);
	const jitter = 0.5 + policy.random() * 0.5;
	return Math.round(capped * jitter);
}

export function withRetry(client: ModelClient, policy?: Partial<RetryPolicy>): ModelClient {
	const fullPolicy: RetryPolicy = {
		...DEFAULT_POLICY,
		...policy,
	};
	const checkRetryable = fullPolicy.isRetryable ?? isRetryable;

	return {
		async complete(request: ModelRequest): Promise<string> {
			let lastError: unknown;

			for (let attempt = 1; attempt <= fullPolicy.maxAttempts; attempt++) {
				try {
					return await client.complete(request);
				} catch (error) {
					lastError = error;

					if (attempt >= fullPolicy.maxAttempts || !checkRetryable(error)) {
						throw error;
					}

					const delayMs = computeBackoff(attempt, fullPolicy, error);
					fullPolicy.onRetry?.(attempt, delayMs, error, request.purpose);
					await fullPolicy.sleep(delayMs);
				}
			}

			throw lastError;
		},
	};
}
