import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { KNOWLEDGE_TOOLS, type KnowledgeContext, loadSkills } from "@kaioken/agent";
import { installExtension, trustExtension } from "@kaioken/ext";
import { buildIndex, SymbolOracle } from "@kaioken/index";
import { scan } from "@kaioken/scan";
import type { AssistantMessage, AssistantMessageEvent } from "@earendil-works/pi-ai";
import { afterEach, describe, expect, it } from "vitest";
import { createSession, mcpAgentTools, toRuntimeTools } from "../dist/agent-host.js";

/**
 * The agent loop, driven offline.
 *
 * A tool-calling loop that can only be exercised against a live provider is a
 * loop nobody tests — every previous phase avoided that by injecting the model,
 * and this one keeps the habit: the stream function is a parameter, so a
 * scripted turn proves the dispatch, the transcript and the failure handling
 * with no credential anywhere.
 */

const roots: string[] = [];

afterEach(async () => {
	await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

const WALK = [
	"/** Walks the working tree once. */",
	"export function walkTree(root: string): string[] {",
	"\treturn [root];",
	"}",
	"",
].join("\n");

async function context(): Promise<KnowledgeContext> {
	const root = await mkdtemp(join(tmpdir(), "kaioken-host-"));
	roots.push(root);
	for (const [path, content] of Object.entries({ "src/walk.ts": WALK })) {
		const abs = join(root, path);
		await mkdir(dirname(abs), { recursive: true });
		await writeFile(abs, content, "utf8");
	}

	const scanned = await scan(root);
	const { index } = await buildIndex(scanned);
	const { skills } = await loadSkills(root);

	return {
		root,
		index,
		oracle: new SymbolOracle(index),
		scan: scanned,
		provenance: [],
		skills,
		search: null,
	};
}

function assistant(overrides: Partial<AssistantMessage>): AssistantMessage {
	return {
		role: "assistant",
		content: [],
		api: "openai-completions",
		provider: "openrouter",
		model: "scripted",
		usage: {
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 0,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		},
		stopReason: "stop",
		timestamp: Date.now(),
		...overrides,
	} as AssistantMessage;
}

/**
 * Replay a fixed sequence of assistant messages, one per turn.
 *
 * This is the same scripted-double discipline the generative phases use: what is
 * being tested is what the harness does with a reply, not the reply itself.
 */
async function scriptedStream(messages: AssistantMessage[]) {
	const { AssistantMessageEventStream } = await import("@earendil-works/pi-ai");
	let turn = 0;

	return () => {
		const message = messages[Math.min(turn++, messages.length - 1)] as AssistantMessage;
		const stream = new AssistantMessageEventStream();

		queueMicrotask(() => {
			stream.push({ type: "start", partial: message } as AssistantMessageEvent);
			message.content.forEach((block, contentIndex) => {
				if (block.type === "text") {
					stream.push({
						type: "text_delta",
						contentIndex,
						delta: block.text,
						partial: message,
					} as AssistantMessageEvent);
				}
			});
			if (message.stopReason === "error") {
				stream.push({ type: "error", reason: "error", error: message } as AssistantMessageEvent);
			} else {
				stream.push({
					type: "done",
					reason: message.stopReason,
					message,
				} as AssistantMessageEvent);
			}
			stream.end(message);
		});

		return stream;
	};
}

describe("toRuntimeTools", () => {
	it("gives every tool a schema the runtime can validate", async () => {
		const ai = await import("@earendil-works/pi-ai");
		const tools = toRuntimeTools(ai, KNOWLEDGE_TOOLS, await context());

		const lookup = tools.find((tool) => tool.name === "symbol_lookup");
		const parameters = lookup?.parameters as { type?: string; required?: string[] };

		expect(parameters?.type).toBe("object");
		// Nothing on symbol_lookup is mandatory: either a name or a path will do,
		// and the tool says which is missing better than a schema can.
		expect(parameters?.required ?? []).toEqual([]);
	});

	it("marks a genuine failure as an error and a negative answer as an answer", async () => {
		const ai = await import("@earendil-works/pi-ai");
		const tools = toRuntimeTools(ai, KNOWLEDGE_TOOLS, await context());
		const lookup = tools.find((tool) => tool.name === "symbol_lookup");

		const miss = await lookup?.execute("1", { name: "nope" } as never);
		expect(JSON.stringify(miss?.content)).toContain("not declared");

		// No arguments at all is the model getting the call wrong, which is the
		// one case that should come back as an error it can correct.
		await expect(lookup?.execute("2", {} as never)).rejects.toThrow(/name.*path/);
	});
});

describe("createSession", () => {
	it("runs a tool the model asked for and keeps the reply that follows", async () => {
		const ai = await import("@earendil-works/pi-ai");
		const runtime = await import("@earendil-works/pi-agent-core");
		const tools = toRuntimeTools(ai, KNOWLEDGE_TOOLS, await context());

		const called: string[] = [];
		const session = createSession(runtime, {
			systemPrompt: "scripted",
			tools,
			model: { provider: "openrouter", id: "scripted" } as never,
			streamFn: await scriptedStream([
				assistant({
					stopReason: "toolUse",
					content: [
						{ type: "toolCall", id: "call-1", name: "symbol_lookup", arguments: { name: "walkTree" } },
					],
				}),
				assistant({ content: [{ type: "text", text: "walkTree is declared in src/walk.ts." }] }),
			]),
			onText: () => {},
			onTool: (name) => called.push(name),
			onToolResult: () => {},
		});

		await session.prompt("where is walkTree?");

		expect(called).toEqual(["symbol_lookup"]);
		expect(session.lastReply()).toContain("src/walk.ts");
	});

	it("throws on a provider error instead of returning an empty success", async () => {
		const ai = await import("@earendil-works/pi-ai");
		const runtime = await import("@earendil-works/pi-agent-core");

		const session = createSession(runtime, {
			systemPrompt: "scripted",
			tools: toRuntimeTools(ai, KNOWLEDGE_TOOLS, await context()),
			model: { provider: "openrouter", id: "scripted" } as never,
			streamFn: await scriptedStream([
				assistant({ stopReason: "error", errorMessage: '401: {"message":"User not found."}' }),
			]),
			onText: () => {},
			onTool: () => {},
			onToolResult: () => {},
		});

		// A provider failure arrives as a finished message with no content. Left
		// alone it exits zero having printed nothing, which reads as a successful
		// answer to a question that was never asked.
		await expect(session.prompt("anything")).rejects.toThrow(/User not found/);
	});

	it("blocks a tool call the approver declines, and says why", async () => {
		const ai = await import("@earendil-works/pi-ai");
		const runtime = await import("@earendil-works/pi-agent-core");

		const executed: string[] = [];
		const results: { name: string; isError: boolean }[] = [];

		// A tool that records being run, so "was it blocked?" is answered by
		// whether it executed rather than by whether the loop announced it.
		const recorder = {
			name: "edit",
			label: "edit",
			description: "Change a file.",
			parameters: ai.Type.Object({ path: ai.Type.String() }),
			async execute(_id: string, params: { path: string }) {
				executed.push(params.path);
				return { content: [{ type: "text" as const, text: "done" }], details: undefined };
			},
		};

		const session = createSession(runtime, {
			systemPrompt: "scripted",
			tools: [recorder as never],
			model: { provider: "openrouter", id: "scripted" } as never,
			streamFn: await scriptedStream([
				assistant({
					stopReason: "toolUse",
					content: [
						{ type: "toolCall", id: "call-1", name: "edit", arguments: { path: "src/walk.ts" } },
					],
				}),
				assistant({ content: [{ type: "text", text: "understood." }] }),
			]),
			onText: () => {},
			onTool: () => {},
			onToolResult: (name, isError) => results.push({ name, isError }),
			approve: async () => false,
		});

		await session.prompt("change something");

		expect(executed).toEqual([]);
		// The refusal reaches the model as a failed call, which is what lets it
		// ask what to do instead rather than silently assuming it succeeded.
		expect(results).toEqual([{ name: "edit", isError: true }]);
	});
});

/**
 * The MCP tier, against a real server.
 *
 * `server.js` below is a genuine JSON-RPC server over stdio — the same
 * newline framing, initialize handshake and tools/list shape a production
 * server speaks — so the test exercises the spawn, the handshake and the
 * call, not a mock of the protocol.
 */
describe("mcpAgentTools", () => {
	const savedHome = process.env.KAIOKEN_HOME;
	const homes: string[] = [];

	afterEach(async () => {
		if (savedHome === undefined) delete process.env.KAIOKEN_HOME;
		else process.env.KAIOKEN_HOME = savedHome;
		await Promise.all(homes.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
	});

	const SERVER = [
		"let buf = \"\";",
		"function reply(id, result) {",
		"\tprocess.stdout.write(JSON.stringify({ jsonrpc: \"2.0\", id, result }) + \"\\n\");",
		"}",
		'process.stdin.setEncoding("utf8");',
		'process.stdin.on("data", (chunk) => {',
		'	buf += chunk;',
		'	let cut = buf.indexOf("\\n");',
		'	while (cut !== -1) {',
		'		const line = buf.slice(0, cut).trim();',
		'		buf = buf.slice(cut + 1);',
		'		cut = buf.indexOf("\\n");',
		'		if (!line) continue;',
		'		let msg;',
		'		try { msg = JSON.parse(line); } catch { continue; }',
		'		if (msg.method === "initialize") reply(msg.id, {});',
		'		else if (msg.method === "tools/list") reply(msg.id, { tools: [{ name: "echo", description: "Echo the given text back.", inputSchema: { type: "object", properties: { text: { type: "string", description: \"The text to echo\" } }, required: [\"text\"] } }] });',
		'		else if (msg.method === "tools/call") reply(msg.id, { content: [{ type: "text", text: `echo: ${(msg.params?.arguments ?? {}).text ?? ""}` }] });',
		'	}',
		'});',
		"",
	].join("\n");

	async function installedServer(): Promise<void> {
		const home = await mkdtemp(join(tmpdir(), "kaioken-mcp-home-"));
		homes.push(home);
		process.env.KAIOKEN_HOME = home;
		const source = await mkdtemp(join(tmpdir(), "kaioken-mcp-src-"));
		homes.push(source);
		await writeFile(
			join(source, "extension.yaml"),
			[
				"id: acme.server",
				"name: Acme Server",
				"version: 1.0.0",
				"type: mcp",
				"mcp:",
				"  command: node",
				"  args: [server.js]",
				"",
			].join("\n"),
		);
		await writeFile(join(source, "server.js"), SERVER);
		await installExtension({ source });
	}

	it("offers nothing while the extension is untrusted", async () => {
		await installedServer();
		// Inert until trusted is the contract of the tier — the agent sees no
		// tool for a server nobody has approved.
		expect(await mcpAgentTools()).toEqual([]);
	});

	it("offers a trusted server's tools and can call them", async () => {
		await installedServer();
		await trustExtension("acme.server", true);

		const tools = await mcpAgentTools();
		expect(tools.map((tool) => tool.name)).toEqual(["mcp_acme_server_echo"]);
		expect((tools[0] as { description?: string }).description).toContain("Echo the given text");

		const result = await (tools[0] as { execute(id: string, params: unknown): Promise<{ content: unknown }> }).execute(
			"1",
			{ text: "hello" },
		);
		expect(JSON.stringify(result.content)).toContain("echo: hello");
	});
});
