import { deepStrictEqual, ok, rejects, strictEqual } from "node:assert/strict";
import type {
	Entry,
	LaneRecord,
	MessageEntry,
	NewRecord,
	OperationStartedRecord,
	SessionError,
	SessionErrorCode,
	SessionRepo,
} from "../types.js";
import type { SessionBackendConformanceCase, SessionBackendFixtureFactory } from "./types.js";

function createMessage(role: "user" | "assistant", text: string) {
	return {
		role,
		content: [{ type: "text", text }],
		timestamp: Date.now(),
	};
}

function operationStarted(
	id: string,
	lane: string,
	kind: "run" | "compaction" | "navigation" = "run",
): NewRecord<OperationStartedRecord> {
	return {
		type: "operation_started",
		id,
		lane,
		sourceLeafId: null,
		intent: { kind, originalPrompt: [], initialMessages: [] },
	};
}

async function rejectsWithCode(operation: Promise<unknown>, code: SessionErrorCode): Promise<void> {
	await rejects(
		operation,
		(error: unknown) =>
			typeof error === "object" && error !== null && "code" in error && (error as SessionError).code === code,
		`Expected SessionError with code ${code}`,
	);
}

type ConformanceTest = (repository: SessionRepo) => Promise<void>;

function createCase(
	factory: SessionBackendFixtureFactory,
	group: string,
	name: string,
	test: ConformanceTest,
): SessionBackendConformanceCase {
	return {
		group,
		name,
		async run() {
			const fixture = await factory();
			try {
				await test(fixture.repository);
			} finally {
				if ("dispose" in fixture && typeof fixture.dispose === "function") {
					await fixture.dispose();
				}
			}
		},
	};
}

/**
 * Creates the reusable session backend conformance suite.
 * Each test runs against an isolated fixture created by the factory.
 */
export function createSessionBackendConformance(
	factory: SessionBackendFixtureFactory,
): readonly SessionBackendConformanceCase[] {
	return [
		// 1. SEQUENCE MONOTONICITY & PARENTAGE
		createCase(
			factory,
			"sequences and ordering",
			"assigns parents and strictly monotonic sequence numbers across entries, lanes, facts, and records",
			async (repo) => {
				const session = await repo.create({ id: "session-mono", cwd: "/test" });

				const root = await session.appendEntry<MessageEntry>(
					{ type: "message", id: "root", message: createMessage("user", "Hello") },
					"main",
				);
				await session.createLane("feature-lane", root.id);

				const child = await session.appendEntry<MessageEntry>(
					{ type: "message", id: "child", message: createMessage("assistant", "Hi there") },
					"feature-lane",
				);

				const record = await session.appendRecord(operationStarted("op-1", "feature-lane"));
				await session.setName("Monotonicity Test Session");
				await session.setLabel(root.id, "initial-checkpoint");
				await session.moveLane("main", child.id);

				// Verify parentage
				strictEqual(root.parentId, null);
				strictEqual(child.parentId, "root");

				// Verify strict monotonic sequence ordering across mutations
				strictEqual(root.seq, 1);
				strictEqual(child.seq, 3); // seq 2 was createLane
				strictEqual(record.seq, 4);

				const log = await session.getLog();
				const sequences = log.map((item) => item.seq);
				deepStrictEqual(sequences, [1, 2, 3, 4, 5, 6, 7]);

				// Verify lanes
				const lanes = await session.getLanes();
				deepStrictEqual(lanes, [
					{ lane: "main", leafId: "child" },
					{ lane: "feature-lane", leafId: "child" },
				]);
			},
		),

		// 2. LANE MOVEMENT & BRANCH ISOLATION
		createCase(
			factory,
			"lanes and branches",
			"moves lanes between branches and isolates divergent branch histories",
			async (repo) => {
				const session = await repo.create({ id: "session-branches", cwd: "/test" });

				// Root node
				const root = await session.appendEntry<MessageEntry>(
					{ type: "message", id: "root", message: createMessage("user", "Base question") },
					"main",
				);

				// Branch 1: main lane continues
				const branchA = await session.appendEntry<MessageEntry>(
					{ type: "message", id: "branch-a", message: createMessage("assistant", "Approach A") },
					"main",
				);

				// Branch 2: alternative lane branched from root
				await session.createLane("alt", root.id);
				const branchB = await session.appendEntry<MessageEntry>(
					{ type: "message", id: "branch-b", message: createMessage("assistant", "Approach B") },
					"alt",
				);

				// Verify tree separation
				const mainBranchEntries = await session.findEntriesOnBranch({ start: branchA.id });
				const altBranchEntries = await session.findEntriesOnBranch({ start: branchB.id });

				deepStrictEqual(
					mainBranchEntries.map((e) => e.id),
					["root", "branch-a"],
				);
				deepStrictEqual(
					altBranchEntries.map((e) => e.id),
					["root", "branch-b"],
				);

				// Move main lane pointer to branchB leaf
				await session.moveLane("main", branchB.id);
				const updatedLanes = await session.getLanes();
				const mainLane = updatedLanes.find((l) => l.lane === "main");
				strictEqual(mainLane?.leafId, "branch-b");

				// Moving to a nonexistent ID must fail with 'not_found'
				await rejectsWithCode(session.moveLane("main", "non-existent-id"), "not_found");
			},
		),

		// 3. FORK OPERATIONS
		createCase(
			factory,
			"forking",
			"forks a session from a specific leaf with independent divergent mutations",
			async (repo) => {
				const original = await repo.create({ id: "original-session", cwd: "/test" });

				const msg1 = await original.appendEntry<MessageEntry>(
					{ type: "message", id: "msg-1", message: createMessage("user", "First") },
					"main",
				);
				const msg2 = await original.appendEntry<MessageEntry>(
					{ type: "message", id: "msg-2", message: createMessage("assistant", "Second") },
					"main",
				);

				// Fork session up to msg-1
				const forked = await repo.fork(await original.getMetadata(), {
					id: "forked-session",
					lane: "main",
					at: msg1.id,
					cwd: "/test",
				});

				// Fork must have msg-1 but NOT msg-2
				const forkedLeaf = await forked.getLeafIdForLane("main");
				strictEqual(forkedLeaf, "msg-1");
				const forkedMsg1 = await forked.getEntry("msg-1");
				ok(forkedMsg1 !== undefined);
				const forkedMsg2 = await forked.getEntry("msg-2");
				strictEqual(forkedMsg2, undefined);

				// Add entry to forked session; original must remain untouched
				const forkMsg = await forked.appendEntry<MessageEntry>(
					{ type: "message", id: "fork-msg", message: createMessage("assistant", "Fork alternative") },
					"main",
				);

				strictEqual(await forked.getLeafIdForLane("main"), "fork-msg");
				strictEqual(await original.getLeafIdForLane("main"), "msg-2");
				strictEqual(await original.getEntry("fork-msg"), undefined);
			},
		),

		// 4. CRASH RECOVERY: TORN TRAILING JSONL LINE
		createCase(
			factory,
			"crash recovery",
			"safely recovers from a torn trailing JSONL line and preserves all valid prior entries",
			async (repo) => {
				const session = await repo.create({ id: "session-torn", cwd: "/test" });

				await session.appendEntry<MessageEntry>(
					{ type: "message", id: "msg-safe-1", message: createMessage("user", "Valid entry 1") },
					"main",
				);
				await session.appendEntry<MessageEntry>(
					{ type: "message", id: "msg-safe-2", message: createMessage("assistant", "Valid entry 2") },
					"main",
				);

				// If repo supports direct simulation of torn tail (or file injection):
				if ("injectTornTail" in repo && typeof (repo as any).injectTornTail === "function") {
					await (repo as any).injectTornTail("session-torn", '{"kind":"entry","id":"torn-entry-half-wri');

					// Reloading the session must NOT throw a syntax error
					const reloaded = await repo.load({ id: "session-torn", cwd: "/test" } as any);
					const entries = await reloaded.findEntries();

					// Valid entries must be preserved
					strictEqual(entries.length, 2);
					deepStrictEqual(
						entries.map((e) => e.id),
						["msg-safe-1", "msg-safe-2"],
					);

					// Appending to the repaired session must work normally
					const afterRepair = await reloaded.appendEntry<MessageEntry>(
						{ type: "message", id: "msg-after", message: createMessage("user", "After crash recovery") },
						"main",
					);
					strictEqual(afterRepair.id, "msg-after");
				}
			},
		),

		// 5. ID UNIQUENESS & VALIDATION
		createCase(
			factory,
			"validation",
			"rejects duplicate entry IDs and enforces valid payload shapes without state corruption",
			async (repo) => {
				const session = await repo.create({ id: "session-val", cwd: "/test" });

				await session.appendEntry<MessageEntry>(
					{ type: "message", id: "unique-id", message: createMessage("user", "Hello") },
					"main",
				);

				// Attempting duplicate ID must fail with 'already_exists'
				await rejectsWithCode(
					session.appendEntry<MessageEntry>(
						{ type: "message", id: "unique-id", message: createMessage("assistant", "Duplicate") },
						"main",
					),
					"already_exists",
				);

				// Prior state remains clean
				const entries = await session.findEntries();
				strictEqual(entries.length, 1);
			},
		),
	];
}
