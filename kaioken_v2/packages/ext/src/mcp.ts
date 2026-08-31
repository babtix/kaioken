import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import type { Installed } from "./lock.js";

/**
 * Talking to an MCP extension.
 *
 * The protocol is JSON-RPC over the child's stdin and stdout, framed by
 * newlines. Only three calls are needed to make a server's tools usable —
 * `initialize`, `tools/list`, `tools/call` — so this is a client for those and
 * nothing else, rather than a dependency on a protocol library that implements
 * a specification this host does not otherwise use.
 *
 * The process is started per operation and stopped afterwards. A long-lived
 * pool would be faster and would also mean somebody's server is running in the
 * background from the moment they installed it, which is precisely what the
 * trust prompt exists to prevent.
 */

/** Long enough for a cold server to start; short enough not to hang a command. */
const CALL_TIMEOUT_MS = 30_000;

export interface McpTool {
	name: string;
	description?: string;
	/** The tool's JSON Schema, passed through as the server states it. */
	inputSchema?: unknown;
}

export interface McpCallResult {
	/** Text content blocks, joined. Non-text content is described, not dropped. */
	text: string;
	isError: boolean;
}

export async function listMcpTools(entry: Installed): Promise<McpTool[]> {
	return withServer(entry, async (session) => {
		const result = (await session.request("tools/list", {})) as { tools?: unknown };
		if (!Array.isArray(result.tools)) return [];
		return result.tools
			.filter((tool): tool is Record<string, unknown> => Boolean(tool) && typeof tool === "object")
			.map((tool) => ({
				name: String(tool.name ?? ""),
				...(typeof tool.description === "string" ? { description: tool.description } : {}),
				...(tool.inputSchema ? { inputSchema: tool.inputSchema } : {}),
			}))
			.filter((tool) => tool.name !== "");
	});
}

export async function callMcpTool(
	entry: Installed,
	name: string,
	args: Record<string, unknown>,
): Promise<McpCallResult> {
	return withServer(entry, async (session) => {
		const result = (await session.request("tools/call", { name, arguments: args })) as {
			content?: unknown;
			isError?: unknown;
		};
		const blocks = Array.isArray(result.content) ? result.content : [];
		const text = blocks
			.map((block) => {
				if (!block || typeof block !== "object") return "";
				const record = block as Record<string, unknown>;
				if (record.type === "text" && typeof record.text === "string") return record.text;
				// An image or a resource is a real result the caller cannot
				// render here. Saying what arrived beats returning nothing.
				return `[${String(record.type ?? "content")}]`;
			})
			.filter(Boolean)
			.join("\n");
		return { text, isError: result.isError === true };
	});
}

interface Session {
	request(method: string, params: unknown): Promise<unknown>;
}

/**
 * Start the server, run one exchange, and stop it.
 *
 * The child's working directory is the install directory, so a server that
 * ships data files beside itself finds them, and its environment is the host's
 * plus whatever the manifest declared — the manifest's entries last, because an
 * extension that needs a variable set knows better than the ambient shell.
 */
async function withServer<T>(entry: Installed, run: (session: Session) => Promise<T>): Promise<T> {
	if (entry.manifest.type !== "mcp" || !entry.manifest.mcp) {
		throw new Error(`extension ${entry.id} is not an mcp extension`);
	}

	const config = entry.manifest.mcp;
	const child = spawn(config.command, config.args ?? [], {
		cwd: entry.dir,
		env: { ...process.env, ...(config.env ?? {}) },
		stdio: ["pipe", "pipe", "pipe"],
		windowsHide: true,
	}) as ChildProcessWithoutNullStreams;

	const pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
	let nextId = 1;
	let buffer = "";
	let stderr = "";

	child.stdout.setEncoding("utf8");
	child.stdout.on("data", (chunk: string) => {
		buffer += chunk;
		let newline = buffer.indexOf("\n");
		while (newline !== -1) {
			const line = buffer.slice(0, newline).trim();
			buffer = buffer.slice(newline + 1);
			newline = buffer.indexOf("\n");
			if (!line) continue;
			deliver(pending, line);
		}
	});
	child.stderr.setEncoding("utf8");
	// Kept rather than forwarded: a server's diagnostics are useful in an error
	// message and noise everywhere else.
	child.stderr.on("data", (chunk: string) => {
		stderr = (stderr + chunk).slice(-4000);
	});

	const failAll = (error: Error): void => {
		for (const waiter of pending.values()) waiter.reject(error);
		pending.clear();
	};
	child.on("error", (error) => failAll(new Error(`${config.command}: ${error.message}`)));
	child.on("exit", (code) => {
		if (pending.size > 0) {
			failAll(new Error(`${config.command} exited with code ${code}${stderr ? `: ${stderr.trim()}` : ""}`));
		}
	});

	const session: Session = {
		request(method, params) {
			const id = nextId++;
			return new Promise<unknown>((resolvePromise, rejectPromise) => {
				const timer = setTimeout(() => {
					pending.delete(id);
					rejectPromise(new Error(`${method} timed out after ${CALL_TIMEOUT_MS}ms`));
				}, CALL_TIMEOUT_MS);

				pending.set(id, {
					resolve: (value) => {
						clearTimeout(timer);
						resolvePromise(value);
					},
					reject: (error) => {
						clearTimeout(timer);
						rejectPromise(error);
					},
				});
				child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
			});
		},
	};

	try {
		await session.request("initialize", {
			protocolVersion: "2024-11-05",
			capabilities: {},
			clientInfo: { name: "kaioken", version: "2" },
		});
		// The spec expects this notification after initialize; a server that
		// waits for it would otherwise never answer tools/list.
		child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`);
		return await run(session);
	} finally {
		child.stdin.end();
		child.kill();
	}
}

function deliver(
	pending: Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>,
	line: string,
): void {
	let message: { id?: unknown; result?: unknown; error?: { message?: unknown } };
	try {
		message = JSON.parse(line);
	} catch {
		// A server that writes something other than JSON-RPC on stdout is
		// misbehaving, but one stray line must not fail the exchange.
		return;
	}
	if (typeof message.id !== "number") return;
	const waiter = pending.get(message.id);
	if (!waiter) return;
	pending.delete(message.id);
	if (message.error) waiter.reject(new Error(String(message.error.message ?? "the server returned an error")));
	else waiter.resolve(message.result);
}
