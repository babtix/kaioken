import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	encodeHeader,
	encodeMutation,
	JsonlSessionRepo,
	JsonlSessionStorage,
	parseHeader,
	parseMutation,
	type JsonlSessionRepoFileSystem,
	type MessageEntry,
} from "../dist/index.js";

const tmpDirs: string[] = [];

afterEach(async () => {
	await Promise.all(tmpDirs.splice(0).map((d) => fs.rm(d, { recursive: true, force: true })));
});

function createNodeFs(): JsonlSessionRepoFileSystem {
	return {
		async absolutePath(p) {
			return resolve(p);
		},
		async joinPath(parts) {
			return join(...parts);
		},
		async readTextFile(p) {
			return fs.readFile(p, "utf8");
		},
		async readTextLines(p, options) {
			const content = await fs.readFile(p, "utf8");
			const lines = content.split("\n");
			return options?.maxLines ? lines.slice(0, options.maxLines) : lines;
		},
		async writeFile(p, content) {
			await fs.writeFile(p, content, "utf8");
		},
		async appendFile(p, content) {
			await fs.appendFile(p, content, "utf8");
		},
		async renameFile(o, n) {
			await fs.rename(o, n);
		},
		async fileInfo(p) {
			const st = await fs.stat(p);
			return { mtimeMs: st.mtimeMs, size: st.size, isDirectory: st.isDirectory() };
		},
		async listDir(p) {
			const entries = await fs.readdir(p, { withFileTypes: true });
			return entries.map((e) => ({
				name: e.name,
				path: join(p, e.name),
				kind: e.isDirectory() ? "directory" : "file",
			}));
		},
		async exists(p) {
			try {
				await fs.access(p);
				return true;
			} catch {
				return false;
			}
		},
		async createDir(p, opts) {
			await fs.mkdir(p, opts);
		},
		async remove(p, opts) {
			await fs.rm(p, { recursive: true, force: opts?.force });
		},
	};
}

describe("JSONL codec", () => {
	it("encodes and decodes v4 header", () => {
		const header = {
			kind: "header" as const,
			version: 4 as const,
			id: "sess-1",
			createdAt: 1700000000000,
			cwd: "/repo",
		};
		const encoded = encodeHeader(header);
		const decoded = parseHeader(encoded.trim());
		expect(decoded.ok).toBe(true);
		if (decoded.ok) {
			expect(decoded.value).toEqual(header);
		}
	});

	it("encodes and decodes mutations", () => {
		const mutation = {
			kind: "entry" as const,
			lane: "main",
			entry: {
				type: "message" as const,
				id: "msg-1",
				seq: 1,
				parentId: null,
				timestamp: 1700000000000,
				message: { role: "user", content: [{ type: "text", text: "Hello" }] },
			},
		};
		const line = encodeMutation(mutation);
		const decoded = parseMutation(line.trim());
		expect(decoded.ok).toBe(true);
		if (decoded.ok) {
			expect(decoded.value).toEqual(mutation);
		}
	});
});

describe("JSONL storage & crash recovery", () => {
	it("recovers from a torn trailing JSONL line on load", async () => {
		const testDir = await fs.mkdtemp(join(tmpdir(), "kaioken-jsonl-"));
		tmpDirs.push(testDir);
		const nfs = createNodeFs();

		const sessionFile = join(testDir, "test.jsonl");

		// Create valid session file
		const storage = await JsonlSessionStorage.create(nfs, sessionFile, {
			kind: "header",
			version: 4,
			id: "session-1",
			createdAt: Date.now(),
			cwd: "/repo",
		});

		await storage.appendEntry<MessageEntry>(
			{
				type: "message",
				id: "entry-1",
				message: { role: "user", content: "first valid entry" },
			},
			"main",
		);

		await storage.appendEntry<MessageEntry>(
			{
				type: "message",
				id: "entry-2",
				message: { role: "assistant", content: "second valid entry" },
			},
			"main",
		);

		// Simulate crash mid-write: append a partial, torn line
		await fs.appendFile(sessionFile, '{"kind":"entry","id":"entry-3-half-wri\n', "utf8");

		// Load session: must NOT throw syntax error, must drop torn tail
		const loaded = await JsonlSessionStorage.load(nfs, sessionFile);
		const entries = await loaded.findEntries();

		expect(entries.length).toBe(2);
		expect(entries.map((e) => e.id)).toEqual(["entry-1", "entry-2"]);

		// File on disk should now be cleanly repaired
		const repairedContent = await fs.readFile(sessionFile, "utf8");
		expect(repairedContent).not.toContain("half-wri");

		// Appending a new entry should work with proper sequence
		const third = await loaded.appendEntry<MessageEntry>(
			{
				type: "message",
				id: "entry-3-clean",
				message: { role: "user", content: "third clean entry" },
			},
			"main",
		);

		expect(third.seq).toBe(3);
		expect(third.parentId).toBe("entry-2");
	});

	it("supports repository list, load, and fork", async () => {
		const testDir = await fs.mkdtemp(join(tmpdir(), "kaioken-repo-"));
		tmpDirs.push(testDir);
		const nfs = createNodeFs();

		const repo = new JsonlSessionRepo({ fs: nfs, sessionsRoot: testDir });

		const session = await repo.create({ id: "s-orig", cwd: "/test/cwd" });
		await session.appendEntry<MessageEntry>(
			{
				type: "message",
				id: "m-1",
				message: { role: "user", content: "Hello" },
			},
			"main",
		);

		const list = await repo.list();
		expect(list.length).toBe(1);
		expect(list[0]?.id).toBe("s-orig");

		// Fork
		const forked = await repo.fork(list[0]!, {
			id: "s-fork",
			lane: "main",
			at: "m-1",
			cwd: "/test/cwd",
		});

		expect(await forked.getLeafId()).toBe("m-1");
		const forkedList = await repo.list();
		expect(forkedList.length).toBe(2);
	});
});
