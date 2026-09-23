import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { readDiff } from "../src/index.ts";

const exec = promisify(execFile);

const roots: string[] = [];

afterEach(async () => {
	await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function repo(): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), "kaioken-diff-"));
	roots.push(root);
	await exec("git", ["init", "--quiet"], { cwd: root });
	await exec("git", ["config", "user.name", "Test"], { cwd: root });
	await exec("git", ["config", "user.email", "test@test.local"], { cwd: root });
	await writeFile(join(root, "tracked.txt"), "base\n", "utf8");
	await exec("git", ["add", "-A"], { cwd: root });
	await exec("git", ["commit", "-m", "initial", "--quiet"], { cwd: root });
	return root;
}

describe("readDiff untracked files", () => {
	it("reports untracked files in files with a synthetic all-added patch", async () => {
		const root = await repo();
		await writeFile(join(root, "new.txt"), "hello\nworld\n", "utf8");

		const snapshot = await readDiff(root);
		expect(snapshot).not.toBeNull();
		expect(snapshot?.files).toContain("new.txt");
		expect(snapshot?.patch).toContain("diff --git a/new.txt b/new.txt");
		expect(snapshot?.patch).toContain("+hello");
		expect(snapshot?.patch).toContain("+world");
		expect(snapshot?.insertions).toBeGreaterThanOrEqual(2);
	});

	it("still reports untracked files alongside staged changes", async () => {
		const root = await repo();
		await writeFile(join(root, "tracked.txt"), "base\nstaged\n", "utf8");
		await exec("git", ["add", "tracked.txt"], { cwd: root });
		await writeFile(join(root, "fresh.txt"), "fresh\n", "utf8");

		const snapshot = await readDiff(root);
		expect(snapshot?.against).toBe("staged");
		expect(snapshot?.files).toContain("tracked.txt");
		expect(snapshot?.files).toContain("fresh.txt");
		expect(snapshot?.patch).toContain("+fresh");
	});

	it("skips untracked files for historical ranges", async () => {
		const root = await repo();
		await writeFile(join(root, "loose.txt"), "loose\n", "utf8");

		const snapshot = await readDiff(root, "HEAD");
		expect(snapshot).not.toBeNull();
		expect(snapshot?.files).not.toContain("loose.txt");
	});

	it("ignores files matched by .gitignore", async () => {
		const root = await repo();
		await writeFile(join(root, ".gitignore"), "ignored.log\n", "utf8");
		await writeFile(join(root, "ignored.log"), "noise\n", "utf8");
		await writeFile(join(root, "kept.txt"), "kept\n", "utf8");

		const snapshot = await readDiff(root);
		expect(snapshot?.files).toContain("kept.txt");
		expect(snapshot?.files).not.toContain("ignored.log");
	});
});
