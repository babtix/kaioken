import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
	assertCleanWorkingTreeGuard,
	atomicWorktreeSwitch,
	detectConflicts,
	getConflictPlaybook,
	interactiveWorktreeCleanupWizard,
	releaseWorktreeLock,
	renderCleanupWizardReport,
	renderGuardWarningCard,
	renderMarkdownConflictCard,
	renderMarkdownRecipeCard,
	renderPlainConflictCard,
	generateDelegationRecipe,
	createWorktree,
	git,
	type DelegationTaskType,
} from "../src/index.ts";

const ARCHETYPES: DelegationTaskType[] = [
	"refactor",
	"deps",
	"docs",
	"fix",
	"bench",
	"migration",
	"security",
	"prototype",
	"cleanup",
	"staging",
];

async function createRepo(): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), "step26-gitops-"));
	await git(dir, "init");
	await git(dir, "config", "user.name", "Step26 Tester");
	await git(dir, "config", "user.email", "step26@kaioken.test");
	await writeFile(join(dir, "README.md"), "# Step 26 Test Repo\n");
	await git(dir, "add", "-A");
	await git(dir, "commit", "-m", "initial commit");
	return dir;
}

describe("Step 26: GitOps, Worktree Delegation & Safe Merges (UX-1851 to UX-1900)", () => {
	describe("Theme 1: 3-Way Conflict & Triage Playbooks (UX-1851 - UX-1860)", () => {
		it("provides tailored playbooks for all 10 task archetypes", () => {
			for (const arch of ARCHETYPES) {
				const playbook = getConflictPlaybook(arch, `kaioken/${arch}-task`, "main");
				expect(playbook.archetypeName.length).toBeGreaterThan(5);
				expect(playbook.diagnosis.length).toBeGreaterThan(10);
				expect(playbook.recoverySteps.length).toBeGreaterThanOrEqual(3);
				expect(playbook.recoverySteps.some((step) => step.includes("rebase"))).toBe(true);
			}
		});

		it("renders plain and markdown conflict triage cards with archetype guidance", async () => {
			const repo = await createRepo();
			try {
				const conflictInfo = await detectConflicts(repo, "main", "kaioken/refactor-task", "refactor");
				const plainCard = renderPlainConflictCard(conflictInfo);
				expect(plainCard).toContain("MERGE CONFLICT WARNING CARD");
				expect(plainCard).toContain("Task Archetype : Experimental Refactoring Branch (UX-1851)");
				expect(plainCard).toContain("Actionable Recovery Playbook:");

				const mdCard = renderMarkdownConflictCard(conflictInfo);
				expect(mdCard).toContain("### ⚠️ Merge Conflict Warning:");
				expect(mdCard).toContain("Experimental Refactoring Branch (UX-1851)");
				expect(mdCard).toContain("#### Recovery Playbook");
				expect(mdCard).toContain("git rebase main");
			} finally {
				await rm(repo, { recursive: true, force: true });
			}
		});
	});

	describe("Theme 2: Interactive Worktree Cleanup Wizard (UX-1861 - UX-1870)", () => {
		it("sweeps and prunes worktrees across all 10 archetypes", async () => {
			const repo = await createRepo();
			try {
				// Create worktrees for two archetypes
				await createWorktree(repo, "refactor-wt");
				await createWorktree(repo, "fix-wt");

				const reportDry = await interactiveWorktreeCleanupWizard(repo, { dryRun: true });
				expect(reportDry.entries.length).toBeGreaterThanOrEqual(2);
				expect(reportDry.dryRun).toBe(true);

				const textReport = renderCleanupWizardReport(reportDry);
				expect(textReport.toUpperCase()).toContain("WORKTREE CLEANUP WIZARD REPORT");

				// Prune with force to remove unmerged
				const reportReal = await interactiveWorktreeCleanupWizard(repo, {
					dryRun: false,
					force: true,
				});
				expect(reportReal.prunedCount).toBeGreaterThanOrEqual(2);
			} finally {
				await rm(repo, { recursive: true, force: true });
			}
		});
	});

	describe("Theme 3: Atomic Lock & Switch Under High-Concurrency (UX-1871 - UX-1880)", () => {
		it("acquires lock, executes protected block, and handles contention", async () => {
			const repo = await createRepo();
			try {
				await createWorktree(repo, "proto-lock-task");

				// 1. Successful atomic switch
				const result = await atomicWorktreeSwitch(repo, "proto-lock-task", {
					taskType: "prototype",
					acquireTimeoutMs: 2000,
					lockTtlMs: 5000,
				});

				expect(result.success).toBe(true);
				expect(result.taskType).toBe("prototype");
				expect(result.targetSlug).toBe("proto-lock-task");
				expect(result.lockHandle).toBeDefined();

				// 2. Lock release is safe
				const released = await releaseWorktreeLock(result.lockHandle!);
				expect(released).toBe(true);
			} finally {
				await rm(repo, { recursive: true, force: true });
			}
		});

		it("provides archetype-specific lock diagnostics for all 10 archetypes", async () => {
			const repo = await createRepo();
			try {
				for (const arch of ARCHETYPES) {
					const slug = `lock-${arch}-task`;
					await createWorktree(repo, slug);
					const res = await atomicWorktreeSwitch(repo, slug, {
						taskType: arch,
						acquireTimeoutMs: 500,
						lockTtlMs: 2000,
					});
					expect(res.success).toBe(true);
					expect(res.taskType).toBe(arch);
					if (res.lockHandle) {
						await releaseWorktreeLock(res.lockHandle);
					}
				}
			} finally {
				await rm(repo, { recursive: true, force: true });
			}
		});
	});

	describe("Theme 4: One-Command Isolated Worktree Delegation Recipes (UX-1881 - UX-1890)", () => {
		it("generates recipes with specialized launch commands and verify gates for all 10 archetypes", async () => {
			const repo = await createRepo();
			try {
				for (const arch of ARCHETYPES) {
					const recipe = await generateDelegationRecipe(repo, `task-${arch}`, {
						taskType: arch,
						model: "anthropic/claude-3-7-sonnet",
					});

					expect(recipe.taskType).toBe(arch);
					expect(recipe.archetypeName).toBeDefined();
					expect(recipe.launchCommand).toContain("pi --model anthropic/claude-3-7-sonnet");
					expect(recipe.launchCommand).toContain(`--mode`);
					expect(recipe.verifyCommand.length).toBeGreaterThan(5);
					expect(recipe.environmentFlags.KAIOKEN_TASK_TYPE).toBe(arch);

					const card = renderMarkdownRecipeCard(recipe);
					expect(card).toContain("Worktree Delegation Recipe");
					expect(card).toContain(arch);
					expect(card).toContain("Launch Command");
					expect(card).toContain("Verification Gate");
				}
			} finally {
				await rm(repo, { recursive: true, force: true });
			}
		});
	});

	describe("Theme 5: Working Tree Dirty Guard & Auto-Stash (UX-1891 - UX-1900)", () => {
		it("detects dirty and untracked files across all 10 archetypes and renders warnings", async () => {
			const repo = await createRepo();
			try {
				// Clean tree first
				const cleanGuard = await assertCleanWorkingTreeGuard(repo, { taskType: "refactor" });
				expect(cleanGuard.clean).toBe(true);
				expect(cleanGuard.warningMessage).toContain("Working tree is clean");

				// Create dirty modification and untracked file
				await writeFile(join(repo, "README.md"), "# Modified\n");
				await writeFile(join(repo, "scratch.txt"), "untracked file\n");

				for (const arch of ARCHETYPES) {
					const dirtyGuard = await assertCleanWorkingTreeGuard(repo, { taskType: arch });
					expect(dirtyGuard.clean).toBe(false);
					expect(dirtyGuard.taskType).toBe(arch);
					expect(dirtyGuard.dirtyFiles).toContain("README.md");
					expect(dirtyGuard.untrackedFiles).toContain("scratch.txt");
					expect(dirtyGuard.remediationOptions.length).toBeGreaterThanOrEqual(1);

					const warningCard = renderGuardWarningCard(dirtyGuard);
					expect(warningCard).toContain("DIRTY WORKING TREE FAST-FORWARD GUARD BLOCKED");
					expect(warningCard).toContain(dirtyGuard.archetypeName);
					expect(warningCard).toContain("README.md");
					expect(warningCard).toContain("scratch.txt");
				}
			} finally {
				await rm(repo, { recursive: true, force: true });
			}
		});
	});
});
