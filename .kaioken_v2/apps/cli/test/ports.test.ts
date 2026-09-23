import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createNodeFsPort, createNodeShellPort } from "../dist/agent-host.js";

const roots: string[] = [];

afterEach(async () => {
	await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("createNodeFsPort", () => {
	it("performs filesystem operations accurately", async () => {
		const root = await mkdtemp(join(tmpdir(), "kaioken-fs-port-"));
		roots.push(root);

		const fsPort = createNodeFsPort();
		const filePath = join(root, "subdir", "test.txt");

		expect(await fsPort.exists(filePath)).toBe(false);

		await fsPort.mkdir(join(root, "subdir"));
		await fsPort.writeFile(filePath, "hello fs port");

		expect(await fsPort.exists(filePath)).toBe(true);
		expect(await fsPort.readFile(filePath, "utf8")).toBe("hello fs port");

		const stat = await fsPort.stat(filePath);
		expect(stat.isFile).toBe(true);
		expect(stat.size).toBe(13);

		const entries = await fsPort.readdir(join(root, "subdir"));
		expect(entries).toHaveLength(1);
		expect(entries[0]?.name).toBe("test.txt");
		expect(entries[0]?.isDirectory).toBe(false);
		expect(entries[0]?.size).toBe(13);
	});
});

describe("createNodeShellPort", () => {
	it("executes a basic command", async () => {
		const shellPort = createNodeShellPort();
		const result = await shellPort.exec("node -e \"console.log('shell port ok')\"", {
			cwd: process.cwd(),
		});

		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain("shell port ok");
	});

	it("enforces timeoutMs", async () => {
		const shellPort = createNodeShellPort();
		const result = await shellPort.exec(
			"node -e \"setTimeout(() => {}, 10000)\"",
			{
				cwd: process.cwd(),
				timeoutMs: 300,
			},
		);

		expect(result.exitCode).toBeNull();
	});

	it("terminates when AbortSignal fires", async () => {
		const shellPort = createNodeShellPort();
		const controller = new AbortController();

		setTimeout(() => controller.abort(), 100);

		const result = await shellPort.exec(
			"node -e \"setTimeout(() => {}, 10000)\"",
			{
				cwd: process.cwd(),
				signal: controller.signal,
			},
		);

		expect(result.exitCode).toBeNull();
	});
});
