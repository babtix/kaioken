import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	bashFileTargets,
	buildBranchTree,
	flattenBranches,
	readUndoJournal,
	recordUndo,
	sessionSignals,
	undoLast,
	type ConversationEvent,
	type SessionMeta,
} from "../dist/index.js";

const roots: string[] = [];

afterEach(async () => {
	await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function repo(files: Record<string, string> = {}): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), "kaioken-history-"));
	roots.push(root);
	for (const [path, content] of Object.entries(files)) {
		const abs = join(root, path);
		await mkdir(dirname(abs), { recursive: true });
		await writeFile(abs, content, "utf8");
	}
	return root;
}

function meta(id: string, parent?: SessionMeta["parent"]): SessionMeta {
	return {
		id,
		title: id,
		created: "2026-01-01T00:00:00.000Z",
		updated: `2026-01-01T00:00:0${id.length}.000Z`,
		model: "acme/model",
		provider: "acme",
		mode: "build",
		thinking: "off",
		turns: 1,
		filePath: `${id}.json`,
		...(parent ? { parent } : {}),
	};
}

describe("the branch tree", () => {
	it("nests a fork under the conversation it came from", () => {
		const root = meta("a");
		const fork = meta("ab", { id: "a", turns: 3, reason: "fork" });
		const nodes = flattenBranches(buildBranchTree([root, fork]));

		expect(nodes.map((n) => n.session.id)).toEqual(["a", "ab"]);
		expect(nodes[1]?.depth).toBe(1);
		// The parent is no longer a tip: the conversation continued elsewhere.
		expect(nodes[0]?.tip).toBe(false);
		expect(nodes[1]?.tip).toBe(true);
	});

	it("keeps a session whose parent is gone, as a root", () => {
		// Losing a conversation because its ancestor was deleted would be the
		// worst possible reading of a broken link.
		const orphan = meta("b", { id: "deleted", turns: 2, reason: "compact" });
		const nodes = flattenBranches(buildBranchTree([orphan]));
		expect(nodes.map((n) => n.session.id)).toEqual(["b"]);
		expect(nodes[0]?.depth).toBe(0);
	});

	it("does not hang on a cycle in hand-edited files", () => {
		const a = meta("aa", { id: "bb", turns: 1, reason: "fork" });
		const b = meta("bb", { id: "aa", turns: 1, reason: "fork" });
		const nodes = flattenBranches(buildBranchTree([a, b]));
		expect(nodes).toHaveLength(2);
	});
});

describe("the undo journal", () => {
	it("restores a file to what it was before the change", async () => {
		const root = await repo({ "src/app.ts": "original\n" });
		await recordUndo(root, { path: "src/app.ts", tool: "edit", session: "s1" });
		await writeFile(join(root, "src/app.ts"), "the agent's version\n", "utf8");

		const outcome = await undoLast(root);
		expect(outcome?.action).toBe("restored");
		expect(await readFile(join(root, "src/app.ts"), "utf8")).toBe("original\n");
		// The stack is popped, not replayed forever.
		expect(await readUndoJournal(root)).toEqual([]);
	});

	it("deletes a file the agent created, rather than blanking it", async () => {
		const root = await repo();
		await recordUndo(root, { path: "src/new.ts", tool: "write", session: "s1" });
		await mkdir(join(root, "src"), { recursive: true });
		await writeFile(join(root, "src/new.ts"), "invented\n", "utf8");

		const outcome = await undoLast(root);
		expect(outcome?.action).toBe("deleted");
		await expect(readFile(join(root, "src/new.ts"), "utf8")).rejects.toThrow();
	});

	it("walks back one step at a time, newest first", async () => {
		const root = await repo({ "a.ts": "a1\n", "b.ts": "b1\n" });
		await recordUndo(root, { path: "a.ts", tool: "edit", session: "s1" });
		await writeFile(join(root, "a.ts"), "a2\n", "utf8");
		await recordUndo(root, { path: "b.ts", tool: "edit", session: "s1" });
		await writeFile(join(root, "b.ts"), "b2\n", "utf8");

		expect((await undoLast(root))?.entry.path).toBe("b.ts");
		expect(await readFile(join(root, "a.ts"), "utf8")).toBe("a2\n");
		expect((await undoLast(root))?.entry.path).toBe("a.ts");
		expect(await undoLast(root)).toBeNull();
	});

	it("refuses to journal a path outside the repository", async () => {
		const root = await repo();
		await recordUndo(root, { path: "../escape.ts", tool: "write", session: "s1" });
		// Restoring one later would write wherever the agent pointed.
		expect(await readUndoJournal(root)).toEqual([]);
	});

	it("survives a corrupt line rather than losing the whole stack", async () => {
		const root = await repo({ "a.ts": "a1\n" });
		await recordUndo(root, { path: "a.ts", tool: "edit", session: "s1" });
		await writeFile(join(root, ".kaioken/undo/journal.jsonl"), "not json\n", { flag: "a" });

		const entries = await readUndoJournal(root);
		expect(entries).toHaveLength(1);
		expect(entries[0]?.path).toBe("a.ts");
	});
});

describe("the learn gate", () => {
	function events(...list: ConversationEvent[]): ConversationEvent[] {
		return list;
	}

	it("says nothing was learned from a question and an answer", () => {
		expect(
			sessionSignals(
				events(
					{ role: "user", text: "what does this do?" },
					{ role: "assistant", text: "it adds numbers" },
				),
			),
		).toEqual([]);
	});

	it("sees a command that failed and then passed", () => {
		const signals = sessionSignals(
			events(
				{ role: "assistant", text: "", calls: [{ name: "bash" }] },
				{ role: "tool", text: "error: exited with error", tool: "bash" },
				{ role: "assistant", text: "", calls: [{ name: "bash" }] },
				{ role: "tool", text: "ok, 12 tests passed", tool: "bash" },
			),
		);
		expect(signals).toContain("error_recovery");
	});

	it("sees a user walking the agent back", () => {
		const signals = sessionSignals(
			events(
				{ role: "assistant", text: "done", calls: [{ name: "write", path: "a.ts" }] },
				{ role: "user", text: "no, use the builder in src/factory.ts instead" },
			),
		);
		expect(signals).toContain("correction");
	});

	it("sees a change that spans files", () => {
		const signals = sessionSignals(
			events(
				{ role: "assistant", text: "", calls: [{ name: "edit", path: "a.ts" }] },
				{ role: "assistant", text: "", calls: [{ name: "edit", path: "b.ts" }] },
			),
		);
		expect(signals).toContain("multi_file");
	});

	it("does not call a correction on a message that only follows the agent", () => {
		// "thanks" after a write is not a lesson, and paying for a model call
		// on every polite reply is how a gate stops being worth having.
		expect(
			sessionSignals(
				events(
					{ role: "assistant", text: "done", calls: [{ name: "write", path: "a.ts" }] },
					{ role: "user", text: "thanks, that looks right" },
				),
			),
		).not.toContain("correction");
	});
});

/**
 * `bashFileTargets` — the heuristic that gives `/undo` something to record
 * for a shell command. It knows redirections and the everyday file-mutating
 * commands; anything more exotic passes unrecorded by design, because a
 * journal full of guessed-at tokens would restore files nobody changed.
 */
describe("bash file targets", () => {
	it("journals a sed -i target", () => {
		expect(bashFileTargets("sed -i 's/a/b/' src/app.ts").files).toEqual(["src/app.ts"]);
	});

	it("journals both sides of an mv, the destination as a create", () => {
		const { files, creates } = bashFileTargets("mv old.ts new.ts");
		expect(files).toEqual(["old.ts"]);
		expect(creates).toEqual(["new.ts"]);
	});

	it("journals a redirection target that does not exist yet", () => {
		expect(bashFileTargets("echo hello > notes.txt").creates).toEqual(["notes.txt"]);
	});

	it("reads attached and descriptor redirections, but not 2>&1", () => {
		const { creates } = bashFileTargets("node build.js 2>errors.log 2>&1 >out.txt");
		expect(creates).toEqual(["errors.log", "out.txt"]);
	});

	it("finds targets in every segment of a compound command", () => {
		const { files } = bashFileTargets("rm a.tmp && sed -i s/x/y/ b.ts ; touch c.ts");
		expect(files).toEqual(["a.tmp", "b.ts", "c.ts"]);
	});

	it("records nothing for a command whose writes it cannot see", () => {
		const { files, creates } = bashFileTargets("node scripts/migrate.js --force");
		expect(files).toEqual([]);
		expect(creates).toEqual([]);
	});

	it("strips quotes and skips flags and env assignments", () => {
		const { files } = bashFileTargets('FOO=1 rm -rf "dir with spaces/file.txt"');
		expect(files).toEqual(["dir with spaces/file.txt"]);
	});
});
