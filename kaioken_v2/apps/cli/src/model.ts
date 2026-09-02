import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { type ModelClient, type ModelRequest, withRetry } from "@kaioken/model";
import type { Flags } from "./main.js";

/**
 * Wiring the borrowed provider layer to the knowledge layer's port.
 *
 * pi-ai owns everything about talking to a model — provider catalogs, auth,
 * retries, streaming. This file is the only place that knows it exists, which is
 * what keeps every package below free of a network dependency.
 */

export type ResolvedClient =
	| { ok: true; client: ModelClient; describe: string; warning?: string }
	| { ok: false; reason: string };

/**
 * The same resolution, stopping one step earlier.
 *
 * The generative stages want a `ModelClient` — one method, no streaming, no
 * transport. The agent needs the provider objects themselves, because it drives
 * a tool-calling loop rather than a single completion. Both go through the same
 * resolution so that "no configured provider offers this model" is one message
 * with one explanation, not two that drift apart.
 */
export type ResolvedModel =
	| {
			ok: true;
			models: Awaited<
				ReturnType<typeof import("@earendil-works/pi-ai/providers/all").builtinModels>
			>;
			model: import("@earendil-works/pi-ai").Model<import("@earendil-works/pi-ai").Api>;
			ai: typeof import("@earendil-works/pi-ai");
			describe: string;
			warning?: string;
	  }
	| { ok: false; reason: string };

export async function resolveModelClient(flags: Flags): Promise<ResolvedClient> {
	const resolved = await resolveModel(flags);
	if (!resolved.ok) return resolved;

	const { models, model, ai, describe } = resolved;

	const rawClient: ModelClient = {
		async complete(request: ModelRequest): Promise<string> {
			let message: Awaited<ReturnType<typeof models.completeSimple>>;
			try {
				message = await models.completeSimple(
					model,
					{
						systemPrompt: request.system,
						messages: [{ role: "user", content: request.prompt, timestamp: Date.now() }],
					},
					{
						...(request.maxOutputTokens !== undefined
							? { maxTokens: request.maxOutputTokens }
							: {}),
						// Reasoning defaults to off, and some endpoints refuse to
						// serve a reasoning model with it disabled. "minimal" keeps
						// it enabled without paying for a long deliberation on what
						// is a structured extraction task.
						...(model.reasoning ? { reasoning: "minimal" as const } : {}),
					},
				);
			} catch (error) {
				throw new Error(describeFailure(describe, request.purpose, error));
			}
			if (message.stopReason === "error") {
				throw new Error(describeFailure(describe, request.purpose, message.errorMessage));
			}
			return ai.contentText(message.content);
		},
	};

	const client = withRetry(rawClient, {
		onRetry: (attempt, delayMs, _error, purpose) => {
			const sec = (delayMs / 1000).toFixed(delayMs % 1000 === 0 ? 0 : 1);
			process.stderr.write(`kaioken: ${purpose} retry ${attempt} in ${sec}s\n`);
		},
	});

	return {
		ok: true,
		client,
		describe,
		...(resolved.warning ? { warning: resolved.warning } : {}),
	};
}

export async function resolveModel(flags: Flags): Promise<ResolvedModel> {
	// Imported lazily so that commands which never call a model — scan, symbols,
	// search, serve, plan --check — do not pay to load a provider catalog.
	let ai: typeof import("@earendil-works/pi-ai");
	let providers: typeof import("@earendil-works/pi-ai/providers/all");
	try {
		ai = await import("@earendil-works/pi-ai");
		providers = await import("@earendil-works/pi-ai/providers/all");
	} catch (error) {
		return {
			ok: false,
			reason: `the model provider layer is not installed (${error instanceof Error ? error.message : String(error)})`,
		};
	}

	const models = providers.builtinModels();
	// No model is assumed. A coding agent bills the model it runs on, so the
	// choice is the user's: the flag, the environment, or the repo's saved
	// choice — and without one of those the command stops here with directions
	// rather than quietly spending on a default.
	const spec = flags.model ?? process.env["KAIOKEN_MODEL"] ?? (await readRepoModel(flags.root));
	if (!spec) {
		return {
			ok: false,
			reason:
				"no model selected — Kaioken assumes nothing.\n" +
				"  pass --model <provider>/<id>, or set KAIOKEN_MODEL,\n" +
				'  or write {"model": "<provider>/<id>"} to .kaioken/model.json\n' +
				"  (in the TUI: /model <provider>/<id> · /provider list shows who is configured)",
		};
	}
	const slash = spec.indexOf("/");
	if (slash === -1) {
		return { ok: false, reason: `model must be "<provider>/<model-id>", got "${spec}"` };
	}

	let providerId = spec.slice(0, slash);
	let modelId = spec.slice(slash + 1);

	// Only providers whose credentials actually resolve are offered, so an
	// unconfigured provider fails here with a usable message rather than at the
	// first request.
	let available = await models.getAvailable();
	let model = available.find((m) => m.provider === providerId && m.id === modelId);

	// A spec's first segment can name a model namespace rather than a
	// provider — an OpenRouter id typed without its `openrouter/` prefix
	// (`z-ai/glm-4.5`). When some configured provider lists the whole spec as
	// a model id, or catalogs a family under that namespace, the spec is that
	// provider's id wearing no prefix, and the true name is adopted so the
	// request, the cost figures and any failure message name the provider
	// that will actually be called. A registered first segment is never
	// second-guessed — `openrouter/auto` is the openrouter provider's own
	// model, not an id missing its prefix.
	let describe = spec;
	if (!model && !models.getProviders().some((p) => p.id === providerId)) {
		const serving =
			available.find((m) => m.id === spec) ?? available.find((m) => m.id.startsWith(`${providerId}/`));
		if (serving) {
			providerId = serving.provider;
			modelId = spec;
			describe = `${serving.provider}/${spec}`;
			model = available.find((m) => m.provider === providerId && m.id === modelId);
		}
	}

	// Dynamic providers can fetch a current list; static ones cannot, and their
	// bundled catalog is a snapshot that goes stale within weeks.
	if (!model) {
		try {
			await models.refresh({ providers: [providerId] });
			available = await models.getAvailable();
			model = available.find((m) => m.provider === providerId && m.id === modelId);
		} catch {
			// Offline or the provider refused: fall through.
		}
	}

	// Last resort for a configured provider that simply has not heard of this
	// model yet. Refusing here would mean a model released after pi-ai's last
	// release is unusable, which is a worse failure than approximate metadata —
	// the id is just a string in the request body for these APIs.
	let synthesized = false;
	if (!model) {
		model = synthesizeModel(available, providerId, modelId) ?? undefined;
		synthesized = model !== undefined;
	}

	if (!model) {
		const configured = [...new Set(available.map((m) => m.provider))].sort();
		return {
			ok: false,
			reason:
				`no configured provider offers "${spec}".\n` +
				`  configured providers: ${configured.length > 0 ? configured.join(", ") : "none"}\n` +
				"  set the provider's API key in the environment, or pass --model <provider>/<id>",
		};
	}

	return {
		ok: true,
		models,
		model,
		ai,
		describe,
		...(synthesized
			? {
					warning:
						`"${describe}" is not in the bundled model catalog; using it anyway with limits ` +
						"borrowed from the nearest known model of that provider. Token and cost " +
						"figures may be wrong.",
				}
			: {}),
	};
}

/**
 * Build a descriptor for a model the catalog does not list, by cloning the
 * closest sibling from the same provider.
 *
 * The sibling supplies everything that must be right for the request to work at
 * all — api, base url, provider id, so auth still resolves. What it cannot
 * supply accurately is context window, token limits and cost, which is why the
 * caller warns.
 */
function synthesizeModel(
	available: readonly import("@earendil-works/pi-ai").Model<
		import("@earendil-works/pi-ai").Api
	>[],
	providerId: string,
	modelId: string,
): (typeof available)[number] | null {
	const siblings = available.filter((m) => m.provider === providerId);
	if (siblings.length === 0) return null;

	// Prefer the sibling sharing the longest id prefix: the same family usually
	// means the same context window and a similar price.
	let best = siblings[0] as (typeof siblings)[number];
	let bestScore = -1;
	for (const candidate of siblings) {
		const score = commonPrefixLength(candidate.id, modelId);
		if (score > bestScore) {
			bestScore = score;
			best = candidate;
		}
	}

	return { ...best, id: modelId, name: modelId };
}

function commonPrefixLength(a: string, b: string): number {
	const limit = Math.min(a.length, b.length);
	let i = 0;
	while (i < limit && a[i] === b[i]) i++;
	return i;
}

/**
 * The model this repository has saved, if the user chose one.
 *
 * `.kaioken/model.json` — the same `.kaioken/` convention the verify gate
 * uses for its config. Every field is optional and every failure is silent:
 * an absent or malformed file just means "no saved choice", which the caller
 * reports as part of the selection chain rather than an error of its own.
 */
async function readRepoModel(root: string | undefined): Promise<string | undefined> {
	const text = await readFile(join(root ?? ".", ".kaioken", "model.json"), "utf8").catch(() => null);
	if (!text) return undefined;
	try {
		const parsed = JSON.parse(text) as { model?: unknown };
		return typeof parsed.model === "string" && parsed.model.trim() ? parsed.model.trim() : undefined;
	} catch {
		return undefined;
	}
}

/**
 * The concurrency setting this repository has saved, if any.
 *
 * `.kaioken/config.json` — {"concurrency": 4}.
 * Silent and all-optional, matching readRepoModel.
 */
export async function readRepoConcurrency(root: string | undefined): Promise<number | undefined> {
	const text = await readFile(join(root ?? ".", ".kaioken", "config.json"), "utf8").catch(() => null);
	if (!text) return undefined;
	try {
		const parsed = JSON.parse(text) as { concurrency?: unknown };
		if (typeof parsed.concurrency === "number" && Number.isFinite(parsed.concurrency) && parsed.concurrency >= 1) {
			return Math.floor(parsed.concurrency);
		}
		return undefined;
	} catch {
		return undefined;
	}
}

/**
 * Providers report failures as raw response bodies. Surfacing one of those on
 * its own leaves the user staring at a JSON blob with no idea which stage
 * failed, against which model, or what to do about it.
 */
export function describeFailure(spec: string, purpose: string, error: unknown): string {
	const raw = error instanceof Error ? error.message : String(error ?? "unknown error");
	const detail = extractProviderMessage(raw);
	const base = `${purpose} failed on ${spec}: ${detail}`;

	if (/\b401\b|unauthor|user not found|invalid api key/i.test(raw)) {
		return `${base}\n  the provider rejected the credential — check the API key for "${spec.split("/")[0]}"`;
	}
	if (/\b429\b|rate limit/i.test(raw)) {
		return `${base}\n  rate limited — retry, or lower the multiplier`;
	}
	if (/\b402\b|credit|quota|billing/i.test(raw)) {
		return `${base}\n  the account has no credit for this model`;
	}
	return base;
}

/** Pull the human-readable line out of a provider's error envelope. */
function extractProviderMessage(raw: string): string {
	const brace = raw.indexOf("{");
	if (brace !== -1) {
		try {
			const parsed = JSON.parse(raw.slice(brace)) as {
				message?: unknown;
				error?: { message?: unknown };
			};
			const message = parsed.error?.message ?? parsed.message;
			if (typeof message === "string" && message.trim()) return message.trim();
		} catch {
			// Fall through to the raw text.
		}
	}
	return raw.trim();
}

/** Get the list of supported thinking levels for a model (e.g. 3 levels vs 7 levels). */
export function getModelThinkingLevels(
	model: import("@earendil-works/pi-ai").Model<import("@earendil-works/pi-ai").Api>,
	ai: typeof import("@earendil-works/pi-ai"),
): import("@earendil-works/pi-ai").ModelThinkingLevel[] {
	return ai.getSupportedThinkingLevels(model);
}

/** Clamp a requested thinking level to the nearest supported level for a model. */
export function clampModelThinking(
	model: import("@earendil-works/pi-ai").Model<import("@earendil-works/pi-ai").Api>,
	ai: typeof import("@earendil-works/pi-ai"),
	level: string,
): import("@earendil-works/pi-ai").ModelThinkingLevel {
	return ai.clampThinkingLevel(
		model,
		level as import("@earendil-works/pi-ai").ModelThinkingLevel,
	);
}
