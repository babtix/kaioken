import { exec } from "node:child_process";
import { activeExtensions, callMcpTool, isTrusted, listMcpTools } from "@kaioken/ext";
import type { CommandRunner, KnowledgeContext, KnowledgeTool, RunOutcome } from "@kaioken/agent";

/**
 * Where the knowledge layer meets an agent runtime.
 *
 * `@kaioken/agent` defines what a tool is and what it may say; this file is the
 * only place that knows those definitions will be executed by Pi's agent loop.
 * The same inversion the generative stages use, for the same reason: the tools
 * are tested by calling them, not by standing up a model.
 *
 * Pi's loop is used as it ships. Compaction, retries, streaming and parallel
 * tool execution are hard to get right and already right here; reimplementing
 * them to own them would be the most expensive way to end up with less.
 */

type PiAi = typeof import("@earendil-works/pi-ai");
type PiAgent = typeof import("@earendil-works/pi-agent-core");

/**
 * Translate a knowledge tool into the runtime's shape.
 *
 * The parameter spec is deliberately small — four types and a description —
 * because every schema feature beyond that is a way for one provider to behave
 * differently from another. Closed sets are expressed in the description rather
 * than as an enum for the same reason.
 */
export function toRuntimeTools(
	ai: PiAi,
	tools: readonly KnowledgeTool[],
	ctx: KnowledgeContext,
): import("@earendil-works/pi-agent-core").AgentTool[] {
	const { Type } = ai;

	return tools.map((tool) => {
		const properties: Record<string, import("@earendil-works/pi-ai").TSchema> = {};

		for (const [name, param] of Object.entries(tool.params)) {
			const description = param.choices
				? `${param.description} One of: ${param.choices.join(", ")}.`
				: param.description;

			let schema: import("@earendil-works/pi-ai").TSchema;
			switch (param.type) {
				case "number":
					schema = Type.Number({ description });
					break;
				case "boolean":
					schema = Type.Boolean({ description });
					break;
				case "string[]":
					schema = Type.Array(Type.String(), { description });
					break;
				default:
					schema = Type.String({ description });
			}

			properties[name] = param.required ? schema : Type.Optional(schema);
		}

		return {
			name: tool.name,
			label: tool.label,
			description: tool.description,
			parameters: Type.Object(properties),
			async execute(_id: string, params: unknown) {
				const result = await tool.run((params ?? {}) as Record<string, unknown>, ctx);
				// The runtime marks a tool result as an error when execute throws.
				// Only a genuine failure goes down that path: "this repository
				// declares no such symbol" is an answer, and flagging it as an
				// error would teach the model to distrust the one response it
				// most needs to believe.
				if (result.isError) throw new Error(result.text);
				return {
					content: [{ type: "text" as const, text: result.text }],
					details: result.details,
				};
			},
		} as import("@earendil-works/pi-agent-core").AgentTool;
	});
}

/** Tools that change the repository. Named here so the caller can gate them. */
export const MUTATING_TOOLS = new Set(["edit", "write", "bash"]);

/**
 * The tools installed MCP extensions contribute to the loop.
 *
 * `ext run` made a server's tools reachable by a person, one command at a
 * time; this makes them reachable by the agent, which is what most servers are
 * actually for. The gate is the trust model itself: an mcp extension installs
 * inert and contributes nothing here until the exact installed version has
 * been trusted, and a disabled one contributes nothing at any trust level.
 *
 * Each call stands the server up and stops it, exactly as `ext run` does — no
 * long-lived pool, for the reason mcp.ts records. Discovery spawns too, which
 * is why this runs once per conversation setup, not per turn.
 */
export async function mcpAgentTools(): Promise<import("@earendil-works/pi-agent-core").AgentTool[]> {
	const out: Array<import("@earendil-works/pi-agent-core").AgentTool> = [];
	const seen = new Set<string>();

	for (const entry of await activeExtensions()) {
		if (entry.manifest.type !== "mcp" || !entry.manifest.mcp) continue;
		// Inert until trusted is the whole contract of the tier; skipping
		// silently is not hiding a failure, it is the documented state.
		if (!isTrusted(entry)) continue;

		let tools;
		try {
			tools = await listMcpTools(entry);
		} catch (error) {
			process.stderr.write(
				`kaioken: mcp extension ${entry.id} could not be reached (${error instanceof Error ? error.message : String(error)}); its tools are not offered\n`,
			);
			continue;
		}

		const prefix = `mcp_${entry.id.replace(/[^A-Za-z0-9-]/g, "_")}`;
		for (const tool of tools) {
			let name = `${prefix}_${tool.name}`.replace(/[^A-Za-z0-9_-]/g, "_");
			while (seen.has(name)) name = `${name}_`;
			seen.add(name);
			out.push({
				name,
				label: `${entry.id}: ${tool.name}`,
				description: tool.description ?? `Tool ${tool.name} from the ${entry.id} extension.`,
				// An MCP input schema is JSON Schema, which is what TypeBox
				// emits; the pass-through is the point of the tier.
				parameters: (tool.inputSchema ?? { type: "object", properties: {} }) as import("@earendil-works/pi-ai").TSchema,
				async execute(_id: string, params: unknown) {
					const result = await callMcpTool(entry, tool.name, (params ?? {}) as Record<string, unknown>);
					if (result.isError) throw new Error(result.text);
					return { content: [{ type: "text" as const, text: result.text }] };
				},
			} as import("@earendil-works/pi-agent-core").AgentTool);
		}
	}

	return out;
}

/**
 * The runtime's own execution tools, bound to this repository.
 *
 * Reading, editing and running commands are solved problems with a great many
 * edge cases — atomic writes, output truncation, unique-match enforcement on an
 * edit — and Pi's implementations already handle them. What this project adds is
 * not a better `edit`; it is knowing what to edit.
 *
 * They come back as a separate list because the decision to hand an agent write
 * access belongs to the command, not to this adapter.
 */
export function executionTools(
	agentRuntime: PiAgent,
	nodeRuntime: typeof import("@earendil-works/pi-agent-core/node"),
	root: string,
): import("@earendil-works/pi-agent-core").AgentTool[] {
	const env = new nodeRuntime.NodeExecutionEnv({ cwd: root });
	const context = { env };

	const harnessTools = [
		agentRuntime.createReadTool(),
		agentRuntime.createEditTool(),
		agentRuntime.createWriteTool(),
		agentRuntime.createBashTool(),
	];

	// The harness passes a per-turn context as a fifth argument; a plain agent
	// tool takes four. Binding it here is the whole adaptation.
	return harnessTools.map((tool) => {
		const bind = tool.execute as (
			id: string,
			params: unknown,
			signal: AbortSignal | undefined,
			onUpdate: unknown,
			ctx: typeof context,
		) => Promise<unknown>;

		return {
			...tool,
			execute: (id: string, params: unknown, signal?: AbortSignal, onUpdate?: unknown) =>
				bind(id, params, signal, onUpdate, context),
		} as unknown as import("@earendil-works/pi-agent-core").AgentTool;
	});
}

export interface AgentSession {
	prompt(text: string): Promise<void>;
	/** The assistant's reply to the last prompt, with tool calls stripped. */
	lastReply(): string;
	abort(): void;
	/** Retrieve all messages currently held in the agent context. */
	getMessages(): unknown[];
	/** Replace messages in the agent context (e.g. for /fork or /compact). */
	setMessages(messages: unknown[]): void;
}

export interface SessionOptions {
	systemPrompt: string;
	tools: import("@earendil-works/pi-agent-core").AgentTool[];
	model: import("@earendil-works/pi-ai").Model<import("@earendil-works/pi-ai").Api>;
	streamFn: import("@earendil-works/pi-agent-core").StreamFn;
	/** Optional prior conversation messages to seed into the agent context. */
	initialMessages?: unknown[];
	/** Called with assistant prose as it streams. */
	onText(delta: string): void;
	/** Called with thinking/reasoning tokens as they stream. */
	onThinking?: (delta: string) => void;
	/** Called when a tool starts, so a long call is visible rather than silent. */
	onTool(name: string, args: unknown): void;
	onToolResult(name: string, isError: boolean): void;
	/**
	 * Asked before a tool that changes the repository runs. Returning false
	 * blocks the call and tells the model it was refused, which is a normal
	 * conversational move rather than an error.
	 */
	approve?: (name: string, args: unknown) => Promise<boolean>;
}

/**
 * Drive one conversation.
 *
 * The agent is constructed once and prompted repeatedly: the transcript is the
 * session, and rebuilding it per turn would throw away both the context and the
 * provider's prompt cache.
 */
export function createSession(agentRuntime: PiAgent, options: SessionOptions): AgentSession {
	const agent = new agentRuntime.Agent({
		initialState: {
			systemPrompt: options.systemPrompt,
			model: options.model,
			tools: options.tools,
			...(options.initialMessages && options.initialMessages.length > 0
				? { messages: options.initialMessages as import("@earendil-works/pi-agent-core").AgentState["messages"] }
				: {}),
		},
		streamFn: options.streamFn,
		...(options.approve
			? {
					async beforeToolCall(
						context: import("@earendil-works/pi-agent-core").BeforeToolCallContext,
					) {
						const allowed = await options.approve?.(context.toolCall.name, context.args);
						if (allowed) return undefined;
						return {
							block: true as const,
							reason: "the user declined this change. Ask what they want instead.",
						};
					},
				}
			: {}),
	});

	let reply = "";
	let failure: string | null = null;

	agent.subscribe((event) => {
		switch (event.type) {
			// A provider failure arrives as a finished assistant message with no
			// content and `stopReason: "error"`, not as a rejection. Left alone,
			// the run completes, prints nothing and exits zero — a silent success
			// on work that never happened, which is the worst failure mode a
			// command can have.
			case "message_end": {
				const message = event.message as { role?: string; stopReason?: string; errorMessage?: string };
				if (message.role === "assistant" && message.stopReason === "error") {
					failure = message.errorMessage ?? "the provider returned an error with no message";
				}
				break;
			}
			case "message_update": {
				const inner = event.assistantMessageEvent;
				if (inner.type === "text_delta") {
					reply += inner.delta;
					options.onText(inner.delta);
				} else if (inner.type === "thinking_delta") {
					options.onThinking?.(inner.delta);
				}
				break;
			}
			case "tool_execution_start":
				options.onTool(event.toolName, event.args);
				break;
			case "tool_execution_end":
				options.onToolResult(event.toolName, event.isError);
				break;
			default:
				break;
		}
	});

	return {
		async prompt(text: string): Promise<void> {
			reply = "";
			failure = null;
			await agent.prompt(text);
			if (failure !== null) throw new Error(failure);
		},
		lastReply: () => reply,
		abort: () => {
			agent.abort();
		},
		getMessages: () => agent.state.messages,
		setMessages: (messages: unknown[]) => {
			(agent.state as unknown as { messages: unknown[] }).messages = messages;
		},
	};
}

/**
 * The gate's hands.
 *
 * Everything about *which* commands run and what their exit codes mean lives in
 * `@kaioken/agent`; this is the twenty lines that actually spawn one. A timeout
 * is reported as a distinct outcome rather than as exit code 1, because "your
 * test suite hangs" and "your test suite fails" call for different next moves.
 */
export function nodeCommandRunner(): CommandRunner {
	return {
		run(command, { cwd, timeoutMs }): Promise<RunOutcome> {
			const started = Date.now();
			return new Promise<RunOutcome>((settle) => {
				exec(
					command,
					{ cwd, timeout: timeoutMs, maxBuffer: 32 * 1024 * 1024, windowsHide: true },
					(error, stdout, stderr) => {
						const durationMs = Date.now() - started;
						const killed = Boolean(
							error && (error as NodeJS.ErrnoException & { killed?: boolean }).killed,
						);
						const exitCode =
							error && typeof (error as { code?: unknown }).code === "number"
								? ((error as { code: number }).code as number)
								: error
									? 1
									: 0;

						settle({
							exitCode,
							stdout: String(stdout ?? ""),
							stderr: String(stderr ?? ""),
							durationMs,
							...(killed ? { timedOut: true } : {}),
						});
					},
				);
			});
		},
	};
}
