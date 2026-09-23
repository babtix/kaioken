import type { CompactionEntry, Entry, GenericAgentMessage } from "./types.js";

export interface SessionContext {
	messages: GenericAgentMessage[];
	thinkingLevel: string;
	model: { provider: string; modelId: string } | null;
	activeToolNames: string[] | null;
}

export type ContextEntryTransform = (entries: readonly Entry[]) => readonly Entry[];

export interface SessionContextBuildOptions {
	entryTransforms?: readonly ContextEntryTransform[];
}

function deriveSessionContextState(pathEntries: readonly Entry[]): Omit<SessionContext, "messages"> {
	let thinkingLevel = "off";
	let model: { provider: string; modelId: string } | null = null;
	let activeToolNames: string[] | null = null;

	for (const entry of pathEntries) {
		if (entry.type === "thinking_level_change") {
			thinkingLevel = entry.thinkingLevel;
		} else if (entry.type === "model_change") {
			model = { provider: entry.provider, modelId: entry.modelId };
		} else if (entry.type === "message" && entry.message.role === "assistant") {
			if (entry.message.provider && entry.message.model) {
				model = { provider: entry.message.provider, modelId: entry.message.model };
			}
		} else if (entry.type === "active_tools_change") {
			activeToolNames = [...entry.activeToolNames];
		}
	}

	return { thinkingLevel, model, activeToolNames };
}

export function defaultContextEntryTransform(pathEntries: readonly Entry[]): Entry[] {
	let compaction: CompactionEntry | undefined;
	let compactionIndex = -1;

	// Find the most recent compaction boundary
	for (let index = pathEntries.length - 1; index >= 0; index--) {
		const entry = pathEntries[index]!;
		if (entry.type === "compaction") {
			compaction = entry;
			compactionIndex = index;
			break;
		}
	}

	return compaction === undefined
		? [...pathEntries]
		: [compaction, ...pathEntries.slice(compactionIndex + 1)];
}

export function sessionEntryToContextMessages(entry: Entry): GenericAgentMessage[] {
	if (entry.type === "message") {
		if (entry.message.role === "assistant" && entry.message.stopReason === "deferred") {
			return [];
		}
		return [entry.message];
	}

	if (entry.type === "compaction") {
		const summaryMessage: GenericAgentMessage = {
			role: "user",
			content: [
				{
					type: "text",
					text: `[Context Checkpoint Summary]\n${entry.summary}`,
				},
			],
			timestamp: entry.timestamp,
		};
		return [summaryMessage, ...entry.retainedTail];
	}

	if (entry.type === "branch_summary" && entry.summary) {
		return [
			{
				role: "user",
				content: [
					{
						type: "text",
						text: `[Prior Branch Summary (${entry.fromId})]\n${entry.summary}`,
					},
				],
				timestamp: entry.timestamp,
			},
		];
	}

	return [];
}

/**
 * Build LLM context messages from session entries, honoring compaction boundaries.
 */
export function buildSessionContext(
	pathEntries: readonly Entry[],
	options: SessionContextBuildOptions = {},
): SessionContext {
	const state = deriveSessionContextState(pathEntries);
	let contextEntries = defaultContextEntryTransform(pathEntries);

	for (const transform of options.entryTransforms ?? []) {
		contextEntries = [...transform(contextEntries)];
	}

	const messages = contextEntries.flatMap(sessionEntryToContextMessages);
	return { ...state, messages };
}
