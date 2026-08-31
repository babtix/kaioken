import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isEmpty, readBranch, readRepoState, type RepoState } from "../src/repoState.js";
import {
	keyLegend,
	knowledgeSummary,
	logoBlock,
	statusPanel,
	stickyHeader,
	welcomeBanner,
	type HeaderInfo,
} from "../src/logo.js";
import { LOGO_WIDTH } from "../src/logo.js";
import { visibleWidth } from "../src/screen.js";
import { stripAnsi } from "../src/theme.js";

/**
 * The header's two added rows.
 *
 * Both are conditional on purpose: the panel is the tallest fixed block on
 * screen, and every row it grows is a row the transcript loses and a step
 * closer to the banner giving up its second column. A row that cannot say
 * anything does not appear.
 */

const INFO: HeaderInfo = {
	version: "2.0.0",
	repo: "/home/dev/kaioken",
	model: "anthropic/claude-opus-4",
	provider: "anthropic",
	hasKey: true,
};

function panel(knowledge?: RepoState): string {
	return stripAnsi(statusPanel(knowledge ? { ...INFO, knowledge } : INFO).join("\n"));
}

describe("rows appear only when they have something to say", () => {
	it("adds nothing at all when there is no repository state", () => {
		const bare = panel();
		expect(bare).not.toContain("Branch");
		expect(bare).not.toContain("Knowledge");
		// The original five rows, untouched.
		for (const label of ["Version", "Repo", "Model", "Provider", "API Key"]) {
			expect(bare).toContain(label);
		}
	});

	it("omits the branch row outside a git repository", () => {
		expect(panel({})).not.toContain("Branch");
		expect(panel({ branch: "master" })).toContain("Branch");
	});

	it("costs a bare directory exactly one row", () => {
		const before = statusPanel(INFO).length;
		// Not a git repo, nothing generated: the knowledge row still earns its
		// place, because "nothing yet" is the answer that most needs acting on.
		expect(statusPanel({ ...INFO, knowledge: {} }).length).toBe(before + 1);
		expect(statusPanel({ ...INFO, knowledge: { branch: "master" } }).length).toBe(before + 2);
	});
});

describe("the knowledge row", () => {
	it("says what to run when there is nothing", () => {
		const summary = stripAnsi(knowledgeSummary({}));
		expect(summary).toContain("nothing generated yet");
		expect(summary).toContain("/wiki");
		expect(summary).toContain("/cards");
	});

	it("counts what exists, and leads with scale", () => {
		const summary = stripAnsi(
			knowledgeSummary({ files: 412, documents: 14, cards: 9, research: 3, freshness: 0.94 }),
		);
		expect(summary).toBe("412 files · 14 docs · 9 cards · 3 research · 94% fresh");
	});

	it("omits a count of zero rather than printing it", () => {
		const summary = stripAnsi(knowledgeSummary({ files: 412, documents: 14, cards: 0, research: 0 }));
		expect(summary).toBe("412 files · 14 docs");
	});

	it("names the drift only when there is drift to act on", () => {
		expect(stripAnsi(knowledgeSummary({ documents: 4, freshness: 1, stale: 0 }))).not.toContain("stale");
		expect(stripAnsi(knowledgeSummary({ documents: 4, freshness: 0.62, stale: 5 }))).toContain("5 stale");
	});

	it("colours freshness as a verdict, not decoration", () => {
		const healthy = knowledgeSummary({ documents: 4, freshness: 0.94 });
		const drifting = knowledgeSummary({ documents: 4, freshness: 0.62 });
		const bad = knowledgeSummary({ documents: 4, freshness: 0.31 });
		expect(new Set([healthy, drifting, bad]).size).toBe(3);
	});

	it("knows empty from merely un-scanned", () => {
		expect(isEmpty({})).toBe(true);
		// A scan with nothing generated from it is still empty.
		expect(isEmpty({ files: 412 })).toBe(true);
		expect(isEmpty({ documents: 1 })).toBe(false);
		expect(isEmpty({ cards: 1 })).toBe(false);
		expect(isEmpty({ research: 1 })).toBe(false);
	});
});

describe("reading the branch", () => {
	it("reads HEAD, and walks up the way git does", async () => {
		const root = await mkdtemp(join(tmpdir(), "kaioken-git-"));
		await mkdir(join(root, ".git"));
		await writeFile(join(root, ".git", "HEAD"), "ref: refs/heads/feat/tui-port\n");
		await mkdir(join(root, "apps", "tui"), { recursive: true });

		expect(await readBranch(root)).toBe("feat/tui-port");
		// Running from a package inside a monorepo is the normal case.
		expect(await readBranch(join(root, "apps", "tui"))).toBe("feat/tui-port");
		await rm(root, { recursive: true, force: true });
	});

	it("shortens a detached HEAD to the length people quote", async () => {
		const root = await mkdtemp(join(tmpdir(), "kaioken-git-"));
		await mkdir(join(root, ".git"));
		await writeFile(join(root, ".git", "HEAD"), "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678\n");
		expect(await readBranch(root)).toBe("a1b2c3d");
		await rm(root, { recursive: true, force: true });
	});

	it("follows the gitdir pointer a worktree leaves behind", async () => {
		const root = await mkdtemp(join(tmpdir(), "kaioken-git-"));
		const real = join(root, "real");
		const tree = join(root, "tree");
		await mkdir(real, { recursive: true });
		await mkdir(tree, { recursive: true });
		await writeFile(join(real, "HEAD"), "ref: refs/heads/worktree-branch\n");
		await writeFile(join(tree, ".git"), `gitdir: ${real}\n`);

		expect(await readBranch(tree)).toBe("worktree-branch");
		await rm(root, { recursive: true, force: true });
	});

	it("is silent rather than failing where there is no git", async () => {
		const root = await mkdtemp(join(tmpdir(), "kaioken-git-"));
		expect(await readBranch(root)).toBeUndefined();
		await rm(root, { recursive: true, force: true });
	});
});

describe("reading the repository", () => {
	it("reads an empty directory without scanning or throwing", async () => {
		const root = await mkdtemp(join(tmpdir(), "kaioken-state-"));
		const state = await readRepoState(root);
		// Never generates: a fresh directory is the normal case, not an error,
		// and a header that cost a repository walk would make the tool feel
		// slow to open.
		expect(isEmpty(state)).toBe(true);
		expect(state.documents).toBeUndefined();
		expect(state.freshness).toBeUndefined();
		await rm(root, { recursive: true, force: true });
	});

	it("is fast enough to run before the first paint", async () => {
		const root = await mkdtemp(join(tmpdir(), "kaioken-state-"));
		const started = Date.now();
		await readRepoState(root);
		expect(Date.now() - started).toBeLessThan(1500);
		await rm(root, { recursive: true, force: true });
	});
});

describe("the space under the wordmark", () => {
	it("stays bare art when there is no state to show", () => {
		// Conditional like the panel's added rows, so the degradation ladder is
		// unchanged: no state, no extra rows, same height as before.
		expect(logoBlock(150)).toHaveLength(6);
		expect(logoBlock(150, { branch: "master" }).length).toBeGreaterThan(6);
	});

	it("hangs nothing off the narrow one-line fallback", () => {
		expect(logoBlock(40, { branch: "master", files: 1 })).toHaveLength(1);
	});

	it("names the keys that are otherwise invisible", () => {
		// Every one of these already worked; none appeared anywhere but /help,
		// which you have to know exists before you can find out that scrolling
		// and search are bound at all.
		const legend = keyLegend().map(stripAnsi).join("\n");
		for (const key of ["enter", "alt+enter", "/", "tab", "↑↓", "pgup/pgdn", "ctrl+shift+f", "ctrl+c"]) {
			expect(legend, key).toContain(key);
		}
		expect(legend).toContain("twice to quit");
	});

	it("keeps every legend row inside the wordmark's own width", () => {
		// The block has to stay rectangular: a row wider than the art would
		// push the panel beside it out of alignment.
		for (const row of keyLegend()) {
			expect(visibleWidth(stripAnsi(row))).toBeLessThanOrEqual(LOGO_WIDTH);
		}
	});
});

describe("the header degrades one step at a time", () => {
	const full: RepoState = { branch: "master", files: 412, documents: 14, cards: 9, freshness: 0.62, stale: 5 };

	function header(width: number, height: number): string {
		return stripAnsi(stickyHeader({ ...INFO, knowledge: full }, width, height).join("\n"));
	}

	it("shows everything when there is room", () => {
		const wide = header(160, 44);
		expect(wide).toContain("██");
		expect(wide).toContain("Branch");
		expect(wide).toContain("5 stale");
	});

	it("gives up the added rows before it gives up the wordmark", () => {
		// The branch and knowledge rows are additions to v1's panel, so a
		// short terminal drops them first. Losing the art to keep a row that
		// was never there before would be the wrong trade.
		const squeezed = header(100, 40);
		expect(squeezed).toContain("██");
		expect(squeezed).toContain("Model:");
		expect(squeezed).not.toContain("Knowledge");
	});

	it("falls all the way to the strip when even that will not fit", () => {
		const tiny = header(100, 12);
		expect(tiny).not.toContain("██");
		expect(tiny).toContain("KAIOKEN");
		expect(tiny).toContain("Model:");
	});
});

describe("the banner still fits", () => {
	it("keeps both columns at a normal width with the rows added", () => {
		const full: RepoState = { branch: "master", files: 412, documents: 14, cards: 9, freshness: 0.62, stale: 5 };
		const banner = stripAnsi(welcomeBanner({ ...INFO, knowledge: full }, 160).join("\n"));
		// Art and panel still share a row: the extra rows cost height, and the
		// side-by-side decision is about width.
		expect(banner.split("\n").some((l) => l.includes("██") && l.includes("kaioken@"))).toBe(true);
		expect(banner).toContain("5 stale");
	});
});
