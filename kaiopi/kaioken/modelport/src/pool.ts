/**
 * Bounded concurrency pools.
 *
 * Kept in the port rather than the transport: the wiki cascade is the only
 * caller, and bounding fan-out is a property of the pipeline, not of any one
 * provider. Nothing here knows a network exists.
 */

export const DEFAULT_CONCURRENCY = 4;
export const FREE_TIER_CONCURRENCY = 2;

/**
 * Does a model spec indicate a free-tier endpoint?
 * e.g. "openrouter/google/gemini-2.0-flash:free", "openrouter/free".
 */
export function isFreeModel(spec: string): boolean {
	const text = spec.toLowerCase();
	return text.includes(":free") || text.includes("/free") || text.endsWith("-free");
}

/** Clamp concurrency for free models, which rate-limit aggressively. */
export function effectiveConcurrency(
	requested: number | undefined,
	modelSpec: string,
): { limit: number; clamped: boolean } {
	const base =
		requested !== undefined && Number.isFinite(requested) && requested >= 1
			? Math.floor(requested)
			: DEFAULT_CONCURRENCY;

	if (isFreeModel(modelSpec) && base > FREE_TIER_CONCURRENCY) {
		return { limit: FREE_TIER_CONCURRENCY, clamped: true };
	}

	return { limit: base, clamped: false };
}

/**
 * Map over items with concurrency bounded by `limit`, rejecting on the first
 * failure. Input ordering is preserved in the result.
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
 * Map over items with concurrency bounded by `limit`, settling every promise.
 * Input ordering is preserved in the result.
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
