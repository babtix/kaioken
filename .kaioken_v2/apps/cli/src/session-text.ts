import type { ConversationEvent, SavedSession } from "@kaioken/session";

/**
 * A saved conversation, rendered as something a model can read.
 *
 * The messages on disk are the agent runtime's own structures — content parts,
 * tool calls, tool results — and handing them over as JSON would spend most of
 * the context window on punctuation. So the transcript is flattened: prose
 * stays prose, and a tool call collapses to its name and the size of what came
 * back. A briefing needs the shape of the work, not every byte it produced.
 */

/** How much of one message's prose survives into the transcript. */
const CLIP = 800;
/** How much of an assistant message that also made tool calls survives. */
const CLIP_WITH_CALLS = 200;

export function renderTranscript(messages: readonly unknown[]): string {
	const out: string[] = [];

	for (const raw of messages) {
		if (!raw || typeof raw !== "object") continue;
		const message = raw as {
			role?: string;
			content?: unknown;
			name?: string;
			toolName?: string;
			toolCalls?: Array<{ name?: string; function?: { name?: string } }>;
		};
		// The system prompt is boilerplate this project wrote. It says nothing
		// about what the session did.
		if (message.role === "system") continue;

		const text = flatten(message.content);
		const calls = toolNames(message);

		// pi-agent-core reports a result as role "toolResult" with `toolName`;
		// the OpenAI-ish shape uses role "tool" with `name`. Both are the same
		// event: what came back from a call, which nobody needs in full.
		if (message.role === "tool" || message.role === "toolResult") {
			const tool = message.toolName ?? message.name ?? "tool";
			out.push(`- *${tool} result* (${text.length} chars)`);
			continue;
		}
		if (calls.length > 0) {
			if (text) out.push(`**assistant**: ${clip(text, CLIP_WITH_CALLS)}`);
			out.push(`- *calls*: ${calls.join(", ")}`);
			continue;
		}
		if (!text) continue;
		out.push(`**${message.role ?? "message"}**: ${clip(text, CLIP)}`, "");
	}

	return out.join("\n");
}

/** The tail of a conversation, which is what a continuation needs. */
export function recentMessages(session: SavedSession, limit: number): unknown[] {
	const messages = Array.isArray(session.messages) ? session.messages : [];
	return messages.length > limit ? messages.slice(-limit) : messages;
}

/**
 * The text of one message, whatever shape it arrived in.
 *
 * Different runtimes and different providers put a message's words in a plain
 * string, in `{type:"text"}` parts, or in both; a reader that understood only
 * one of them would silently produce an empty transcript for the others.
 */
function flatten(content: unknown): string {
	if (typeof content === "string") return content.trim();
	if (!Array.isArray(content)) return "";
	let text = "";
	for (const part of content) {
		if (typeof part === "string") text += part;
		else if (part && typeof part === "object" && typeof (part as { text?: unknown }).text === "string") {
			text += (part as { text: string }).text;
		}
	}
	return text.trim();
}

function toolNames(message: {
	content?: unknown;
	toolCalls?: Array<{ name?: string; function?: { name?: string } }>;
}): string[] {
	const names: string[] = [];
	for (const call of message.toolCalls ?? []) {
		const name = call.name ?? call.function?.name;
		if (name) names.push(name);
	}
	// Some runtimes carry the call inside the content parts instead.
	if (Array.isArray(message.content)) {
		for (const part of message.content) {
			if (part && typeof part === "object") {
				const record = part as { type?: string; name?: string };
				if (record.type === "toolCall" && record.name) names.push(record.name);
			}
		}
	}
	return names;
}

function clip(text: string, limit: number): string {
	const single = text.split(/\s+/).filter(Boolean).join(" ");
	return single.length > limit ? `${single.slice(0, limit)}…` : single;
}

/**
 * The stored messages as the events the signal gate reads.
 *
 * The gate asks structural questions — did a failing command later pass, did
 * the user push back after the agent acted, how many files were written — so it
 * needs roles, tool names and paths, not prose. Everything else is dropped.
 */
export function toEvents(messages: readonly unknown[]): ConversationEvent[] {
	const out: ConversationEvent[] = [];
	for (const raw of messages) {
		if (!raw || typeof raw !== "object") continue;
		const message = raw as {
			role?: string;
			content?: unknown;
			name?: string;
			toolName?: string;
			isError?: boolean;
			toolCalls?: Array<{ name?: string; function?: { name?: string; arguments?: unknown }; arguments?: unknown }>;
		};
		const role = message.role;
		// "toolResult" is what pi-agent-core calls a tool's reply; the gate
		// speaks "tool". Dropping them here — the bug this rename fixes —
		// silently disabled every signal that reads results, error_recovery
		// among them.
		if (role === "system") continue;
		if (role !== "user" && role !== "assistant" && role !== "tool" && role !== "toolResult") continue;

		const calls: Array<{ name: string; path?: string }> = [];
		for (const call of message.toolCalls ?? []) {
			const name = call.name ?? call.function?.name;
			if (!name) continue;
			const path = argumentPath(call.arguments ?? call.function?.arguments);
			calls.push(path ? { name, path } : { name });
		}
		if (Array.isArray(message.content)) {
			for (const part of message.content) {
				if (!part || typeof part !== "object") continue;
				const record = part as { type?: string; name?: string; arguments?: unknown; input?: unknown };
				if (record.type !== "toolCall" && record.type !== "tool_use") continue;
				if (!record.name) continue;
				const path = argumentPath(record.arguments ?? record.input);
				calls.push(path ? { name: record.name, path } : { name: record.name });
			}
		}

		out.push({
			role: role === "toolResult" ? "tool" : role,
			text: flatten(message.content),
			...(calls.length > 0 ? { calls } : {}),
			...(message.toolName ?? message.name ? { tool: message.toolName ?? message.name } : {}),
			...(typeof message.isError === "boolean" ? { isError: message.isError } : {}),
		});
	}
	return out;
}

/**
 * The file a tool call names.
 *
 * Tool schemas differ on what they call it, and a call whose argument is a JSON
 * string rather than an object is common enough to be worth handling — the
 * alternative is a `multi_file` signal that never fires.
 */
function argumentPath(args: unknown): string | undefined {
	let record = args;
	if (typeof record === "string") {
		try {
			record = JSON.parse(record);
		} catch {
			return undefined;
		}
	}
	if (!record || typeof record !== "object") return undefined;
	for (const key of ["path", "file", "filePath", "file_path"]) {
		const value = (record as Record<string, unknown>)[key];
		if (typeof value === "string" && value.trim()) return value.trim();
	}
	return undefined;
}
