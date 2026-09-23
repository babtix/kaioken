import { dim, fg } from "./theme.js";

/**
 * The provider catalog, read from pi-ai.
 *
 * `/provider` is a TUI-level command: the engine never learns a provider
 * name — it takes a `--model <provider>/<id>` spec — so a switch is the shell
 * retargeting its own session. That needs two facts: who is configured, and
 * what models each provider offers. pi-ai already owns both (its auth layer
 * resolves credentials, its catalog carries the models), so this reads them
 * rather than keeping a second opinion that would drift.
 */

/** One provider, as the `/provider` surface reports it. */
export interface ProviderInfo {
	/** The id a model spec's first segment names, e.g. "openrouter". */
	id: string;
	/** Display name; pi-ai defaults it to the id when none is shipped. */
	name: string;
	/** Where the credential resolved from, e.g. "OPENROUTER_API_KEY". */
	authSource?: string;
	/** Model ids in the catalog's current snapshot. */
	models: string[];
}

/**
 * Every registered provider, with its auth state and catalog.
 *
 * `checkAuth` is a local credential check, not a network call, so this is
 * cheap enough for a command — but it does load pi-ai's provider registry,
 * which is why it happens here, on demand, rather than at startup.
 */
export async function listProviders(): Promise<ProviderInfo[]> {
	const { builtinModels } = await import("@earendil-works/pi-ai/providers/all");
	const models = builtinModels();
	const infos = await Promise.all(
		models.getProviders().map(async (provider) => {
			const auth = await models.checkAuth(provider.id);
			return {
				id: provider.id,
				name: provider.name,
				models: models.getModels(provider.id).map((model) => model.id),
				...(auth ? { authSource: auth.source } : {}),
			};
		}),
	);
	// Configured first: the question "what can I switch to right now" is
	// answered by the top of the list, not by hunting for a checkmark.
	return infos.sort(
		(a, b) => Number(!a.authSource) - Number(!b.authSource) || a.id.localeCompare(b.id),
	);
}

/**
 * Conventional credential env vars, for the error line when a provider has
 * none resolved. pi-ai reports the source only for providers that resolved;
 * these are the ones its own auth layer reads, so the hint names a variable
 * that will actually work.
 */
const ENV_HINTS: Record<string, string> = {
	openrouter: "OPENROUTER_API_KEY",
	anthropic: "ANTHROPIC_API_KEY",
	openai: "OPENAI_API_KEY",
	groq: "GROQ_API_KEY",
	together: "TOGETHER_API_KEY",
	deepseek: "DEEPSEEK_API_KEY",
	mistral: "MISTRAL_API_KEY",
	fireworks: "FIREWORKS_API_KEY",
	xai: "XAI_API_KEY",
	cerebras: "CEREBRAS_API_KEY",
};

/** What to set to make this provider work. */
export function credentialHint(info: ProviderInfo): string {
	return info.authSource ?? ENV_HINTS[info.id] ?? "its API key in the environment";
}

/**
 * The model a switch lands on when the current spec cannot follow.
 *
 * The catalog's order is the provider's own, and the pick is announced in the
 * transcript with the catalogue size, so a wrong default is one `/model` away
 * from being visible and correctable rather than a mystery.
 */
export function pickDefaultModel(ids: readonly string[]): string {
	return ids[0] as string;
}

/**
 * The `/models` listing.
 *
 * Without a filter this is the active provider's catalog; with one it sweeps
 * every configured provider, since the question "which of my providers has a
 * reasoning model" spans them all. Rows carry the full spec because that is
 * exactly what `/model` and `--model` accept.
 */
export function modelLines(infos: readonly ProviderInfo[], filter: string, active: string): string[] {
	const configured = infos.filter((info) => info.authSource);
	if (configured.length === 0) {
		return ["no provider is configured — /provider list shows what this engine knows"];
	}

	// `active` is a full spec; the provider it names scopes the unfiltered view.
	const activeProvider = active ? active.slice(0, active.indexOf("/")) : "";
	const scope = filter
		? `matching "${filter}" across ${configured.length} configured provider(s)`
		: activeProvider
			? `${activeProvider} — /models <text> to search every configured provider`
			: `across ${configured.length} configured provider(s)`;
	const lines: string[] = [`models ${scope}:`];

	const capped = 50;
	let shown = 0;
	let hidden = 0;
	for (const info of configured) {
		// Unfiltered means "this provider's catalog"; a filter sweeps them all.
		if (!filter && activeProvider && info.id !== activeProvider) continue;
		for (const id of info.models) {
			const spec = `${info.id}/${id}`;
			if (filter && !spec.toLowerCase().includes(filter) && !info.id.includes(filter)) continue;
			if (shown >= capped) {
				hidden++;
				continue;
			}
			const mark = spec === active ? ` ${fg("ok", "· active")}` : "";
			lines.push(`  ${dim(spec)}${mark}`);
			shown++;
		}
	}
	if (shown === 0) lines.push(dim(`  nothing ${filter ? `matching "${filter}"` : "in the catalog"}`));
	if (hidden > 0) lines.push(dim(`  … and ${hidden} more — narrow with /models <text>`));
	return lines;
}

/**
 * The provider a model spec actually runs on, when that is not its first
 * segment.
 *
 * A spec's first segment usually names the provider — but an OpenRouter id
 * carries a namespace of its own (`z-ai/glm-4.5`), and typing it without the
 * `openrouter/` prefix leaves a first segment that names no provider at all.
 * When every configured provider says no but one of them lists the whole spec
 * as a model id — or catalogs a family under that namespace — the spec is
 * that provider's id wearing no prefix, and the true provider is returned.
 * `null` means the spec already names a registered provider (or matches
 * nothing, which the turn itself will report); choosing is not this
 * function's job.
 */
export function resolveModelSpec(
	infos: readonly ProviderInfo[],
	spec: string,
	active?: string,
): { provider: string; model: string } | null {
	const head = spec.slice(0, spec.indexOf("/"));
	if (!head) return null;
	// A registered provider id is never second-guessed: `openai/gpt-5` means
	// the openai provider even when OpenRouter catalogs the same family.
	if (infos.some((info) => info.id === head)) return null;

	const configured = infos.filter((info) => info.authSource);
	// Exact first — a catalog hit is proof; the namespace fallback below
	// covers ids newer than the catalog's snapshot.
	const exact = configured.filter((info) => info.models.includes(spec));
	const serving =
		exact.length > 0 ? exact : configured.filter((info) => info.models.some((id) => id.startsWith(`${head}/`)));
	if (serving.length === 0) return null;

	// Several providers can carry the same namespace; the active one wins so
	// a prefix never silently moves the traffic to another bill.
	const activeProvider = active ? active.slice(0, active.indexOf("/")) : "";
	const pick = serving.find((info) => info.id === activeProvider) ?? serving[0];
	if (!pick) return null;
	return { provider: pick.id, model: spec };
}

/**
 * The environment variable a provider reads its key from.
 *
 * pi-ai's auth layer resolves credentials from these same names; the table
 * covers the providers whose variables are conventional, and the rest follow
 * the uppercase convention closely enough to be worth naming rather than
 * giving up on.
 */
export function envVarFor(provider: string): string {
	return ENV_HINTS[provider] ?? `${provider.toUpperCase().replace(/-/g, "_")}_API_KEY`;
}

/**
 * The `/provider` listing.
 *
 * All providers, not only the configured ones: "who could I configure" is
 * half the question, and a list that hides the rest turns the command into a
 * guess. The active provider is named even when it has no credentials — that
 * mismatch is exactly what the row should expose.
 */
export function providerLines(infos: readonly ProviderInfo[], active: string): string[] {
	const lines: string[] = [];
	if (infos.length === 0) {
		return [`no providers registered — the engine's provider layer is missing`];
	}
	lines.push(`provider: ${active || "none"} — /provider <name> to switch`);
	for (const info of infos) {
		if (info.authSource) {
			const activeMark = info.id === active ? ` ${fg("ok", "· active")}` : "";
			lines.push(
				`  ${fg("ok", "✓")} ${dim(info.id)} ${dim("·")} ${dim(info.authSource)} ${dim("·")} ${dim(
					`${info.models.length} models`,
				)}${activeMark}`,
			);
		} else {
			lines.push(`  ${fg("error", "✗")} ${dim(info.id)} ${dim("·")} ${dim(`set ${credentialHint(info)}`)}`);
		}
	}
	if (infos.every((info) => !info.authSource)) {
		lines.push(dim("no provider is configured — /key sets one for this session"));
	}
	return lines;
}
