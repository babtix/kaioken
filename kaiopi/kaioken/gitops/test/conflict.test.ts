import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
	detectConflicts,
	getThreeWayDiff,
	renderConflictCard,
} from "../src/conflict.ts";
import { git } from "../src/run.ts";

describe("conflict: Conflict Detection, Warning Card and 3-Way Diff", () => {
	it("renders visual conflict warning card with formatted sections", () => {
		const card = renderConflictCard({
			hasConflicts: true,
			conflictedFiles: [
				{ path: "src/engine.ts", markerCount: 2 },
				{ path: "src/parser.ts", markerCount: 1 },
			],
			ahead: 3,
			behind: 5,
			baseBranch: "main",
			incomingBranch: "kaioken/refactor-ast",
		});

		expect(card).toContain("⚠️  MERGE CONFLICT WARNING CARD");
		expect(card).toContain("Base Branch    : main");
		expect(card).toContain("Incoming Branch: kaioken/refactor-ast");
		expect(card).toContain("3 commit(s) ahead, 5 commit(s) behind");
		expect(card).toContain("2 file(s) with 3 conflict marker section(s)");
		expect(card).toContain("• src/engine.ts (2 conflict blocks)");
		expect(card).toContain("Actionable Recovery Playbook:");
		expect(card).toContain("git rebase main");
	});

	it("detects real git merge conflicts and extracts 3-way stages", async () => {
		const repo = await mkdtemp(join(tmpdir(), "kaio-conflict-diff3-"));
		try {
			await git(repo, "init");
			await git(repo, "config", "user.name", "Tester");
			await git(repo, "config", "user.email", "test@domain.com");

			// Initial commit
			await writeFile(join(repo, "file.txt"), "base content\nline 2\n");
			await git(repo, "add", "-A");
			await git(repo, "commit", "-m", "base commit");

			// Feature branch edits file
			await git(repo, "checkout", "-b", "feature");
			await writeFile(join(repo, "file.txt"), "feature modification\nline 2\n");
			await git(repo, "commit", "-am", "feature commit");

			// Main branch makes conflicting edit
			await git(repo, "checkout", "master").catch(() => git(repo, "checkout", "main"));
			await writeFile(join(repo, "file.txt"), "main conflicting edit\nline 2\n");
			await git(repo, "commit", "-am", "main commit");

			// Attempt merge to trigger conflict
			await git(repo, "merge", "feature");

			const info = await detectConflicts(repo, "main", "feature");
			expect(info.hasConflicts).toBe(true);
			expect(info.conflictedFiles.length).toBe(1);
			expect(info.conflictedFiles[0].path).toBe("file.txt");

			const diff3 = await getThreeWayDiff(repo, "file.txt");
			expect(diff3.files.length).toBe(1);
			expect(diff3.files[0].hasAncestor).toBe(true);
			expect(diff3.files[0].hasOurs).toBe(true);
			expect(diff3.files[0].hasTheirs).toBe(true);
			expect(diff3.files[0].ancestorContent).toContain("base content");
			expect(diff3.files[0].oursContent).toContain("main conflicting edit");
			expect(diff3.files[0].theirsContent).toContain("feature modification");
		} finally {
			await rm(repo, { recursive: true, force: true });
		}
	});
});
