import type { ModelClient, ModelRequest } from "@kaioken/plan";
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

const DEFAULT_MODEL = "anthropic/claude-sonnet-4.5";

export async function resolveModelClient(flags: Flags): Promise<ResolvedClient> {
	const resolved = await resolveModel(flags);
	if (!resolved.ok) return resolved;

	const { models, model, ai, describe } = resolved;

	const client: ModelClient = {
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
	const spec = flags.model ?? process.env["KAIOKEN_MODEL"] ?? DEFAULT_MODEL;
	const slash = spec.indexOf("/");
	if (slash === -1) {
		return { ok: false, reason: `model must be "<provider>/<model-id>", got "${spec}"` };
	}

	const providerId = spec.slice(0, slash);
	const modelId = spec.slice(slash + 1);

	// Only providers whose credentials actually resolve are offered, so an
	// unconfigured provider fails here with a usable message rather than at the
	// first request.
	let available = await models.getAvailable();
	let model = available.find((m) => m.provider === providerId && m.id === modelId);

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
		describe: spec,
		...(synthesized
			? {
					warning:
						`"${spec}" is not in the bundled model catalog; using it anyway with limits ` +
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
