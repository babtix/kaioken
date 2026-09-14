import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	ExtensionLoader,
	ExtensionRunner,
} from "../dist/index.js";

describe("ExtensionLoader & ExtensionRunner", () => {
	const tempDirs: string[] = [];

	afterEach(async () => {
		await Promise.all(
			tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
		);
	});

	async function createWorkspace(): Promise<{ workspaceRoot: string; extensionsDir: string }> {
		const workspaceRoot = await mkdtemp(join(tmpdir(), "kaioken-ext-test-"));
		tempDirs.push(workspaceRoot);
		const extensionsDir = join(workspaceRoot, ".kaioken", "extensions");
		await mkdir(extensionsDir, { recursive: true });
		return { workspaceRoot, extensionsDir };
	}

	it("discovers extensions with extension.json or package.json", async () => {
		const { workspaceRoot, extensionsDir } = await createWorkspace();

		// Ext 1: extension.json
		const ext1Dir = join(extensionsDir, "ext-one");
		await mkdir(ext1Dir, { recursive: true });
		await writeFile(
			join(ext1Dir, "extension.json"),
			JSON.stringify({ name: "ext-one", version: "1.0.0", trusted: true }),
		);

		// Ext 2: package.json
		const ext2Dir = join(extensionsDir, "ext-two");
		await mkdir(ext2Dir, { recursive: true });
		await writeFile(
			join(ext2Dir, "package.json"),
			JSON.stringify({ name: "ext-two", version: "2.0.0", trusted: false }),
		);

		const loader = new ExtensionLoader({ workspaceRoot });
		const discovered = await loader.discoverExtensions();

		expect(discovered).toHaveLength(2);
		const ids = discovered.map((d) => d.id).sort();
		expect(ids).toEqual(["ext-one", "ext-two"]);
	});

	it("returns empty list if extensions directory does not exist", async () => {
		const workspaceRoot = await mkdtemp(join(tmpdir(), "kaioken-ext-test-empty-"));
		tempDirs.push(workspaceRoot);

		const loader = new ExtensionLoader({ workspaceRoot });
		const discovered = await loader.discoverExtensions();
		expect(discovered).toEqual([]);
	});

	it("loads trusted extension and registers its tools", async () => {
		const { workspaceRoot, extensionsDir } = await createWorkspace();
		const extDir = join(extensionsDir, "trusted-ext");
		await mkdir(extDir, { recursive: true });

		const entryCode = `
export function activate(api) {
	api.registerTool({
		name: "ping",
		description: "ping tool",
		inputSchema: { type: "object" },
		execute: async () => ({ text: "pong" }),
	});
}
`;
		await writeFile(join(extDir, "index.js"), entryCode, "utf8");
		await writeFile(
			join(extDir, "extension.json"),
			JSON.stringify({ name: "trusted-ext", version: "1.0.0", trusted: true, entrypoint: "index.js" }),
		);

		const loader = new ExtensionLoader({ workspaceRoot });
		const runner = new ExtensionRunner(loader);
		await runner.start();

		const active = runner.getActiveExtensions();
		expect(active).toHaveLength(1);
		expect(active[0].trusted).toBe(true);
		expect(active[0].tools).toHaveLength(1);
		expect(active[0].tools[0].name).toBe("ping");

		const trustedTools = runner.getTrustedTools();
		expect(trustedTools).toHaveLength(1);
		expect(trustedTools[0].extId).toBe("trusted-ext");
		expect(trustedTools[0].tool.name).toBe("ping");

		const result = await trustedTools[0].tool.execute({});
		expect(result.text).toBe("pong");

		await runner.stop();
	});

	it("loads untrusted extension but REFUSES to register its tools with warning", async () => {
		const { workspaceRoot, extensionsDir } = await createWorkspace();
		const extDir = join(extensionsDir, "untrusted-ext");
		await mkdir(extDir, { recursive: true });

		const warnings: string[] = [];
		const entryCode = `
export function activate(api) {
	api.registerTool({
		name: "dangerous_tool",
		description: "malicious or untrusted tool",
		inputSchema: { type: "object" },
		execute: async () => ({ text: "hacked" }),
	});
}
`;
		await writeFile(join(extDir, "index.js"), entryCode, "utf8");
		await writeFile(
			join(extDir, "extension.json"),
			JSON.stringify({ name: "untrusted-ext", version: "1.0.0", trusted: false, entrypoint: "index.js" }),
		);

		const loader = new ExtensionLoader({
			workspaceRoot,
			logger: {
				info: () => {},
				warn: (msg) => warnings.push(msg),
				error: () => {},
			},
		});

		const runner = new ExtensionRunner(loader);
		await runner.start();

		const active = runner.getActiveExtensions();
		expect(active).toHaveLength(1);
		expect(active[0].trusted).toBe(false);
		expect(active[0].tools).toHaveLength(0); // Tools MUST NOT be registered

		const trustedTools = runner.getTrustedTools();
		expect(trustedTools).toHaveLength(0); // CRITICAL: 0 tools returned

		// Warning must be logged
		expect(warnings.some((w) => w.includes("untrusted") || w.includes("refused"))).toBe(true);

		await runner.stop();
	});

	it("handles extension activation lifecycle and dispose", async () => {
		const { workspaceRoot, extensionsDir } = await createWorkspace();
		const extDir = join(extensionsDir, "lifecycle-ext");
		await mkdir(extDir, { recursive: true });

		let disposed = false;
		(globalThis as unknown as { __test_ext_disposed?: boolean }).__test_ext_disposed = false;

		const entryCode = `
export function activate(api) {
	return {
		dispose: async () => {
			globalThis.__test_ext_disposed = true;
		}
	};
}
`;
		await writeFile(join(extDir, "index.js"), entryCode, "utf8");
		await writeFile(
			join(extDir, "extension.json"),
			JSON.stringify({ name: "lifecycle-ext", version: "1.0.0", trusted: true, entrypoint: "index.js" }),
		);

		const loader = new ExtensionLoader({ workspaceRoot });
		const runner = new ExtensionRunner(loader);
		await runner.start();

		expect(runner.getActiveExtensions()).toHaveLength(1);
		await runner.stop();

		expect((globalThis as unknown as { __test_ext_disposed?: boolean }).__test_ext_disposed).toBe(true);
		delete (globalThis as unknown as { __test_ext_disposed?: boolean }).__test_ext_disposed;
	});

	it("calls emit and invokes registered event handlers", async () => {
		const { workspaceRoot, extensionsDir } = await createWorkspace();
		const extDir = join(extensionsDir, "event-ext");
		await mkdir(extDir, { recursive: true });

		const entryCode = `
export function activate(api) {
	api.on("session_start", (payload) => {
		globalThis.__ext_event_received = payload;
	});
}
`;
		await writeFile(join(extDir, "index.js"), entryCode, "utf8");
		await writeFile(
			join(extDir, "extension.json"),
			JSON.stringify({ name: "event-ext", version: "1.0.0", trusted: true, entrypoint: "index.js" }),
		);

		const loader = new ExtensionLoader({ workspaceRoot });
		const runner = new ExtensionRunner(loader);
		await runner.start();

		await runner.emit("session_start", { sessionId: "sess-123" });
		expect((globalThis as unknown as { __ext_event_received?: unknown }).__ext_event_received).toEqual({ sessionId: "sess-123" });
		delete (globalThis as unknown as { __ext_event_received?: unknown }).__ext_event_received;

		await runner.stop();
	});
});
