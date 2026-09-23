import { classifyDocCategory } from "./dial.ts";
import type {
	DocCategory,
	RegenerationQueueStats,
	RegenerationTask,
	SourceDiff,
	StalenessReport,
} from "./types.ts";

const CATEGORY_PRIORITIES: Record<DocCategory, number> = {
	architecture: 1,
	subsystems: 2,
	api: 3,
	cards: 4,
	data_models: 5,
	security: 6,
	procedures: 7,
	runbooks: 8,
	benchmarks: 9,
	tutorials: 10,
	other: 11,
};

export interface QueueOptions {
	docToCategory?: (doc: string) => DocCategory;
	tokensPerDocumentEstimate?: number;
	sourceDiffs?: ReadonlyMap<string, SourceDiff[]> | Record<string, SourceDiff[]>;
}

/**
 * Selective regeneration queue running model inference only for stale chapters.
 *
 * Skipping already-current chapters eliminates redundant token spend, reduces latency,
 * and prevents regression or hallucination on untouched parts of the codebase.
 */
export class RegenerationQueue {
	private readonly tasksMap: Map<string, RegenerationTask> = new Map();
	private readonly order: string[] = [];
	private readonly totalRepoDocuments: number;
	private readonly tokensPerDoc: number;

	constructor(
		tasks: RegenerationTask[],
		totalRepoDocuments: number,
		tokensPerDoc = 4000,
	) {
		this.totalRepoDocuments = totalRepoDocuments;
		this.tokensPerDoc = tokensPerDoc;

		// Sort tasks by priority ascending (1 = highest priority)
		const sorted = [...tasks].sort((a, b) => a.priority - b.priority);
		for (const t of sorted) {
			this.tasksMap.set(t.id, t);
			this.order.push(t.id);
		}
	}

	get length(): number {
		return this.order.length;
	}

	get remaining(): number {
		return [...this.tasksMap.values()].filter(
			(t) => t.status === "queued" || t.status === "running",
		).length;
	}

	getAllTasks(): RegenerationTask[] {
		return this.order.map((id) => this.tasksMap.get(id)!);
	}

	getTask(id: string): RegenerationTask | undefined {
		return this.tasksMap.get(id);
	}

	peek(): RegenerationTask | undefined {
		for (const id of this.order) {
			const task = this.tasksMap.get(id)!;
			if (task.status === "queued") return task;
		}
		return undefined;
	}

	dequeue(): RegenerationTask | undefined {
		for (const id of this.order) {
			const task = this.tasksMap.get(id)!;
			if (task.status === "queued") {
				task.status = "running";
				return task;
			}
		}
		return undefined;
	}

	markCompleted(taskId: string): void {
		const task = this.tasksMap.get(taskId);
		if (task) task.status = "completed";
	}

	markFailed(taskId: string, error: string): void {
		const task = this.tasksMap.get(taskId);
		if (task) {
			task.status = "failed";
			task.error = error;
		}
	}

	markSkipped(taskId: string): void {
		const task = this.tasksMap.get(taskId);
		if (task) task.status = "skipped";
	}

	getStats(): RegenerationQueueStats {
		let queued = 0;
		let completed = 0;
		let failed = 0;

		for (const task of this.tasksMap.values()) {
			if (task.status === "queued" || task.status === "running") queued++;
			else if (task.status === "completed") completed++;
			else if (task.status === "failed") failed++;
		}

		const totalTasks = this.tasksMap.size;
		const fullTokens = this.totalRepoDocuments * this.tokensPerDoc;
		const selectiveTokens = totalTasks * this.tokensPerDoc;
		const estimatedTokensSaved = Math.max(0, fullTokens - selectiveTokens);
		const tokenSavingsRatio =
			this.totalRepoDocuments === 0
				? 0
				: Math.max(0, (this.totalRepoDocuments - totalTasks) / this.totalRepoDocuments);

		return {
			totalTasks,
			queued,
			completed,
			failed,
			estimatedTokensSaved,
			tokenSavingsRatio: Number(tokenSavingsRatio.toFixed(3)),
		};
	}

	serialize(): string {
		return JSON.stringify({
			tasks: this.getAllTasks(),
			totalRepoDocuments: this.totalRepoDocuments,
			tokensPerDoc: this.tokensPerDoc,
		});
	}

	static deserialize(json: string): RegenerationQueue {
		const data = JSON.parse(json);
		return new RegenerationQueue(
			data.tasks ?? [],
			data.totalRepoDocuments ?? 0,
			data.tokensPerDoc ?? 4000,
		);
	}
}

/**
 * Build a selective regeneration queue from a StalenessReport.
 */
export function createRegenerationQueue(
	report: StalenessReport,
	options?: QueueOptions,
): RegenerationQueue {
	const tokensPerDoc = options?.tokensPerDocumentEstimate ?? 4000;
	const diffMap =
		options?.sourceDiffs instanceof Map
			? options.sourceDiffs
			: options?.sourceDiffs
				? new Map(Object.entries(options.sourceDiffs))
				: new Map<string, SourceDiff[]>();

	const tasks: RegenerationTask[] = [];

	for (const staleDoc of report.stale) {
		const category = options?.docToCategory
			? options.docToCategory(staleDoc.document)
			: classifyDocCategory(staleDoc.document);

		const priority = CATEGORY_PRIORITIES[category] ?? 11;
		const changedSources = diffMap.get(staleDoc.document) ?? [];

		// Estimate tokens saved by not regenerating all the other fresh chapters
		const skippedCount = Math.max(0, report.documents.length - report.stale.length);
		const estimatedTokenSavings = Math.round(
			(skippedCount * tokensPerDoc) / Math.max(1, report.stale.length),
		);

		tasks.push({
			id: `regen:${staleDoc.document}`,
			document: staleDoc.document,
			category,
			priority,
			changedSources,
			estimatedTokenSavings,
			status: "queued",
		});
	}

	return new RegenerationQueue(tasks, report.documents.length, tokensPerDoc);
}
