import { randomUUID } from "node:crypto";
import { Session } from "./session.js";
import { SessionState, type SessionMutation } from "./state.js";
import {
	deleteSession,
	listSessions,
	loadSession,
	saveSession,
	type SavedSession,
} from "./storage.js";
import {
	type BranchBounds,
	type Entry,
	type EntryQuery,
	type ForkOptions,
	type LanePointer,
	type LaneRecord,
	type LogItem,
	type LogOptions,
	type MessageEntry,
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

export class LegacySessionStorage implements SessionStorage {
	private readonly root: string;
	private readonly metadata: SessionMetadata;
	private readonly state = new SessionState();

	constructor(root: string, metadata: SessionMetadata) {
		this.root = root;
		this.metadata = structuredClone(metadata);
	}

	static async create(root: string, metadata: SessionMetadata): Promise<LegacySessionStorage> {
		const storage = new LegacySessionStorage(root, metadata);
		await storage.persist();
		return storage;
	}

	static async load(root: string, id: string): Promise<LegacySessionStorage> {
		const saved = await loadSession(root, id);
		if (!saved) {
			throw new SessionError("not_found", `Session not found: ${id}`);
		}

		const metadata: SessionMetadata = {
			id: saved.id,
			createdAt: new Date(saved.created).getTime(),
			cwd: root,
			parentSessionId: saved.parent?.id,
			metadata: { title: saved.title },
		};

		const storage = new LegacySessionStorage(root, metadata);

		// Replay messages as entries
		if (Array.isArray(saved.messages)) {
			for (let i = 0; i < saved.messages.length; i++) {
				const msg = saved.messages[i] as any;
				const entry: MessageEntry = {
					type: "message",
					id: `msg-${i + 1}`,
					seq: i + 1,
					parentId: i === 0 ? null : `msg-${i}`,
					timestamp: metadata.createdAt + i * 1000,
					message: msg,
				};
				storage.state.applyMutation({ kind: "entry", lane: "main", entry });
			}
		}

		if (saved.title) {
			storage.state.applyMutation({
				kind: "fact",
				seq: storage.state.nextSequence,
				fact: "name",
				name: saved.title,
			});
		}

		return storage;
	}

	private async persist(): Promise<void> {
		const entries = this.state.findEntries({ type: "message" });
		const messages = entries.map((e) => (e as MessageEntry).message);
		const saved: SavedSession = {
			id: this.metadata.id,
			title: this.state.getName() ?? (this.metadata.metadata?.title as string) ?? "New conversation",
			created: new Date(this.metadata.createdAt).toISOString(),
			updated: new Date().toISOString(),
			model: "default",
			provider: "default",
			mode: "build",
			thinking: "off",
			turns: messages.length,
			messages,
			parent: this.metadata.parentSessionId
				? { id: this.metadata.parentSessionId, turns: 0, reason: "fork" }
				: undefined,
		};

		await saveSession(this.root, saved);
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
		await this.persist();
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
		await this.persist();
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

	fork(metadata: SessionMetadata, options: ForkOptions): LegacySessionStorage {
		const storage = new LegacySessionStorage(this.root, metadata);
		for (const mutation of this.state.createForkMutations(options)) {
			storage.state.applyMutation(mutation);
		}
		return storage;
	}
}

export class LegacySessionRepo implements SessionRepo {
	private readonly root: string;

	constructor(root: string) {
		this.root = root;
	}

	async create(options: SessionCreateOptions = {}): Promise<Session> {
		const id = options.id ?? randomUUID();
		const existing = await loadSession(this.root, id);
		if (existing) {
			throw new SessionError("already_exists", `Session already exists: ${id}`);
		}

		const metadata: SessionMetadata = {
			id,
			createdAt: Date.now(),
			cwd: this.root,
			parentSessionId: options.parentSessionId,
			metadata: options.metadata,
		};

		const storage = await LegacySessionStorage.create(this.root, metadata);
		return new Session(storage);
	}

	async load(metadata: SessionMetadata): Promise<Session> {
		const storage = await LegacySessionStorage.load(this.root, metadata.id);
		return new Session(storage);
	}

	async list(): Promise<SessionMetadata[]> {
		const metas = await listSessions(this.root);
		return metas.map((m) => ({
			id: m.id,
			createdAt: new Date(m.created).getTime(),
			cwd: this.root,
			parentSessionId: m.parent?.id,
			metadata: { title: m.title },
		}));
	}

	async delete(metadata: SessionMetadata): Promise<void> {
		await deleteSession(this.root, metadata.id);
	}

	async fork(source: SessionMetadata, options: ForkOptions & SessionCreateOptions): Promise<Session> {
		const sourceStorage = await LegacySessionStorage.load(this.root, source.id);
		const id = options.id ?? randomUUID();
		const existing = await loadSession(this.root, id);
		if (existing) {
			throw new SessionError("already_exists", `Session already exists: ${id}`);
		}

		const targetStorage = sourceStorage.fork(
			{
				id,
				createdAt: Date.now(),
				cwd: this.root,
				parentSessionId: source.id,
				metadata: options.metadata,
			},
			options,
		);

		await targetStorage["persist"]();
		return new Session(targetStorage);
	}
}
