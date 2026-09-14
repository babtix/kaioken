export type JsonValue =
	| null
	| boolean
	| number
	| string
	| JsonValue[]
	| { [key: string]: JsonValue };

export interface IdGenerator {
	next(): string;
}

export interface EntryBase {
	type: string;
	id: string;
	seq: number;
	parentId: string | null;
	timestamp: number;
}

export interface GenericAgentMessage {
	role: string;
	content?: unknown;
	provider?: string;
	model?: string;
	stopReason?: string;
	timestamp?: number;
	api?: string;
	usage?: unknown;
}

export interface MessageEntry extends EntryBase {
	type: "message";
	message: GenericAgentMessage;
	terminate?: true;
}

export interface ModelChangeEntry extends EntryBase {
	type: "model_change";
	provider: string;
	modelId: string;
}

export interface ThinkingLevelEntry extends EntryBase {
	type: "thinking_level_change";
	thinkingLevel: string;
}

export interface ActiveToolsEntry extends EntryBase {
	type: "active_tools_change";
	activeToolNames: string[];
}

export interface CompactionEntry extends EntryBase {
	type: "compaction";
	summary: string;
	retainedTail: GenericAgentMessage[];
	tokensBefore: number;
	details?: unknown;
}

export interface BranchSummaryEntry extends EntryBase {
	type: "branch_summary";
	fromId: string;
	summary: string;
	details?: unknown;
}

export interface CustomEntry extends EntryBase {
	type: "custom";
	customType: string;
	data?: unknown;
}

export type Entry =
	| MessageEntry
	| ModelChangeEntry
	| ThinkingLevelEntry
	| ActiveToolsEntry
	| CompactionEntry
	| BranchSummaryEntry
	| CustomEntry;

export type ProvisionedEntry<TEntry extends Entry = Entry> = TEntry extends Entry
	? Omit<TEntry, "parentId" | "seq" | "timestamp">
	: never;

export interface RecordBase {
	id: string;
	seq: number;
	lane: string;
	timestamp: number;
}

export interface OperationStartedRecord extends RecordBase {
	type: "operation_started";
	sourceLeafId: string | null;
	intent: {
		kind: "run" | "compaction" | "navigation";
		originalPrompt?: unknown[];
		initialMessages?: unknown[];
		systemPromptOverride?: string;
		targetId?: string | null;
		summarize?: boolean;
		resultEntryId?: string;
	};
}

export interface AbortRequestedRecord extends RecordBase {
	type: "abort_requested";
	runId: string;
}

export interface OperationFinishedRecord extends RecordBase {
	type: "operation_finished";
	runId: string;
	outcome: "completed" | "aborted" | "failed" | "declined";
	error?: { code: string; message: string };
}

export interface StepAttemptRecord extends RecordBase {
	type: "step_attempt";
	runId: string;
	step: "assistant" | "branch_summary" | "compaction";
	attempt: number;
	resultEntryId: string;
}

export interface ToolStartedRecord extends RecordBase {
	type: "tool_started";
	runId: string;
	toolCallId: string;
	toolName: string;
}

export type LaneRecord =
	| OperationStartedRecord
	| AbortRequestedRecord
	| OperationFinishedRecord
	| StepAttemptRecord
	| ToolStartedRecord;

export type NewRecord<TRecord extends LaneRecord = LaneRecord> = TRecord extends LaneRecord
	? Omit<TRecord, "seq" | "timestamp">
	: never;

export interface LanePointer {
	lane: string;
	leafId: string | null;
}

export interface SessionStats {
	entryCount: number;
	recordCount: number;
	laneCount: number;
}

export interface SessionMetadata {
	id: string;
	createdAt: number;
	cwd?: string;
	parentSessionId?: string;
	metadata?: Record<string, JsonValue>;
}

export interface SessionCreateOptions {
	id?: string;
	cwd?: string;
	parentSessionId?: string;
	metadata?: Record<string, JsonValue>;
}

export interface ForkOptions {
	id?: string;
	lane: string;
	at: string | null;
}

export interface BranchBounds {
	stopAt?: string | null;
}

export interface EntryQuery {
	type?: Entry["type"];
	afterSeq?: number;
	limit?: number;
}

export interface RecordQuery {
	type?: LaneRecord["type"];
	lane?: string;
	afterSeq?: number;
	limit?: number;
}

export interface LogOptions {
	afterSeq?: number;
	limit?: number;
}

export type LogItem =
	| { kind: "entry"; seq: number; entry: Entry }
	| { kind: "record"; seq: number; record: LaneRecord }
	| { kind: "lane"; seq: number; lane: string; leafId: string | null }
	| { kind: "fact"; seq: number; fact: "name"; name?: string }
	| { kind: "fact"; seq: number; fact: "label"; targetId: string; label?: string };

export type SessionErrorCode =
	| "not_found"
	| "already_exists"
	| "invalid_entry"
	| "invalid_payload"
	| "invalid_lane"
	| "invalid_query"
	| "invalid_fork_target"
	| "storage";

export class SessionError extends Error {
	readonly code: SessionErrorCode;

	constructor(code: SessionErrorCode, message: string, cause?: Error) {
		super(message, cause === undefined ? undefined : { cause });
		this.name = "SessionError";
		this.code = code;
	}
}

export interface SessionTree {
	getLeafId(lane?: string): Promise<string | null>;
	getEntry(id: string): Promise<Entry | undefined>;
	getStats(): Promise<SessionStats>;
}

export interface SessionStorage<TMetadata extends SessionMetadata = SessionMetadata> {
	getMetadata(): Promise<TMetadata>;
	getLanes(): Promise<LanePointer[]>;
	createLane(lane: string, at: string | null): Promise<void>;
	moveLane(lane: string, to: string | null): Promise<void>;
	appendEntry<TEntry extends Entry>(newEntry: ProvisionedEntry<TEntry>, lane: string): Promise<TEntry>;
	appendRecord<TRecord extends LaneRecord>(newRecord: NewRecord<TRecord>): Promise<TRecord>;
	getEntry(id: string): Promise<Entry | undefined>;
	findEntries(query?: EntryQuery): Promise<Entry[]>;
	findEntriesOnBranch(query: EntryQuery & BranchBounds & { start: string }): Promise<Entry[]>;
	findRecords(query?: RecordQuery): Promise<LaneRecord[]>;
	findOpenOperations(lane?: string, options?: { limit?: number }): Promise<OperationStartedRecord[]>;
	getLog(options?: LogOptions): Promise<LogItem[]>;
	getName(): Promise<string | undefined>;
	setName(name: string | undefined): Promise<void>;
	getLabel(id: string): Promise<string | undefined>;
	setLabel(id: string, label: string | undefined): Promise<void>;
	getStats(): Promise<SessionStats>;
}

export interface SessionRepo<
	TMetadata extends SessionMetadata = SessionMetadata,
	TCreateOptions extends SessionCreateOptions = SessionCreateOptions,
	TListOptions = unknown,
> {
	create(options?: TCreateOptions): Promise<import("./session.js").Session<TMetadata>>;
	load(metadata: TMetadata): Promise<import("./session.js").Session<TMetadata>>;
	list(options?: TListOptions): Promise<TMetadata[]>;
	delete(metadata: TMetadata): Promise<void>;
	fork(source: TMetadata, options: ForkOptions & TCreateOptions): Promise<import("./session.js").Session<TMetadata>>;
}
