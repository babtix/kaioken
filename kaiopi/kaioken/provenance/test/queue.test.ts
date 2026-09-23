import { describe, expect, it } from "vitest";
import { createRegenerationQueue, RegenerationQueue } from "../src/queue.ts";
import type { StalenessReport } from "../src/types.ts";

describe("Selective Regeneration Queue", () => {
	const mockReport: StalenessReport = {
		ok: false,
		freshness: 0.8,
		changedFiles: ["src/core.ts"],
		deletedFiles: [],
		undocumentedFiles: [],
		documents: [
			{
				document: "docs/architecture/system.md",
				freshness: "stale",
				changed: ["src/core.ts"],
				deleted: [],
				unchanged: [],
				generatedAt: "",
			},
			{
				document: "card:users",
				freshness: "stale",
				changed: ["src/core.ts"],
				deleted: [],
				unchanged: [],
				generatedAt: "",
			},
			{
				document: "tutorials/getting-started.md",
				freshness: "current",
				changed: [],
				deleted: [],
				unchanged: ["src/other.ts"],
				generatedAt: "",
			},
			{
				document: "docs/runbooks/deploy.md",
				freshness: "current",
				changed: [],
				deleted: [],
				unchanged: ["src/other.ts"],
				generatedAt: "",
			},
			{
				document: "card:billing",
				freshness: "current",
				changed: [],
				deleted: [],
				unchanged: ["src/other.ts"],
				generatedAt: "",
			},
		],
		current: [
			{
				document: "tutorials/getting-started.md",
				freshness: "current",
				changed: [],
				deleted: [],
				unchanged: [],
				generatedAt: "",
			},
			{
				document: "docs/runbooks/deploy.md",
				freshness: "current",
				changed: [],
				deleted: [],
				unchanged: [],
				generatedAt: "",
			},
			{
				document: "card:billing",
				freshness: "current",
				changed: [],
				deleted: [],
				unchanged: [],
				generatedAt: "",
			},
		],
		stale: [
			{
				document: "docs/architecture/system.md",
				freshness: "stale",
				changed: ["src/core.ts"],
				deleted: [],
				unchanged: [],
				generatedAt: "",
			},
			{
				document: "card:users",
				freshness: "stale",
				changed: ["src/core.ts"],
				deleted: [],
				unchanged: [],
				generatedAt: "",
			},
		],
		orphaned: [],
	};

	it("enqueues only stale documents, skipping current documents", () => {
		const queue = createRegenerationQueue(mockReport);
		expect(queue.length).toBe(2);

		const tasks = queue.getAllTasks();
		expect(tasks.map((t) => t.document)).toEqual([
			"docs/architecture/system.md",
			"card:users",
		]);
	});

	it("schedules tasks according to category priority", () => {
		const queue = createRegenerationQueue(mockReport);
		const first = queue.dequeue();
		expect(first?.document).toBe("docs/architecture/system.md"); // Priority 1 (architecture)
		expect(first?.category).toBe("architecture");

		const second = queue.dequeue();
		expect(second?.document).toBe("card:users"); // Priority 4 (cards)
	});

	it("computes accurate token savings metrics", () => {
		const queue = createRegenerationQueue(mockReport, { tokensPerDocumentEstimate: 4000 });
		const stats = queue.getStats();

		// Total repo docs = 5. Full regen = 5 * 4000 = 20,000 tokens.
		// Stale docs = 2. Selective regen = 2 * 4000 = 8,000 tokens.
		// Estimated tokens saved = 12,000 tokens (60% savings ratio).
		expect(stats.totalTasks).toBe(2);
		expect(stats.estimatedTokensSaved).toBe(12000);
		expect(stats.tokenSavingsRatio).toBe(0.6);
	});

	it("tracks task state transitions through completion and failure", () => {
		const queue = createRegenerationQueue(mockReport);
		const task = queue.dequeue();
		expect(task?.status).toBe("running");

		queue.markCompleted(task!.id);
		expect(queue.getTask(task!.id)?.status).toBe("completed");

		const task2 = queue.dequeue();
		queue.markFailed(task2!.id, "Model rate limit exceeded");
		expect(queue.getTask(task2!.id)?.status).toBe("failed");
		expect(queue.getTask(task2!.id)?.error).toBe("Model rate limit exceeded");

		const stats = queue.getStats();
		expect(stats.completed).toBe(1);
		expect(stats.failed).toBe(1);
		expect(stats.queued).toBe(0);
	});

	it("serializes and deserializes cleanly for persistence", () => {
		const queue = createRegenerationQueue(mockReport);
		const json = queue.serialize();
		const restored = RegenerationQueue.deserialize(json);

		expect(restored.length).toBe(2);
		expect(restored.peek()?.document).toBe("docs/architecture/system.md");
	});
});
