import { findCommand } from "./commands.js";
import { explainLines, helpLines, tutorialLines } from "./manual.js";
import { infoLine, errorLine, okLine, warnLine, type Line } from "./transcript.js";
import { bold, dim, fg, setTheme, themeName, THEME_NAMES } from "./theme.js";
import { statusPanel, type HeaderInfo } from "./logo.js";
import { HIGH_POWER, powerBand, powerMeter } from "./motion.js";

/**
 * Command execution.
 *
 * v1's `dispatch`: parse `/name args`, echo the input, run it, append the
 * result to the transcript. Kept apart from `app.ts` so that what a command
 * *does* can be tested without a terminal — the shell only supplies the
 * session it acts on.
 *
 * The commands v2's engine actually backs run for real, through the same code
 * paths `kaioken <command>` uses. The rest report plainly that they are not
 * wired up yet. A command that silently did nothing, or printed a plausible
 * result it did not compute, would be worse than one that says so.
 */

/** What a command may read and change. The shell owns the real values. */
export interface Session {
	root: string;
	version: string;
	model: string;
	provider: string;
	hasKey: boolean;
	autoApprove: boolean;
	/** The agent's permission preset: build, plan, general, explore, review. */
	mode: string;
	/** Thinking depth: off, minimal, low, medium, high, xhigh, max. */
	thinking: string;
	/** Thinking visibility: show (expanded stream) or hide (compact 1-line summary). */
	thinkingVisibility?: "show" | "hide";
	/** Steering notes injected into generation prompts. */
	notes: string[];
	/** Messages typed while busy, sent in order once the turn completes. */
	queued: string[];
	/** The wiki browser's URL while it is running. */
	serveUrl: string | null;
}

/** What running a command asks the shell to do. */
export interface DispatchResult {
	/** Lines to append to the transcript. */
	lines: Line[];
	/** Clear the transcript first (`/clear`). */
	clear?: boolean;
	/** Leave (`/quit`). */
	quit?: boolean;
	/** Reprint the status panel — the header has scrolled out of reach. */
	reprintPanel?: boolean;
	/** Run this engine command in the background and stream its output. */
	run?: EngineRun;
	/** Prompt for an API key with the echo hidden. */
	promptKey?: boolean;
	/**
	 * An API key typed inline. The shell stores it — dispatch never touches
	 * the environment itself — and marks the session as keyed.
	 */
	inlineKey?: string;
	/** Stop whatever is running. */
	stop?: boolean;
	/**
	 * Confirm before running. DESIGN.md §6.3 requires an explicit yes above the
	 * high-power threshold, where a run costs 15-30x the baseline in calls.
	 */
	confirm?: string;
	/** A transient confirmation for the status row, rather than a whole line. */
	flash?: string;
	/**
	 * A `/provider` request. Listing needs pi-ai's catalog and switching
	 * retargets the session from it, so both are the shell's to perform —
	 * dispatch only settles the argument's shape.
	 */
	providers?: ProviderAction;
	/**
	 * A `/model <provider>/<id>` was accepted. The session already holds it;
	 * the shell also saves it to `.kaioken/model.json` so the choice outlives
	 * the session and the CLI's own commands run on the same model.
	 */
	persistModel?: boolean;
	/**
	 * A `/theme` switch was accepted. The shell writes it to
	 * `.kaioken/theme.json`, which is what the command's own help has always
	 * said happens.
	 */
	persistTheme?: boolean;
	/** Actions related to session management and persistence. */
	sessionAction?: {
		kind: "list" | "info" | "resume" | "switch" | "new" | "fork" | "compact" | "import";
		arg?: string;
	};
	/** Utility actions handled by the shell. */
	utilAction?: {
		kind: "diff" | "copy" | "cost";
		arg?: string;
	};
	/**
	 * `/repo <path>` — point the session at a different repository.
	 *
	 * Dispatch settles nothing but the argument: whether the path is a
	 * repository, and what has to be rebuilt once it is, are the shell's, which
	 * is the only thing holding the caches keyed to the old root.
	 */
	repoAction?: { path: string };
	/**
	 * `/tree` and `/undo` — the two commands about going back.
	 *
	 * Both are the shell's: one walks the saved sessions it owns, the other
	 * restores files from the journal it wrote at approval time.
	 */
	historyAction?:
		| { kind: "tree"; branch: string; summarize: boolean }
		| { kind: "undo"; steps: number };
	/**
	 * `/templates`, and `/t:<name>` — list the repository's prompt templates,
	 * or expand one and send it as an ordinary message.
	 */
	templateAction?: { kind: "list" } | { kind: "run"; name: string; args: string };
}

/**
 * The leading xN dial, if the arguments carry one.
 *
 * `x3` is the Kaioken multiplier every generating command takes. Reading it
 * here rather than in the shell means the power meter and the confirmation
 * threshold are decided in one place, next to each other.
 */
export function multiplierOf(args: readonly string[]): number | null {
	for (const arg of args) {
		const match = /^x(\d{1,2})$/i.exec(arg);
		if (match) {
			const value = Number(match[1]);
			if (value >= 1 && value <= 10) return value;
		}
	}
	return null;
}

/** An engine command to run, named the way the CLI names it. */
export interface EngineRun {
	command: string;
	args: string[];
	/** What the status line says while it runs. */
	busyText: string;
	/**
	 * The command reads the active conversation.
	 *
	 * The shell saves it first and passes its id: the engine reads sessions off
	 * disk, so a briefing of "the current session" has to be a briefing of a
	 * session that has actually been written down.
	 */
	needsSession?: boolean;
	/** The shell appends the session's steering notes as `--note` arguments. */
	withNotes?: boolean;
	/**
	 * The model to run it with, filled in by the shell from the session.
	 *
	 * The CLI falls back to `$KAIOKEN_MODEL` and then its own default, so a
	 * TUI launched with `--model` would otherwise run every generating
	 * command on a model the header does not show.
	 */
	model?: string;
}

/** What a `/provider`, `/models` or `/model` line asks the shell to do. */
export type ProviderAction =
	| { kind: "list" }
	| { kind: "switch"; name: string }
	| { kind: "models"; filter: string }
	| { kind: "model"; spec: string };

/**
 * The commands v2's engine backs, and the CLI verb each maps to.
 *
 * A table rather than a switch arm apiece because the mapping is the whole
 * content: every one of these is "run the CLI command of the same name in
 * this repo, and put its output in the transcript".
 */
const ENGINE_COMMANDS: Record<
	string,
	{ verb: string; busy: string; needsSession?: boolean; withNotes?: boolean }
> = {
	scan: { verb: "scan", busy: "scanning the repository" },
	plan: { verb: "plan", busy: "planning modules" },
	cards: { verb: "cards", busy: "generating knowledge cards" },
	wiki: { verb: "wiki", busy: "generating the wiki" },
	update: { verb: "update", busy: "refreshing from the diff" },
	status: { verb: "status", busy: "checking freshness" },
	research: { verb: "research", busy: "researching" },
	verify: { verb: "verify", busy: "running the gate" },
	serve: { verb: "serve", busy: "starting the browser" },
	publish: { verb: "export", busy: "rendering the site" },
	graph: { verb: "graph", busy: "deriving the knowledge graph" },
	init: { verb: "init", busy: "setting the repository up" },
	onboard: { verb: "onboard", busy: "writing ONBOARDING.md" },
	hook: { verb: "hook", busy: "updating the git hook" },
	draft: { verb: "draft", busy: "drafting the commit message", withNotes: true },
	handoff: { verb: "handoff", busy: "writing the handoff briefing", needsSession: true, withNotes: true },
	learn: { verb: "learn", busy: "distilling the session", needsSession: true, withNotes: true },
	skills: { verb: "skills", busy: "writing task guides", withNotes: true },
	impact: { verb: "impact", busy: "predicting the blast radius" },
	fetcher: { verb: "fetcher", busy: "checking the page reader" },
	prism: { verb: "prism", busy: "asking the imported corpus" },
	ext: { verb: "ext", busy: "managing extensions" },
};

/**
 * Run one command line.
 *
 * `raw` is what the user typed, leading slash included. Mutating `session` is
 * how a command changes state; everything else it wants is a field on the
 * result, so the shell stays the only thing that touches the terminal.
 */
export function dispatch(raw: string, session: Session, width = 78): DispatchResult {
	const body = raw.trim().replace(/^\//, "");
	const fields = body.split(/\s+/).filter(Boolean);
	// A lone slash, or a slash with nothing but whitespace after it. There is
	// no command to run, but the input was echoed, so returning nothing leaves
	// a prompt line with no reply under it.
	if (fields.length === 0) return { lines: [infoLine("no command — /help lists what this engine runs")] };

	const typed = (fields[0] as string).toLowerCase();
	const rest = body.slice((fields[0] as string).length).trim();
	const args = fields.slice(1);

	// Resolve aliases through the registry rather than listing them again in
	// every case arm. v1 duplicated them and `/usage` still reached `/cost`
	// only because someone remembered to add it in both places; here the
	// registry is the one place an alias exists.
	// `/t:<name>` is a template invocation rather than a command: the part
	// after the colon names a file, so it can never be resolved against the
	// registry, and matching it here keeps `/t` from being reported as unknown.
	if (typed.startsWith("t:")) {
		const template = typed.slice(2);
		if (!template) {
			return { lines: [errorLine("/t:<name> needs a template name — /templates lists them")] };
		}
		return { lines: [], templateAction: { kind: "run", name: template, args: rest } };
	}

	const name = findCommand(typed)?.name ?? typed;

	switch (name) {
		case "help":
			return { lines: helpLines() };

		case "tutorial":
			return { lines: tutorialLines(rest) };

		case "explain":
			return { lines: explainLines(rest) };

		case "quit":
			return { lines: [infoLine("bye")], quit: true };

		case "clear":
			return { lines: [], clear: true };

		case "version":
			return { lines: [`Kaioken v${session.version}  (node ${process.versions.node}, ${process.platform}/${process.arch})`] };

		case "stop":
			return { lines: [], stop: true };

		case "config":
			return { lines: configLines(session) };

		case "theme": {
			const lines = doTheme(rest);
			// A palette switch is visible the instant it happens; a permanent
			// line about it is clutter, so it flashes and goes.
			return rest.trim() && setTheme(rest.trim().toLowerCase())
				? { lines: [], flash: `theme → ${themeName()}`, persistTheme: true }
				: { lines };
		}

		case "yolo":
			session.autoApprove = !session.autoApprove;
			// This one keeps its transcript line as well as the flash: turning
			// off the approval prompt is not a preference, it is a decision
			// worth being able to scroll back and find.
			return {
				lines: [
					session.autoApprove
						? warnLine("auto-approve ON — edits and commands will NOT ask first")
						: okLine("auto-approve OFF — every edit and command asks first"),
				],
				flash: session.autoApprove ? "auto-approve ON" : "auto-approve OFF",
			};

		case "mode":
			return { lines: doMode(rest, session) };

		case "thinking":
			return { lines: doThinking(rest, session) };

		case "notes":
			return { lines: doNotes(args, rest, session) };

		case "queue":
			return { lines: doQueue(rest, session) };

		case "key":
			// A key typed inline is already on screen; a blank /key opens the
			// hidden prompt, which is the only way to enter one unobserved.
			// The value travels back as `inlineKey` — dispatch has no business
			// touching the environment, but silently dropping it would leave
			// the session claiming a key it never stored.
			return rest
				? { lines: [okLine("key set for this session")], inlineKey: rest, reprintPanel: true }
				: { lines: [], promptKey: true };

		case "model": {
			// The picker and the catalog dump stay engine-side and say so. The
			// spec's shape is settled here; whether its first segment names the
			// provider or a model namespace (an OpenRouter id typed without
			// its prefix) needs the catalog, so the shell applies it.
			const spec = rest.trim();
			// Bare `/model` reports rather than opening a picker, and `/model
			// list` is the catalog `/models` already renders. Both used to say
			// the capability was missing, which was true of a picker and false
			// of everything the command actually does.
			if (!spec) {
				return {
					lines: [
						infoLine(`model: ${session.model || "none selected"} · provider: ${session.provider || "none"}`),
						dim("  /model <provider>/<model-id> sets one · /models lists the catalog"),
					],
				};
			}
			if (spec.toLowerCase() === "list") {
				return { lines: [], providers: { kind: "models", filter: "" } };
			}
			// The spec's first segment is the provider: everything after the
			// first slash belongs to the id, which is why openrouter ids with
			// slashes of their own still parse. A bare id cannot be told apart
			// from a short spec, so it is refused rather than guessed at.
			const slash = spec.indexOf("/");
			const provider = slash === -1 ? "" : spec.slice(0, slash);
			const id = slash === -1 ? "" : spec.slice(slash + 1);
			if (!provider || !id) {
				return {
					lines: [
						errorLine(`models are "<provider>/<model-id>" — e.g. ${session.provider || "openrouter"}/${spec}`),
					],
				};
			}
			return { lines: [], providers: { kind: "model", spec } };
		}

		case "models": {
			// The catalog lives in pi-ai's registry; the shell renders it. Only
			// the argument is settled here.
			return { lines: [], providers: { kind: "models", filter: rest.trim().toLowerCase() } };
		}

		case "provider": {
			// The switch itself is the shell's to perform: it needs pi-ai's
			// catalog to say who is configured and what to retarget the model
			// to. What dispatch can settle here is the argument's shape.
			const name = rest.trim().toLowerCase();
			if (!name || name === "list") return { lines: [], providers: { kind: "list" } };
			if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) {
				return { lines: [errorLine(`"${name}" is not a provider id — /provider list shows them`)] };
			}
			return { lines: [], providers: { kind: "switch", name } };
		}

		case "new":
			return { lines: [], sessionAction: { kind: "new" } };

		case "sessions":
			return { lines: [], sessionAction: { kind: "list" } };

		case "session":
			return { lines: [], sessionAction: { kind: "info" } };

		case "resume":
			return { lines: [], sessionAction: { kind: "resume", arg: rest.trim() } };

		case "switch":
			return { lines: [], sessionAction: { kind: "switch", arg: rest.trim() } };

		case "fork":
			return { lines: [], sessionAction: { kind: "fork", arg: rest.trim() } };

		case "compact":
			return { lines: [], sessionAction: { kind: "compact" } };

		case "import":
			if (!rest.trim()) return { lines: [errorLine("/import needs a file path to import")] };
			return { lines: [], sessionAction: { kind: "import", arg: rest.trim() } };

		case "diff":
			return { lines: [], utilAction: { kind: "diff" } };

		case "copy":
			return { lines: [], utilAction: { kind: "copy" } };

		case "cost":
		case "usage":
			return { lines: [], utilAction: { kind: "cost" } };

		case "tree": {
			const first = (args[0] ?? "").trim();
			const summarize = args.some((arg) => arg.toLowerCase() === "summarize");
			return { lines: [], historyAction: { kind: "tree", branch: first, summarize } };
		}

		case "undo": {
			const raw = (args[0] ?? "").trim();
			const steps = raw ? Number.parseInt(raw, 10) : 1;
			if (raw && (!Number.isInteger(steps) || steps < 1 || steps > 50)) {
				return { lines: [errorLine("/undo takes a step count from 1 to 50")] };
			}
			return { lines: [], historyAction: { kind: "undo", steps: steps || 1 } };
		}

		case "x": {
			// `/x` is a shorthand for one engine subcommand rather than a verb
			// of its own: with no arguments it lists what an extension offers,
			// and with them it runs one command in the sandbox.
			if (args.length === 0) {
				return {
					lines: [
						infoLine("/x <extension> <command> [args] — run a command an extension contributed"),
						dim("  /ext list shows what is installed · /ext tools <id> lists its commands"),
					],
				};
			}
			if (args.length === 1) {
				return { lines: [], run: { command: "ext", args: ["tools", args[0] as string], busyText: "listing extension commands" } };
			}
			return {
				lines: [],
				run: { command: "ext", args: ["run", ...args], busyText: `running ${args[1]}` },
			};
		}

		case "templates":
			return { lines: [], templateAction: { kind: "list" } };

		case "repo": {
			const path = rest.trim();
			if (!path) return { lines: [errorLine("/repo needs a path — /repo <directory>")] };
			return { lines: [], repoAction: { path } };
		}

		case "btw":
			if (!rest) return { lines: [errorLine("/btw needs something to say")] };
			session.queued.push(rest);
			return { lines: [dim(`noted — sent with the next turn: ${rest}`)] };

		default:
			break;
	}

	const engine = ENGINE_COMMANDS[name];
	if (engine) {
		const run: EngineRun = {
			command: engine.verb,
			args,
			busyText: engine.busy,
			...(engine.needsSession ? { needsSession: true } : {}),
			...(engine.withNotes ? { withNotes: true } : {}),
		};
		const power = multiplierOf(args);
		if (power === null) return { lines: [], run };

		// The meter goes in the transcript before the run starts, so what the
		// dial actually costs is on screen at the moment it is being chosen.
		const lines: Line[] = ["", powerMeter(power), ""];
		if (power < HIGH_POWER) return { lines, run };
		return {
			lines,
			run,
			confirm: `x${power} is ${powerBand(power).note}. Run it?`,
		};
	}

	return { lines: unknownCommand(name) };
}

/** An unknown command, with the near misses the palette would have offered. */
function unknownCommand(name: string): Line[] {
	const out = [errorLine(`unknown command: /${name}`)];
	const command = findCommand(name);
	if (command) out.push(dim(`  did you mean /${command.name}?`));
	out.push(dim("  /help for the list · / to open the palette"));
	return out;
}

function doTheme(arg: string): Line[] {
	const name = arg.trim().toLowerCase();
	if (!name) {
		return [infoLine(`theme: ${themeName()} — /theme ${THEME_NAMES.join("|")}`)];
	}
	if (!setTheme(name)) {
		return [errorLine(`unknown theme — available: ${THEME_NAMES.join(", ")}`)];
	}
	return [okLine(`theme → ${name}`)];
}

const MODES = ["build", "plan", "general", "explore", "review", "prism"];

function doMode(arg: string, session: Session): Line[] {
	const name = arg.trim().toLowerCase();
	if (!name) return [infoLine(`mode: ${session.mode} — /mode ${MODES.join("|")}`)];
	if (!MODES.includes(name)) {
		return [errorLine(`unknown mode — available: ${MODES.join(", ")}`)];
	}
	session.mode = name;
	return [okLine(`mode → ${name}`)];
}

export const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"];

function doThinking(arg: string, session: Session): Line[] {
	const choice = arg.trim().toLowerCase();
	const visibility = session.thinkingVisibility ?? "show";
	if (!choice) {
		return [
			infoLine(
				`thinking: ${session.thinking} · display: ${visibility} — /thinking ${THINKING_LEVELS.join("|")} | show | hide`,
			),
		];
	}
	if (choice === "show" || choice === "hide") {
		session.thinkingVisibility = choice;
		return [okLine(`thinking display → ${choice}`)];
	}
	if (choice === "toggle") {
		session.thinkingVisibility = visibility === "show" ? "hide" : "show";
		return [okLine(`thinking display → ${session.thinkingVisibility}`)];
	}
	if (!THINKING_LEVELS.includes(choice)) {
		return [
			errorLine(
				`unknown level or mode "${choice}" — available: ${THINKING_LEVELS.join(", ")}, show, hide`,
			),
		];
	}
	session.thinking = choice;
	return [okLine(`thinking → ${choice}`)];
}

function doNotes(args: string[], rest: string, session: Session): Line[] {
	const sub = (args[0] ?? "").toLowerCase();
	if (sub === "clear") {
		session.notes = [];
		return [okLine("notes cleared")];
	}
	if (sub === "add") {
		const text = rest.slice(rest.toLowerCase().indexOf("add") + 3).trim();
		if (!text) return [errorLine("/notes add needs some text")];
		session.notes.push(text);
		return [okLine(`note added (${session.notes.length} total)`)];
	}
	if (session.notes.length === 0) {
		return [infoLine("no notes — /notes add <text> to steer generation")];
	}
	return [
		infoLine(`${session.notes.length} note(s):`),
		...session.notes.map((note, i) => `  ${dim(`${i + 1}.`)} ${note}`),
	];
}

function doQueue(arg: string, session: Session): Line[] {
	if (arg.trim().toLowerCase() === "clear") {
		const n = session.queued.length;
		session.queued = [];
		return [okLine(`cleared ${n} queued message(s)`)];
	}
	if (session.queued.length === 0) return [infoLine("nothing queued")];
	return [
		infoLine(`${session.queued.length} queued:`),
		...session.queued.map((text, i) => `  ${dim(`${i + 1}.`)} ${text}`),
	];
}

/** `/config` — what this session is actually running with. */
function configLines(session: Session): Line[] {
	const info: HeaderInfo = {
		version: session.version,
		repo: session.root,
		model: session.model,
		provider: session.provider,
		hasKey: session.hasKey,
	};
	return [
		"",
		...statusPanel(info),
		"",
		`${bold(fg("accent", "Mode:"))}      ${session.mode}`,
		`${bold(fg("accent", "Thinking:"))}  ${session.thinking}`,
		`${bold(fg("accent", "Approve:"))}   ${session.autoApprove ? fg("warn", "auto (yolo)") : "asks first"}`,
		`${bold(fg("accent", "Theme:"))}     ${themeName()}`,
		`${bold(fg("accent", "Notes:"))}     ${session.notes.length || dim("none")}`,
		"",
	];
}
