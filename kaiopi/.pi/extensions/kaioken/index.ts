import { readFile, readdir } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { TUI } from "@earendil-works/pi-tui";
import { registerCommands } from "./commands/index.ts";
import { registerHooks, setDirty } from "./hooks/index.ts";
import { registerTools } from "./tools/index.ts";
import { KaiokenHeader, playPowerOff } from "./ui/header.ts";
import type { HeaderInfo, RepoState } from "./ui/logo.ts";
import { motionFromEnv, setMotion } from "./ui/motion.ts";
import type { PaintTheme } from "./ui/theme.ts";

const VERSION = "0.1.0";

/** The theme Kaioken applies to the whole session, when it is available. */
const THEME_NAME = "kaioken";

/**
 * Switch the session to the Kaioken theme, so the palette reaches every part of
 * the TUI rather than only the header.
 *
 * The header's own colours come from the theme it is handed, so a theme that is
 * *installed but not selected* leaves the whole session — chat, tool output,
 * diffs, footer — on the built-in `dark` palette while the banner sits in
 * Kaioken orange above it. Applying it here is what makes the two agree.
 *
 * Two deliberate limits:
 *
 * - **It only applies when the theme exists.** `getTheme` returns undefined
 *   when `.pi/themes/kaioken.json` is absent — a checkout that never ran the
 *   build, or a user who deleted it. Falling back to a hard-coded palette would
 *   ignore their own choice, so nothing happens instead.
 * - **It is an instance, not a name.** `setTheme(name)` also writes the name to
 *   settings, which would silently rewrite the user's `theme` preference as a
 *   side effect of loading an extension. `setTheme(Theme)` sets it for this
 *   session only and leaves their setting alone.
 *
 * `KAIOKEN_THEME=0` opts out entirely, and a user who has explicitly picked a
 * different theme is left where they are — the extension should not overrule a
 * deliberate choice, only fill in a default.
 */
export function applyKaiokenTheme(ctx: ExtensionContext): void {
	if (process.env.KAIOKEN_THEME === "0") return;

	const instance = ctx.ui.getTheme(THEME_NAME);
	if (!instance) return;

	// Respect a deliberate choice. `dark/dark` is Pi's default auto-setting, so
	// it reads as "no preference yet" rather than as a decision.
	const configured = readConfiguredTheme();
	if (
		configured &&
		configured !== "dark/dark" &&
		configured !== THEME_NAME &&
		!configured.endsWith(`/${THEME_NAME}`)
	)
		return;

	const result = ctx.ui.setTheme(instance);
	if (!result.success) return;
	ctx.ui.setStatus("kaioken", "theme · kaioken");
}

/**
 * The theme name from Pi's own settings, or undefined when it cannot be read.
 *
 * `KAIOKEN_THEME_SETTING` overrides the file, which is what makes the
 * "do not overrule the user" branch testable without writing to a real home
 * directory.
 */
export function readConfiguredTheme(env: NodeJS.ProcessEnv = process.env): string | undefined {
	if (env.KAIOKEN_THEME_SETTING) return env.KAIOKEN_THEME_SETTING;
	try {
		const settings = JSON.parse(readFileSync(join(homedir(), ".pi", "agent", "settings.json"), "utf8"));
		return typeof settings?.theme === "string" ? settings.theme : undefined;
	} catch {
		return undefined;
	}
}

/**
 * Read what `.kaioken/` currently holds, for the header's knowledge row.
 *
 * Tolerant by design: the row is a summary, and a header that threw because an
 * artifact was mid-write would take the session down over a decoration. A
 * missing store is the normal state on a fresh clone and reads as "nothing
 * generated yet", which is the answer that most needs acting on.
 */
async function readRepoState(root: string): Promise<RepoState | undefined> {
	const state: RepoState = {};

	try {
		const scan = JSON.parse(await readFile(join(root, ".kaioken", "scan.json"), "utf8"));
		if (typeof scan?.fileCount === "number") state.files = scan.fileCount;
		else if (Array.isArray(scan?.files)) state.files = scan.files.length;
	} catch {
		// not scanned yet
	}

	try {
		const provenance = JSON.parse(
			await readFile(join(root, ".kaioken", "provenance.json"), "utf8"),
		);
		if (Array.isArray(provenance?.documents)) state.documents = provenance.documents.length;
	} catch {
		// nothing generated yet
	}

	try {
		const cards = await readdir(join(root, ".kaioken", "cards"));
		state.cards = cards.filter((name) => name.endsWith(".json")).length;
	} catch {
		// no cards yet
	}

	// Branch is best-effort and never blocks the header: a non-git directory
	// simply keeps the shorter panel.
	try {
		const head = await readFile(join(root, ".git", "HEAD"), "utf8");
		const match = /ref:\s*refs\/heads\/(.+)/.exec(head.trim());
		if (match?.[1]) state.branch = match[1].trim();
	} catch {
		// not a git checkout, or a worktree whose HEAD lives elsewhere
	}

	// Freshness answers "is this still true", so it comes from the verification
	// record rather than from anything the generator claimed.
	try {
		const verification = JSON.parse(
			await readFile(join(root, ".kaioken", "verification.json"), "utf8"),
		);
		if (Array.isArray(verification?.documents) && verification.documents.length > 0) {
			const clean = verification.documents.filter(
				(doc: { defects?: unknown[] }) => (doc.defects?.length ?? 0) === 0,
			).length;
			state.freshness = clean / verification.documents.length;
			state.stale = verification.documents.length - clean;
		}
	} catch {
		// nothing verified yet
	}

	return Object.keys(state).length > 0 ? state : undefined;
}

export default function (pi: ExtensionAPI) {
	const root = () => process.cwd();
	let lastCtx: ExtensionContext | undefined;

	// Captured from the header factory below. The shutdown event carries no TUI,
	// and the factory is the one place Pi hands one over, so this is where the
	// exit animation gets its handle.
	let tui: TUI | undefined;
	let theme: PaintTheme | undefined;
	let header: KaiokenHeader | undefined;

	/**
	 * The repo state, read once per session start and refreshed after a
	 * command rather than on every frame: it changes when something runs, not
	 * continuously, and a filesystem read at 22fps would be the most expensive
	 * thing the header did.
	 */
	let stateCache: RepoState | undefined;

	// Honour NO_COLOR / NO_MOTION / TERM=dumb once, at load, so every UI module
	// below agrees on whether to animate.
	setMotion(motionFromEnv());

	const badge = (s: string) => {
		lastCtx?.ui?.setStatus("kaioken", s);
	};

	const infoFor = (ctx: ExtensionContext | undefined): HeaderInfo => {
		const model = ctx?.model;
		return {
			version: VERSION,
			repo: ctx?.cwd ?? root(),
			model: model?.id ?? "",
			provider: model ? String(model.provider) : "",
			hasKey: Boolean(model),
		};
	};

	registerHooks(
		pi,
		root,
		(s) => badge(s),
		(ctx) => {
			lastCtx = ctx;
			// The panel reports the model, so it has to be told when the model
			// changes rather than only once at startup.
			header?.setInfo(infoFor(ctx));
		},
	);

	registerTools(pi, root, {
		onVerify: (pass: boolean) => {
			if (pass) {
				setDirty(false);
				badge("verified ✓");
			} else {
				setDirty(true);
				badge("UNVERIFIED CHANGES");
			}
		},
	});

	registerCommands(pi, root);

	// ---- the header ----
	//
	// `ui.setHeader` is the extensions API's own hook for replacing the built-in
	// masthead, so this is a supported seam rather than a patch: Pi core is never
	// forked (Invariant 1), and everything here enters through the API.
	pi.on("session_start", async (_event, ctx) => {
		stateCache = await readRepoState(ctx.cwd ?? root()).catch(() => undefined);

		// Only the TUI mode has a header to replace; print and rpc modes have no
		// terminal, and `setHeader` would be a no-op at best.
		if (ctx.mode !== "tui") return;

		applyKaiokenTheme(ctx);

		ctx.ui.setHeader((createdTui, createdTheme) => {
			tui = createdTui;
			theme = createdTheme;
			const created = new KaiokenHeader(createdTui, createdTheme, {
				info: infoFor(ctx),
				state: () => stateCache,
				busy: () => !ctx.isIdle(),
			});
			header = created;
			return created;
		});
	});

	// Keep the row honest after anything that could have generated or verified.
	pi.on("tool_execution_end", async (_event, ctx) => {
		stateCache = await readRepoState(ctx?.cwd ?? lastCtx?.cwd ?? root()).catch(() => undefined);
	});
	pi.on("agent_end", async (_event, ctx) => {
		stateCache = await readRepoState(ctx?.cwd ?? lastCtx?.cwd ?? root()).catch(() => undefined);
	});

	// ---- the curtain ----
	//
	// A CRT power-off on the way out. Only a real quit earns an animation: a
	// reload or a session swap is a transition rather than an ending, and
	// playing a power-off for one would make `/model` look like a crash.
	pi.on("session_shutdown", async (event) => {
		if (event.reason !== "quit" || !tui || !theme) return;
		await playPowerOff(tui, theme, VERSION).catch(() => null);
	});
}
