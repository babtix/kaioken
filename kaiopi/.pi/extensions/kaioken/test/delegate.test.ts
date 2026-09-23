import { describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import bridgeInit from "../index.ts";
import { createWorktree, ffMerge, slug, worktreePath } from "../../../../kaioken/gitops/src/worktree.ts";
import { REPAIR_PROTOCOL, runVerify } from "../../../../kaioken/verify/src/gate.ts";
import { fakePi as createFakePi } from "./fake-pi.ts";

const runExec = promisify(execFile);

describe("Phase 5: Gates, Repair Loop & Delegation", () => {
	it("registers delegation commands", () => {
		const fake = createFakePi();
		bridgeInit(fake.pi);

		expect(fake.commands.has("kaio-delegate")).toBe(true);
		expect(fake.commands.has("kaio-merge")).toBe(true);
	});

	it("returns unverifiable when no test suite is detected in repo", async () => {
		const tempDir = await mkdtemp(join(tmpdir(), "kaio-unverifiable-"));
		try {
			const res = await runVerify(tempDir);
			expect(res.pass).toBe(false);
			expect(res.summary).toContain("unverifiable: no native suite detected");
		} finally {
			await rm(tempDir, { recursive: true, force: true });
		}
	});

	it("includes repair protocol on verify failure", () => {
		expect(REPAIR_PROTOCOL).toContain("REPAIR LOOP: read failure verbatim → minimal fix → re-run kaio_verify.");
		expect(REPAIR_PROTOCOL).toContain("Max 5 iterations");
		expect(REPAIR_PROTOCOL).toContain("Never weaken/delete tests to pass.");
	});

	it("executes worktree delegation round-trip cleanly", async () => {
		const testRepo = await mkdtemp(join(tmpdir(), "kaio-wt-repo-"));
		try {
			// Initialize real git repo
			await runExec("git", ["init"], { cwd: testRepo });
			await runExec("git", ["config", "user.name", "Test Agent"], { cwd: testRepo });
			await runExec("git", ["config", "user.email", "agent@test.local"], { cwd: testRepo });

			// Initial commit
			await writeFile(
				join(testRepo, "package.json"),
				JSON.stringify({ name: "wt-test", scripts: { test: 'node -e "process.exit(0)"' } }),
			);
			await runExec("git", ["add", "-A"], { cwd: testRepo });
			await runExec("git", ["commit", "-m", "initial commit"], { cwd: testRepo });

			// Delegate into worktree
			const taskName = "isolated-feature";
			const wt = await createWorktree(testRepo, taskName);
			expect(wt).toBe(worktreePath(testRepo, taskName));

			// Make change in worktree
			await writeFile(join(wt, "feature.txt"), "built inside worktree\n");
			await runExec("git", ["add", "feature.txt"], { cwd: wt });
			await runExec("git", ["commit", "-m", "add feature.txt in worktree"], { cwd: wt });

			// Verify in worktree
			const verifyOutcome = await runVerify(wt);
			expect(verifyOutcome.pass).toBe(true);

			// Merge back to main
			const mergeOutcome = await ffMerge(testRepo, taskName);
			expect(mergeOutcome.success).toBe(true);

			// Main tree has feature.txt now
			const content = await readFile(join(testRepo, "feature.txt"), "utf8");
			expect(content.replace(/\r\n/g, "\n")).toBe("built inside worktree\n");
		} finally {
			await rm(testRepo, { recursive: true, force: true }).catch(() => {});
		}
	});

	it("prevents merge if worktree fails verification", async () => {
		const testRepo = await mkdtemp(join(tmpdir(), "kaio-wt-fail-"));
		try {
			// Initialize git repo
			await runExec("git", ["init"], { cwd: testRepo });
			await runExec("git", ["config", "user.name", "Test Agent"], { cwd: testRepo });
			await runExec("git", ["config", "user.email", "agent@test.local"], { cwd: testRepo });

			await writeFile(
				join(testRepo, "package.json"),
				JSON.stringify({ name: "wt-fail", scripts: { test: 'node -e "process.exit(0)"' } }),
			);
			await runExec("git", ["add", "-A"], { cwd: testRepo });
			await runExec("git", ["commit", "-m", "initial commit"], { cwd: testRepo });

			// Create worktree
			const taskName = "broken-feature";
			const wt = await createWorktree(testRepo, taskName);

			// Break tests in worktree
			await writeFile(
				join(wt, "package.json"),
				JSON.stringify({ name: "wt-fail", scripts: { test: 'node -e "process.exit(1)"' } }),
			);
			await runExec("git", ["add", "package.json"], { cwd: wt });
			await runExec("git", ["commit", "-m", "break tests"], { cwd: wt });

			const fake = createFakePi();
			bridgeInit(fake.pi);

			const notifications: Array<{ message: string; type?: string }> = [];
			const fakeCtx = {
				cwd: testRepo,
				ui: {
					notify: (message: string, type?: string) => {
						notifications.push({ message, type });
					},
					setStatus: () => {},
					setWidget: () => {},
				},
			};

			const mergeCmd = fake.commands.get("kaio-merge");
			await mergeCmd.handler(taskName, fakeCtx);

			const errNotify = notifications.find((n) => n.type === "error") ?? notifications[0];
			expect(errNotify.type).toBe("error");
			expect(errNotify.message).toContain("VERIFY FAIL in");
		} finally {
			await rm(testRepo, { recursive: true, force: true }).catch(() => {});
		}
	});
});
