import { resolve } from "node:path";
import { KNOWLEDGE_TOOLS, runGate } from "@kaioken/agent";
import type { Flags } from "../../cli/dist/main.js";
import type { ChatSessionCache } from "../../cli/dist/main.js";

/**
 * The bridge from the TUI's chat view to the engine's agent.
 *
 * The CLI already owns the whole path — model resolution, the Pi agent loop,
 * the verification gate. Duplicating any of it here would create a second
 * behaviour to keep in sync, so the bridge drives the CLI's own `runChat`
 * directly, rather than round-tripping through `main`'s argv, which has no way
 * to carry a callback.
 *
 * `process.stdout` is left alone, and that is the load-bearing part. This ran
 * for a while with stdout replaced by a capture buffer, so the reply could be
 * parsed back out of `--json` output; but pi-tui repaints through
 * `process.stdout.write`, so every frame drawn during a turn went into the
 * buffer instead of the terminal. The screen froze on whatever it last painted
 * — "thinking · 0s", forever, with the elapsed counter stuck — and if the agent
 * asked to write a file, the approval prompt it was blocked on was painted into
 * the buffer too. The turn then waited on an answer to a question nobody could
 * see. `onOutcome` hands the reply over directly instead.
 *
 * stderr is still captured: the engine writes diagnostics there unconditionally,
 * and loose text would tear the alt screen. Nothing repaints through it.
 *
 * The reply also arrives before the gate does: `onReply` fires the moment the
 * model is done, so the shell can paint it while the repository's own
 * typecheck, build and test run afterwards; the gate's verdict comes later
 * through `onOutcome`. `onText` and `onTool` stream the turn as it happens.
 *
 * `cache` is the conversation's memory, held by the shell: knowledge, model
 * resolution and the agent session itself survive between turns instead of
 * being rebuilt — and re-billed — for every message.
 */

export interface ChatRequest {
	root: string;
	question: string;
	model?: string;
	/**
	 * Let the agent write files, edit them, and run commands.
	 *
	 * Without this, chat is knowledge-only — reading, searching, answering —
	 * no matter what the session's mode or auto-approve setting say, because
	 * neither one reaches this call unless the caller threads it through here.
	 */
	write?: boolean;
	/** Asked once per write/edit/command when `write` is true. */
	approve?: (name: string, args: unknown) => Promise<boolean>;
	/** Aborts the turn already in flight. */
	signal?: AbortSignal;
	/**
	 * Called with assistant prose as it arrives, so the reply paints token by
	 * token rather than landing all at once after the model finishes.
	 */
	onText?: (delta: string) => void;
	/** Called with assistant thinking/reasoning prose as it arrives. */
	onThinking?: (delta: string) => void;
	/** Called when a tool call starts, so the turn's work is visible. */
	onTool?: (name: string, args: unknown) => void;
	/**
	 * Called when the model is done, before the verification gate runs. The
	 * reply is on screen while the gate works; the gate's result follows via
	 * the return value's `verified`.
	 */
	onReply?: (reply: string) => void;
	/**
	 * Called when the model is done and the verification gate starts.
	 *
	 * The gate runs the repository's own typecheck, build and test commands, so
	 * on a turn that wrote a file it is most of the wait. Without this the
	 * status row went on saying "thinking" through all of it.
	 */
	onVerify?: (what: string) => void;
	/**
	 * The conversation cache, owned by the caller and passed on every turn.
	 * Absent on the first turn; filled in by the first; consumed by the rest.
	 */
	cache?: ChatSessionCache;
	/** Thinking depth: off, low, medium, high. */
	thinking?: string;
	/** Initial conversation history to seed into the agent. */
	initialMessages?: unknown[];
}

export interface ChatReply {
	reply: string;
	verified: unknown;
	gateRan: boolean;
	messages?: unknown[];
}

export async function chatHeadless(request: ChatRequest): Promise<ChatReply> {
	const capturedErr: string[] = [];
	const origErr = process.stderr.write.bind(process.stderr);

	process.stderr.write = ((chunk: unknown) => {
		capturedErr.push(String(chunk));
		return true;
	}) as typeof process.stderr.write;

	let outcome: { reply: string; verified: unknown; messages?: unknown[] } | null = null;

	try {
		const { parseArgs, runChat } = await import("../../cli/dist/main.js");
		// `--json` still matters with the hooks in place: it is what stops the
		// command streaming the reply to stdout a token at a time. The hooks
		// carry the stream to the shell directly, regardless of the flag.
		const argv = [
			"chat",
			"--root",
			request.root,
			"--json",
			...(request.model ? ["--model", request.model] : []),
			...(request.thinking ? ["--thinking", request.thinking] : []),
			...(request.write ? ["--write"] : []),
			request.question,
		];
		const flags = parseArgs(argv.slice(1));
		if (!flags) throw new Error(`internal: chat argv failed to parse (${argv.join(" ")})`);
		const code = await runChat(flags, {
			...(request.approve ? { approve: request.approve } : {}),
			...(request.signal ? { signal: request.signal } : {}),
			...(request.onText ? { onText: request.onText } : {}),
			...(request.onThinking ? { onThinking: request.onThinking } : {}),
			...(request.onTool ? { onTool: request.onTool } : {}),
			...(request.onReply ? { onReply: request.onReply } : {}),
			...(request.onVerify ? { onVerify: request.onVerify } : {}),
			...(request.cache ? { reuse: request.cache } : {}),
			...(request.thinking ? { thinking: request.thinking } : {}),
			...(request.initialMessages ? { initialMessages: request.initialMessages } : {}),
			onOutcome: (result) => {
				outcome = result;
			},
		});
		// The command returns early — before any turn runs — when a flag
		// combination is refused or a model cannot be resolved. It also sets a
		// non-zero exit code when the turn fails. It says why on stderr, which is
		// the only place that reason exists.
		if (code !== 0 || outcome === null) {
			throw new Error(capturedErr.join("").trim() || `chat produced no reply (exit ${code})`);
		}
		const settled = outcome as { reply: string; verified: unknown; messages?: unknown[] };
		return {
			reply: String(settled.reply ?? ""),
			verified: settled.verified ?? null,
			gateRan: settled.verified !== null && settled.verified !== undefined,
			messages: settled.messages,
		};
	} finally {
		process.stderr.write = origErr;
	}
}

export async function runGateFor(root: string): Promise<unknown> {
	const { detectCommands } = await import("@kaioken/agent");
	const { commands } = await detectCommands(resolve(root));
	const report = await runGate(commands, nodeRunner(), { cwd: resolve(root) });
	return report;
}

function nodeRunner() {
	// Mirrors apps/cli/src/agent-host.ts nodeCommandRunner; the TUI runs the
	// same gate commands with the same timeout semantics.
	const { exec } = require("node:child_process") as typeof import("node:child_process");
	return {
		run(
			command: string,
			options: { cwd: string; timeoutMs: number },
		): Promise<{ exitCode: number; killed: boolean; durationMs: number; stdout: string; stderr: string }> {
			const started = Date.now();
			return new Promise((settle) => {
				exec(
					command,
					{ cwd: options.cwd, timeout: options.timeoutMs, maxBuffer: 32 * 1024 * 1024, windowsHide: true },
					(error, stdout, stderr) => {
						settle({
							exitCode:
								error && typeof (error as { code?: unknown }).code === "number"
									? ((error as { code: number }).code as number)
									: error
										? 1
										: 0, // matches RunOutcome: number, never null
							killed: Boolean(error && (error as { killed?: boolean }).killed),
							durationMs: Date.now() - started,
							stdout,
							stderr,
						});
					},
				);
			});
		},
	};
}

void KNOWLEDGE_TOOLS;
void ({} as Flags);
