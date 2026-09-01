import { createInterface } from "node:readline";
import { resolve } from "node:path";
import { type KnowledgeContext, toolByName } from "@kaioken/agent";
import { runChat, type ChatHooks, type ChatSessionCache } from "./chat.js";
import { loadKnowledge } from "../knowledge.js";
import type { Flags } from "../main.js";

/**
 * `kaioken agent-serve` — the engine over a newline-delimited JSON wire, for an
 * embedder with no JS boundary into this process: an editor extension host that
 * can only spawn a child process and talk to its stdio.
 *
 * Two kinds of request, because an embedder wants the engine at two different
 * levels.
 *
 * **A whole conversational turn**, when the embedder has no agent of its own:
 *   {"question": string, "write"?: boolean, "thinking"?: string}
 * answered with a stream of events, one JSON object per line:
 *   {"type":"text","delta":string}         {"type":"thinking","delta":string}
 *   {"type":"tool","name":string,"args":unknown}
 *   {"type":"reply","text":string}         {"type":"verify","what":string}
 *   {"type":"approve","id":number,"name":string,"args":unknown}   — blocks
 *   {"type":"outcome","reply":string,"verified":unknown}          — turn done
 *   {"type":"error","message":string}
 * A pending "approve" is answered on stdin with
 *   {"type":"approve-reply","id":number,"allow":boolean}
 *
 * **One tool, with no model in the loop**, when the embedder already has an
 * agent and wants only the grounded part:
 *   {"type":"tool-call","id":number,"name":string,"args":object}
 *   -> {"type":"tool-result","id":number,"text":string,"details":unknown,"isError":boolean}
 * This is what lets an editor hand the engine's tools to its *own* chat agent.
 *
 * Requests are dispatched as they arrive rather than handled in a queue, so a
 * tool call does not wait behind a conversational turn — the two levels are
 * used by different callers at different times and blocking one on the other
 * would make the tools unusable during a conversation. Turns are still
 * serialised against each other: they share one agent session, and two turns
 * interleaved in one transcript is not a conversation.
 *
 * `runChat` writes human-readable output to stdout unless told otherwise, which
 * would tear the JSON stream a byte at a time; every turn therefore runs with
 * `json: true`, leaving the hooks below as the only source of stdout.
 */
export async function runAgentServe(flags: Flags): Promise<number> {
	const rl = createInterface({ input: process.stdin });

	function emit(event: Record<string, unknown>): void {
		process.stdout.write(`${JSON.stringify(event)}\n`);
	}

	const cache: ChatSessionCache = {};
	const approvals = new Map<number, (allow: boolean) => void>();
	let approveId = 0;
	let turns: Promise<unknown> = Promise.resolve();

	/**
	 * The knowledge a bare tool call reads, loaded once and kept.
	 *
	 * A conversational turn gets its context through `runChat`'s own cache; a
	 * `tool-call` has no turn to hang it on, so it keeps its own — and prefers
	 * the conversation's when there is one, so the two never hold separate
	 * copies of the same artifacts. Loading per call would make an editor's
	 * every tool invocation cost a full artifact load.
	 */
	let knowledge: KnowledgeContext | undefined;
	async function knowledgeContext(): Promise<KnowledgeContext> {
		if (cache.context) return cache.context;
		if (!knowledge) ({ context: knowledge } = await loadKnowledge(resolve(flags.root)));
		return knowledge;
	}

	/**
	 * One tool, no model.
	 *
	 * A failure is reported *as a tool result*, not as a protocol error: a tool
	 * that cannot answer is a normal outcome the caller's own agent should see
	 * and may retry, not a broken connection.
	 */
	async function handleToolCall(request: Record<string, unknown>): Promise<void> {
		const id = request["id"];
		const name = String(request["name"] ?? "");
		const tool = toolByName(name);
		if (!tool) {
			emit({ type: "tool-result", id, text: `no such tool: ${name}`, isError: true });
			return;
		}
		try {
			const args = (request["args"] ?? {}) as Record<string, unknown>;
			const result = await tool.run(args, await knowledgeContext());
			emit({
				type: "tool-result",
				id,
				text: result.text,
				details: result.details,
				isError: result.isError === true,
			});
		} catch (error) {
			emit({
				type: "tool-result",
				id,
				text: error instanceof Error ? error.message : String(error),
				isError: true,
			});
		}
	}

	async function handleQuestion(request: Record<string, unknown>): Promise<void> {
		const question = typeof request["question"] === "string" ? request["question"].trim() : "";
		if (!question) {
			emit({ type: "error", message: "request has no question" });
			return;
		}

		const write = typeof request["write"] === "boolean" ? request["write"] : flags.write;
		const thinking = typeof request["thinking"] === "string" ? request["thinking"] : flags.thinking;
		const turnFlags: Flags = { ...flags, json: true, write, thinking, positional: [question] };

		const hooks: ChatHooks = {
			reuse: cache,
			onText: (delta) => emit({ type: "text", delta }),
			onThinking: (delta) => emit({ type: "thinking", delta }),
			onTool: (name, args) => emit({ type: "tool", name, args }),
			onReply: (reply) => emit({ type: "reply", text: reply }),
			onVerify: (what) => emit({ type: "verify", what }),
			onOutcome: (outcome) =>
				emit({ type: "outcome", reply: outcome.reply, verified: outcome.verified }),
			...(write
				? {
						approve: (name: string, args: unknown): Promise<boolean> => {
							const id = ++approveId;
							emit({ type: "approve", id, name, args });
							return new Promise<boolean>((resolveApproval) => {
								approvals.set(id, resolveApproval);
							});
						},
					}
				: {}),
		};

		try {
			await runChat(turnFlags, hooks);
		} catch (error) {
			emit({ type: "error", message: error instanceof Error ? error.message : String(error) });
		}
	}

	rl.on("line", (line) => {
		if (line.trim() === "") return;

		let request: Record<string, unknown>;
		try {
			request = JSON.parse(line);
		} catch {
			emit({ type: "error", message: "invalid JSON request" });
			return;
		}

		if (request["type"] === "tool-call") {
			void handleToolCall(request);
			return;
		}

		if (request["type"] === "approve-reply") {
			const pending = approvals.get(request["id"] as number);
			if (pending) {
				approvals.delete(request["id"] as number);
				pending(request["allow"] === true);
			}
			return;
		}

		// Turns share one agent session, so they are serialised against each
		// other even though tool calls are not. A failed turn must not wedge
		// the queue for the next one.
		turns = turns.then(() => handleQuestion(request)).catch(() => undefined);
	});

	// Nothing left to answer once stdin closes. Any approval still outstanding
	// is denied rather than left hanging: the side that could have said yes is
	// gone, and a write approved by nobody is exactly what the gate prevents.
	await new Promise<void>((done) => rl.on("close", () => done()));
	for (const pending of approvals.values()) pending(false);
	approvals.clear();
	return 0;
}
