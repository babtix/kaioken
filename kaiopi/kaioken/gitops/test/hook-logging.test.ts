import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { hookPath, installPostCommit } from "../src/index.ts";

const exec = promisify(execFile);

const roots: string[] = [];

afterEach(async () => {
	await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function repo(): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), "kaioken-hooklog-"));
	roots.push(root);
	await exec("git", ["init", "--quiet"], { cwd: root });
	return root;
}

describe("post-commit hook background execution", () => {
	it("pins a bare node interpreter to the absolute executable", async () => {
		const root = await repo();
		const path = await installPostCommit(root, ["node", "/opt/kaioken/bin.js"]);
		const body = await readFile(path, "utf8");
		const absolute = process.execPath.replace(/\\/g, "/");

		expect(body).toContain(absolute);
		expect(body).not.toContain("'node' '/opt/kaioken/bin.js'");
	});

	it("logs background output to .kaioken/hook.log instead of /dev/null", async () => {
		const root = await repo();
		const path = await installPostCommit(root, ["/usr/bin/node", "/opt/kaioken/bin.js"]);
		const body = await readFile(path, "utf8");

		expect(body).toContain(".kaioken/hook.log");
		expect(body).not.toContain("/dev/null");
		expect(body).toContain("2>&1 &");
	});

	it("creates the .kaioken directory so the log redirect has a parent", async () => {
		const root = await repo();
		await installPostCommit(root, ["/usr/bin/node", "/opt/kaioken/bin.js"]);
		const logLine = (await readFile((await hookPath(root)) as string, "utf8"))
			.split("\n")
			.find((line) => line.includes("hook.log"));
		expect(logLine).toBeDefined();
	});

	it("keeps Windows absolute paths quoted alongside the log redirect", async () => {
		const root = await repo();
		const path = await installPostCommit(root, ["C:\\Program Files\\node.exe", "C:\\kaioken\\bin.js"]);
		const body = await readFile(path, "utf8");

		expect(body).toContain("'C:/Program Files/node.exe' 'C:/kaioken/bin.js'");
		expect(body).toContain(".kaioken/hook.log");
	});
});
