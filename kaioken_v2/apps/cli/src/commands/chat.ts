import { createInterface } from "node:readline/promises";
import { resolve } from "node:path";
import {
	buildSystemPrompt,
	detectCommands,
	type GateCommand,
	KNOWLEDGE_TOOLS,
	runGate,
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
import { describeFailure, resolveModel } from "../model.js";
import { formatGate } from "./verify.js";

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
 * a human approved the call.
 */
export async function runChat(flags: Flags): Promise<number> {
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
	// to prompt is exactly the failure this gate exists to prevent.
	if (flags.write && !interactive && !flags.yes) {
		process.stderr.write(
			"kaioken chat: --write outside an interactive session needs --yes, which approves\n" +
				"  every file change the agent makes without asking. Consider running it in a\n" +
				"  terminal instead, where each change is confirmed.\n",
		);
		return 1;
	}

	const { context, skillProblems } = await loadKnowledge(root, { force: flags.force });
	for (const problem of skillProblems) {
		process.stderr.write(`kaioken: skipped skill ${problem.path} — ${problem.reason}\n`);
	}

	const { commands } = await detectCommands(root);

	const resolved = await resolveModel(flags);
	if (!resolved.ok) {
		process.stderr.write(`kaioken chat: ${resolved.reason}\n`);
		return 1;
	}
	if (resolved.warning) process.stderr.write(`kaioken: ${resolved.warning}\n`);

	const runtime = await import("@earendil-works/pi-agent-core");
	const nodeRuntime = await import("@earendil-works/pi-agent-core/node");

	const tools = toRuntimeTools(resolved.ai, KNOWLEDGE_TOOLS, context);
	if (flags.write) tools.push(...executionTools(runtime, nodeRuntime, root));

	const { models, model } = resolved;
	const quiet = flags.json;

	let mutated = false;
	const prompts = interactive && !flags.yes ? createInterface({ input: process.stdin, output: process.stdout }) : null;

	const session = createSession(runtime, {
		systemPrompt: buildSystemPrompt(context, {
			gate: commands,
			canWrite: flags.write === true,
		}),
		tools,
		model,
		// The same reasoning compromise the generative stages make: some
		// endpoints refuse to serve a reasoning model with reasoning disabled,
		// and a long deliberation before every tool call is not what this
		// session is paying for.
		streamFn: (target, ctx, options) =>
			models.streamSimple(target, ctx, {
				...options,
				...(model.reasoning ? { reasoning: "minimal" as const } : {}),
			}),
		onText: (delta) => {
			if (!quiet) process.stdout.write(delta);
		},
		onTool: (name, args) => {
			if (!quiet) process.stderr.write(`\n  · ${name} ${summarise(args)}\n`);
		},
		onToolResult: (name, isError) => {
			// Only a change that actually happened counts. A declined edit and a
			// failed one both come back as errors, and treating either as a
			// mutation would run the gate over an untouched repository.
			if (!isError && MUTATING_TOOLS.has(name)) mutated = true;
			if (!quiet && isError) process.stderr.write(`  · ${name} failed\n`);
		},
		...(flags.write && prompts
			? {
					approve: async (name: string, args: unknown) => {
						if (!MUTATING_TOOLS.has(name)) return true;
						const answer = await prompts.question(
							`\n  ${name} ${summarise(args)}\n  allow? [y/N] `,
						);
						return /^y(es)?$/i.test(answer.trim());
					},
				}
			: {}),
	});

	let code = 0;
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
	}

	const reply = session.lastReply();
	prompts?.close();

	// The gate runs when the agent changed something, or when it was asked for.
	// It is not run after a read-only conversation by default: verifying a
	// repository nobody touched reports on the state it was already in, which is
	// what `kaioken verify` is for.
	const shouldVerify = flags.verify || (mutated && !flags.noVerify);
	if (!shouldVerify) {
		if (quiet) process.stdout.write(`${JSON.stringify({ reply, verified: null }, null, 2)}\n`);
		return code;
	}

	if (!quiet) process.stderr.write(`\nverifying — ${describeGate(commands)}\n`);
	const report = await runGate(commands, nodeCommandRunner(), { cwd: root });

	if (quiet) {
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
