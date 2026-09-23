/**
 * The Pi transport behind the Kaioken model port.
 *
 * This is the only file in the offline core that knows a model transport exists,
 * and even it does not know how to authenticate: the caller injects a ready
 * `Models` instance, so credentials, `models.json` and the cost registry stay in
 * Pi's hands (Invariant 2 — the core never reads a key).
 *
 * Because the dependency is injected rather than imported as a singleton, tests
 * drive the whole generative pipeline with a stub, which is what keeps
 * "a stage that needs a key to be tested is designed wrong" true (Invariant 10).
 */

import type { Api, Model, Models, ThinkingLevel } from "@earendil-works/pi-ai";
import { contentText } from "@earendil-works/pi-ai";
import type { ModelClient, ModelRequest } from "./port.ts";

export interface RetryPolicy {
	/** Maximum number of retry attempts on rate limit or transient errors. Defaults to 3. */
	maxRetries?: number;
	/** Initial backoff delay in ms. Defaults to 500ms. */
	initialDelayMs?: number;
	/** Maximum backoff delay cap in ms. Defaults to 10,000ms. */
	maxDelayMs?: number;
	/** Exponential multiplier. Defaults to 2. */
	backoffFactor?: number;
	/** Optional sleep implementation, injectable for fast unit tests. */
	sleep?: (ms: number) => Promise<void>;
}

export interface PiAiClientOptions {
	/** Provider id as registered in Pi, e.g. `antigravity`. */
	provider: string;
	/** Model id as registered in Pi, e.g. `gemini-3.8-flash-high`. */
	model: string;
	/** Reasoning effort. Omitted lets the provider default stand. */
	reasoning?: ThinkingLevel;
	/** Sampling temperature. Omitted lets the provider default stand. */
	temperature?: number;
	/** Retry and backoff configuration for rate-limit and network resilience. */
	retry?: RetryPolicy;
}

export class ModelUnavailableError extends Error {
	constructor(provider: string, model: string, hint: string) {
		super(`model "${provider}/${model}" is unavailable: ${hint}`);
		this.name = "ModelUnavailableError";
	}
}

function isRetryable(msg: string): boolean {
	const lower = msg.toLowerCase();
	return (
		lower.includes("429") ||
		lower.includes("rate limit") ||
		lower.includes("ratelimit") ||
		lower.includes("too many requests") ||
		lower.includes("resource_exhausted") ||
		lower.includes("quota") ||
		lower.includes("overloaded") ||
		lower.includes("503") ||
		lower.includes("502") ||
		lower.includes("504") ||
		lower.includes("timeout") ||
		lower.includes("timed out") ||
		lower.includes("etimedout") ||
		lower.includes("econnreset") ||
		lower.includes("econnrefused") ||
		lower.includes("fetch failed") ||
		lower.includes("network")
	);
}

export class PiAiClient implements ModelClient {
	private readonly models: Models;
	private readonly options: PiAiClientOptions;

	constructor(models: Models, options: PiAiClientOptions) {
		this.models = models;
		this.options = options;
	}

	/** Resolve the configured model, or explain precisely why it is not usable. */
	resolveModel(): Model<Api> {
		const { provider, model } = this.options;
		let resolved: Model<Api> | undefined;
		try {
			resolved = this.models.getModel(provider, model);
		} catch (error) {
			throw new ModelUnavailableError(provider, model, `lookup threw: ${(error as Error).message}`);
		}
		if (!resolved) {
			const known = this.models
				.getModels(provider)
				.map((m) => m.id)
				.join(", ");
			throw new ModelUnavailableError(
				provider,
				model,
				known
					? `provider "${provider}" offers: ${known}`
					: `provider "${provider}" is unknown or declares no models`,
			);
		}
		return resolved;
	}

	async complete(request: ModelRequest): Promise<string> {
		const retry = this.options.retry ?? {};
		const maxRetries = retry.maxRetries ?? 3;
		const initialDelay = retry.initialDelayMs ?? 500;
		const maxDelay = retry.maxDelayMs ?? 10_000;
		const factor = retry.backoffFactor ?? 2;
		const sleepFn = retry.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));

		let attempt = 0;
		let delay = initialDelay;

		while (true) {
			attempt++;
			try {
				const model = this.resolveModel();
				const context = {
					systemPrompt: request.system,
					messages: [{ role: "user" as const, content: request.prompt, timestamp: Date.now() }],
				};
				const options = {
					...(request.maxOutputTokens === undefined ? {} : { maxTokens: request.maxOutputTokens }),
					...(this.options.reasoning === undefined ? {} : { reasoning: this.options.reasoning }),
					...(this.options.temperature === undefined ? {} : { temperature: this.options.temperature }),
				};

				if (request.onChunk && typeof this.models.stream === "function") {
					const eventStream = this.models.stream(model, context, options);
					for await (const event of eventStream) {
						if (event.type === "text_delta" && event.delta) {
							request.onChunk(event.delta);
						}
					}
					const message = await eventStream.result();
					if (message.stopReason === "error" || message.stopReason === "aborted") {
						const detail =
							message.diagnostics
								?.map((d) => d.error?.message ?? d.type)
								.filter(Boolean)
								.join("; ") || "no diagnostics";
						const err = new Error(
							`model call for stage "${request.purpose}" ended with ${message.stopReason}: ${detail}`,
						);
						if (attempt <= maxRetries && isRetryable(err.message)) {
							const jitter = Math.random() * 0.3 * delay;
							await sleepFn(Math.min(delay + jitter, maxDelay));
							delay *= factor;
							continue;
						}
						throw err;
					}
					return contentText(message.content);
				}

				const message = await this.models.complete(model, context, options);

				if (message.stopReason === "error" || message.stopReason === "aborted") {
					const detail =
						message.diagnostics
							?.map((d) => d.error?.message ?? d.type)
							.filter(Boolean)
							.join("; ") || "no diagnostics";
					const err = new Error(
						`model call for stage "${request.purpose}" ended with ${message.stopReason}: ${detail}`,
					);
					if (attempt <= maxRetries && isRetryable(err.message)) {
						const jitter = Math.random() * 0.3 * delay;
						await sleepFn(Math.min(delay + jitter, maxDelay));
						delay *= factor;
						continue;
					}
					throw err;
				}

				const text = contentText(message.content);
				if (request.onChunk) {
					request.onChunk(text);
				}
				return text;
			} catch (err: unknown) {
				const errorMsg = err instanceof Error ? err.message : String(err);
				if (attempt <= maxRetries && isRetryable(errorMsg)) {
					const jitter = Math.random() * 0.3 * delay;
					await sleepFn(Math.min(delay + jitter, maxDelay));
					delay *= factor;
					continue;
				}
				throw err;
			}
		}
	}

	async completeStream(request: ModelRequest, onChunk: (chunk: string) => void): Promise<string> {
		return this.complete({ ...request, onChunk });
	}
}
