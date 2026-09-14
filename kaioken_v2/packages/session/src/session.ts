import { buildSessionContext, type SessionContext, type SessionContextBuildOptions } from "./context.js";
import type {
	BranchBounds,
	Entry,
	EntryQuery,
	LanePointer,
	LaneRecord,
	LogItem,
	LogOptions,
	NewRecord,
	OperationStartedRecord,
	ProvisionedEntry,
	RecordQuery,
	SessionMetadata,
	SessionStats,
	SessionStorage,
	SessionTree,
} from "./types.js";

export class Session<TMetadata extends SessionMetadata = SessionMetadata> implements SessionTree {
	private readonly storage: SessionStorage<TMetadata>;

	constructor(storage: SessionStorage<TMetadata>) {
		this.storage = storage;
	}

	async getMetadata(): Promise<TMetadata> {
		return this.storage.getMetadata();
	}

	async getLeafId(lane = "main"): Promise<string | null> {
		return this.getLeafIdForLane(lane);
	}

	async getLeafIdForLane(lane = "main"): Promise<string | null> {
		const lanes = await this.storage.getLanes();
		const pointer = lanes.find((l) => l.lane === lane);
		return pointer ? pointer.leafId : null;
	}

	async getEntry(id: string): Promise<Entry | undefined> {
		return this.storage.getEntry(id);
	}

	async findEntries(query?: EntryQuery): Promise<Entry[]> {
		return this.storage.findEntries(query);
	}

	async findEntriesOnBranch(query: EntryQuery & BranchBounds & { start: string }): Promise<Entry[]> {
		return this.storage.findEntriesOnBranch(query);
	}

	async findRecords(query?: RecordQuery): Promise<LaneRecord[]> {
		return this.storage.findRecords(query);
	}

	async findOpenOperations(lane = "main", options?: { limit?: number }): Promise<OperationStartedRecord[]> {
		return this.storage.findOpenOperations(lane, options);
	}

	async getLog(options?: LogOptions): Promise<LogItem[]> {
		return this.storage.getLog(options);
	}

	async appendEntry<TEntry extends Entry>(newEntry: ProvisionedEntry<TEntry>, lane = "main"): Promise<TEntry> {
		return this.storage.appendEntry(newEntry, lane);
	}

	async appendRecord<TRecord extends LaneRecord>(newRecord: NewRecord<TRecord>): Promise<TRecord> {
		return this.storage.appendRecord(newRecord);
	}

	async createLane(lane: string, at: string | null): Promise<void> {
		return this.storage.createLane(lane, at);
	}

	async moveLane(lane: string, to: string | null): Promise<void> {
		return this.storage.moveLane(lane, to);
	}

	async getLanes(): Promise<LanePointer[]> {
		return this.storage.getLanes();
	}

	async getName(): Promise<string | undefined> {
		return this.storage.getName();
	}

	async setName(name: string | undefined): Promise<void> {
		return this.storage.setName(name);
	}

	async getLabel(id: string): Promise<string | undefined> {
		return this.storage.getLabel(id);
	}

	async setLabel(id: string, label: string | undefined): Promise<void> {
		return this.storage.setLabel(id, label);
	}

	async getStats(): Promise<SessionStats> {
		return this.storage.getStats();
	}

	/**
	 * Reconstructs LLM context messages from the current leaf of the specified lane,
	 * automatically respecting compaction boundaries.
	 */
	async buildContext(
		lane = "main",
		options: SessionContextBuildOptions = {},
	): Promise<SessionContext> {
		const leafId = await this.getLeafIdForLane(lane);
		if (!leafId) {
			return {
				messages: [],
				thinkingLevel: "off",
				model: null,
				activeToolNames: null,
			};
		}

		const branchEntries = await this.storage.findEntriesOnBranch({ start: leafId });
		return buildSessionContext(branchEntries, options);
	}
}
