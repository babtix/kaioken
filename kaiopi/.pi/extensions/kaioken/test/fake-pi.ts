import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

/**
 * A collection that reads as an array and indexes as a map.
 *
 * Registration order is meaningful here — `kaio-*` commands appear in the
 * order they were registered, and the tool list is asserted positionally — but
 * suites also want to grab one entry by name without knowing its index. An
 * array with `get`/`has` added serves both, so a test can say
 * `tools.map(t => t.name)` or `tools.get("kaio_verify")` without either
 * reading being a special case.
 */
export interface Registry<T extends { name: string }> extends Array<T> {
	/**
	 * Fetch by name. Throws when absent, because a test asking for a
	 * registration that does not exist is a bug, and the useful failure names
	 * which one was missing rather than surfacing as `undefined` three lines
	 * later. Use `has` to test for absence.
	 */
	get: (name: string) => T;
	has: (name: string) => boolean;
	/** Alias for `length`, so a suite can read either. */
	size: number;
}

function registry<T extends { name: string }>(): Registry<T> {
	const items = [] as unknown as Registry<T>;
	Object.defineProperties(items, {
		get: {
			value: (name: string) => {
				const found = items.find((item) => item.name === name);
				if (!found) throw new Error(`nothing registered under "${name}"`);
				return found;
			},
		},
		has: { value: (name: string) => items.some((item) => item.name === name) },
		// A getter, not a snapshot: registration happens after this call.
		size: { get: () => items.length },
	});
	return items;
}

/**
 * A stand-in for Pi's `ExtensionAPI` so the bridge can be exercised without a
 * live session (Invariant 10: every test runs offline, with no keys).
 *
 * The five bridge suites each grew their own copy of this, and they drifted:
 * some kept tools in an array, some in a map. None could fire a hook, so the
 * hook bodies — the code that decides whether a destructive command is blocked
 * — were only ever checked for registration, never for behaviour. One harness
 * with a real `emit` closes that gap.
 */
export interface FakePi {
	/** Pass to `registerTools` / `registerCommands` / the extension entry point. */
	pi: ExtensionAPI;
	/** Registered tools, in order, also indexable by name. */
	tools: Registry<any>;
	/** Registered commands, in order, also indexable by name. */
	commands: Registry<{ name: string } & Record<string, any>>;
	/** Handlers registered per event. */
	hooks: Record<string, any[]>;
	/** Run every handler for an event and collect the results. */
	emit: (event: string, ...args: any[]) => Promise<any[]>;
	/** Run every handler for an event, returning the first non-undefined result. */
	emitFirst: (event: string, ...args: any[]) => Promise<any>;
	/** Status lines pushed through `ctx.ui.setStatus`. */
	status: Array<{ id: string; text: string }>;
	/** Widgets pushed through `ctx.ui.setWidget`. */
	widgets: Array<{ id: string; lines: string[] }>;
	/** A context whose `ui` records what the bridge displays. */
	ctx: (
		cwd?: string,
		options?: { mode?: string; theme?: unknown },
	) => ExtensionContext;
	/** Every status text the bridge has set, newest last. */
	statusText: () => string[];
	/** Theme names the bridge asked for. */
	themeLookups: string[];
	/** Theme values the bridge applied. */
	themesApplied: unknown[];
	/** Header factories the bridge registered. */
	headerFactories: unknown[];
	/** Custom entries appended through `pi.appendEntry`. */
	entries: Array<{ customType: string; data?: unknown }>;
	/** Custom entry renderers registered through `pi.registerEntryRenderer`. */
	entryRenderers: Map<string, any>;
	/** Toast notifications pushed through `ctx.ui.notify`. */
	notifications: Array<{ message: string; type?: "info" | "warning" | "error" }>;
}

export function fakePi(): FakePi {
	const tools = registry<any>();
	const commands = registry<{ name: string } & Record<string, any>>();
	const hooks: Record<string, any[]> = {};
	const status: Array<{ id: string; text: string }> = [];
	const widgets: Array<{ id: string; lines: string[] }> = [];
	const notifications: Array<{ message: string; type?: "info" | "warning" | "error" }> = [];
	const entries: Array<{ customType: string; data?: unknown }> = [];
	const entryRenderers = new Map<string, any>();
	/** Theme names the bridge asked for, in order. */
	const themeLookups: string[] = [];
	/** Theme values the bridge applied, in order. */
	const themesApplied: unknown[] = [];
	/** Header factories the bridge registered, in order. */
	const headerFactories: unknown[] = [];

	const pi = {
		registerTool: (tool: any) => {
			tools.push(tool);
		},
		registerCommand: (name: string, opts: any) => {
			commands.push({ name, ...opts });
		},
		on: (event: string, handler: any) => {
			(hooks[event] ??= []).push(handler);
		},
		registerEntryRenderer: (customType: string, renderer: any) => {
			entryRenderers.set(customType, renderer);
		},
		appendEntry: (customType: string, data?: unknown) => {
			entries.push({ customType, data });
		},
	} as unknown as ExtensionAPI;

	const ctx = (cwd?: string, options?: { mode?: string; theme?: unknown }) =>
		({
			cwd: cwd ?? process.cwd(),
			// `mode` matters: the header and the theme are TUI-only, and the
			// bridge checks it before touching either.
			mode: options?.mode ?? "tui",
			hasUI: (options?.mode ?? "tui") === "tui",
			ui: {
				notify: (message: string, type?: "info" | "warning" | "error") => {
					notifications.push({ message, type });
				},
				setStatus: (id: string, text: string) => {
					status.push({ id, text });
				},
				setWidget: (id: string, lines: string[]) => {
					widgets.push({ id, lines });
				},
				getTheme: (name: string) => {
					themeLookups.push(name);
					return options?.theme;
				},
				setTheme: (value: unknown) => {
					themesApplied.push(value);
					return { success: true };
				},
				// The header factory is called by Pi, not by the bridge, so this
				// records the factory rather than invoking it — a test that wants
				// a header calls it with its own TUI.
				setHeader: (factory: unknown) => {
					headerFactories.push(factory);
				},
			},
		}) as unknown as ExtensionContext;

	const emit = async (event: string, ...args: any[]) => {
		const out: any[] = [];
		for (const handler of hooks[event] ?? []) out.push(await handler(...args));
		return out;
	};

	return {
		pi,
		tools,
		commands,
		hooks,
		emit,
		emitFirst: async (event: string, ...args: any[]) => {
			for (const result of await emit(event, ...args)) {
				if (result !== undefined) return result;
			}
			return undefined;
		},
		status,
		widgets,
		ctx,
		statusText: () => status.map((s) => s.text),
		themeLookups,
		themesApplied,
		headerFactories,
		entries,
		entryRenderers,
		notifications,
	};
}

