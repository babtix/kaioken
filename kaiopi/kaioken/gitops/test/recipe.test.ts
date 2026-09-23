import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
	formatDelegationRecipe,
	generateDelegationRecipe,
	listWorktrees,
} from "../src/recipe.ts";
import { git } from "../src/run.ts";

describe("recipe: Worktree Delegation and Listing", () => {
	it("generates structured delegation recipe and infers task types", async () => {
		const repo = await mkdtemp(join(tmpdir(), "kaio-rec-"));
		try {
			await git(repo, "init");
			await git(repo, "config", "user.name", "Tester");
			await git(repo, "config", "user.email", "test@domain.com");
			await writeFile(join(repo, "README.md"), "# Init\n");
			await git(repo, "add", "-A");
			await git(repo, "commit", "-m", "init");

			const recipe1 = await generateDelegationRecipe(repo, "refactor-ast-engine", {
				model: "anthropic/claude-3-7-sonnet",
			});
			expect(recipe1.taskSlug).toBe("refactor-ast-engine");
			expect(recipe1.taskType).toBe("refactor");
			expect(recipe1.branch).toBe("kaioken/refactor-ast-engine");
			expect(recipe1.launchCommand).toContain("cd ");
			expect(recipe1.launchCommand).toContain("pi --model anthropic/claude-3-7-sonnet");
			expect(recipe1.mergeCommand).toBe("kaioken gitops merge refactor-ast-engine");

			const formatted = formatDelegationRecipe(recipe1);
			expect(formatted).toContain("Delegation Recipe for [refactor-ast-engine] (refactor):");
			expect(formatted).toContain("Model Target  : anthropic/claude-3-7-sonnet");

			const recipe2 = await generateDelegationRecipe(repo, "upgrade-dependencies-task");
			expect(recipe2.taskType).toBe("deps");
		} finally {
			await rm(repo, { recursive: true, force: true });
		}
	});

	it("lists registered worktrees with metadata", async () => {
		const repo = await mkdtemp(join(tmpdir(), "kaio-list-wt-"));
		try {
			await git(repo, "init");
			await git(repo, "config", "user.name", "Tester");
			await git(repo, "config", "user.email", "test@domain.com");
			await writeFile(join(repo, "README.md"), "# Init\n");
			await git(repo, "add", "-A");
			await git(repo, "commit", "-m", "init");

			const initialList = await listWorktrees(repo);
			expect(initialList.length).toBeGreaterThanOrEqual(1);
			expect(initialList[0].bare).toBe(false);

			await generateDelegationRecipe(repo, "scratch-task-1");
			const updatedList = await listWorktrees(repo);
			expect(updatedList.length).toBe(2);

			const scratch = updatedList.find((w) => w.branch === "kaioken/scratch-task-1");
			expect(scratch).toBeDefined();
			expect(scratch?.isKaioken).toBe(true);
		} finally {
			await rm(repo, { recursive: true, force: true });
		}
	});
});
