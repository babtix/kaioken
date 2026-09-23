/**
 * Bounded concurrency pools for model and async operations.
 */

export const DEFAULT_CONCURRENCY = 4;
export const FREE_TIER_CONCURRENCY = 2;

/**
 * Check whether a model spec indicates a free-tier endpoint.
 * E.g. "openrouter/google/gemini-2.0-flash:free", "openrouter/free", etc.
 */
export function isFreeModel(spec: string): boolean {
	const text = spec.toLowerCase();
	return text.includes(":free") || text.includes("/free") || text.endsWith("-free");
}

/**
 * Calculate effective concurrency, clamping free models to avoid rate limits.
 */
export function effectiveConcurrency(
	requested: number | undefined,
	modelSpec: string,
): { limit: number; clamped: boolean } {
	const base = requested !== undefined && Number.isFinite(requested) && requested >= 1
		? Math.floor(requested)
		: DEFAULT_CONCURRENCY;

	if (isFreeModel(modelSpec) && base > FREE_TIER_CONCURRENCY) {
		return { limit: FREE_TIER_CONCURRENCY, clamped: true };
	}

	return { limit: base, clamped: false };
}

/**
 * Execute an async mapping over items with concurrency bounded by limit.
 * If any item fails, rejects with the first error.
 * Preserves input ordering in the returned array.
 */
export async function mapLimit<T, R>(
	items: readonly T[],
	limit: number,
	fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
	if (items.length === 0) return [];
	const bound = Math.max(1, Math.min(limit, items.length));
	const results: R[] = new Array(items.length);
	let next = 0;

	const worker = async (): Promise<void> => {
		while (true) {
			const i = next++;
			if (i >= items.length) return;
			results[i] = await fn(items[i] as T, i);
		}
	};

	await Promise.all(Array.from({ length: bound }, () => worker()));
	return results;
}

/**
 * Execute an async mapping over items with concurrency bounded by limit, settling all promises.
 * Preserves input ordering in the returned array.
 */
export async function mapLimitSettled<T, R>(
	items: readonly T[],
	limit: number,
	fn: (item: T, index: number) => Promise<R>,
): Promise<Array<PromiseSettledResult<R>>> {
	if (items.length === 0) return [];
	const bound = Math.max(1, Math.min(limit, items.length));
	const results: Array<PromiseSettledResult<R>> = new Array(items.length);
	let next = 0;

	const worker = async (): Promise<void> => {
		while (true) {
			const i = next++;
			if (i >= items.length) return;
			try {
				const value = await fn(items[i] as T, i);
				results[i] = { status: "fulfilled", value };
			} catch (reason) {
				results[i] = { status: "rejected", reason };
			}
		}
	};

	await Promise.all(Array.from({ length: bound }, () => worker()));
	return results;
}
