import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
	type Component,
	Container,
	Editor,
	type EditorTheme,
	matchesKey,
	ProcessTerminal,
	ScrollView,
	type Terminal,
	TuiAltScreen,
	VStack,
	visibleWidth,
	wrapTextWithAnsi,
} from "@earendil-works/pi-tui";

import { expandTemplate, listTemplates, loadTemplate } from "@kaioken/templates";

import { COMMANDS } from "./commands.js";
import type { ChatReply, ChatRequest } from "./chatBridge.js";
import type { ChatSessionCache } from "../../cli/dist/main.js";
import { CLOSING, goodbye, goodbyeLine, opening, playCurtain } from "./curtain.js";
import { dispatch, type EngineRun, type ProviderAction, type Session } from "./dispatch.js";
import { stickyHeader, statusPanel, type HeaderInfo } from "./logo.js";
import { renderSeam, renderStatusLine, type BusyState, type StatusData } from "./statusLine.js";
import {
	FLASH_MS,
	isRevealing,
	motionEnabled,
	motionFromEnv,
	pulseText,
	setMotion,
} from "./motion.js";
import {
	assistantLines,
	approvalLines,
	errorLine,
	infoLine,
	okLine,
	reasoningSummary,
	shellCommandLine,
	thinkingCompletedHeader,
	thinkingStreamingHeader,
	toolCallLine,
	userLine,
	warnLine,
	type ApprovalRequest,
	type Line,
} from "./transcript.js";
import {
	emptyPalette,
	movePalette,
	refreshPalette,
	renderComposer,
	renderPalette,
	type PaletteState,
} from "./composer.js";
import { bold, colorFromEnv, dim, fg, setColor, setTheme, themeName } from "./theme.js";
import { truncate } from "./screen.js";
import { kaiokenAutocomplete } from "./autocomplete.js";
import { readRepoState, type RepoState } from "./repoState.js";
import {
	bashFileTargets,
	buildBranchTree,
	deleteSession,
	deriveTitle,
	flattenBranches,
	generateSessionId,
	listSessions,
	loadSession,
	saveSession,
	sessionPath,
	recordUndo,
	undoLast,
	type SavedSession,
	type SessionMeta,
	type SessionParent,
} from "./sessionStorage.js";
import {
	credentialHint,
	envVarFor,
	listProviders,
	modelLines,
	pickDefaultModel,
	providerLines,
	resolveModelSpec,
	type ProviderInfo,
} from "./providers.js";

/**
 * The shell.
 *
 * One conversational surface, as in v1: a sticky wordmark-and-status header,
 * a scrolling transcript that everything writes into, the completion palette,
 * the composer, and one status row. There are no separate views — `/status`,
 * `/cards`, a chat reply and a proposed diff all land as styled lines in the
 * same scrollback, which is most of what makes the interface feel the way it
 * does.
 *
 * Key decisions, stated:
 * - The transcript is a `string[]`. Every builder that appends to it is a pure
 *   function in `transcript.ts`, so what the interface says is testable
 *   without a terminal.
 * - Rendering is pi-tui's: differential repaint, display-width arithmetic, the
 *   editor and the markdown parser. This file owns the state machine and the
 *   key grammar, nothing else.
 * - Commands do not run here. `dispatch` decides what a command means and
 *   returns a description of it; the shell is the only thing that touches the
 *   terminal or the engine.
 */

export const VERSION = "2.0.0";

export interface TuiOptions {
	root: string;
	model?: string;
	provider?: string;
	theme?: string;
	/**
	 * Play animations. Defaults to what the environment asks for.
	 *
	 * DESIGN.md §6.5 requires motion to be switchable, and a multiplexer over a
	 * slow link is reason enough on its own.
	 */
	motion?: boolean;
	/** Emit colour. Defaults to what the environment asks for (NO_COLOR). */
	color?: boolean;
	/**
	 * The terminal to drive. Defaults to the real one.
	 *
	 * A seam rather than a hard-wired `ProcessTerminal` so the shell itself is
	 * testable without a pty — the same reason the transcript is plain lines.
	 */
	terminal?: Terminal;
	/** Stop the event loop after `run()` paints; tests drive it by hand. */
	headless?: boolean;
	/**
	 * Runs an engine command and streams its output back a line at a time.
	 * Defaults to the real CLI. Tests pass a scripted double, which is how the
	 * whole command surface is exercised with no network and no API key.
	 */
	engine?: EngineRunner;
	/**
	 * Runs one chat turn. Defaults to the real agent. Tests pass a scripted
	 * double, for the same reason `engine` does.
	 */
	chat?: ChatRunner;
	/**
	 * Reads the provider catalog for `/provider`. Defaults to pi-ai's own
	 * registry, whose `checkAuth` is a local credential check. Tests pass a
	 * fixed list, which is how the switch is exercised with no providers
	 * installed at all.
	 */
	providers?: ProviderLister;
	/**
	 * Runs a shell / powershell command and streams its output back a line at a time.
	 * Defaults to PowerShell on Windows, or $SHELL on POSIX. Tests pass a scripted
	 * double to verify execution without touching the OS.
	 */
	shell?: ShellRunner;
}

export type EngineRunner = (
	run: EngineRun,
	root: string,
	emit: (line: string) => void,
	/**
	 * Registers the function that stops the run for real.
	 *
	 * Most engine commands cannot be interrupted once started and never call
	 * it; `serve` registers one so stopping it is a direct `close()` on the
	 * server rather than a synthetic SIGINT, which would fire every other
	 * handler Node has registered — the terminal's raw-mode cleanup included.
	 */
	onCancel?: (cancel: () => void) => void,
) => Promise<number>;

export type ChatRunner = (request: ChatRequest) => Promise<ChatReply>;

export type ShellRunner = (
	command: string,
	root: string,
	emit: (line: string) => void,
	onCancel?: (cancel: () => void) => void,
) => Promise<number>;

/**
 * The default shell runner: executes commands in PowerShell on Windows,
 * or the default user shell ($SHELL or /bin/sh) on POSIX.
 */
export const defaultShellRunner: ShellRunner = async (command, root, emit, onCancel) => {
	return new Promise((resolve) => {
		const isWin = process.platform === "win32";
		const shellCmd = isWin ? "powershell.exe" : (process.env.SHELL || "/bin/sh");
		const args = isWin ? ["-NoProfile", "-Command", command] : ["-c", command];

		let child: import("node:child_process").ChildProcess;
		try {
			child = spawn(shellCmd, args, {
				cwd: root,
				env: process.env,
				shell: false,
				windowsHide: true,
			});
		} catch (error) {
			emit(`error: ${error instanceof Error ? error.message : String(error)}`);
			return resolve(1);
		}

		onCancel?.(() => {
			try {
				child.kill();
			} catch {}
		});

		let stdoutRemainder = "";
		child.stdout?.on("data", (chunk: Buffer) => {
			const text = stdoutRemainder + chunk.toString("utf8");
			const lines = text.split(/\r?\n/);
			stdoutRemainder = lines.pop() ?? "";
			for (const line of lines) emit(line);
		});

		let stderrRemainder = "";
		child.stderr?.on("data", (chunk: Buffer) => {
			const text = stderrRemainder + chunk.toString("utf8");
			const lines = text.split(/\r?\n/);
			stderrRemainder = lines.pop() ?? "";
			for (const line of lines) emit(line);
		});

		child.on("close", (code) => {
			if (stdoutRemainder) emit(stdoutRemainder);
			if (stderrRemainder) emit(stderrRemainder);
			resolve(code ?? 0);
		});

		child.on("error", (err) => {
			emit(`error: ${err.message}`);
			resolve(1);
		});
	});
};

/** Reads the provider catalog on `/provider`'s behalf. */
export type ProviderLister = () => Promise<ProviderInfo[]>;

/**
 * A pure view, mounted.
 *
 * The adapter is three lines because the render functions already return
 * `string[]` for a width — the same contract pi-tui components have.
 */
class ViewComponent implements Component {
	constructor(private readonly draw: (width: number) => string[]) {}
	render(width: number): string[] {
		return this.draw(width);
	}
	invalidate(): void {}
}

export async function runTui(options: TuiOptions): Promise<number> {
	await new KaiokenTui(options).run();
	return 0;
}

/** Build a shell without starting the event loop. For tests and previews. */
export function createTui(options: TuiOptions): KaiokenTui {
	return new KaiokenTui({ ...options, headless: true });
}

const PLACEHOLDER = "chat with the model, or /help for commands";
const SHELL_PLACEHOLDER = "run powershell command directly (e.g. dir, git status, npm test)...";

/**
 * How long the second ctrl+c has to arrive.
 *
 * Long enough to be a decision, short enough that a ctrl+c minutes later is
 * read as a fresh one rather than confirming something forgotten.
 */
const CTRL_C_WINDOW_MS = 2000;
const STOP_CONFIRM_WINDOW_MS = 2000;

/** Logical rows the scrollback keeps. Past this, the front is dropped. */
const MAX_SCROLLBACK = 5000;

/** Memoised wrap results per width before the memo is dropped wholesale. */
const WRAP_MEMO_MAX = 12_000;

/** How many terminal widths' worth of wrap memos are kept at once. */
const WRAP_WIDTHS_KEPT = 4;

/** Memoised per-line indent facts before the memo is dropped wholesale. */
const LINE_INFO_MAX = 12_000;

/**
 * One streamed region of the transcript, still arriving.
 *
 * A turn's prose is not one contiguous block — tool calls and approvals land
 * between the text — so each run of prose is its own region, owned by the
 * stream: rewriting it splices exactly its rows and leaves everything around
 * it where it is.
 */
interface StreamBlock {
	/** First transcript line the block owns. */
	start: number;
	/** One past the last transcript line the block owns. */
	end: number;
	/** Set once anything else has landed after the block; text starts a new one. */
	closed: boolean;
	/** The raw text the block's rows render. */
	text: string;
	/** The kind of streamed content: prose or thinking. */
	kind?: "prose" | "thinking";
	/** Line index where the thinking header lives. */
	headerIndex?: number;
	/** When thinking started (epoch ms). */
	startTime?: number;
	/** When thinking completed (epoch ms). */
	endTime?: number;
	/** Extracted title if present. */
	title?: string | null;
}

interface StreamState {
	blocks: StreamBlock[];
	/** Whether the formatted reply has been placed. */
	replyShown: boolean;
}

/**
 * A real terminal whose output path cannot be taken over.
 *
 * pi-tui resolves `process.stdout.write` at the moment of each call, so any
 * code that swaps that function out — the engine's output capture, chiefly —
 * swallows every frame for as long as it runs: no spinner, no elapsed counter,
 * no streamed output, for the whole of every engine command, and the TUI is
 * unusable afterwards. This subclass binds the real write once, at
 * construction, and routes every drawing operation through that binding, so
 * the interface keeps painting no matter what the engine does to the globals
 * behind it.
 */
export class SealedProcessTerminal extends ProcessTerminal {
	private readonly sink: (chunk: string) => boolean;

	constructor(sink: (chunk: string) => boolean = process.stdout.write.bind(process.stdout)) {
		super();
		this.sink = sink;
	}

	override write(data: string): void {
		this.sink(data);
	}

	override moveBy(lines: number): void {
		if (lines > 0) this.sink(`\x1b[${lines}B`);
		else if (lines < 0) this.sink(`\x1b[${-lines}A`);
	}

	override hideCursor(): void {
		this.sink("\x1b[?25l");
	}

	override showCursor(): void {
		this.sink("\x1b[?25h");
	}

	override clearLine(): void {
		this.sink("\x1b[K");
	}

	override clearFromCursor(): void {
		this.sink("\x1b[J");
	}

	override clearScreen(): void {
		this.sink("\x1b[2J\x1b[H");
	}

	override setTitle(title: string): void {
		this.sink(`\x1b]0;${title}\x07`);
	}
}

export class KaiokenTui {
	private readonly headless: boolean;
	private readonly ui: TuiAltScreen;
	private readonly editor: Editor;
	private readonly transcript: ScrollView;
	private readonly engine: EngineRunner;
	private readonly chatRunner: ChatRunner;
	private readonly shellRunner: ShellRunner;
	private readonly listProviders: ProviderLister;
	/**
	 * The terminal, kept so the header can ask its real height.
	 *
	 * The header trades the wordmark for a compact strip on a short terminal,
	 * which means it needs the row count — and a component is only ever handed
	 * its width. Caching a height at construction made the banner decide from
	 * a size the terminal had stopped being.
	 */
	private readonly terminal: Terminal;

	/** The scrollback. Everything the interface says lands here. */
	private lines: Line[] = [];
	private readonly session: Session;
	private readonly palette: PaletteState = emptyPalette();

	private busyText = "";
	private busyStartedAt = 0;
	private busy = false;
	private shellMode = false;
	/**
	 * The chat conversation, held across turns.
	 *
	 * Knowledge, model resolution and the agent session are per-conversation
	 * costs; rebuilding them per message re-serialised the index artifact,
	 * re-read the whole corpus and re-sent the full system prompt with no
	 * chance of a provider prompt cache hit — and the agent had no memory of
	 * the previous turn. The cache is emptied after every engine run, because
	 * a run may have rewritten the artifacts the cached context was built
	 * from, and the bridge empties it after a turn that changed files.
	 */
	private chatCache: ChatSessionCache = {};
	/** The streaming state of the chat turn in flight, if any. */
	private stream: StreamState | null = null;
	/** Set once the shell's interface exists; boot-time work renders before it. */
	private booted = false;
	/** The active conversation's persistence ID. */
	private activeSessionId: string = generateSessionId();
	private sessionCreatedAt: string = new Date().toISOString();
	private sessionTurns = 0;
	private sessionMessages: unknown[] = [];
	/**
	 * Where this conversation branched from, when it did.
	 *
	 * Written into the saved session so `/tree` can show the shape of a
	 * conversation that has been rewound, instead of a flat list in which three
	 * forks off one turn look like three unrelated chats.
	 */
	private sessionParent: SessionParent | undefined;
	private lastAssistantReply = "";
	/** When the shell opened, for the entrance. */
	private startedAt = Date.now();
	private flash: { text: string; at: number } | null = null;
	private frameTimer: NodeJS.Timeout | undefined;
	private cancelRun: (() => void) | undefined;
	/** A run held behind an explicit yes; see DESIGN.md §6.3. */
	private pendingConfirm: { prompt: string; run: EngineRun } | null = null;

	/** Set while the hidden `/key` prompt is open. */
	private pendingKey = false;
	private approval: ApprovalRequest | null = null;
	private approvalResolve: ((approved: boolean) => void) | null = null;
	/** When the current y/n prompt was armed, so its pulse has a phase. */
	private approvalArmedAt = 0;
	/** When ctrl+c was last pressed with nothing to stop. */
	private lastCtrlC = 0;
	/** When esc or ctrl+c was last pressed while busy, for two-step verification. */
	private lastStopPress = 0;
	/** Set once the shell is on its way out, so the exit runs exactly once. */
	private leaving = false;
	/**
	 * What this repository already has, for the header.
	 *
	 * Read once at startup and again whenever a command has changed the
	 * artifacts, so the row cannot claim a wiki that a run just replaced.
	 */
	private knowledge: RepoState = {};

	private width = 80;

	/**
	 * Rendering facts, memoised between frames.
	 *
	 * Wrapping every line from scratch on every frame is O(scrollback) with a
	 * large constant — a full grapheme-width scan plus a wrap pass per line —
	 * and pi-tui's own width cache holds 512 entries, which a transcript
	 * outruns within a handful of commands and then thrashes forever. These
	 * memos are keyed by the things that actually change: a line's indent is
	 * fixed forever, and its wrapped rows are fixed per width.
	 */
	private readonly lineInfoMemo = new Map<string, { indent: string; blank: boolean }>();
	private readonly wrapMemo = new Map<number, Map<string, string[]>>();
	/** Settled header lines, reused until the facts they were built from move. */
	private headerMemo: { key: string; lines: string[] } | null = null;

	constructor(options: TuiOptions) {
		this.headless = options.headless === true;
		// An explicit --theme wins; otherwise the repository's saved choice does,
		// applied before the first frame so nothing is painted in the old one.
		if (options.theme) setTheme(options.theme);
		else void readSavedTheme(resolve(options.root)).then((saved) => saved && setTheme(saved));
		setMotion(options.motion ?? motionFromEnv());
		setColor(options.color ?? colorFromEnv());
		this.engine = options.engine ?? defaultEngine;
		this.chatRunner = options.chat ?? defaultChatRunner;
		this.shellRunner = options.shell ?? defaultShellRunner;
		this.listProviders = options.providers ?? listProviders;

		// The provider is the model spec's first segment — openrouter ids
		// carry slashes of their own, so everything before the first one is
		// what names it. An explicit option wins; without one the header
		// would claim "(none)" while a spec sat right beside it. A first
		// segment that is really a model namespace is corrected against the
		// catalog in `reconcileProvider`, right after startup.
		const initialProvider = options.provider ?? (options.model ? options.model.slice(0, options.model.indexOf("/")) : "");
		this.session = {
			root: resolve(options.root),
			version: VERSION,
			model: options.model ?? "",
			provider: initialProvider,
			// The key that matters is the active provider's own: a saved
			// openrouter key says nothing about an anthropic session.
			hasKey: keyPresentFor(initialProvider),
			autoApprove: false,
			mode: "build",
			thinking: "off",
			notes: [],
			queued: [],
			serveUrl: null,
		};

		this.terminal = options.terminal ?? new SealedProcessTerminal();
		this.ui = new TuiAltScreen(this.terminal, true);
		this.editor = new Editor(this.ui, editorTheme(() => this.shellMode));
		this.editor.onSubmit = (text) => void this.submit(text);
		this.editor.onChange = () => this.onComposerChange();
		// Path and argument completion. The editor drives the menu; this only
		// says what the candidates are.
		this.editor.setAutocompleteProvider(kaiokenAutocomplete(this.session.root));

		const body = new ViewComponent((width) => this.renderTranscript(width));
		this.transcript = new ScrollView(body, { primary: true, follow: "end", scrollbar: "auto" });

		const composer = new Container();
		composer.addChild(new ViewComponent((width) => this.renderComposerBlock(width)));

		// The transcript is the only row that may lose height. pi-tui shrinks
		// every entry by default, weighted by size, so a long scrollback used
		// to push the composer and the status line off the bottom of the frame
		// — the two things that must be on screen at all times.
		const fixed = { basis: "auto", shrink: 0 } as const;
		const layout = new VStack([
			{ component: new ViewComponent((width) => this.renderHeader(width)), ...fixed },
			{ component: new ViewComponent((width) => [renderSeam(width)]), ...fixed },
			{ component: this.transcript, basis: 0, grow: 1, shrink: 1, minSize: 1 },
			{ component: new ViewComponent((width) => renderPalette(this.palette, width)), ...fixed },
			{ component: composer, ...fixed },
			{ component: new ViewComponent((width) => [renderStatusLine(this.statusData(), width)]), ...fixed },
		]);
		this.ui.addChild(layout);
		this.ui.setLayoutRoot(layout);
	}

	async run(): Promise<void> {
		// The reads that fill the shell in — the header's artifacts, the saved
		// model, the provider catalog — are pure I/O with no dependency on the
		// interface existing: their results cannot be painted until pi-tui has
		// the terminal either way. They start here, run underneath the curtain,
		// and are awaited once the shell is up, so a boot costs one curtain
		// rather than a curtain plus the reads. (They are chained internally:
		// the provider reconciliation only means something once the saved
		// model, if any, has been read.)
		const boot = (async () => {
			await this.refreshKnowledge();
			await this.seedModel();
			await this.reconcileProvider();
		})();

		// The opening boot, before pi-tui takes the terminal: full screen, on
		// the alternate screen, handed straight over to the real interface —
		// see `curtain.ts`. Motion off skips it outright, which is what every
		// test does and what `--no-motion` is for.
		await playCurtain(this.terminal, opening(VERSION));

		this.ui.addInputListener((data) => this.onGlobalKey(data));
		this.ui.setFocus(this.editor);
		this.ui.start();
		this.startedAt = Date.now();
		this.booted = true;
		this.syncFrameTimer();
		this.ui.requestRender();

		// By here the reads have usually finished with the curtain; the header
		// is worth showing immediately either way, and the frame timer paints
		// each result the moment it lands.
		await boot;
		if (this.headless) return;

		// The loop never resolves while the TUI is open; terminal input drives
		// it, and leaving happens through `quit`.
		await new Promise<never>(() => {});
	}

	// ---- rendering ----

	private headerInfo(): HeaderInfo {
		const info: HeaderInfo = {
			version: this.session.version,
			repo: this.session.root,
			model: this.session.model,
			provider: this.session.provider,
			hasKey: this.session.hasKey,
		};
		// Only a non-default mode is worth a row: "mode build" on every frame
		// is a fact nobody needs repeated.
		if (this.session.mode !== "build") info.mode = this.session.mode;
		info.knowledge = this.knowledge;
		return info;
	}

	private renderHeader(width: number): string[] {
		this.width = width;
		// The entrance plays once, from the shell's own start time, and the
		// header renders settled forever after. Settled is also cheap: the
		// wordmark and the panel are pure functions of (info, width, height),
		// so they are built once per fact-set and reused on every frame after
		// — a static masthead was being rebuilt sixty times a second.
		const since = this.revealing() ? Date.now() - this.startedAt : undefined;
		if (since === undefined) {
			const info = this.headerInfo();
			const key = `${width}:${this.terminal.rows}:${JSON.stringify(info)}`;
			if (this.headerMemo?.key === key) return this.headerMemo.lines;
			const lines = stickyHeader(info, width, this.terminal.rows, undefined);
			this.headerMemo = { key, lines };
			return lines;
		}
		return stickyHeader(this.headerInfo(), width, this.terminal.rows, since);
	}

	/** Whether the opening entrance is still playing. */
	private revealing(): boolean {
		return isRevealing(24, Date.now() - this.startedAt);
	}

	/** The live task, as the status row and the progress bar want it. */
	private busyState(): BusyState | undefined {
		if (!this.busy) return undefined;
		return { text: this.busyText, elapsedMs: Date.now() - this.busyStartedAt };
	}

	/**
	 * The scrollback, wrapped to the viewport.
	 *
	 * Wrapping is not optional: the surface clips whatever runs past the last
	 * column, so on a narrow terminal `/help` lost most of every row with no
	 * ellipsis and no way to reach the text. Wrapping is ANSI-aware, so a
	 * coloured row keeps its colour across the break.
	 *
	 * It is also memoised — per line, per width, for as long as the line is
	 * in the scrollback — because re-wrapping every line on every frame is
	 * the one cost that grows with the session. A line's rows are a pure
	 * function of the line and the width; when neither changed, the previous
	 * answer is the answer.
	 *
	 * No empty state beyond this: the banner directly above already says "type
	 * to chat · press / for commands", and repeating it two rows lower reads as
	 * a rendering fault rather than an invitation.
	 */
	private renderTranscript(width: number): string[] {
		const content = Math.max(8, width);
		const out: string[] = [];
		for (const line of this.lines) {
			// An empty line is a deliberate gap; wrapping would drop it.
			if (line === "") {
				out.push("");
				continue;
			}
			const info = this.lineInfo(line);
			// A row with nothing but whitespace in it is a gap, whatever it
			// was padded to. Treating it as an indented row instead meant
			// wrapping its whitespace at the four-column floor and emitting a
			// row per four columns.
			if (info.blank) {
				out.push("");
				continue;
			}
			// The indent only survives while it leaves something to wrap
			// into. Past that the floor below takes over, and a row indented
			// to within a few columns of the margin comes back as one row per
			// few characters — so a deep indent is dropped rather than
			// shredding the text it was meant to line up.
			const room = content - info.indent.length;
			const wrapped = this.wrappedRows(line, info.indent, content);
			out.push(wrapped[0] as string);
			for (const rest of wrapped.slice(1)) out.push(room >= 8 ? info.indent + rest : rest);
		}
		return out;
	}

	/**
	 * A line's indent and whether it is a gap in disguise, remembered.
	 *
	 * Both are pure functions of the line, and both were being recomputed
	 * with a full scan of the string on every frame for every line.
	 */
	private lineInfo(line: string): { indent: string; blank: boolean } {
		let info = this.lineInfoMemo.get(line);
		if (info === undefined) {
			const indent = leadingIndent(line);
			info = { indent, blank: visibleWidth(line) === indent.length };
			if (this.lineInfoMemo.size >= LINE_INFO_MAX) this.lineInfoMemo.clear();
			this.lineInfoMemo.set(line, info);
		}
		return info;
	}

	/**
	 * A line wrapped at its own effective width, remembered.
	 *
	 * Continuation rows keep the original row's indent — without it a wrapped
	 * list item runs back to column zero and stops looking like part of the
	 * item above it, which is most of `/help`. The indent only survives while
	 * it leaves something to wrap into: past that, a deep indent is dropped
	 * rather than shredding the text it was meant to line up.
	 */
	private wrappedRows(line: string, indent: string, content: number): string[] {
		const room = content - indent.length;
		const at = Math.max(4, room >= 8 ? room : content);
		let memo = this.wrapMemo.get(at);
		if (memo === undefined) {
			// Only a few widths are ever live; a burst of resizes drops the
			// lot rather than growing without bound.
			if (this.wrapMemo.size >= WRAP_WIDTHS_KEPT) this.wrapMemo.clear();
			memo = new Map();
			this.wrapMemo.set(at, memo);
		}
		let rows = memo.get(line);
		if (rows === undefined) {
			rows = wrapTextWithAnsi(line, at);
			if (memo.size >= WRAP_MEMO_MAX) memo.clear();
			memo.set(line, rows);
		}
		return rows;
	}

	/**
	 * The composer block, or the hidden key prompt in its place.
	 *
	 * A key must never reach the scrollback, the session log or a screenshot,
	 * so while the prompt is open the editor's own rendering is replaced by a
	 * row of asterisks — the length is the only feedback that is safe to give.
	 */
	private renderComposerBlock(width: number): string[] {
		if (this.pendingKey) {
			return [
				`${bold(fg("prompt", "›"))} ${"*".repeat(Math.min(40, this.editor.getText().length))}`,
				dim("paste the key and press enter — input is hidden"),
			];
		}
		if (this.approval) {
			// Armed and waiting on the user: nothing has been written, the run
			// is blocked, and the prompt should not look settled while that is
			// true. The pulse stops the moment a key answers it.
			const since = Date.now() - this.approvalArmedAt;
			return [
				`${pulseText(`apply ${this.approval.action}`, since)}  ${fg("user", this.approval.target)}` +
					`  ${keycapPair("y", "yes")}  ${keycapPair("n", "no")}`,
				dim("esc / ctrl+c denies · nothing has been written yet"),
			];
		}
		if (this.pendingConfirm) {
			const since = Date.now() - this.approvalArmedAt;
			return [
				`${pulseText("⚠ high power", since, "diffDel", "warn")}  ${this.pendingConfirm.prompt}` +
					`  ${keycapPair("y", "yes")}  ${keycapPair("n", "no")}`,
				dim("esc / ctrl+c cancels · nothing has run yet"),
			];
		}
		const rows = renderComposer(
			this.editor.render(Math.max(8, width - 2)),
			{
				busy: this.busy,
				autoApprove: this.session.autoApprove,
				placeholder: this.shellMode ? SHELL_PLACEHOLDER : PLACEHOLDER,
				empty: this.editor.getText().length === 0,
				shell: this.shellMode,
			},
			width,
		);
		return rows;
	}

	private statusData(): StatusData {
		const data: StatusData = { autoApprove: this.session.autoApprove };
		const busy = this.busyState();
		if (busy) data.busy = busy;
		// Expire here rather than only in the frame timer: with motion off the
		// timer never runs, and a flash that outlived its two seconds would sit
		// on the status row for the rest of the session.
		const flash = this.liveFlash();
		if (flash) data.flash = flash;
		if (this.session.serveUrl) data.serving = true;
		if (this.session.model) data.model = this.session.model;
		return data;
	}

	// ---- input ----

	/**
	 * The global grammar.
	 *
	 * Runs before the editor sees a key and consumes only what is genuinely
	 * global. There are no single-letter view accelerators to collide with the
	 * composer here: v1 puts everything behind `/`, and a surface where every
	 * keystroke is text is a surface with no ambiguity to resolve.
	 */
	private onGlobalKey(data: string): { consume?: boolean } | undefined {
		if (this.approval) return this.onApprovalKey(data);
		if (this.pendingConfirm) return this.onConfirmKey(data);

		if (matchesKey(data, "ctrl+c")) {
			// Ctrl+C stops the run if one is going.
			// In-flight chat turns require two-step verification like OpenCode to prevent accidental cancellation.
			if (this.busy) {
				if (this.stream) {
					const now = Date.now();
					if (now - this.lastStopPress < STOP_CONFIRM_WINDOW_MS) {
						this.lastStopPress = 0;
						this.stopCurrent();
						return { consume: true };
					}
					this.lastStopPress = now;
					this.showFlash("press ctrl+c again to stop · esc also stops");
					return { consume: true };
				}
				this.stopCurrent();
				return { consume: true };
			}
			// With nothing to stop it quits, but not on one keystroke: a stray
			// ctrl+c used to end the session outright. The second press has to
			// arrive while the warning is still on screen.
			const now = Date.now();
			if (now - this.lastCtrlC < CTRL_C_WINDOW_MS) {
				this.quit();
				return { consume: true };
			}
			this.lastCtrlC = now;
			this.showFlash("press ctrl+c again to quit · ctrl+d also quits");
			return { consume: true };
		}
		if (matchesKey(data, "ctrl+d") && !this.editor.getText()) {
			this.quit();
			return { consume: true };
		}
		if (matchesKey(data, "ctrl+t")) {
			const levels = this.getModelThinkingLevels();
			const current = (this.session.thinking || "off").toLowerCase();
			const idx = levels.indexOf(current);
			const next = levels[(idx + 1) % levels.length] ?? levels[0] ?? "off";
			this.session.thinking = next;
			const count = levels.length > 1 ? ` (${levels.length} levels)` : " (reasoning not supported)";
			this.showFlash(`thinking → ${next}${count}`);
			return { consume: true };
		}
		if (matchesKey(data, "alt+t")) {
			this.session.thinkingVisibility = this.session.thinkingVisibility === "hide" ? "show" : "hide";
			this.showFlash(`thinking display → ${this.session.thinkingVisibility}`);
			return { consume: true };
		}

		if (this.palette.active) {
			if (matchesKey(data, "up")) {
				movePalette(this.palette, -1);
				return this.repaint();
			}
			if (matchesKey(data, "down")) {
				movePalette(this.palette, 1);
				return this.repaint();
			}
			if (matchesKey(data, "tab")) {
				this.completePalette();
				return { consume: true };
			}
			if (matchesKey(data, "escape")) {
				this.dismissPalette();
				return this.repaint();
			}
		}

		if (matchesKey(data, "escape")) return this.onEscape();

		// Shell mode activation: pressing '!' when editor is completely empty
		if (
			!this.shellMode &&
			!this.busy &&
			!this.pendingKey &&
			this.editor.getText().length === 0 &&
			(data === "!" || matchesKey(data, "!"))
		) {
			this.shellMode = true;
			this.editor.setText("");
			return this.repaint();
		}

		// Shell mode deactivation: pressing backspace when editor is empty
		if (
			this.shellMode &&
			this.editor.getText().length === 0 &&
			matchesKey(data, "backspace")
		) {
			this.shellMode = false;
			return this.repaint();
		}

		return undefined;
	}

	/**
	 * Escape, innermost first.
	 *
	 * A half-typed prompt is the innermost surface of all: escaping past it to
	 * stop a run leaves the text behind to reappear later, which is how a
	 * composer ends up submitting something the user abandoned.
	 */
	private onEscape(): { consume?: boolean } | undefined {
		if (this.pendingKey) {
			this.pendingKey = false;
			this.editor.setText("");
			return this.repaint();
		}
		if (this.shellMode) {
			this.shellMode = false;
			this.editor.setText("");
			return this.repaint();
		}
		if (this.editor.getText()) {
			this.editor.setText("");
			this.dismissPalette();
			this.palette.dismissed = "";
			return this.repaint();
		}
		if (this.busy) {
			if (this.stream) {
				const now = Date.now();
				if (now - this.lastStopPress < STOP_CONFIRM_WINDOW_MS) {
					this.lastStopPress = 0;
					this.stopCurrent();
					return { consume: true };
				}
				this.lastStopPress = now;
				this.showFlash("press esc again to stop");
				return { consume: true };
			}
			this.stopCurrent();
			return { consume: true };
		}
		return undefined;
	}

	/**
	 * The approval prompt: y approves, n and esc deny.
	 *
	 * No default — neither key is bound to Enter — because the one thing an
	 * approval prompt must never do is accept a change because the user was
	 * still typing when it appeared.
	 */
	private onApprovalKey(data: string): { consume?: boolean } {
		if (matchesKey(data, "y")) this.settleApproval(true);
		else if (matchesKey(data, "n") || matchesKey(data, "escape") || matchesKey(data, "ctrl+c")) {
			this.settleApproval(false);
		}
		this.ui.requestRender();
		return { consume: true };
	}

	/**
	 * The high-power gate: y runs it, anything else does not.
	 *
	 * Same shape as the approval prompt, and for the same reason — a run that
	 * costs 15-30x the baseline should not start because Enter was already on
	 * its way down.
	 */
	private onConfirmKey(data: string): { consume?: boolean } {
		const held = this.pendingConfirm;
		if (!held) return { consume: true };
		if (matchesKey(data, "y")) {
			this.pendingConfirm = null;
			this.syncFrameTimer();
			void this.runEngine(held.run);
		} else if (matchesKey(data, "n") || matchesKey(data, "escape") || matchesKey(data, "ctrl+c")) {
			this.pendingConfirm = null;
			this.append(infoLine("cancelled — nothing ran"));
			this.syncFrameTimer();
		}
		this.ui.requestRender();
		return { consume: true };
	}

	private onComposerChange(): void {
		const text = this.editor.getText();
		if (!this.shellMode && !this.pendingKey && text.startsWith("!")) {
			this.shellMode = true;
			this.editor.setText(text.slice(1).trimStart());
		}
		if (!this.pendingKey) refreshPalette(this.palette, this.editor.getText(), COMMANDS);
		this.ui.requestRender();
	}

	private dismissPalette(): void {
		this.palette.active = false;
		this.palette.items = [];
		this.palette.dismissed = this.editor.getText();
	}

	/** Insert the highlighted command. Commands taking arguments get a space. */
	private completePalette(): void {
		const command = this.palette.items[this.palette.selected];
		if (!command) return;
		this.editor.setText(`/${command.name}${command.args ? " " : ""}`);
		this.dismissPalette();
		this.ui.requestRender();
	}

	// ---- the turn ----

	/**
	 * Adopt the repository's saved model, if the user has not chosen one this
	 * session.
	 *
	 * `.kaioken/model.json` is where `/model` persists its choice, so a
	 * session opened tomorrow starts on the model that was picked today
	 * instead of falling back to whatever the environment happens to name.
	 */
	/** Repaint when the interface exists. Boot-time reads run before it does. */
	private render(): void {
		if (this.booted) this.ui.requestRender();
	}

	private async seedModel(): Promise<void> {
		if (this.session.model) return;
		const saved = await readFile(join(this.session.root, ".kaioken", "model.json"), "utf8").catch(() => null);
		if (!saved) return;
		try {
			const parsed = JSON.parse(saved) as { model?: unknown };
			if (typeof parsed.model === "string" && parsed.model.includes("/")) {
				this.session.model = parsed.model;
				this.session.provider = parsed.model.slice(0, parsed.model.indexOf("/"));
				this.render();
			}
		} catch {
			// A malformed file is the same as an absent one: the session starts
			// model-less and the first turn explains how to choose.
		}
	}

	/**
	 * Settle what a session's model spec really names, once, at startup.
	 *
	 * `seedModel` and `--model` both take a spec's first segment as the
	 * provider, which an OpenRouter id typed without its prefix quietly
	 * breaks: `z-ai/glm-4.5` would key and bill against a provider that does
	 * not exist. The catalog decides — a spec that names no registered
	 * provider but matches a configured one's model namespace is that
	 * provider's id, and the session adopts the true name. The persisted file
	 * is left alone: the CLI's own resolution makes the same call.
	 */
	private async reconcileProvider(): Promise<void> {
		if (!this.session.model) return;
		let infos: ProviderInfo[];
		try {
			infos = await this.listProviders();
		} catch {
			// No catalog, no opinion: the spec stays as given and the first
			// turn reports whatever the provider layer makes of it.
			return;
		}
		const expanded = resolveModelSpec(infos, this.session.model, this.session.model);
		if (!expanded) return;
		const canonical = `${expanded.provider}/${expanded.model}`;
		if (canonical === this.session.model) return;
		this.session.model = canonical;
		this.session.provider = expanded.provider;
		this.session.hasKey = keyPresentFor(expanded.provider);
		this.append(dim(`model → ${canonical} (the provider prefix was added — "${expanded.model}" is ${expanded.provider}'s id)`));
		this.render();
	}

	/** Persist the session's model so the CLI's commands run on it too. */
	private async persistModel(): Promise<void> {
		if (!this.session.model) return;
		try {
			const dir = join(this.session.root, ".kaioken");
			await mkdir(dir, { recursive: true });
			await writeFile(join(dir, "model.json"), `${JSON.stringify({ model: this.session.model }, null, "\t")}\n`);
		} catch (error) {
			// The session still runs on the chosen model; only the restart
			// convenience is lost, and that is worth a line, not a failure.
			this.append(warnLine(`could not save the model choice: ${message(error)}`));
		}
	}

	/**
	 * Save the palette so it survives a restart.
	 *
	 * `/theme` has always advertised that the choice is remembered, and it was
	 * the one setting that silently was not — a promise in the help text that
	 * the next session quietly broke. Stored beside the model, per repository,
	 * for the same reason: this is where the interface's other choices live.
	 */
	private async persistTheme(): Promise<void> {
		try {
			const dir = join(this.session.root, ".kaioken");
			await mkdir(dir, { recursive: true });
			const body = JSON.stringify({ theme: themeName() }, null, "\t");
			await writeFile(join(dir, "theme.json"), `${body}\n`);
		} catch (error) {
			// The palette already changed on screen; only the restart
			// convenience is lost, and that is worth a line, not a failure.
			this.append(warnLine(`could not save the theme: ${message(error)}`));
		}
	}

	private async submit(text: string): Promise<void> {
		if (this.pendingKey) {
			this.pendingKey = false;
			const key = text.trim();
			this.editor.setText("");
			if (key) {
				// Stored where the provider layer reads it — the same place an
				// inline `/key <value>` lands, so both entry points behave
				// identically and neither discards what was typed.
				process.env[keyEnvVarFor(this.session.provider)] = key;
				this.session.hasKey = true;
				this.append(...statusPanel(this.headerInfo()));
			}
			return this.repaintAsync();
		}

		const trimmed = text.trim();
		const wasShell = this.shellMode || trimmed.startsWith("!");
		const shellCmd = this.shellMode ? trimmed : (trimmed.startsWith("!") ? trimmed.slice(1).trim() : "");
		this.shellMode = false;

		if (!trimmed && !wasShell) return;
		if (wasShell && !shellCmd) {
			this.editor.setText("");
			return this.repaintAsync();
		}

		if (wasShell) {
			this.editor.addToHistory(`!${shellCmd}`);
			this.editor.setText("");
			this.dismissPalette();
			this.palette.dismissed = "";
			if (this.busy) {
				this.session.queued.push(`!${shellCmd}`);
				this.append(dim(`queued — sent when the current task finishes: !${shellCmd}`));
				return this.repaintAsync();
			}
			return this.runShell(shellCmd);
		}

		this.editor.addToHistory(text);
		this.editor.setText("");
		this.dismissPalette();
		this.palette.dismissed = "";

		// A run in flight takes typed input as steering rather than bouncing
		// it — losing what you typed because a task happened to be running is
		// the single most annoying thing a busy interface can do.
		if (this.busy) {
			this.session.queued.push(trimmed);
			this.append(dim(`queued — sent when the current task finishes: ${trimmed}`));
			return this.repaintAsync();
		}

		if (trimmed.startsWith("/")) return this.runCommand(trimmed);
		return this.chat(trimmed);
	}

	private async runCommand(raw: string): Promise<void> {
		// A key typed inline is echoed masked: the transcript is scrollback,
		// and scrollback gets read over shoulders and pasted into issues.
		const echo = /^\/key\s+\S/.test(raw) ? "/key ********" : raw;
		this.append(userLine(echo));

		const result = dispatch(raw, this.session, this.width);
		if (result.clear) this.lines = [];
		if (result.lines.length > 0) this.append(...result.lines);
		if (result.inlineKey) {
			// Store the key where the agent bridge's provider layer looks for
			// it. Session-scoped by design: `/key` promises "for this session",
			// and nothing here writes to disk. Handled before the panel reprint
			// below so the header reports the key as set.
			process.env[keyEnvVarFor(this.session.provider)] = result.inlineKey;
			this.session.hasKey = true;
		}
		if (result.reprintPanel) this.append("", ...statusPanel(this.headerInfo()), "");
		if (result.promptKey) {
			this.pendingKey = true;
			this.editor.setText("");
		}
		if (result.stop) this.stopCurrent();
		if (result.providers) return this.runProviders(result.providers);
		if (result.persistModel) await this.persistModel();
		if (result.sessionAction) return this.handleSessionAction(result.sessionAction);
		if (result.utilAction) return this.handleUtilAction(result.utilAction);
		if (result.repoAction) return this.handleRepoAction(result.repoAction);
		if (result.historyAction) return this.handleHistoryAction(result.historyAction);
		if (result.templateAction) return this.handleTemplateAction(result.templateAction);
		// The flash is raised before the file is written: a palette switch is
		// visible the instant it happens, and making the confirmation wait on a
		// disk write would put it a frame behind the thing it confirms.
		if (result.flash) this.showFlash(result.flash);
		if (result.persistTheme) await this.persistTheme();
		if (result.quit) return this.quit();
		if (result.run) {
			if (result.confirm) {
				// Hold it. DESIGN.md §6.3 wants an explicit yes above the
				// high-power threshold, and the meter is already on screen.
				this.pendingConfirm = { prompt: result.confirm, run: result.run };
				this.approvalArmedAt = Date.now();
				this.syncFrameTimer();
				return this.repaintAsync();
			}
			return this.runEngine(result.run);
		}
		return this.repaintAsync();
	}

	/**
	 * Run an engine command, streaming its output into the transcript.
	 *
	 * The output arrives a line at a time rather than in one block at the end,
	 * because a wiki run takes minutes and an interface that shows nothing
	 * until it finishes is indistinguishable from one that has hung.
	 *
	 * Lines are flushed per event-loop turn rather than painted per line: a
	 * command that emits thousands of rows would otherwise schedule a render
	 * per row, and every render is O(scrollback) — quadratic work for what is
	 * really one burst of output.
	 */
	private async runEngine(run: EngineRun): Promise<void> {
		// A command that reads the conversation reads it from disk, so the
		// conversation has to be on disk first — and it has to be *this* one.
		// Without the id, `handoff` would fall back to the newest saved session,
		// which after a `/new` is a different conversation entirely.
		if (run.needsSession) {
			if (this.sessionTurns === 0 && this.sessionMessages.length === 0) {
				// Named per command: "nothing to handoff yet" reads as a verb
				// that does not exist, and the two commands want different nouns.
				const what = run.command === "handoff" ? "brief" : "learn from";
				this.append(
					infoLine(`nothing to ${what} yet — this session has no turns`),
					dim("  ask something first, or /resume a saved conversation"),
				);
				return this.repaintAsync();
			}
			await this.persistCurrentSession();
			run = { ...run, args: [...run.args, "--session", this.activeSessionId] };
		}
		// `/notes` promises the notes steer generation. This is where that
		// promise is kept for the engine commands that can honour it.
		if (run.withNotes && this.session.notes.length > 0) {
			const forwarded = this.session.notes.flatMap((note) => ["--note", note]);
			run = { ...run, args: [...run.args, ...forwarded] };
		}

		let cancelled = false;
		let cancelServe: (() => void) | undefined;
		this.cancelRun = () => {
			cancelled = true;
			// `serve` is the one command with a way in: the engine registered a
			// real cancel below, and invoking it closes the server directly.
			// Every other command has no cancellation path into the work it
			// already started and simply finishes in the background.
			cancelServe?.();
		};
		// The session's model rides along: without it the CLI would pick up
		// $KAIOKEN_MODEL or its own default, and a TUI launched with --model
		// would generate on a model the header never showed.
		const payload: EngineRun = this.session.model ? { ...run, model: this.session.model } : run;
		this.startSpinner(run.busyText);
		const batch: string[] = [];
		let flushQueued = false;
		let outputCount = 0;
		const flush = (): void => {
			flushQueued = false;
			const lines = batch.splice(0, batch.length);
			if (cancelled || lines.length === 0) return;
			for (const line of lines) {
				outputCount++;
				// The URL lands here the moment the port is bound; the status
				// row's serving marker is only true while the server is.
				if (run.command === "serve") {
					const url = /https?:\/\/\S+/.exec(line)?.[0];
					if (url) this.session.serveUrl = url;
				}
				this.append(line);
			}
			this.ui.requestRender();
		};
		try {
			const code = await this.engine(payload, this.session.root, (line) => {
				if (cancelled) return;
				batch.push(line);
				if (!flushQueued) {
					flushQueued = true;
					queueMicrotask(flush);
				}
			}, (cancel) => {
				cancelServe = cancel;
			});
			// The last batch may still be sitting in the queued microtask when
			// the promise resolves; draining it here is what makes the count
			// below mean "emitted nothing" rather than "had not painted yet".
			flush();
			if (!cancelled && code !== 0) {
				// An exit code alone leaves the user with nowhere to go, and
				// the two things that actually fix most failures are the same
				// two every time.
				this.append(errorLine(`${run.command} exited ${code}`));
				this.append(dim(`  /explain ${run.command} describes what it needs · /status checks the artifacts`));
			} else if (!cancelled && outputCount === 0) {
				// A command that succeeded and said nothing is indistinguishable
				// from one that was never dispatched. Every engine command has
				// something to say, so silence here is a surprise worth marking
				// rather than a state to leave on screen.
				this.append(okLine(`${run.command} completed — no output`));
			}
		} catch (error) {
			this.append(errorLine(message(error)));
		} finally {
			this.cancelRun = undefined;
			this.stopSpinner();
			if (run.command === "serve") this.session.serveUrl = null;
			// "stopped" lands here rather than in `stopCurrent` because only
			// this moment knows the run actually settled. Commands with no
			// cancellation path into the work they already started keep
			// running to completion in the background — worth a note once
			// that resolves, since it may be minutes later and completely
			// disconnected from anything the user has done since.
			if (cancelled) {
				this.append(infoLine("stopped"));
				if (run.command !== "serve") {
					this.append(dim(`  ${run.command} kept running in the background and has now finished`));
				}
			}
			// The run may have rewritten the artifacts the conversation's
			// cached knowledge was built from — a /scan or /index above all.
			// The next turn rebuilds rather than answering from a stale index.
			this.chatCache = {};
			// The run may have written artifacts; the header must not keep
			// reporting the state from before it.
			await this.refreshKnowledge();
			await this.drainQueue();
			this.ui.requestRender();
		}
	}

	/**
	 * Run a shell / powershell command directly, streaming its output into the transcript.
	 */
	private async runShell(command: string): Promise<void> {
		this.append(shellCommandLine(command));
		let cancelled = false;
		let cancelShell: (() => void) | undefined;
		this.cancelRun = () => {
			cancelled = true;
			cancelShell?.();
		};

		this.startSpinner(`powershell: ${truncate(command, 30)}`);
		const batch: string[] = [];
		let flushQueued = false;
		let outputCount = 0;
		const flush = (): void => {
			flushQueued = false;
			const lines = batch.splice(0, batch.length);
			if (cancelled || lines.length === 0) return;
			for (const line of lines) {
				outputCount++;
				this.append(line);
			}
			this.ui.requestRender();
		};

		try {
			const code = await this.shellRunner(
				command,
				this.session.root,
				(line) => {
					if (cancelled) return;
					batch.push(line);
					if (!flushQueued) {
						flushQueued = true;
						queueMicrotask(flush);
					}
				},
				(cancel) => {
					cancelShell = cancel;
				},
			);

			// Flush any pending lines
			if (!cancelled && batch.length > 0) {
				for (const line of batch.splice(0, batch.length)) {
					outputCount++;
					this.append(line);
				}
			}

			if (cancelled) {
				this.append(infoLine("powershell command stopped"));
			} else if (code !== 0) {
				this.append(errorLine(`powershell exited ${code}`));
			} else if (outputCount === 0) {
				this.append(okLine("completed"));
			}
		} catch (error) {
			if (!cancelled) {
				this.append(errorLine(`powershell failed: ${message(error)}`));
			}
		} finally {
			this.cancelRun = undefined;
			this.stopSpinner();
			this.ui.requestRender();
		}

		await this.drainQueue();
	}

	/**
	 * A chat turn.
	 *
	 * The runner defaults to the real bridge, imported lazily so that starting
	 * the interface costs nothing on the model path — the overwhelming
	 * majority of sessions open, run a command and never send a turn.
	 *
	 * The turn paints itself as it happens: prose lands as it arrives, tool
	 * calls as they start, and the formatted reply replaces the raw stream the
	 * moment the model finishes — before the verification gate, whose verdict
	 * lands afterwards as the follow-up line it is. A turn where every one of
	 * those steps is visible reads as fast as it actually is; a turn that
	 * shows one word for the lot reads as a hang.
	 *
	 * `mode` decides whether the agent gets write tools at all: build and
	 * general do, plan/explore/review/prism do not — matching what `/mode`'s
	 * own help text promises. When it does, every write/edit/command goes
	 * through this shell's own approval prompt, the same one engine-command
	 * diffs use, so `/yolo` and a denied change behave identically here.
	 */
	private async chat(question: string): Promise<void> {
		this.append(userLine(question));
		// No model is assumed anywhere in the engine: without a session choice,
		// a saved one or KAIOKEN_MODEL, a turn would only reach the provider
		// layer to be refused. Saying what to do first is cheaper than the
		// round trip.
		if (!this.session.model && !process.env.KAIOKEN_MODEL) {
			this.append(errorLine("no model selected — /model <provider>/<id> picks one · /provider list shows who is configured"));
			this.append(dim("  the choice is saved to .kaioken/model.json and the CLI picks it up too"));
			this.ui.requestRender();
			return;
		}
		this.startSpinner("thinking");
		let cancelled = false;
		const controller = new AbortController();
		this.cancelRun = () => {
			cancelled = true;
			controller.abort();
		};
		const stream: StreamState = { blocks: [], replyShown: false };
		this.stream = stream;
		try {
			const canWrite = this.session.mode === "build" || this.session.mode === "general";
			const reply = await this.chatRunner({
				root: this.session.root,
				question,
				...(this.session.model ? { model: this.session.model } : {}),
				write: canWrite,
				...(canWrite ? { approve: (name: string, args: unknown) => this.approveToolCall(name, args) } : {}),
				signal: controller.signal,
				cache: this.chatCache,
				thinking: this.session.thinking,
				initialMessages: this.sessionMessages.length > 0 ? this.sessionMessages : undefined,
				onText: (delta) => {
					if (cancelled) return;
					this.streamText(stream, delta);
				},
				onThinking: (delta) => {
					if (cancelled) return;
					this.streamThinking(stream, delta);
				},
				onTool: (name, args) => {
					if (cancelled) return;
					this.streamTool(stream, name, args);
				},
				// The reply arrives here the moment the model is done — before
				// the gate — so it is on screen while the repository's own
				// typecheck, build and test run.
				onReply: (text) => {
					if (cancelled || stream.replyShown) return;
					stream.replyShown = true;
					this.showStreamReply(stream, text);
				},
				// The gate is the long half of a turn that wrote something, and
				// it starts after the model has finished. Saying so is the
				// difference between a wait and an apparent hang.
				onVerify: (what) => {
					if (cancelled) return;
					this.startSpinner(`verifying — ${what}`);
				},
			});
			if (cancelled) return;
			if (!stream.replyShown) {
				// A runner that never streamed — the scripted doubles in tests,
				// an embedder that passes no hooks — still gets the formatted
				// block, in one piece.
				stream.replyShown = true;
				this.showStreamReply(stream, reply.reply);
			}
			this.lastAssistantReply = reply.reply;
			this.sessionTurns++;
			if (reply.messages) {
				this.sessionMessages = reply.messages;
			}
			// Auto-save the active conversation to .kaioken/sessions/
			void this.persistCurrentSession();

			if (reply.gateRan) {
				this.append(infoLine(`gate: ${JSON.stringify(reply.verified).slice(0, 120)}`));
			}
		} catch (error) {
			if (!cancelled) this.append(errorLine(message(error)));
		} finally {
			if (this.stream) {
				for (const block of this.stream.blocks) {
					if (block.kind === "thinking" && !block.closed) {
						this.closeThinkingBlock(block);
					}
				}
			}
			this.stream = null;
			this.cancelRun = undefined;
			this.stopSpinner();
			if (cancelled) this.append(infoLine("stopped"));
			await this.drainQueue();
			this.ui.requestRender();
		}
	}

	/** Return the supported thinking levels for the active model. */
	private getModelThinkingLevels(): string[] {
		if (this.chatCache.resolved) {
			const { model, ai } = this.chatCache.resolved;
			return ai.getSupportedThinkingLevels(model);
		}
		return ["off", "minimal", "low", "medium", "high", "xhigh", "max"];
	}

	/** Finalize a thinking block: compute duration and rewrite header row with OpenCode summary. */
	private closeThinkingBlock(block: StreamBlock): void {
		if (block.kind !== "thinking" || block.closed) return;
		block.closed = true;
		block.endTime = Date.now();
		const durationMs = block.startTime ? block.endTime - block.startTime : undefined;
		const collapsed = this.session.thinkingVisibility === "hide";
		if (block.headerIndex !== undefined && block.headerIndex < this.lines.length) {
			this.lines[block.headerIndex] = thinkingCompletedHeader(block.title ?? null, durationMs, collapsed);
		}
	}

	/**
	 * Stream one thinking/reasoning delta into the transcript.
	 *
	 * Styled in dimmed text with an OpenCode-style live header showing
	 * extracted bold title ("Thinking: <title>") and duration on completion.
	 */
	private streamThinking(stream: StreamState, delta: string): void {
		if (delta === "") return;
		let block = stream.blocks[stream.blocks.length - 1];
		if (!block || block.closed || block.kind !== "thinking") {
			if (block && !block.closed) {
				if (block.kind === "thinking") this.closeThinkingBlock(block);
				else block.closed = true;
			}
			const headerIdx = this.lines.length;
			this.append(thinkingStreamingHeader(null));
			block = {
				start: this.lines.length,
				end: this.lines.length,
				closed: false,
				text: "",
				kind: "thinking",
				headerIndex: headerIdx,
				startTime: Date.now(),
				title: null,
			};
			stream.blocks.push(block);
		}
		block.text += delta;

		const summary = reasoningSummary(block.text);
		if (summary.title && summary.title !== block.title) {
			block.title = summary.title;
			if (block.headerIndex !== undefined && block.headerIndex < this.lines.length) {
				this.lines[block.headerIndex] = thinkingStreamingHeader(summary.title);
			}
		}

		if (this.session.thinkingVisibility === "hide") {
			this.ui.requestRender();
			return;
		}

		const bodyToRender = summary.body || block.text;
		const rendered = bodyToRender.split("\n").map((part) => (part === "" ? "" : dim(`  ${part}`)));
		this.lines.splice(block.start, block.end - block.start, ...rendered);
		block.end = block.start + rendered.length;
		this.ui.requestRender();
	}

	/**
	 * Stream one prose delta into the transcript.
	 *
	 * The text accumulates into the turn's open block and the block's own rows
	 * are rewritten in place — splicing exactly the region the block owns, so
	 * tool lines and approvals around it stay put. Only the last physical row
	 * of the block changes per delta, which the wrap memo makes cheap.
	 */
	private streamText(stream: StreamState, delta: string): void {
		if (delta === "") return;
		let block = stream.blocks[stream.blocks.length - 1];
		if (!block || block.closed || block.kind === "thinking") {
			if (block && !block.closed) {
				if (block.kind === "thinking") this.closeThinkingBlock(block);
				else block.closed = true;
			}
			block = { start: this.lines.length, end: this.lines.length, closed: false, text: "", kind: "prose" };
			stream.blocks.push(block);
		}
		block.text += delta;
		const rendered = block.text.split("\n").map((part) => (part === "" ? "" : fg("assistant", part)));
		this.lines.splice(block.start, block.end - block.start, ...rendered);
		block.end = block.start + rendered.length;
		this.ui.requestRender();
	}

	/** Announce a tool call: the block stops taking text and the call gets its row. */
	private streamTool(stream: StreamState, name: string, args: unknown): void {
		const block = stream.blocks[stream.blocks.length - 1];
		if (block && !block.closed) {
			if (block.kind === "thinking") this.closeThinkingBlock(block);
			else block.closed = true;
		}
		this.append(toolCallLine(name, JSON.stringify(args ?? {})));
		this.ui.requestRender();
	}

	/**
	 * Put the finished reply on screen.
	 *
	 * The raw streamed prose rows come out and the formatted prose goes in where the
	 * first prose block began — the markdown pass is worth having, but only once the
	 * text has stopped moving under it. Thinking blocks remain intact in the scrollback.
	 * A turn with no streamed prose rows (nothing arrived before the reply did)
	 * just appends the block.
	 */
	private showStreamReply(stream: StreamState, reply: string): void {
		for (const block of stream.blocks) {
			if (block.kind === "thinking" && !block.closed) {
				this.closeThinkingBlock(block);
			}
		}
		const proseBlocks = stream.blocks.filter((b) => b.kind !== "thinking");
		if (proseBlocks.length === 0) {
			if (reply.trim().length > 0) {
				this.append(...assistantLines(reply, this.width));
			}
			this.ui.requestRender();
			return;
		}
		const first = proseBlocks[0]!.start;
		for (let i = proseBlocks.length - 1; i >= 0; i--) {
			const block = proseBlocks[i]!;
			this.lines.splice(block.start, block.end - block.start);
		}
		this.lines.splice(first, 0, ...assistantLines(reply, this.width));
		this.ui.requestRender();
	}

	/**
	 * Send whatever was typed while the last task ran, oldest first.
	 *
	 * A queued line keeps the meaning it had when it was typed: one starting
	 * with `/` is a command and runs as one — sending it to the model as
	 * prose would make `/stop` typed in a hurry come back as a question
	 * about stopping.
	 */
	private async drainQueue(): Promise<void> {
		const next = this.session.queued.shift();
		if (next === undefined) return;
		if (next.startsWith("!")) return this.runShell(next.slice(1).trim());
		if (next.startsWith("/")) return this.runCommand(next);
		return this.chat(next);
	}

	/** Re-read the artifacts behind the header's knowledge row. */
	private async refreshKnowledge(): Promise<void> {
		this.knowledge = await readRepoState(this.session.root);
		this.render();
	}

	private stopCurrent(): void {
		if (!this.busy) {
			// Nothing to cancel. Saying so beats a keystroke that appears to
			// have been swallowed — the two are indistinguishable on screen.
			this.append(infoLine("nothing running"));
			this.ui.requestRender();
			return;
		}
		this.lastStopPress = 0;
		this.cancelRun?.();
		// The spinner keeps turning until the run actually settles: an abort
		// has to reach the engine before "stopped" means anything, and the
		// chat and engine finally blocks both say it the moment their promise
		// resolves. Saying it here would promise a stop that has not happened.
		this.append(infoLine("stopping…"));
		this.ui.requestRender();
	}

	// ---- approvals ----

	/**
	 * `/provider`: list who is configured, or retarget the session.
	 *
	 * The engine never learns a provider name — it takes a model spec — so a
	 * switch is the shell retargeting itself: the provider, and a model from
	 * that provider's catalog when the current spec cannot run there. Every
	 * move is said in full, because the next turn bills the new provider.
	 */
	private async runProviders(action: ProviderAction): Promise<void> {
		let infos: ProviderInfo[];
		try {
			infos = await this.listProviders();
		} catch (error) {
			this.append(errorLine(message(error)));
			return this.repaintAsync();
		}

		if (action.kind === "list") {
			this.append(...providerLines(infos, this.session.provider));
			return this.repaintAsync();
		}

		if (action.kind === "models") {
			this.append(...modelLines(infos, action.filter, this.session.model));
			return this.repaintAsync();
		}

		if (action.kind === "model") {
			return this.applyModelSpec(infos, action.spec);
		}

		const target = infos.find((info) => info.id === action.name);
		if (!target) {
			this.append(errorLine(`no provider called "${action.name}" — /provider list shows what this engine knows`));
			return this.repaintAsync();
		}
		if (!target.authSource) {
			this.append(errorLine(`${target.id} has no credentials — set ${credentialHint(target)} and try again`));
			return this.repaintAsync();
		}

		this.session.provider = target.id;
		this.session.hasKey = keyPresentFor(target.id);
		const lines: Line[] = [okLine(`provider → ${target.id}`)];
		if (this.session.model.startsWith(`${target.id}/`)) {
			lines.push(dim(`  model stays ${this.session.model}`));
		} else if (target.models.length > 0) {
			// A spec for the old provider cannot follow; the catalog's own
			// first entry is the honest default, said out loud so it can be
			// corrected rather than discovered from the bill.
			this.session.model = `${target.id}/${pickDefaultModel(target.models)}`;
			lines.push(infoLine(`  model → ${this.session.model} (first of ${target.models.length} in the catalog)`));
		} else {
			// No cached catalog to pick from — keeping the old spec would run
			// the provider the user just left, so it goes and the fallback is
			// named instead of implied.
			this.session.model = "";
			lines.push(warnLine(`  no ${target.id} models in the catalog — the next turn falls back to the engine default`));
		}
		this.append(...lines, "", ...statusPanel(this.headerInfo()), "");
		this.showFlash(`provider → ${target.id}`);
		return this.repaintAsync();
	}

	/**
	 * Apply a `/model <spec>` choice, with the catalog's say on what it names.
	 *
	 * A spec's first segment usually is the provider — but an OpenRouter id
	 * carries a namespace of its own, and `z-ai/glm-4.5` typed without its
	 * `openrouter/` prefix would leave the session keyed and billed against a
	 * provider that does not exist. When the catalog says the whole spec is
	 * really a model id of a configured provider, the prefix is added and the
	 * rewrite is said out loud; otherwise the spec is taken as typed and a
	 * first segment that names no provider is said so before the first turn
	 * fails on it.
	 */
	private async applyModelSpec(infos: readonly ProviderInfo[], spec: string): Promise<void> {
		const expanded = resolveModelSpec(infos, spec, this.session.model);
		const head = spec.slice(0, spec.indexOf("/"));
		const lines: Line[] = [];
		if (expanded) {
			this.session.model = `${expanded.provider}/${expanded.model}`;
			this.session.provider = expanded.provider;
			lines.push(okLine(`model → ${this.session.model}`));
			if (this.session.model !== spec) {
				// Only said when the prefix was actually added — a spec that
				// already named its provider needs no echo of the obvious.
				lines.push(dim(`  "${spec}" is ${expanded.provider}'s id — the provider prefix was added`));
			}
		} else {
			this.session.model = spec;
			this.session.provider = head;
			lines.push(okLine(`model → ${spec}`));
			const target = infos.find((info) => info.id === head);
			if (!target) {
				lines.push(warnLine(`  no provider called "${head}" — /provider list shows who is configured`));
			} else if (!target.authSource) {
				lines.push(warnLine(`  ${head} has no credentials — set ${credentialHint(target)} before the next turn`));
			}
		}
		this.session.hasKey = keyPresentFor(this.session.provider);
		this.append(...lines, "", ...statusPanel(this.headerInfo()), "");
		await this.persistModel();
		return this.repaintAsync();
	}

	/**
	 * Persist the current active session state to `.kaioken/sessions/<id>.json`.
	 */
	private async persistCurrentSession(): Promise<void> {
		// An empty conversation is not worth a file — except when it is a branch
		// somebody just took. A fork rewound to turn zero still exists, and a
		// branch missing from its own tree is a branch nobody can get back to.
		if (this.sessionTurns === 0 && this.sessionMessages.length === 0 && !this.sessionParent) return;
		try {
			const saved: SavedSession = {
				id: this.activeSessionId,
				title: deriveTitle(this.sessionMessages),
				created: this.sessionCreatedAt,
				updated: new Date().toISOString(),
				model: this.session.model,
				provider: this.session.provider,
				mode: this.session.mode,
				thinking: this.session.thinking,
				turns: this.sessionTurns,
				messages: this.sessionMessages,
				transcript: [...this.lines],
				...(this.sessionParent ? { parent: this.sessionParent } : {}),
			};
			await saveSession(this.session.root, saved);
		} catch {
			// Best-effort auto-save: non-fatal if disk is read-only
		}
	}

	/**
	 * Handle session actions: /sessions, /session, /resume, /switch, /new, /fork, /compact, /import.
	 */
	private async handleSessionAction(action: {
		kind: "list" | "info" | "resume" | "switch" | "new" | "fork" | "compact" | "import";
		arg?: string;
	}): Promise<void> {
		switch (action.kind) {
			case "list": {
				const list = await listSessions(this.session.root);
				if (list.length === 0) {
					this.append(
						infoLine("no saved sessions in .kaioken/sessions/"),
						dim("  conversations are saved automatically after each completed reply"),
					);
					return this.repaintAsync();
				}
				const lines: Line[] = [
					bold(fg("accent", "SAVED SESSIONS")),
					dim("─".repeat(Math.min(76, this.width - 4))),
				];
				for (const item of list) {
					const activeMarker = item.id === this.activeSessionId ? fg("ok", " ● active") : "";
					const dateStr = item.updated ? new Date(item.updated).toLocaleString() : "";
					lines.push(
						`${bold(fg("user", item.id))}  ${dim(dateStr)}  ${fg("warn", `${item.turns} turns`)}${activeMarker}`,
						`  ${dim("model:")} ${item.model || dim("(none)")}  ${dim("title:")} "${truncate(item.title, 45)}"`,
					);
				}
				lines.push("", dim("use /resume <id> to restore a session, or /new to start over"));
				this.append(...lines);
				return this.repaintAsync();
			}

			case "info": {
				const durationMinutes = Math.round((Date.now() - new Date(this.sessionCreatedAt).getTime()) / 60000);
				const p = sessionPath(this.session.root, this.activeSessionId);
				const lines: Line[] = [
					bold(fg("accent", "CURRENT SESSION")),
					dim("─".repeat(Math.min(76, this.width - 4))),
					`${dim("Session ID:")}  ${bold(fg("user", this.activeSessionId))}`,
					`${dim("Title:")}       "${deriveTitle(this.sessionMessages)}"`,
					`${dim("Turns:")}       ${bold(String(this.sessionTurns))}`,
					`${dim("Messages:")}    ${this.sessionMessages.length} items in agent context`,
					`${dim("Started:")}     ${new Date(this.sessionCreatedAt).toLocaleTimeString()} (${durationMinutes}m ago)`,
					`${dim("Model:")}       ${this.session.model || dim("(none)")}`,
					`${dim("Mode:")}        ${this.session.mode}`,
					`${dim("Thinking:")}    ${this.session.thinking}`,
					`${dim("File:")}        ${dim(p)}`,
				];
				this.append(...lines);
				return this.repaintAsync();
			}

			case "new": {
				// Persist previous session if it has turns
				await this.persistCurrentSession();
				const oldId = this.activeSessionId;
				// Reset state
				this.activeSessionId = generateSessionId();
				this.sessionCreatedAt = new Date().toISOString();
				this.sessionTurns = 0;
				this.sessionMessages = [];
				this.sessionParent = undefined;
				this.lastAssistantReply = "";
				this.chatCache = {};
				this.lines = [];
				this.append(
					infoLine(`started fresh session — previous session saved (${oldId})`),
					dim("type to chat · /sessions lists saved conversations"),
				);
				this.showFlash("new session started");
				return this.repaintAsync();
			}

			case "switch":
			case "resume": {
				const targetId = action.arg?.trim();
				if (!targetId) {
					// No ID passed: show list
					const list = await listSessions(this.session.root);
					if (list.length === 0) {
						this.append(
							infoLine("no saved sessions to resume"),
							dim("  start typing to chat and create a session"),
						);
						return this.repaintAsync();
					}
					this.append(
						infoLine("specify a session id to resume — e.g. /resume <id>"),
						"",
						...list.slice(0, 5).map((s) => `  ${bold(fg("user", s.id))}  ${dim(`"${truncate(s.title, 35)}"`)}`),
						"",
						dim("run /sessions to view the full list"),
					);
					return this.repaintAsync();
				}

				// Auto-save current before switching
				await this.persistCurrentSession();

				const loaded = await loadSession(this.session.root, targetId);
				if (!loaded) {
					this.append(errorLine(`session "${targetId}" not found in .kaioken/sessions/`));
					return this.repaintAsync();
				}

				// Switch active context
				this.activeSessionId = loaded.id;
				this.sessionCreatedAt = loaded.created || new Date().toISOString();
				this.sessionTurns = loaded.turns ?? (Array.isArray(loaded.messages) ? loaded.messages.filter((m: any) => m?.role === "user").length : 0);
				this.sessionMessages = loaded.messages ?? [];
				this.sessionParent = loaded.parent;
				if (loaded.model) {
					this.session.model = loaded.model;
					const slash = loaded.model.indexOf("/");
					if (slash !== -1) this.session.provider = loaded.model.slice(0, slash);
				}
				if (loaded.mode) this.session.mode = loaded.mode;
				if (loaded.thinking) this.session.thinking = loaded.thinking;

				// Invalidate cache so agent reconstructs with initialMessages
				this.chatCache = {};

				// Restore transcript lines if saved, otherwise summarize
				if (loaded.transcript && loaded.transcript.length > 0) {
					this.lines = [...loaded.transcript];
					this.append(okLine(`resumed session ${loaded.id} (${this.sessionTurns} turns)`));
				} else {
					this.lines = [
						okLine(`resumed session ${loaded.id} (${this.sessionTurns} turns)`),
						dim(`title: "${loaded.title}"`),
					];
				}
				this.showFlash(`resumed ${loaded.id}`);
				return this.repaintAsync();
			}

			case "fork": {
				const n = parseInt(action.arg ?? "1", 10) || 1;
				if (this.sessionMessages.length === 0) {
					this.append(infoLine("no conversation turns to rewind"));
					return this.repaintAsync();
				}

				// The conversation being left is saved under its own id first.
				// A fork that rewound in place would destroy the very turns it
				// exists to let you come back to.
				const from = await this.branchFrom("fork");

				let removedTurns = 0;
				while (removedTurns < n && this.sessionMessages.length > 0) {
					const last = this.sessionMessages[this.sessionMessages.length - 1] as { role?: string };
					this.sessionMessages.pop();
					if (last?.role === "user") {
						removedTurns++;
					}
				}
				this.sessionTurns = Math.max(0, this.sessionTurns - removedTurns);

				// Reset agent session cache so next turn prompts from the forked message list
				this.chatCache = {};
				this.append(
					okLine(`forked conversation: rewound ${removedTurns} turn(s)`),
					dim(`branch ${this.activeSessionId} from ${from} · /tree lists them`),
				);
				void this.persistCurrentSession();
				return this.repaintAsync();
			}

			case "compact": {
				if (this.sessionMessages.length < 4) {
					this.append(infoLine("conversation is too short to compact (< 4 messages)"));
					return this.repaintAsync();
				}
				const beforeCount = this.sessionMessages.length;
				// Compaction is destructive to context, so it branches too: the
				// full conversation stays on disk under the old id, and /tree
				// can walk back to it if the summary turns out to have dropped
				// the one thing that mattered.
				const from = await this.branchFrom("compact");
				// Retain last turn (user + assistant) and summarize earlier turns
				const tail = this.sessionMessages.slice(-2);
				const earlier = this.sessionMessages.slice(0, -2);
				// The summary is the engine's own handoff of the branch just left —
				// a real briefing, written by the model from the saved transcript.
				// Without a model the marker says what actually happened — messages
				// were elided, and where they went — rather than dressing the
				// conversation's title up as a summary of it.
				const briefing = await this.briefingForSession(from);
				const summaryText = briefing
					? `[Earlier conversation compacted from ${earlier.length} messages. Briefing of the full conversation, preserved as session ${from}:\n\n${briefing}]`
					: `[${earlier.length} earlier messages elided — no model available to summarise them. The full conversation is preserved in session ${from}.]`;
				this.sessionMessages = [
					{ role: "system", content: [{ type: "text", text: summaryText }] },
					...tail,
				];
				this.chatCache = {};
				this.append(
					okLine(`compacted conversation: reduced from ${beforeCount} to ${this.sessionMessages.length} items`),
					dim(
						briefing
							? "earlier context carried as a briefing written from the saved transcript"
							: `earlier messages elided unsummarised; full copy in session ${from}`,
					),
				);
				void this.persistCurrentSession();
				return this.repaintAsync();
			}

			case "import": {
				const targetPath = action.arg?.trim();
				if (!targetPath) {
					this.append(errorLine("/import requires a path to a session JSON or JSONL file"));
					return this.repaintAsync();
				}
				try {
					const raw = await readFile(resolve(this.session.root, targetPath), "utf8");
					let parsedData: any;
					try {
						parsedData = JSON.parse(raw);
					} catch {
						// Try line-delimited JSON
						parsedData = raw
							.split("\n")
							.map((l) => l.trim())
							.filter(Boolean)
							.map((l) => JSON.parse(l));
					}
					const newId = generateSessionId();
					const imported: SavedSession = {
						id: newId,
						title: typeof parsedData.title === "string" ? parsedData.title : deriveTitle(Array.isArray(parsedData) ? parsedData : parsedData.messages),
						created: new Date().toISOString(),
						updated: new Date().toISOString(),
						model: parsedData.model ?? this.session.model,
						provider: parsedData.provider ?? this.session.provider,
						mode: parsedData.mode ?? "build",
						thinking: parsedData.thinking ?? "off",
						turns: Array.isArray(parsedData.messages) ? parsedData.messages.filter((m: any) => m?.role === "user").length : 1,
						messages: Array.isArray(parsedData.messages) ? parsedData.messages : (Array.isArray(parsedData) ? parsedData : []),
						transcript: Array.isArray(parsedData.transcript) ? parsedData.transcript : undefined,
					};
					await saveSession(this.session.root, imported);
					this.append(okLine(`imported external conversation as session ${newId}`));
					// Switch to imported session
					return this.handleSessionAction({ kind: "resume", arg: newId });
				} catch (err) {
					this.append(errorLine(`failed to import: ${message(err)}`));
					return this.repaintAsync();
				}
			}
		}
	}

	/**
	 * Handle developer utility actions: /diff, /copy, /cost.
	 */
	private async handleUtilAction(action: { kind: "diff" | "copy" | "cost"; arg?: string }): Promise<void> {
		switch (action.kind) {
			case "diff": {
				const { exec } = await import("node:child_process");
				return new Promise<void>((resolvePromise) => {
					exec("git diff", { cwd: this.session.root }, (err, stdout, stderr) => {
						if (err) {
							this.append(errorLine(`git diff error: ${stderr.trim() || err.message}`));
						} else if (!stdout.trim()) {
							this.append(dim("working tree clean — no uncommitted changes"));
						} else {
							const lines = stdout.split("\n");
							const rendered: Line[] = [
								bold(fg("accent", "GIT DIFF")),
								dim("─".repeat(Math.min(76, this.width - 4))),
							];
							for (const line of lines.slice(0, 100)) {
								if (line.startsWith("+")) rendered.push(fg("diffAdd", line));
								else if (line.startsWith("-")) rendered.push(fg("diffDel", line));
								else if (line.startsWith("@@") || line.startsWith("diff ")) rendered.push(bold(fg("warn", line)));
								else rendered.push(dim(line));
							}
							if (lines.length > 100) {
								rendered.push(dim(`  … and ${lines.length - 100} more lines`));
							}
							this.append(...rendered);
						}
						this.repaintAsync().then(resolvePromise);
					});
				});
			}

			case "copy": {
				if (!this.lastAssistantReply) {
					this.append(infoLine("no assistant reply to copy yet"));
					return this.repaintAsync();
				}
				const isWin = process.platform === "win32";
				const cmd = isWin ? "clip.exe" : process.platform === "darwin" ? "pbcopy" : "xclip -selection clipboard";
				const child = spawn(cmd, { shell: true });
				child.stdin.write(this.lastAssistantReply);
				child.stdin.end();
				child.on("close", (code) => {
					if (code === 0) {
						this.append(okLine("copied last assistant reply to clipboard"));
					} else {
						this.append(errorLine(`clipboard command exited with code ${code}`));
					}
					this.ui.requestRender();
				});
				return;
			}

			case "cost": {
				// The runtime bills per assistant reply and records what it spent
				// on the message: usage tokens and the cost it computed from the
				// model's own pricing. Summing those is real accounting; a flat
				// per-token rate invented here would be real-looking nonsense.
				let replies = 0;
				let inputTokens = 0;
				let outputTokens = 0;
				let cachedTokens = 0;
				let cost: number | null = null;
				for (const raw of this.sessionMessages) {
					const message = raw as {
						role?: string;
						usage?: {
							input?: number;
							output?: number;
							cacheRead?: number;
							cacheWrite?: number;
							cost?: { total?: number };
						};
					};
					if (message.role !== "assistant" || !message.usage) continue;
					replies++;
					inputTokens += message.usage.input ?? 0;
					outputTokens += message.usage.output ?? 0;
					cachedTokens += (message.usage.cacheRead ?? 0) + (message.usage.cacheWrite ?? 0);
					if (typeof message.usage.cost?.total === "number") {
						cost = (cost ?? 0) + message.usage.cost.total;
					}
				}

				const lines: Line[] = [
					bold(fg("accent", "USAGE & COST")),
					dim("─".repeat(Math.min(76, this.width - 4))),
					`${dim("Conversation turns:")}  ${this.sessionTurns}`,
					`${dim("Context messages:")}    ${this.sessionMessages.length}`,
				];
				if (replies > 0) {
					lines.push(
						`${dim("Metered replies:")}      ${replies}`,
						`${dim("Tokens:")}  ${inputTokens.toLocaleString()} in · ${outputTokens.toLocaleString()} out${cachedTokens > 0 ? ` · ${cachedTokens.toLocaleString()} cached` : ""}`,
					);
					lines.push(
						cost !== null
							? `${dim("Cost:")}                ~$${cost.toFixed(4)} USD (reported by the provider per reply)`
							: dim("cost unpriced — the provider's replies carried no cost figure"),
					);
				} else {
					lines.push(
						dim("no metered replies yet — usage is recorded per assistant reply"),
					);
				}
				this.append(...lines);
				return this.repaintAsync();
			}
		}
	}

	/**
	 * `/tree` — the conversation's branches, and moving between them.
	 *
	 * Bare, it lists the tree. With a number it switches to that branch, which
	 * is an ordinary resume of a session that happens to have a parent. Adding
	 * `summarize` writes a briefing of the branch being left and carries it
	 * into the one being joined, so a fork does not start by forgetting what
	 * the fork was for.
	 */
	private async handleHistoryAction(
		action:
			| { kind: "tree"; branch: string; summarize: boolean }
			| { kind: "undo"; steps: number },
	): Promise<void> {
		if (action.kind === "undo") return this.undoChanges(action.steps);

		// The live conversation has to be on disk before it can appear in its
		// own tree — otherwise the branch you are standing on is the one branch
		// the listing does not show.
		await this.persistCurrentSession();
		const sessions = await listSessions(this.session.root);
		const nodes = flattenBranches(buildBranchTree(sessions));

		if (nodes.length === 0) {
			this.append(
				infoLine("no saved conversations yet"),
				dim("  /fork rewinds this one and leaves a branch behind"),
			);
			return this.repaintAsync();
		}

		if (!action.branch) {
			this.append(
				bold(fg("accent", "CONVERSATION TREE")),
				dim("─".repeat(Math.min(76, this.width - 4))),
				...nodes.map((node, i) => {
					const indent = "  ".repeat(node.depth);
					const marker = node.session.id === this.activeSessionId ? fg("ok", "●") : node.tip ? fg("accent", "○") : dim("·");
					const reason = node.session.parent ? dim(` (${node.session.parent.reason} at turn ${node.session.parent.turns})`) : "";
					return `  ${dim(String(i + 1).padStart(2))} ${indent}${marker} ${truncate(node.session.title, 40)}${reason}`;
				}),
				dim("  ● here · ○ branch tip · · branched away from"),
				dim("  /tree <n> switches · /tree <n> summarize carries a briefing over"),
			);
			return this.repaintAsync();
		}

		const index = Number.parseInt(action.branch, 10);
		const target = Number.isInteger(index) ? nodes[index - 1] : nodes.find((n) => n.session.id.startsWith(action.branch));
		if (!target) {
			this.append(errorLine(`no branch "${action.branch}" — /tree lists them by number`));
			return this.repaintAsync();
		}
		if (target.session.id === this.activeSessionId) {
			this.append(infoLine("already on that branch"));
			return this.repaintAsync();
		}

		let briefing = "";
		if (action.summarize) {
			briefing = await this.brancheBriefing();
			if (!briefing) {
				this.append(dim("  no briefing was written — switching without one"));
			}
		}

		// Resuming replaces the transcript with the branch's own saved one, so
		// the tree the user was just reading — and the command they typed — are
		// gone from the screen by the time this returns. Saying which branch
		// they landed on is the only continuity they get.
		await this.handleSessionAction({ kind: "resume", arg: target.session.id });
		this.append(
			okLine(`branch ${index || target.session.id} — ${truncate(target.session.title, 48)}`),
			dim(`  ${target.session.turns} turn(s) · /tree lists the branches again`),
		);

		if (briefing) {
			// Prepended as context rather than appended as a turn: it is
			// something the model should know before it answers, not something
			// anybody said in this conversation.
			this.sessionMessages.unshift({
				role: "system",
				content: [
					{ type: "text", text: `Briefing carried over from the branch you were on:\n\n${briefing}` },
				],
			});
			this.chatCache = {};
			this.append(dim("  carried a briefing of the previous branch into this one"));
			await this.persistCurrentSession();
		}
		return this.repaintAsync();
	}

	/**
	 * Brief the branch being left, by running the engine's own handoff.
	 *
	 * Reusing `kaioken handoff` rather than writing a second summariser means
	 * the briefing that travels between branches is the same document a
	 * teammate would be handed — one prompt, one definition of what matters.
	 */
	private async brancheBriefing(): Promise<string> {
		if (this.sessionTurns === 0 && this.sessionMessages.length === 0) return "";
		return this.briefingForSession(this.activeSessionId);
	}

	/**
	 * The handoff briefing of a saved session, or "" when none was written.
	 *
	 * The engine reads the session off disk, so it must already be saved —
	 * callers branch (which persists) before asking. Only the four briefing
	 * sections travel; the appended transcript is the whole conversation,
	 * which is exactly what the branch itself preserves.
	 */
	private async briefingForSession(id: string): Promise<string> {
		await this.runEngine({
			command: "handoff",
			args: ["--session", id],
			busyText: "briefing the branch you are leaving",
		});
		const path = join(this.session.root, ".kaioken", "handoffs", `${id}.md`);
		const document = await readFile(path, "utf8").catch(() => "");
		const cut = document.indexOf("\n---\n");
		const head = cut === -1 ? document : document.slice(0, cut);
		return head.trim();
	}

	/**
	 * `/undo` — put back what the agent changed.
	 *
	 * One step at a time, each one reported: a loop that quietly reverted six
	 * files would be indistinguishable, afterwards, from one that reverted the
	 * wrong six. Git remains the real history; this covers the gap between
	 * commits, which is exactly where an agent does its work.
	 */
	private async undoChanges(steps: number): Promise<void> {
		const done: string[] = [];
		for (let i = 0; i < steps; i++) {
			let outcome: Awaited<ReturnType<typeof undoLast>>;
			try {
				outcome = await undoLast(this.session.root);
			} catch (error) {
				this.append(errorLine(`undo failed: ${message(error)}`));
				break;
			}
			if (!outcome) break;
			done.push(
				outcome.action === "deleted"
					? `${fg("diffDel", "deleted")} ${outcome.entry.path} (the agent had created it)`
					: `${fg("diffAdd", "restored")} ${outcome.entry.path}`,
			);
		}

		if (done.length === 0) {
			this.append(
				infoLine("nothing to undo — no file changes recorded this session"),
				dim("  git remains the history for anything already committed"),
			);
			return this.repaintAsync();
		}
		this.append(okLine(`undid ${done.length} change(s)`), ...done.map((line) => `  ${line}`));
		return this.repaintAsync();
	}

	/**
	 * Save the conversation as it stands and continue under a new id.
	 *
	 * Returns the id left behind, which is what the caller reports. Everything
	 * else about the session — messages, turns, model — carries over; only the
	 * identity and the parent link change, because from here on the two
	 * conversations are different documents.
	 */
	private async branchFrom(reason: "fork" | "compact"): Promise<string> {
		const from = this.activeSessionId;
		await this.persistCurrentSession();
		this.activeSessionId = generateSessionId();
		this.sessionCreatedAt = new Date().toISOString();
		this.sessionParent = { id: from, turns: this.sessionTurns, reason };
		return from;
	}

	/**
	 * `/repo <path>` — point the whole session at a different repository.
	 *
	 * Everything the shell holds is keyed to the root: the agent's cached
	 * session, the header's knowledge row, the autocompleter's file list.
	 * Carrying any of it across would leave the next turn answering questions
	 * about one repository with facts from another, so the switch saves the
	 * conversation where it belongs, drops the caches, and rebuilds.
	 */
	private async handleRepoAction(action: { path: string }): Promise<void> {
		const target = resolve(this.session.root, action.path);

		let directory = false;
		try {
			directory = (await stat(target)).isDirectory();
		} catch {
			directory = false;
		}
		if (!directory) {
			this.append(errorLine(`not a directory: ${target}`));
			return this.repaintAsync();
		}
		if (target === this.session.root) {
			this.append(infoLine(`already pointed at ${target}`));
			return this.repaintAsync();
		}

		// Saved before the root moves: a session file belongs under the
		// repository it was about, and one line later this points elsewhere.
		await this.persistCurrentSession();

		const previous = this.session.root;
		this.session.root = target;
		this.activeSessionId = generateSessionId();
		this.sessionCreatedAt = new Date().toISOString();
		this.sessionTurns = 0;
		this.sessionMessages = [];
		this.sessionParent = undefined;
		this.lastAssistantReply = "";
		this.chatCache = {};
		this.editor.setAutocompleteProvider(kaiokenAutocomplete(target));

		// The model is per-repository too: a `.kaioken/model.json` in the new
		// root is that repository's recorded choice, and honouring it is the
		// difference between switching repositories and merely changing cwd.
		await this.adoptRepoModel();
		await this.refreshKnowledge();

		this.append(
			okLine(`repository → ${target}`),
			dim(`  was ${previous} · conversation saved and reset`),
		);
		this.append("", ...statusPanel(this.headerInfo()), "");
		this.showFlash("repository switched");
		return this.repaintAsync();
	}

	/** Adopt the new root's recorded model, if it has one. */
	private async adoptRepoModel(): Promise<void> {
		const saved = await readFile(join(this.session.root, ".kaioken", "model.json"), "utf8").catch(
			() => null,
		);
		if (!saved) return;
		try {
			const parsed = JSON.parse(saved) as { model?: unknown };
			if (typeof parsed.model !== "string") return;
			const slash = parsed.model.indexOf("/");
			if (slash <= 0) return;
			this.session.provider = parsed.model.slice(0, slash);
			this.session.model = parsed.model;
			this.session.hasKey = keyPresentFor(this.session.provider);
		} catch {
			// A malformed model.json is the repository's problem to fix; the
			// switch itself succeeded, and keeping the current model is the
			// safe reading of an unreadable one.
		}
	}

	/**
	 * `/templates`, and `/t:<name>` — the repository's parameterized prompts.
	 *
	 * Expanding one produces an ordinary chat message, which is the whole
	 * point: a template is a saved way of *asking*, not a second kind of turn.
	 * A placeholder nothing filled stops the send instead of going out with a
	 * hole in it — the model would answer the incomplete question rather than
	 * point out that it was incomplete.
	 */
	private async handleTemplateAction(
		action: { kind: "list" } | { kind: "run"; name: string; args: string },
	): Promise<void> {
		if (action.kind === "list") {
			const templates = await listTemplates(this.session.root);
			if (templates.length === 0) {
				this.append(
					infoLine("no templates — write one to .kaioken/templates/<name>.md"),
					dim("  {{placeholders}} are filled from key=value arguments; /t:<name> runs it"),
				);
				return this.repaintAsync();
			}
			this.append(
				bold(fg("accent", "PROMPT TEMPLATES")),
				dim("─".repeat(Math.min(76, this.width - 4))),
				...templates.map((template) => {
					const vars = template.vars.length > 0 ? ` ${template.vars.map((v) => `<${v}>`).join(" ")}` : "";
					return `  ${fg("accent", `/t:${template.name}`)}${dim(vars)}`;
				}),
				dim(`  ${templates.length} template(s) in .kaioken/templates/`),
			);
			return this.repaintAsync();
		}

		const template = await loadTemplate(this.session.root, action.name);
		if (!template) {
			this.append(
				errorLine(`no template "${action.name}" — /templates lists them`),
				dim(`  expected .kaioken/templates/${action.name}.md`),
			);
			return this.repaintAsync();
		}

		const { prompt, missing } = expandTemplate(template, action.args);
		if (missing.length > 0) {
			this.append(
				errorLine(`/t:${template.name} still needs ${missing.map((m) => `${m}=`).join(" ")}`),
				dim(`  e.g. /t:${template.name} ${missing.map((m) => `${m}=…`).join(" ")}`),
			);
			return this.repaintAsync();
		}
		if (!prompt) {
			this.append(errorLine(`template "${template.name}" is empty`));
			return this.repaintAsync();
		}

		this.append(dim(`— /t:${template.name} —`));
		return this.chat(prompt);
	}

	/**
	 * Turn one chat tool call into the same y/n prompt engine commands use.
	 *
	 * The agent's harness tools (`write`, `edit`, `bash`) hand over their raw
	 * arguments before the call runs, not a diff — `edit`'s `oldText`/`newText`
	 * pairs are enough to build one; `write` has no "before" to compare against
	 * without reading the file first, so its preview is the new content in
	 * full, marked as all added lines. Any other mutating tool a future harness
	 * adds still gets asked about rather than let through unrecognised.
	 */
	private async approveToolCall(name: string, args: unknown): Promise<boolean> {
		const record = (args && typeof args === "object" ? args : {}) as Record<string, unknown>;
		if (name === "edit" || name === "write") {
			const approved = await this.approveFileChange(name, record);
			// The file's prior bytes are read here: after the answer, and before
			// the tool runs. Reading them afterwards would record what the agent
			// just wrote — the one thing an undo stack must never store — and
			// reading them earlier would journal a change the user then declined.
			if (approved) await this.journalUndo(name, String(record.path ?? ""));
			return approved;
		}
		if (name === "bash") {
			const command = String(record.command ?? "");
			const approved = await this.requestApproval({ action: "run", target: command, preview: command });
			// A bash call names no file, so its journal is recovered from the
			// command line itself — redirections and the file-mutating commands.
			// What the heuristic cannot see (a glob, a computed path) it does
			// not claim, and /undo says nothing about it rather than lying.
			if (approved) await this.journalBash(command);
			return approved;
		}
		return this.requestApproval({ action: name, target: name, preview: JSON.stringify(args ?? {}) });
	}

	/**
	 * Record what a file looked like before the agent changed it.
	 *
	 * Best-effort by design: a journal that could not be written is not a reason
	 * to block a change the user has already approved. `/undo` then reports an
	 * empty stack honestly, which is the better failure of the two.
	 */
	private async journalUndo(tool: string, path: string): Promise<void> {
		if (!path) return;
		try {
			await recordUndo(this.session.root, { path, tool, session: this.activeSessionId });
		} catch {
			// Nothing to say here. An error about the undo journal, printed in
			// the middle of a turn, reads as an error about the write itself.
		}
	}

	/**
	 * Journal the files an approved bash command is about to touch.
	 *
	 * `bashFileTargets` reads the command line for the paths it names. A
	 * mutation target that does not exist is dropped here rather than
	 * journaled — the undo stack never carries a "deletion" of something that
	 * was never there. Redirection targets are journaled either way: a file
	 * the command creates is undone by deleting it.
	 */
	private async journalBash(command: string): Promise<void> {
		const { files, creates } = bashFileTargets(command);
		for (const target of creates) {
			await this.journalUndo("bash", target);
		}
		for (const target of files) {
			const isFile = await stat(resolve(this.session.root, target))
				.then((s) => s.isFile())
				.catch(() => false);
			if (isFile) await this.journalUndo("bash", target);
		}
	}

	/** The y/n prompt for a write or an edit, with the diff it proposes. */
	private approveFileChange(name: string, record: Record<string, unknown>): Promise<boolean> {
		if (name === "edit") {
			const edits = Array.isArray(record.edits) ? record.edits : [];
			const preview = (edits as Array<{ oldText?: unknown; newText?: unknown }>)
				.flatMap((edit) => [
					...String(edit.oldText ?? "").split("\n").map((line) => `-${line}`),
					...String(edit.newText ?? "").split("\n").map((line) => `+${line}`),
				])
				.join("\n");
			return this.requestApproval({ action: "edit", target: String(record.path ?? ""), preview });
		}
		const preview = String(record.content ?? "")
			.split("\n")
			.map((line) => `+${line}`)
			.join("\n");
		return this.requestApproval({ action: "write", target: String(record.path ?? ""), preview });
	}

	/**
	 * Ask before a change lands, and block until an answer arrives.
	 *
	 * The diff goes into the transcript rather than a modal: it is part of what
	 * happened, it should still be there afterwards, and a long proposal needs
	 * the scrollback's room. The prompt itself replaces the composer, where
	 * the eye already is.
	 */
	requestApproval(request: ApprovalRequest): Promise<boolean> {
		if (this.session.autoApprove) return Promise.resolve(true);
		this.append(...approvalLines(request));
		this.approval = request;
		this.approvalArmedAt = Date.now();
		this.syncFrameTimer();
		this.ui.requestRender();
		return new Promise<boolean>((settle) => {
			this.approvalResolve = settle;
		});
	}

	private settleApproval(approved: boolean): void {
		const settle = this.approvalResolve;
		this.approval = null;
		this.approvalResolve = null;
		this.syncFrameTimer();
		this.append(approved ? fg("ok", "  approved") : fg("error", "  denied — nothing was written"));
		settle?.(approved);
	}

	// ---- lifecycle ----

	/**
	 * One animation driver for the whole interface.
	 *
	 * Effects are driven by a timer rather than by repaints, because an effect
	 * that only advances when something else redraws stops moving exactly when
	 * the process is busiest — the one moment it exists to be reassuring.
	 *
	 * The timer is alive only while something is actually animating. An idle
	 * Kaioken costs nothing: no repaints, no wakeups, no battery.
	 */
	private static readonly FRAME_MS = 66;

	private animating(): boolean {
		if (!motionEnabled()) return false;
		return this.busy || this.approval !== null || this.pendingConfirm !== null || this.liveFlash() !== null || this.revealing();
	}

	private syncFrameTimer(): void {
		if (this.animating()) {
			this.frameTimer ??= setInterval(() => {
				// The flash expires on its own; dropping it here is what lets
				// the driver go back to sleep afterwards.
				this.liveFlash();
				this.ui.requestRender();
				if (!this.animating()) this.stopFrameTimer();
			}, KaiokenTui.FRAME_MS);
			// Never hold the process open for an animation.
			this.frameTimer.unref?.();
			return;
		}
		this.stopFrameTimer();
	}

	private stopFrameTimer(): void {
		clearInterval(this.frameTimer);
		this.frameTimer = undefined;
	}

	private startSpinner(text: string): void {
		this.busy = true;
		this.busyText = text;
		this.busyStartedAt = Date.now();
		this.syncFrameTimer();
		this.ui.requestRender();
	}

	private stopSpinner(): void {
		this.busy = false;
		this.syncFrameTimer();
	}

	/** The flash, if it is still within its lifetime. Drops it if not. */
	private liveFlash(): { text: string; elapsedMs: number } | null {
		if (!this.flash) return null;
		const elapsedMs = Date.now() - this.flash.at;
		if (elapsedMs > FLASH_MS) {
			this.flash = null;
			return null;
		}
		return { text: this.flash.text, elapsedMs };
	}

	/** Show a transient confirmation in the status row. */
	private showFlash(text: string): void {
		this.flash = { text, at: Date.now() };
		this.syncFrameTimer();
		this.ui.requestRender();
	}

	/**
	 * Append to the scrollback.
	 *
	 * The transcript follows its end, which is right for a streaming reply and
	 * wrong for a block you just asked to read: `/help` is sixty rows, and
	 * following the end drops you two-thirds down it. When an append is taller
	 * than the viewport, park at the block's first row instead, so the answer
	 * starts where the eye already is.
	 *
	 * The scrollback is capped: a session that prints thousands of rows would
	 * otherwise keep them all forever, and even a memoised render pays for
	 * building the frame out of them. The cap is suspended while a turn is
	 * streaming, because the stream holds indices into this array.
	 */
	private append(...lines: Line[]): void {
		const firstAppended = this.lines.length;
		this.lines.push(...lines);
		let dropped = 0;
		if (this.stream === null && this.lines.length > MAX_SCROLLBACK) {
			dropped = this.lines.length - MAX_SCROLLBACK;
			this.lines.splice(0, dropped);
		}
		if (lines.length > this.transcript.viewportHeight) {
			this.transcript.scrollTo(this.wrappedHeightOf(firstAppended - dropped), { disableFollow: true });
		}
	}

	/**
	 * How many rendered rows the scrollback occupies before `index`.
	 *
	 * Counts memoised wraps, so it costs one map hit per line rather than a
	 * wrap pass — the O(scrollback) shape stays, but the constant is a
	 * thousandth of what re-wrapping cost.
	 */
	private wrappedHeightOf(index: number): number {
		const width = Math.max(8, this.transcript.getContentWidth(this.width));
		let rows = 0;
		for (let i = 0; i < index && i < this.lines.length; i++) {
			const line = this.lines[i] as string;
			if (line === "") {
				rows++;
				continue;
			}
			const info = this.lineInfo(line);
			rows += info.blank ? 1 : this.wrappedRows(line, info.indent, width).length;
		}
		return rows;
	}

	private repaint(): { consume: true } {
		this.ui.requestRender();
		return { consume: true };
	}

	private async repaintAsync(): Promise<void> {
		this.ui.requestRender();
	}

	private quit(): void {
		// Leaving happens once. The closing curtain is asynchronous, so a
		// second quit gesture arriving while it plays would otherwise stop an
		// already-stopped shell and draw a second curtain over the first.
		if (this.leaving) return;
		this.leaving = true;
		this.stopSpinner();
		this.stopFrameTimer();
		// `stop()` restores the terminal and prints the transcript back onto
		// the main screen, so everything below this runs on a terminal pi-tui
		// no longer owns.
		this.ui.stop();
		void this.farewell();
	}

	/**
	 * The closing curtain, and the last word.
	 *
	 * The exit is the mirror of the entrance: the same aura collapsing back
	 * through the same letters, then one line of goodbye left in the
	 * scrollback. The goodbye is printed whether or not motion is on — it is a
	 * message, not an effect, and `--no-motion` asked for stillness rather than
	 * silence.
	 *
	 * `process.exit` is in the `finally` on purpose: a terminal that refuses
	 * the curtain is not a reason to hang on the way out.
	 */
	private async farewell(): Promise<void> {
		try {
			await playCurtain(this.terminal, CLOSING);
			// `\r\n`, not `\n`: raw mode is already off, but a Windows console
			// with VT processing on takes a bare line feed as "down one row"
			// and leaves the next prompt indented under the goodbye.
			this.terminal.write(`${goodbyeLine(goodbye())}\r\n`);
		} catch {
			// Nothing to report to: the interface is already gone.
		} finally {
			// A headless shell is owned by its caller — exiting the process
			// from inside a render loop would take the test runner with it. It
			// still gets the goodbye, on its own terminal, which is what makes
			// the exit testable at all.
			if (!this.headless) process.exit(0);
		}
	}

	// ---- test seams ----

	/** Paint one frame now, bypassing the render throttle. */
	paint(): void {
		this.ui.renderNow(true);
	}

	/** The transcript as the interface built it, escapes included. */
	scrollback(): readonly Line[] {
		return this.lines;
	}

	/** The session a command would act on. */
	state(): Readonly<Session> {
		return this.session;
	}

	/** Whether an approval prompt is open, and on what. */
	pendingApproval(): ApprovalRequest | null {
		return this.approval;
	}

	isBusy(): boolean {
		return this.busy;
	}

	isPromptingForKey(): boolean {
		return this.pendingKey;
	}

	isStopArmed(): boolean {
		return this.busy && this.stream !== null && Date.now() - this.lastStopPress < STOP_CONFIRM_WINDOW_MS;
	}

	isShellMode(): boolean {
		return this.shellMode;
	}
}

/**
 * The default engine: the CLI's own command implementations, with their
 * output captured.
 *
 * They write to stdout because they were built for a shell; running them here
 * means intercepting that rather than forking a second copy of every command
 * for the TUI, which is how the two surfaces would drift.
 *
 * The capture works because the shell's own output path does not run through
 * `process.stdout.write` at call time: `SealedProcessTerminal` binds the real
 * write at construction, so a frame painted mid-run reaches the terminal even
 * while this function has swapped the global out. It reached exactly the
 * opposite arrangement once, for the length of every command, and the screen
 * froze for all of it — the capture swallowed the frames, the transcript
 * filled with them instead, and no spinner, counter or streamed line survived
 * the run.
 */
export const defaultEngine: EngineRunner = async (run, root, emit, onCancel) => {
	// `serve` never reaches the CLI: its command blocks on a process signal,
	// which an in-process caller cannot honestly synthesize without firing
	// every other SIGINT handler Node has registered. Importing the server
	// directly gets the same behaviour under the shell's cancel channel.
	if (run.command === "serve") {
		return runServeInProcess(root, run.args, emit, onCancel);
	}
	const { main } = await import("@kaioken/cli");
	const argv = engineArgv(run, root);

	const original = process.stdout.write.bind(process.stdout);
	const originalError = process.stderr.write.bind(process.stderr);
	let pending = "";
	const capture = (chunk: unknown): boolean => {
		pending += String(chunk);
		const parts = pending.split("\n");
		pending = parts.pop() ?? "";
		for (const line of parts) emit(line);
		return true;
	};
	process.stdout.write = capture as typeof process.stdout.write;
	process.stderr.write = capture as typeof process.stderr.write;
	try {
		return await main(argv);
	} finally {
		process.stdout.write = original;
		process.stderr.write = originalError;
		if (pending) emit(pending);
	}
};

/**
 * The palette this repository last chose, or "" when it has not chosen one.
 *
 * Read rather than required: a missing or malformed file means the default,
 * because a theme is a preference and a preference is never worth a failed
 * start.
 */
async function readSavedTheme(root: string): Promise<string> {
	try {
		const parsed = JSON.parse(await readFile(join(root, ".kaioken", "theme.json"), "utf8")) as {
			theme?: unknown;
		};
		return typeof parsed.theme === "string" ? parsed.theme : "";
	} catch {
		return "";
	}
}

/** The real chat runner: the TUI's own agent bridge. */
const defaultChatRunner: ChatRunner = (request) =>
	import("./chatBridge.js").then(({ chatHeadless }) => chatHeadless(request));

/**
 * The serve command, in process, with a cancellation channel.
 *
 * The CLI's own serve stands up the same server and then blocks until the
 * process is interrupted — right for a foreground command, wrong for an
 * embedder. Importing `@kaioken/serve` directly returns a handle whose
 * `close()` can be registered with the shell's cancel hook, so Esc stops the
 * server without a synthetic signal touching anything else.
 *
 * `serve()` resolves once the port is bound, so the emits below are truthful
 * the moment they land. Without a registered cancel the await never settles —
 * the server simply runs on, as it would in a terminal with no ctrl-c.
 */
async function runServeInProcess(
	root: string,
	args: readonly string[],
	emit: (line: string) => void,
	onCancel?: (cancel: () => void) => void,
): Promise<number> {
	const { serve } = await import("@kaioken/serve");
	const portArg = args.findIndex((a) => a === "--port");
	const parsed = portArg !== -1 ? Number(args[portArg + 1]) : Number.NaN;
	const port = Number.isInteger(parsed) && parsed >= 0 && parsed <= 65535 ? parsed : undefined;

	const server = await serve({ root, ...(port !== undefined ? { port } : {}) });
	emit(`serving ${root}`);
	emit(`  ${server.url}`);
	emit("  esc or /stop to stop");

	await new Promise<void>((done) => {
		onCancel?.(() => server.close().then(done, done));
	});
	return 0;
}

/**
 * Whether the session's provider has its credential in the environment.
 *
 * Model-less sessions have no provider to ask, so the three this project
 * documents stand in — the first chosen provider narrows the question to its
 * own variable.
 */
function keyPresentFor(provider: string): boolean {
	if (!provider) {
		return Boolean(process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY || process.env.OPENROUTER_API_KEY);
	}
	return Boolean(process.env[keyEnvVarFor(provider)]);
}

/**
 * The environment variable the session's provider reads its key from.
 *
 * The session's provider is whatever the model spec's prefix names; the
 * table lives with the provider catalog, which knows the same names.
 */
function keyEnvVarFor(provider: string): string {
	return envVarFor(provider);
}

/**
 * The editor's own chrome.
 *
 * Only the border and the autocomplete list are the editor's to colour; the
 * prompt glyph and the frame belong to `composer.ts`, so the two files do not
 * both claim the same row.
 */
function editorTheme(isShellMode?: () => boolean): EditorTheme {
	return {
		borderColor: (text) => (isShellMode?.() ? fg("warn", text) : fg("line", text)),
		selectList: {
			selectedPrefix: (text) => fg("accent", text),
			selectedText: (text) => bold(fg("warn", text)),
			description: (text) => dim(text),
			scrollInfo: (text) => dim(text),
			noMatch: (text) => dim(text),
		},
	};
}

/**
 * The leading whitespace of a rendered row, escapes ignored.
 *
 * Read from the visible text rather than the raw string, so a row that opens
 * with a colour code still reports the indent a reader sees.
 */
function leadingIndent(line: string): string {
	// biome-ignore lint: matching escape sequences is the whole job.
	const bare = line.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "");
	return /^\s*/.exec(bare)?.[0] ?? "";
}

function keycapPair(key: string, label: string): string {
	return `${bold(fg("warn", ` ${key} `))}${dim(` ${label}`)}`;
}

function message(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

/**
 * The argv the default engine hands the CLI for one engine run.
 *
 * Split out from `defaultEngine` because the model threading is contract, not
 * plumbing: a TUI launched with `--model` must generate on that model, and a
 * test can hold this to it without importing the CLI.
 */
export function engineArgv(run: EngineRun, root: string): string[] {
	return [
		run.command,
		"--root",
		root,
		...(run.model ? ["--model", run.model] : []),
		...run.args,
	];
}
