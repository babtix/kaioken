import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, it } from "vitest";
import {
	createSessionBackendConformance,
	InMemorySessionRepo,
	JsonlSessionRepo,
	LegacySessionRepo,
	type JsonlSessionRepoFileSystem,
	type SessionBackendFixture,
} from "../dist/index.js";

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

describe("Session Backend Conformance Suite", () => {
	describe("InMemory Backend", () => {
		const inMemorySuite = createSessionBackendConformance(async (): Promise<SessionBackendFixture> => {
			return {
				repository: new InMemorySessionRepo(),
			};
		});

		for (const testCase of inMemorySuite) {
			it(`[${testCase.group}] ${testCase.name}`, async () => {
				await testCase.run();
			});
		}
	});

	describe("JSONL Backend", () => {
		const jsonlSuite = createSessionBackendConformance(async (): Promise<SessionBackendFixture> => {
			const tmpDir = await fs.mkdtemp(join(tmpdir(), "kaioken-conf-jsonl-"));
			const nfs = createNodeFs();
			const repo = new JsonlSessionRepo({ fs: nfs, sessionsRoot: tmpDir });

			return {
				repository: repo,
				async dispose() {
					await fs.rm(tmpDir, { recursive: true, force: true });
				},
			};
		});

		for (const testCase of jsonlSuite) {
			it(`[${testCase.group}] ${testCase.name}`, async () => {
				await testCase.run();
			});
		}
	});

	describe("Legacy Storage Backend (Wrapped)", () => {
		const legacySuite = createSessionBackendConformance(async (): Promise<SessionBackendFixture> => {
			const tmpDir = await fs.mkdtemp(join(tmpdir(), "kaioken-conf-legacy-"));
			const repo = new LegacySessionRepo(tmpDir);

			return {
				repository: repo,
				async dispose() {
					await fs.rm(tmpDir, { recursive: true, force: true });
				},
			};
		});

		for (const testCase of legacySuite) {
			it(`[${testCase.group}] ${testCase.name}`, async () => {
				await testCase.run();
			});
		}
	});
});
