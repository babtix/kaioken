import { randomUUID } from "node:crypto";
import { Session } from "./session.js";
import { SessionState } from "./state.js";
import {
	type BranchBounds,
	type Entry,
	type EntryQuery,
	type ForkOptions,
	type LanePointer,
	type LaneRecord,
	type LogItem,
	type LogOptions,
	type NewRecord,
	type OperationStartedRecord,
	type ProvisionedEntry,
	type RecordQuery,
	type SessionCreateOptions,
	SessionError,
	type SessionMetadata,
	type SessionRepo,
	type SessionStats,
	type SessionStorage,
} from "./types.js";

export class InMemorySessionStorage implements SessionStorage {
	private readonly metadata: SessionMetadata;
	private readonly state = new SessionState();

	constructor(metadata: SessionMetadata) {
		this.metadata = structuredClone(metadata);
	}

	fork(metadata: SessionMetadata, options: ForkOptions): InMemorySessionStorage {
		const storage = new InMemorySessionStorage(metadata);
		for (const mutation of this.state.createForkMutations(options)) {
			storage.state.applyMutation(mutation);
		}
		return storage;
	}

	async getMetadata(): Promise<SessionMetadata> {
		return structuredClone(this.metadata);
	}

	async getLanes(): Promise<LanePointer[]> {
		return this.state.getLanes();
	}

	async createLane(lane: string, at: string | null): Promise<void> {
		this.state.validateNewLane(lane);
		this.state.validateTarget(at);
		this.state.applyMutation({ kind: "lane", seq: this.state.nextSequence, lane, leafId: at });
	}

	async moveLane(lane: string, to: string | null): Promise<void> {
		this.state.requireLane(lane);
		this.state.validateTarget(to);
		this.state.applyMutation({ kind: "lane", seq: this.state.nextSequence, lane, leafId: to });
	}

	async appendEntry<TEntry extends Entry>(newEntry: ProvisionedEntry<TEntry>, lane: string): Promise<TEntry> {
		const parentId = this.state.requireLane(lane);
		this.state.validateUnusedId(newEntry.id);
		const entry = {
			...structuredClone(newEntry),
			parentId,
			seq: this.state.nextSequence,
			timestamp: Date.now(),
		} as unknown as TEntry;
		this.state.applyMutation({ kind: "entry", lane, entry });
		return structuredClone(entry);
	}

	async appendRecord<TRecord extends LaneRecord>(newRecord: NewRecord<TRecord>): Promise<TRecord> {
		this.state.requireLane(newRecord.lane);
		this.state.validateUnusedId(newRecord.id);
		const record = {
			...structuredClone(newRecord),
			seq: this.state.nextSequence,
			timestamp: Date.now(),
		} as unknown as TRecord;
		this.state.applyMutation({ kind: "record", record });
		return structuredClone(record);
	}

	async getEntry(id: string): Promise<Entry | undefined> {
		const entry = this.state.getEntry(id);
		return entry === undefined ? undefined : structuredClone(entry);
	}

	async findEntries(query: EntryQuery = {}): Promise<Entry[]> {
		return structuredClone(this.state.findEntries(query));
	}

	async findEntriesOnBranch(query: EntryQuery & BranchBounds & { start: string }): Promise<Entry[]> {
		return structuredClone(this.state.findEntriesOnBranch(query));
	}

	async findRecords(query: RecordQuery = {}): Promise<LaneRecord[]> {
		return structuredClone(this.state.findRecords(query));
	}

	async findOpenOperations(lane: string, options?: { limit?: number }): Promise<OperationStartedRecord[]> {
		return structuredClone(this.state.findOpenOperations(lane, options));
	}

	async getLog(options: LogOptions = {}): Promise<LogItem[]> {
		return structuredClone(this.state.getLog(options));
	}

	async getName(): Promise<string | undefined> {
		return this.state.getName();
	}

	async setName(name: string | undefined): Promise<void> {
		this.state.applyMutation({ kind: "fact", seq: this.state.nextSequence, fact: "name", name });
	}

	async getLabel(id: string): Promise<string | undefined> {
		return this.state.getLabel(id);
	}

	async setLabel(id: string, label: string | undefined): Promise<void> {
		this.state.validateTarget(id);
		this.state.applyMutation({
			kind: "fact",
			seq: this.state.nextSequence,
			fact: "label",
			targetId: id,
			label,
		});
	}

	async getStats(): Promise<SessionStats> {
		return structuredClone(this.state.getStats());
	}
}

export class InMemorySessionRepo implements SessionRepo {
	private readonly sessions = new Map<string, InMemorySessionStorage>();

	async create(options: SessionCreateOptions = {}): Promise<Session> {
		const id = options.id ?? randomUUID();
		if (this.sessions.has(id)) {
			throw new SessionError("already_exists", `Session already exists: ${id}`);
		}
		const storage = new InMemorySessionStorage({
			id,
			createdAt: Date.now(),
			cwd: options.cwd,
			parentSessionId: options.parentSessionId,
			metadata: options.metadata,
		});
		this.sessions.set(id, storage);
		return new Session(storage);
	}

	async load(metadata: SessionMetadata): Promise<Session> {
		const storage = this.sessions.get(metadata.id);
		if (!storage) {
			throw new SessionError("not_found", `Session not found: ${metadata.id}`);
		}
		return new Session(storage);
	}

	async list(): Promise<SessionMetadata[]> {
		const result: SessionMetadata[] = [];
		for (const storage of this.sessions.values()) {
			result.push(await storage.getMetadata());
		}
		return result.sort((a, b) => b.createdAt - a.createdAt);
	}

	async delete(metadata: SessionMetadata): Promise<void> {
		this.sessions.delete(metadata.id);
	}

	async fork(source: SessionMetadata, options: ForkOptions & SessionCreateOptions): Promise<Session> {
		const sourceStorage = this.sessions.get(source.id);
		if (!sourceStorage) {
			throw new SessionError("not_found", `Source session not found: ${source.id}`);
		}

		const id = options.id ?? randomUUID();
		if (this.sessions.has(id)) {
			throw new SessionError("already_exists", `Session already exists: ${id}`);
		}

		const targetStorage = sourceStorage.fork(
			{
				id,
				createdAt: Date.now(),
				cwd: options.cwd ?? source.cwd,
				parentSessionId: source.id,
				metadata: options.metadata,
			},
			options,
		);

		this.sessions.set(id, targetStorage);
		return new Session(targetStorage);
	}
}
