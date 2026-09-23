import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { hookPath, hookStatus, installPostCommit, isRepo, removePostCommit } from "../dist/index.js";

const exec = promisify(execFile);

/**
 * The installer writes into a file it does not own. Every test here is really
 * the same question asked from a different angle: does someone else's hook
 * script survive us?
 */

const roots: string[] = [];

afterEach(async () => {
	await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function repo(): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), "kaioken-hook-"));
	roots.push(root);
	await exec("git", ["init", "--quiet"], { cwd: root });
	return root;
}

const EXE = ["/usr/bin/node", "/opt/kaioken/bin.js"];

describe("the post-commit hook", () => {
	it("installs into a repository that has no hook", async () => {
		const root = await repo();
		expect(await isRepo(root)).toBe(true);

		const path = await installPostCommit(root, EXE);
		const body = await readFile(path, "utf8");

		expect(body.startsWith("#!/bin/sh")).toBe(true);
		expect(body).toContain("kaioken");
		expect(body).toContain("update --root");
		expect((await hookStatus(root)).installed).toBe(true);
	});

	it("keeps a hook that was already there", async () => {
		const root = await repo();
		const path = (await hookPath(root)) as string;
		await writeFile(path, "#!/bin/sh\necho existing hook\n", "utf8");

		await installPostCommit(root, EXE);
		const body = await readFile(path, "utf8");

		expect(body).toContain("echo existing hook");
		expect(body).toContain("update --root");
	});

	it("refreshes its own block in place rather than stacking copies", async () => {
		const root = await repo();
		const path = await installPostCommit(root, EXE);
		await installPostCommit(root, ["/elsewhere/node", "/moved/bin.js"]);

		const body = await readFile(path, "utf8");
		expect(body.match(/>>> kaioken >>>/g)).toHaveLength(1);
		// The point of refreshing: a moved checkout leaves a hook pointing at
		// a binary that is no longer there, and it fails silently every commit.
		expect(body).toContain("/moved/bin.js");
		expect(body).not.toContain("/opt/kaioken/bin.js");
	});

	it("removes only its own lines, leaving the rest of the script running", async () => {
		const root = await repo();
		const path = (await hookPath(root)) as string;
		await writeFile(path, "#!/bin/sh\necho existing hook\n", "utf8");
		await installPostCommit(root, EXE);

		expect(await removePostCommit(root)).toBe(true);
		const body = await readFile(path, "utf8");
		expect(body).toContain("echo existing hook");
		expect(body).not.toContain("kaioken");
	});

	it("deletes the file when nothing but our block was in it", async () => {
		const root = await repo();
		const path = await installPostCommit(root, EXE);
		expect(await removePostCommit(root)).toBe(true);
		await expect(readFile(path, "utf8")).rejects.toThrow();
	});

	it("reports a foreign hook rather than claiming to be installed", async () => {
		const root = await repo();
		await writeFile((await hookPath(root)) as string, "#!/bin/sh\nlefthook run post-commit\n", "utf8");

		const status = await hookStatus(root);
		expect(status.installed).toBe(false);
		expect(status.foreign).toBe(true);
	});

	it("removing when nothing is installed is not an error", async () => {
		const root = await repo();
		expect(await removePostCommit(root)).toBe(false);
	});

	it("refuses a directory that is not a repository", async () => {
		const root = await mkdtemp(join(tmpdir(), "kaioken-nogit-"));
		roots.push(root);
		expect(await isRepo(root)).toBe(false);
		await expect(installPostCommit(root, EXE)).rejects.toThrow(/not a git repository/);
	});

	it("single-quotes paths so a space or a backslash cannot split the command", async () => {
		const root = await repo();
		const path = await installPostCommit(root, ["C:\\Program Files\\node.exe", "C:\\kaioken\\bin.js"]);
		const body = await readFile(path, "utf8");

		expect(body).toContain("'C:/Program Files/node.exe' 'C:/kaioken/bin.js'");
	});
});
