import { describe, expect, it } from "vitest";
import bridgeInit, { applyKaiokenTheme } from "../index.ts";
import { fakePi as createFakePi } from "./fake-pi.ts";

describe("Phase 3: Kaioken Bridge & Grounding Tools", () => {
	it("registers all 7 grounding tools and session_start hook", async () => {
		const fake = createFakePi();
		bridgeInit(fake.pi);

		// Verify 7 tools registered
		expect(fake.tools.length).toBe(7);
		const toolNames = fake.tools.map((t) => t.name);
		expect(toolNames).toEqual([
			"kaio_symbol_lookup",
			"kaio_read_file",
			"kaio_wiki_search",
			"kaio_impact",
			"kaio_skill_load",
			"kaio_status",
			"kaio_verify",
		]);

		const labels = fake.tools.map((t) => t.label);
		expect(labels).toEqual([
			"Symbol Oracle",
			"Grounded Read",
			"Wiki/Card Search",
			"Blast Radius",
			"Load Procedure",
			"Drift Check",
			"Hard Test Gate",
		]);

		// Verify session_start hook
		expect(fake.hooks.session_start).toBeDefined();
		// Two handlers, not one: the hooks module sets the badge and widget, and
		// the extension entry point installs the custom header. They are
		// separate concerns and Pi runs both.
		expect(fake.hooks.session_start.length).toBe(2);

		let setStatusArgs: [string, string] | null = null;
		const fakeCtx = {
			ui: {
				setStatus: (id: string, text: string) => {
					setStatusArgs = [id, text];
				},
				setWidget: () => {},
			},
		};

		await fake.hooks.session_start[0]({}, fakeCtx);
		expect(setStatusArgs).toEqual(["kaioken", "grounded"]);
	});
});

/**
 * The header is drawn in whatever theme the session is using, so a Kaioken
 * theme that is *installed* but not *selected* leaves the banner in Kaioken
 * orange above a chat, diff and footer still on the built-in palette. These
 * cover the switch — and, more importantly, the cases where it must decline to
 * happen, because an extension that overrules a deliberate theme choice is
 * worse than one that leaves a mismatched banner.
 */
describe("kaioken bridge: applying the theme", () => {
	/** Set an env var for one test and put it back afterwards. */
	function withEnv(name: string, value: string | undefined, body: () => void): void {
		const previous = process.env[name];
		if (value === undefined) delete process.env[name];
		else process.env[name] = value;
		try {
			body();
		} finally {
			if (previous === undefined) delete process.env[name];
			else process.env[name] = previous;
		}
	}

	it("switches to the kaioken theme when it is installed", () => {
		const fake = createFakePi();
		bridgeInit(fake.pi);
		applyKaiokenTheme(fake.ctx(process.cwd(), { mode: "tui", theme: { name: "kaioken" } }));

		expect(fake.themeLookups).toContain("kaioken");
		expect(fake.themesApplied).toHaveLength(1);
	});

	it("applies the instance, never the name", () => {
		// `setTheme(name)` also writes the name into settings, which would
		// silently rewrite the user's theme preference as a side effect of
		// loading an extension. The instance form is session-only.
		const fake = createFakePi();
		bridgeInit(fake.pi);
		const instance = { name: "kaioken" };
		applyKaiokenTheme(fake.ctx(process.cwd(), { mode: "tui", theme: instance }));

		expect(fake.themesApplied[0]).toBe(instance);
		expect(typeof fake.themesApplied[0]).not.toBe("string");
	});

	it("does nothing when the theme is not installed", () => {
		// A checkout that never ran the build has no `.pi/themes`. Falling back
		// to a hard-coded palette would ignore whatever theme the user does have.
		const fake = createFakePi();
		bridgeInit(fake.pi);
		applyKaiokenTheme(fake.ctx(process.cwd(), { mode: "tui", theme: undefined }));

		expect(fake.themesApplied).toHaveLength(0);
	});

	it("leaves a theme the user deliberately chose alone", () => {
		withEnv("KAIOKEN_THEME_SETTING", "gruvbox", () => {
			const fake = createFakePi();
			bridgeInit(fake.pi);
			applyKaiokenTheme(fake.ctx(process.cwd(), { mode: "tui", theme: { name: "kaioken" } }));
			expect(fake.themesApplied).toHaveLength(0);
		});
	});

	it("treats Pi's default auto-setting as no preference", () => {
		// `dark/dark` is what a fresh install has. It means "follow the
		// terminal", not "I chose dark", so it is not a decision to respect.
		withEnv("KAIOKEN_THEME_SETTING", "dark/dark", () => {
			const fake = createFakePi();
			bridgeInit(fake.pi);
			applyKaiokenTheme(fake.ctx(process.cwd(), { mode: "tui", theme: { name: "kaioken" } }));
			expect(fake.themesApplied).toHaveLength(1);
		});
	});

	it("stands down entirely under KAIOKEN_THEME=0", () => {
		withEnv("KAIOKEN_THEME", "0", () => {
			const fake = createFakePi();
			bridgeInit(fake.pi);
			applyKaiokenTheme(fake.ctx(process.cwd(), { mode: "tui", theme: { name: "kaioken" } }));
			expect(fake.themesApplied).toHaveLength(0);
			// Not even looked up: the opt-out is checked before any work.
			expect(fake.themeLookups).toHaveLength(0);
		});
	});
});
