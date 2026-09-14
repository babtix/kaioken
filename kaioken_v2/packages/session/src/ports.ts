import type { CompactionPort, SessionPort } from "@kaioken/agent";
import { compact, shouldCompact, type CompactOptions } from "./compaction/compaction.js";
import { deriveTitle } from "./storage.js";
import type { Entry, GenericAgentMessage, MessageEntry, SessionMetadata, SessionRepo } from "./types.js";

export interface SessionPortOptions {
	cwd: string;
}

/**
 * Creates a concrete SessionPort implementing the @kaioken/agent SessionPort contract,
 * backed by a SessionRepo.
 */
export function createSessionPort(
	repo: SessionRepo,
	options: SessionPortOptions,
): SessionPort {
	return {
		async save(messages: unknown[]): Promise<void> {
			const session = await repo.create({ cwd: options.cwd });
			const rawMessages = (Array.isArray(messages) ? messages : []) as GenericAgentMessage[];

			for (let i = 0; i < rawMessages.length; i++) {
				const msg = rawMessages[i]!;
				await session.appendEntry<MessageEntry>({
					type: "message",
					id: `msg-${i + 1}`,
					message: msg,
				});
			}

			const title = deriveTitle(messages);
			await session.setName(title);
		},

		async load(id: string): Promise<unknown[] | null> {
			try {
				const session = await repo.load({ id, createdAt: Date.now(), cwd: options.cwd });
				const context = await session.buildContext("main");
				return context.messages;
			} catch {
				return null;
			}
		},

		async list(): Promise<Array<{ id: string; title: string; updated: string }>> {
			const list = await repo.list({ cwd: options.cwd });
			return list.map((meta: SessionMetadata) => ({
				id: meta.id,
				title: (meta.metadata?.title as string) ?? meta.id,
				updated: new Date(meta.createdAt).toISOString(),
			}));
		},
	};
}

/**
 * Creates a concrete CompactionPort implementing the @kaioken/agent CompactionPort contract.
 *
 * Takes a provider-bound summarize callback from the host, keeping packages/session
 * strictly transport-agnostic with zero LLM SDK imports.
 */
export function createCompactionPort(
	summarize: (prompt: string) => Promise<string>,
	options: CompactOptions = {},
): CompactionPort {
	return {
		shouldCompact(messages: unknown[]): boolean {
			const msgs = (Array.isArray(messages) ? messages : []) as GenericAgentMessage[];
			return shouldCompact(msgs, options.tokenThreshold);
		},

		async compact(messages: unknown[], _signal?: AbortSignal): Promise<unknown[]> {
			const msgs = (Array.isArray(messages) ? messages : []) as GenericAgentMessage[];
			const result = await compact(msgs, options, summarize);

			// Return reconstructed message context: summary message + retained tail
			const summaryMessage: GenericAgentMessage = {
				role: "user",
				content: [{ type: "text", text: `[Context Checkpoint Summary]\n${result.summary}` }],
				timestamp: Date.now(),
			};

			return [summaryMessage, ...result.retainedTail];
		},
	};
}
