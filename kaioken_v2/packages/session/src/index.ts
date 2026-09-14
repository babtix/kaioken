// Legacy storage, tree, undo, and signals exports
export {
	deleteSession,
	deriveTitle,
	generateSessionId,
	listSessions,
	loadSession,
	saveSession,
	sessionPath,
	sessionsDir,
} from "./storage.js";
export type { SavedSession, SessionMeta, SessionParent } from "./storage.js";
export { buildBranchTree, flattenBranches } from "./tree.js";
export type { BranchNode } from "./tree.js";
export {
	bashFileTargets,
	clearUndoJournal,
	readUndoJournal,
	recordUndo,
	undoLast,
	undoPath,
	UNDO_DIR,
} from "./undo.js";
export type { BashTargets, UndoEntry, UndoOutcome } from "./undo.js";
export { looksLikeCorrection, looksLikeToolError, sessionSignals } from "./signals.js";
export type { ConversationEvent, Signal } from "./signals.js";

// Sprint 4: Unified Session & Compaction
export { Session } from "./session.js";
export { SessionState } from "./state.js";
export type { SessionMutation } from "./state.js";
export { InMemorySessionStorage, InMemorySessionRepo } from "./memory.js";
export { LegacySessionStorage, LegacySessionRepo } from "./legacy-adapter.js";
export {
	buildSessionContext,
	defaultContextEntryTransform,
	sessionEntryToContextMessages,
} from "./context.js";
export type { SessionContext, SessionContextBuildOptions, ContextEntryTransform } from "./context.js";

// JSONL Crash-safe Append-only Storage & Repo
export { JsonlSessionStorage } from "./jsonl/storage.js";
export { JsonlSessionRepo } from "./jsonl/repo.js";
export { encodeHeader, parseHeader, encodeMutation, parseMutation, metadataFromHeader } from "./jsonl/codec.js";
export { JsonlDecodeError, invalidFile } from "./jsonl/errors.js";
export type {
	JsonlV4Header,
	JsonlSessionMetadata,
	JsonlSessionCreateOptions,
	JsonlSessionListOptions,
	JsonlSessionRepoFileSystem,
	JsonlSessionRepoOptions,
	FileInfo,
	DirEntry,
} from "./jsonl/types.js";

// Compaction & Branch Summarization
export {
	compact,
	shouldCompact,
	estimateTokens,
	SUMMARIZATION_SYSTEM_PROMPT,
	GROUND_TRUTH_SUMMARIZATION_PROMPT,
	UPDATE_GROUND_TRUTH_SUMMARIZATION_PROMPT,
} from "./compaction/compaction.js";
export type { CompactOptions, CompactResult, CompactDetails } from "./compaction/compaction.js";
export {
	collectEntriesForBranchSummary,
	summarizeBranch,
} from "./compaction/branch-summarization.js";
export type { BranchSummaryResult, CollectEntriesResult } from "./compaction/branch-summarization.js";
export {
	createFileOps,
	extractFileOpsFromMessage,
	computeFileLists,
	formatFileOperations,
	serializeConversation,
} from "./compaction/utils.js";
export type { FileOperations, GenericMessage } from "./compaction/utils.js";

// Testing Conformance Suite
export { createSessionBackendConformance } from "./testing/conformance.js";
export type {
	SessionBackendFixture,
	SessionBackendFixtureFactory,
	SessionBackendConformanceCase,
} from "./testing/types.js";

// Port Adapters
export { createSessionPort, createCompactionPort } from "./ports.js";
export type { SessionPortOptions } from "./ports.js";

// Core Types
export { SessionError } from "./types.js";
export type {
	Entry,
	EntryBase,
	MessageEntry,
	ModelChangeEntry,
	ThinkingLevelEntry,
	ActiveToolsEntry,
	CompactionEntry,
	BranchSummaryEntry,
	CustomEntry,
	ProvisionedEntry,
	RecordBase,
	LaneRecord,
	OperationStartedRecord,
	AbortRequestedRecord,
	OperationFinishedRecord,
	StepAttemptRecord,
	ToolStartedRecord,
	NewRecord,
	LanePointer,
	SessionStats,
	SessionMetadata,
	SessionCreateOptions,
	ForkOptions,
	BranchBounds,
	EntryQuery,
	RecordQuery,
	LogOptions,
	LogItem,
	SessionErrorCode,
	SessionStorage,
	SessionRepo,
	SessionTree,
	GenericAgentMessage,
} from "./types.js";
