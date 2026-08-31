import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { clampModelThinking, getModelThinkingLevels, resolveModel } from "../src/model.js";
import { parseArgs } from "../src/main.js";

/**
 * Model selection is the user's, and nothing assumes a default.
 *
 * The chain is flag → environment → the repo's saved choice, and without any
 * of them a generating command stops with directions. The specs below use an
 * unconfigured provider on purpose: resolution fails before any network call,
 * and the failure message names the spec it was handed — which is how a test
 * can tell which link in the chain won without a live provider.
 */
describe("model selection", () => {
	const saved = {
		KAIOKEN_MODEL: process.env.KAIOKEN_MODEL,
		ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
		OPENAI_API_KEY: process.env.OPENAI_API_KEY,
		OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
	};

	afterEach(() => {
		for (const [name, value] of Object.entries(saved)) {
			if (value === undefined) delete process.env[name];
			else process.env[name] = value;
		}
	});

	async function repoWith(modelJson: string | null): Promise<string> {
		const root = await mkdtemp(join(tmpdir(), "kaioken-model-"));
		if (modelJson !== null) {
			await mkdir(join(root, ".kaioken"), { recursive: true });
			await writeFile(join(root, ".kaioken", "model.json"), modelJson);
		}
		return root;
	}

	function flags(root: string, model?: string) {
		pinOffline();
		const base = parseArgs(["--root", root]);
		expect(base, "the argv fixture must parse").not.toBeNull();
		return { ...(base as NonNullable<typeof base>), model };
	}

	function pinOffline(): void {
		// Unconfigured providers fail locally — static ones are never
		// refreshed, dynamic ones refuse without credentials — so the
		// resolution outcome depends on nothing outside the process.
		delete process.env.ANTHROPIC_API_KEY;
		delete process.env.OPENAI_API_KEY;
		delete process.env.OPENROUTER_API_KEY;
	}

	function reason(resolved: Awaited<ReturnType<typeof resolveModel>>): string {
		expect(resolved.ok, JSON.stringify(resolved)).toBe(false);
		return (resolved as { reason: string }).reason;
	}

	it("stops with directions when nothing has been chosen", async () => {
		delete process.env.KAIOKEN_MODEL;
		const root = await repoWith(null);
		expect(reason(await resolveModel(flags(root)))).toContain("no model selected");
		expect(reason(await resolveModel(flags(root)))).toContain(".kaioken/model.json");
		await rm(root, { recursive: true, force: true });
	});

	it("adopts the repository's saved choice", async () => {
		delete process.env.KAIOKEN_MODEL;
		const root = await repoWith('{"model": "anthropic/claude-opus-4"}\n');
		expect(reason(await resolveModel(flags(root)))).toContain("anthropic/claude-opus-4");
		await rm(root, { recursive: true, force: true });
	});

	it("lets the environment override the repository", async () => {
		process.env.KAIOKEN_MODEL = "anthropic/claude-haiku-4-5";
		const root = await repoWith('{"model": "anthropic/claude-opus-4"}\n');
		expect(reason(await resolveModel(flags(root)))).toContain("anthropic/claude-haiku-4-5");
		await rm(root, { recursive: true, force: true });
	});

	it("lets the flag override everything", async () => {
		process.env.KAIOKEN_MODEL = "anthropic/claude-haiku-4-5";
		const root = await repoWith('{"model": "anthropic/claude-opus-4"}\n');
		expect(reason(await resolveModel(flags(root, "anthropic/claude-sonnet-4-5")))).toContain(
			"anthropic/claude-sonnet-4-5",
		);
		await rm(root, { recursive: true, force: true });
	});

	it("treats a malformed model file as no choice at all", async () => {
		delete process.env.KAIOKEN_MODEL;
		const root = await repoWith("{not json");
		expect(reason(await resolveModel(flags(root)))).toContain("no model selected");
		await rm(root, { recursive: true, force: true });
	});

	it("treats a model file without a model as no choice at all", async () => {
		delete process.env.KAIOKEN_MODEL;
		const root = await repoWith('{"theme": "light"}\n');
		expect(reason(await resolveModel(flags(root)))).toContain("no model selected");
		await rm(root, { recursive: true, force: true });
	});

	it("resolves an id typed without its provider prefix", async () => {
		// `z-ai/glm-4.5` is an OpenRouter model id: its first segment names a
		// namespace, not a provider. Resolution must land on the provider
		// whose catalog carries it — the same call the TUI's header makes —
		// and name it, so failures and cost figures point at the truth. The
		// static catalog is consulted, never the network.
		delete process.env.KAIOKEN_MODEL;
		const root = await repoWith(null);
		const argv = flags(root, "z-ai/glm-4.5");
		process.env.OPENROUTER_API_KEY = "test-key";
		const resolved = await resolveModel(argv);
		expect(resolved.ok, JSON.stringify(resolved).slice(0, 200)).toBe(true);
		expect((resolved as { describe: string }).describe).toBe("openrouter/z-ai/glm-4.5");
		await rm(root, { recursive: true, force: true });
	});

	it("detects supported thinking levels and clamps requested levels", async () => {
		const root = await repoWith(null);
		const argv = flags(root, "anthropic/claude-3-7-sonnet");
		process.env.ANTHROPIC_API_KEY = "test-key";
		const resolved = await resolveModel(argv);
		expect(resolved.ok).toBe(true);
		if (resolved.ok) {
			const levels = getModelThinkingLevels(resolved.model, resolved.ai);
			expect(levels).toBeInstanceOf(Array);
			expect(levels).toContain("high");
			expect(levels).toContain("low");
			const clamped = clampModelThinking(resolved.model, resolved.ai, "max");
			expect(levels).toContain(clamped);
		}
		await rm(root, { recursive: true, force: true });
	});
});
