import { describe, expect, it } from "vitest";
import {
	collectEntriesForBranchSummary,
	compact,
	InMemorySessionRepo,
	shouldCompact,
	summarizeBranch,
	type GenericMessage,
	type MessageEntry,
} from "../dist/index.js";

describe("compaction", () => {
	it("recommends compaction when token threshold is exceeded", () => {
		const smallMessages: GenericMessage[] = [
			{ role: "user", content: "hello" },
			{ role: "assistant", content: "hi" },
		];
		expect(shouldCompact(smallMessages, 1000)).toBe(false);

		const largeMessages: GenericMessage[] = [
			{ role: "user", content: "A".repeat(5000) },
		];
		expect(shouldCompact(largeMessages, 1000)).toBe(true);
	});

	it("preserves ground truth instructions in the summarization prompt", async () => {
		const messages: GenericMessage[] = [
			{ role: "user", content: "Please fix the failing tests in edit.ts" },
			{
				role: "assistant",
				content: [
					{
						type: "toolCall",
						name: "edit",
						arguments: { path: "packages/agent/src/tools/coding/edit.ts" },
					},
					{ type: "text", text: "I have edited edit.ts with withFileMutationQueue." },
				],
			},
			{
				role: "toolResult",
				content: "edited packages/agent/src/tools/coding/edit.ts (line 42, LF preserved)",
			},
			{ role: "user", content: "What is the test status?" },
			{
				role: "assistant",
				content: "1007 tests passing, 0 regressions.",
			},
		];

		let capturedPrompt = "";
		const mockSummarizer = async (prompt: string) => {
			capturedPrompt = prompt;
			return "## Goal & Scope\nFix tests\n## Modified Files & Changes (Ground Truth)\n- packages/agent/src/tools/coding/edit.ts: added withFileMutationQueue lock\n## Build & Test Status (Ground Truth)\n- 1007 tests passing, 0 failures\n";
		};

		const result = await compact(messages, { retainedTurnCount: 1 }, mockSummarizer);

		// Verify that ground-truth directives are strictly present in the prompt sent to LLM
		expect(capturedPrompt).toContain("PRESERVE GROUND TRUTH");
		expect(capturedPrompt).toContain("Modified Files & Changes (Ground Truth)");
		expect(capturedPrompt).toContain("Build & Test Status (Ground Truth)");
		expect(capturedPrompt).toContain("packages/agent/src/tools/coding/edit.ts");

		// Verify result details and retained tail
		expect(result.details.modifiedFiles).toContain("packages/agent/src/tools/coding/edit.ts");
		expect(result.summary).toContain("1007 tests passing");
		expect(result.retainedTail.length).toBeGreaterThan(0);
	});

	it("summarizes divergent branch history on branch jump", async () => {
		const repo = new InMemorySessionRepo();
		const session = await repo.create({ id: "branch-sess" });

		const root = await session.appendEntry<MessageEntry>(
			{ type: "message", id: "r", message: { role: "user", content: "root" } },
			"main",
		);

		// Exploration branch
		await session.createLane("experiment", root.id);
		const exp1 = await session.appendEntry<MessageEntry>(
			{
				type: "message",
				id: "e1",
				message: {
					role: "assistant",
					content: [
						{ type: "toolCall", name: "write", arguments: { path: "scratch/trial.ts" } },
						{ type: "text", text: "trying trial.ts" },
					],
				},
			},
			"experiment",
		);

		// Target jump back to root
		const collection = await collectEntriesForBranchSummary(session, exp1.id, root.id);
		expect(collection.commonAncestorId).toBe("r");
		expect(collection.entries.map((e) => e.id)).toEqual(["e1"]);

		let summarizedPrompt = "";
		const summary = await summarizeBranch(session, exp1.id, root.id, async (p) => {
			summarizedPrompt = p;
			return "Explored trial.ts on experiment branch, decided to revert.";
		});

		expect(summarizedPrompt).toContain("scratch/trial.ts");
		expect(summary.modifiedFiles).toContain("scratch/trial.ts");
		expect(summary.summary).toContain("Explored trial.ts");
	});
});
