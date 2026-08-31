import { createInterface } from "node:readline/promises";
import { resolve } from "node:path";
import {
	buildSystemPrompt,
	detectCommands,
	type GateCommand,
	type KnowledgeContext,
	KNOWLEDGE_TOOLS,
	runGate,
	type SkillProblem,
} from "@kaioken/agent";
import {
	createSession,
	executionTools,
	MUTATING_TOOLS,
	nodeCommandRunner,
	toRuntimeTools,
} from "../agent-host.js";
import { loadKnowledge } from "../knowledge.js";
import type { Flags } from "../main.js";
import { describeFailure, resolveModel, type ResolvedModel } from "../model.js";
import { formatGate } from "./verify.js";

/**
 * A caller that already has its own way to ask a human, or to cancel.
 *
 * The interactive loop below asks over a readline prompt on this process's own
 * stdin; an embedder — the TUI is the only one today — has neither a TTY here
 * nor any business sharing this process's stdin, but still needs each write
 * approved and a turn still cancellable. Supplying these is how it gets both
 * without `runChat` growing a second notion of what "interactive" means.
 */
export interface ChatHooks {
	approve?: (name: string, args: unknown) => Promise<boolean>;
	signal?: AbortSignal;
	/** Optional pre-existing messages to initialize the agent conversation with. */
	initialMessages?: unknown[];
	/**
	 * Take the turn's result directly, instead of reading it back off stdout.
	 *
	 * `--json` lets a caller parse the reply out of this process's output,
	 * which is fine for a caller that owns the process and nothing else. The
	 * TUI is not that caller: it owns the terminal and repaints through
	 * `process.stdout`, so capturing stdout to read the JSON back swallowed
	 * every frame for the length of a turn — including the approval prompt
	 * a write was blocked on. Handing the result over is what lets an embedder
	 * leave stdout alone.
	 */
	onOutcome?: (outcome: { reply: string; verified: unknown; messages?: unknown[] }) => void;
	/**
	 * Assistant prose as it arrives, token by token.
	 *
	 * Fired regardless of `--json`: `--json` exists to keep this command's own
	 * stdout clean for a caller that reads it, and says nothing about whether a
	 * caller with hooks wants the stream. An embedder without a live token feed
	 * shows one word — "thinking" — for an entire agentic turn, which reads as
	 * a hang and is the single biggest reason the same wall-clock turn feels
	 * slower here than in other agents.
	 */
	onText?: (delta: string) => void;
	/** Assistant thinking/reasoning as it arrives, token by token. */
	onThinking?: (delta: string) => void;
	/** Fired when a tool call starts, so a long call is visible rather than silent. */
	onTool?: (name: string, args: unknown) => void;
	/**
	 * The finished reply, handed over the moment the model is done — before
	 * the verification gate.
	 *
	 * On a turn that wrote a file, the gate runs the repository's own
	 * typecheck, build and test commands afterwards, which on any real
	 * repository is minutes of additional silence. A caller that paints the
	 * reply when the model stops and reports the gate result separately keeps
	 * the exchange alive through all of it.
	 */
	onReply?: (reply: string) => void;
	/**
	 * Announced when the turn is over and the gate starts.
	 *
	 * A turn that changed a file is followed by the repository's own typecheck,
	 * build and test commands, which on a repository of any size is the longest
	 * part of the exchange by far. A caller with a progress indicator has to be
	 * told, or it goes on claiming the model is still thinking for a minute
	 * after the model has stopped.
	 */
	onVerify?: (what: string) => void;
	/**
	 * A caller-held cache of the expensive per-turn setup, reused across turns.
	 *
	 * Loading the knowledge, detecting the gate commands and resolving the
	 * model are per-conversation costs, not per-message ones; rebuilding them
	 * on every message re-serialises artifacts, re-walks the corpus and
	 * re-sends the whole system prompt — with no provider prompt cache hit,
	 * because the agent never sees a second turn. The cache is a plain object
	 * the caller owns and keeps; `runChat` fills it on the first turn and
	 * consumes it afterwards, and empties the parts that go stale the moment
	 * the repository changes under them.
	 */
	reuse?: ChatSessionCache;
	/** Thinking depth: off, minimal, low, medium, high, max. */
	thinking?: string;
}

/**
 * What one conversation has already paid for, held by the caller.
 *
 * The fields are opaque to the caller: they are filled and consumed by
 * `runChat`. Setting `key` to undefined — or passing a fresh object — forces a
 * full rebuild; that is how a caller signals that the repository or the model
 * moved.
 */
export interface ChatSessionCache {
	/** What the cached setup was built for: root, model spec, write mode. */
	key?: string;
	session?: import("../agent-host.js").AgentSession;
	tools?: import("@earendil-works/pi-agent-core").AgentTool[];
	resolved?: Extract<Awaited<ReturnType<typeof import("../model.js").resolveModel>>, { ok: true }>;
	gate?: GateCommand[];
	context?: KnowledgeContext;
	skillProblems?: SkillProblem[];
	thinking?: string;
}

/**
 * The knowledge engine, in conversation.
 *
 * Everything below this command answers questions about a repository
 * definitively; this is where those answers are handed to something that can use
 * them. The agent is given tools rather than a context dump, because which parts
 * of a repository matter depends on the question, and no bundling heuristic
 * decided in advance beats letting it ask.
 *
 * Two properties keep it honest. It is told, in its system prompt, exactly which
 * commands will be run against its claim of success — and then they are run,
 * whatever it said. And it cannot change a file unless `--write` was passed and
 * a human — this process's own or, via `hooks.approve`, an embedder's — approved
 * the call.
 */
export async function runChat(flags: Flags, hooks: ChatHooks = {}): Promise<number> {
	const root = resolve(flags.root);
	const question = flags.positional.join(" ").trim();
	const interactive = question === "" && process.stdin.isTTY === true;

	if (question === "" && !interactive) {
		process.stderr.write(
			"kaioken chat: expected a question, or a terminal to hold a conversation in\n",
		);
		return 1;
	}

	// Refusing here rather than auto-approving: a non-interactive session has
	// nobody to ask, and silently granting write access because there was no way
	// to prompt is exactly the failure this gate exists to prevent. A supplied
	// `hooks.approve` means there is somebody to ask after all, just not over
	// this process's own stdin.
	if (flags.write && !interactive && !flags.yes && !hooks.approve) {
		process.stderr.write(
			"kaioken chat: --write outside an interactive session needs --yes, which approves\n" +
				"  every file change the agent makes without asking. Consider running it in a\n" +
				"  terminal instead, where each change is confirmed.\n",
		);
		return 1;
	}

	// The expensive half of the setup — knowledge, gate commands, model
	// resolution, the agent session itself — is per-conversation, not
	// per-message. When the caller holds a cache built for the same root,
	// model and write mode, the turn starts from it instead; anything else
	// rebuilds and refills it.
	const cache = hooks.reuse;
	const thinkingLevel = flags.thinking ?? hooks.thinking;
	const cacheKey = `${resolve(flags.root)}\u0000${flags.model ?? process.env["KAIOKEN_MODEL"] ?? ""}\u0000${flags.write === true ? "write" : "read"}\u0000${thinkingLevel ?? ""}\u0000${flags.force ? "force" : "warm"}`;
	const reusable =
		cache !== undefined &&
		cache.key === cacheKey &&
		cache.session !== undefined &&
		cache.resolved !== undefined &&
		cache.gate !== undefined &&
		cache.context !== undefined;

	let context: KnowledgeContext;
	let skillProblems: SkillProblem[];
	let commands: readonly GateCommand[];
	let resolved: ResolvedModel;

	if (reusable && cache) {
		context = cache.context as KnowledgeContext;
		skillProblems = cache.skillProblems ?? [];
		commands = cache.gate as readonly GateCommand[];
		resolved = cache.resolved as Extract<ResolvedModel, { ok: true }>;
	} else {
		({ context, skillProblems } = await loadKnowledge(root, { force: flags.force }));
		for (const problem of skillProblems) {
			process.stderr.write(`kaioken: skipped skill ${problem.path} — ${problem.reason}\n`);
		}

		({ commands } = await detectCommands(root));

		const check = await resolveModel(flags);
		if (!check.ok) {
			process.stderr.write(`kaioken chat: ${check.reason}\n`);
			return 1;
		}
		resolved = check;
		if (resolved.warning) process.stderr.write(`kaioken: ${resolved.warning}\n`);
	}

	const runtime = await import("@earendil-works/pi-agent-core");
	const nodeRuntime = await import("@earendil-works/pi-agent-core/node");

	// Tools bind to the knowledge context they read, so they follow it: a
	// cached context keeps its tools, a fresh context builds its own — with
	// the execution tools added when, and only when, the turn may write.
	const tools = reusable && cache?.tools ? cache.tools : toRuntimeTools(resolved.ai, KNOWLEDGE_TOOLS, context);
	if (!reusable && flags.write) {
		tools.push(...executionTools(runtime, nodeRuntime, root));
	}

	const { models, model } = resolved;
	const quiet = flags.json;

	let mutated = false;
	const prompts = interactive && !flags.yes ? createInterface({ input: process.stdin, output: process.stdout }) : null;

	// One agent for the conversation, not one per message: the session carries
	// the transcript, so re-creating it per turn would erase the agent's memory
	// of the previous turn and re-send the full system prompt — which no prompt
	// cache could ever hit.
	const session = reusable && cache?.session
		? cache.session
		: createSession(runtime, {
				systemPrompt: buildSystemPrompt(context, {
					gate: commands,
					canWrite: flags.write === true,
				}),
				tools,
				model,
				initialMessages: hooks.initialMessages,
				// The reasoning compromise: if the user set a thinking level, use it;
				// otherwise, for reasoning-capable models, minimal keeps endpoints that
				// require reasoning happy without paying for a long deliberation.
				streamFn: (target, ctx, options) => {
					let reasoning: import("@earendil-works/pi-ai").SimpleStreamOptions["reasoning"] | undefined;
					if (thinkingLevel === "off") {
						reasoning = undefined;
					} else if (
						thinkingLevel === "minimal" ||
						thinkingLevel === "low" ||
						thinkingLevel === "medium" ||
						thinkingLevel === "high" ||
						thinkingLevel === "xhigh" ||
						thinkingLevel === "max"
					) {
						const clamped = resolved.ai.clampThinkingLevel(model, thinkingLevel);
						reasoning = clamped === "off" ? undefined : clamped;
					} else if (model.reasoning) {
						reasoning = "minimal";
					}

					const stream = resolved.ai.createAssistantMessageEventStream();
					(async () => {
						try {
							const initialStream = models.streamSimple(target, ctx, {
								...options,
								...(reasoning ? { reasoning } : {}),
							});
							let first = true;
							for await (const chunk of initialStream) {
								if (
									first &&
									chunk.type === "error" &&
									!reasoning &&
									(chunk.error?.errorMessage || "").toLowerCase().includes("reasoning is mandatory")
								) {
									const fallbackStream = models.streamSimple(target, ctx, {
										...options,
										reasoning: "minimal",
									});
									for await (const fallbackChunk of fallbackStream) {
										stream.push(fallbackChunk);
									}
									stream.end();
									return;
								}
								first = false;
								stream.push(chunk);
							}
							stream.end();
						} catch (error) {
							stream.end();
						}
					})();
					return stream;
				},
				onText: (delta) => {
					hooks.onText?.(delta);
					if (!quiet) process.stdout.write(delta);
				},
				onThinking: (delta) => {
					hooks.onThinking?.(delta);
					if (!quiet && !hooks.onThinking) process.stderr.write(delta);
				},
				onTool: (name, args) => {
					hooks.onTool?.(name, args);
					if (!quiet) process.stderr.write(`\n  · ${name} ${summarise(args)}\n`);
				},
				onToolResult: (name, isError) => {
					// Only a change that actually happened counts. A declined edit and a
					// failed one both come back as errors, and treating either as a
					// mutation would run the gate over an untouched repository.
					if (!isError && MUTATING_TOOLS.has(name)) mutated = true;
					if (!quiet && isError) process.stderr.write(`  · ${name} failed\n`);
				},
				...(flags.write && (prompts || hooks.approve)
					? {
							approve: async (name: string, args: unknown) => {
								if (!MUTATING_TOOLS.has(name)) return true;
								// An embedder's hook takes precedence: it is the one actually
								// showing the human something and getting an answer back.
								if (hooks.approve) return hooks.approve(name, args);
								const answer = await prompts?.question(
									`\n  ${name} ${summarise(args)}\n  allow? [y/N] `,
								);
								return /^y(es)?$/i.test((answer ?? "").trim());
							},
						}
					: {}),
			});

	if (cache) {
		Object.assign(cache, {
			key: cacheKey,
			session,
			tools,
			resolved,
			gate: commands,
			context,
			skillProblems,
		});
	}

	if (hooks.signal) {
		if (hooks.signal.aborted) session.abort();
		else hooks.signal.addEventListener("abort", () => session.abort(), { once: true });
	}

	let code = 0;
	let turnFailed = false;
	try {
		if (question) {
			await session.prompt(question);
			if (!quiet) process.stdout.write("\n");
		} else {
			code = await converse(session, prompts, resolved.describe);
		}
	} catch (error) {
		process.stderr.write(`\nkaioken chat: ${describeFailure(resolved.describe, "chat", error)}\n`);
		code = 1;
		turnFailed = true;
	}

	const reply = session.lastReply();
	prompts?.close();

	// The reply is handed over the moment the model is done. The gate below is
	// the repository's own typecheck, build and test — on any real repository
	// that is minutes of work, and holding the reply hostage to it meant the
	// exchange went silent exactly when there was the most to say.
	if (!turnFailed && hooks.onReply) hooks.onReply(reply);

	// A turn that changed the repository has invalidated the knowledge the
	// cached context was built from. The conversation's memory lives in the
	// session, but the tools' view of the repository lives in the context, and
	// a stale one answers from an index that no longer describes the files on
	// disk — so the setup, session included, is rebuilt next turn.
	if (mutated && cache) {
		cache.key = undefined;
		cache.session = undefined;
		cache.tools = undefined;
		cache.context = undefined;
		cache.resolved = undefined;
		cache.gate = undefined;
		cache.skillProblems = undefined;
		cache.thinking = undefined;
	}

	// The gate runs when the agent changed something, or when it was asked for.
	// It is not run after a read-only conversation by default: verifying a
	// repository nobody touched reports on the state it was already in, which is
	// what `kaioken verify` is for.
	const shouldVerify = flags.verify || (mutated && !flags.noVerify);
	if (!shouldVerify) {
		if (!turnFailed && hooks.onOutcome) hooks.onOutcome({ reply, verified: null, messages: session.getMessages() });
		else if (quiet) process.stdout.write(`${JSON.stringify({ reply, verified: null }, null, 2)}\n`);
		return code;
	}

	hooks.onVerify?.(describeGate(commands));
	if (!quiet) process.stderr.write(`\nverifying — ${describeGate(commands)}\n`);
	const report = await runGate(commands, nodeCommandRunner(), { cwd: root });

	if (hooks.onOutcome) {
		hooks.onOutcome({ reply, verified: report, messages: session.getMessages() });
	} else if (quiet) {
		process.stdout.write(`${JSON.stringify({ reply, verified: report }, null, 2)}\n`);
	} else {
		process.stdout.write(formatGate(report));
	}

	if (report.verdict === "failed") return 1;
	if (report.verdict === "unverifiable" && mutated) {
		// Files changed and nothing could check them. Saying nothing here would
		// let an unverified change read as a verified one.
		if (!quiet) {
			process.stderr.write("files were changed and nothing could verify them.\n");
		}
		return 2;
	}
	return code;
}

/** The interactive loop. One prompt at a time; the transcript is the session. */
async function converse(
	session: { prompt(text: string): Promise<void>; abort(): void },
	prompts: ReturnType<typeof createInterface> | null,
	spec: string,
): Promise<number> {
	if (!prompts) return 1;

	process.stdout.write("kaioken chat — ask about this repository. Ctrl-C, or \"exit\", to leave.\n");

	for (;;) {
		let line: string;
		try {
			line = (await prompts.question("\n> ")).trim();
		} catch {
			return 0;
		}
		if (line === "") continue;
		if (line === "exit" || line === "quit") return 0;

		try {
			await session.prompt(line);
			process.stdout.write("\n");
		} catch (error) {
			// A failed turn ends the turn, not the conversation: the transcript
			// is still there, and a rate limit should not cost the session.
			process.stderr.write(`\nkaioken chat: ${describeFailure(spec, "chat", error)}\n`);
		}
	}
}

function describeGate(commands: readonly GateCommand[]): string {
	if (commands.length === 0) return "nothing to run";
	return commands.map((command) => command.command).join(", ");
}

/** One line describing a tool call, short enough to sit in the margin. */
function summarise(args: unknown): string {
	if (!args || typeof args !== "object") return "";
	const parts: string[] = [];
	for (const [key, value] of Object.entries(args as Record<string, unknown>)) {
		if (value === undefined || value === null) continue;
		const text = Array.isArray(value) ? value.join(" ") : String(value);
		parts.push(`${key}=${text.length > 60 ? `${text.slice(0, 59)}…` : text}`);
	}
	return parts.join(" ");
}
