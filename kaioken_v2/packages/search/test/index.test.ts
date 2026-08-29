import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { buildIndex, writeIndexArtifact } from "@kaioken/index";
import { scan, writeScanArtifact } from "@kaioken/scan";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type EmbeddingProvider, SearchIndex, splitMarkdown } from "../dist/index.js";

const roots: string[] = [];

afterEach(async () => {
	await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function repo(files: Record<string, string>): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), "kaioken-search-"));
	roots.push(root);
	for (const [path, content] of Object.entries(files)) {
		const abs = join(root, path);
		await mkdir(dirname(abs), { recursive: true });
		await writeFile(abs, content, "utf8");
	}
	// Phase 1 artifacts are the search corpus's only input after a cold start.
	const scanned = await scan(root);
	await writeScanArtifact(root, scanned);
	const { index } = await buildIndex(scanned);
	await writeIndexArtifact(root, index);
	return root;
}

const SOURCE = {
	"src/wiki.ts": [
		"/** Handles a wiki search request against the generated corpus. */",
		"export function handleWikiSearch(query: string): string[] {",
		"\treturn [query];",
		"}",
		"",
		"/** Applies exponential backoff between retries. */",
		"export function retryWithBackoff(attempts: number): void {}",
		"",
	].join("\n"),
	"src/scan.py": ['def walk_tree(root):\n    """Traverse the working tree once."""\n    return []\n'].join(""),
};

describe("corpus", () => {
	it("indexes declarations so search is useful before anything generative runs", async () => {
		const root = await repo(SOURCE);
		const index = await SearchIndex.open(root);
		expect(index.kinds()).toEqual({ symbol: 2 });
		expect(index.chunkCount).toBeGreaterThan(0);
	});

	it("finds a compound identifier from a two-word query", async () => {
		const root = await repo(SOURCE);
		const index = await SearchIndex.open(root);
		const hits = await index.search({ text: "wiki search" });
		expect(hits[0]?.heading).toContain("handleWikiSearch");
	});

	it("finds a declaration through its doc comment's vocabulary", async () => {
		const root = await repo(SOURCE);
		const index = await SearchIndex.open(root);
		const hits = await index.search({ text: "exponential" });
		expect(hits[0]?.heading).toContain("retryWithBackoff");
	});

	it("points at the declaration's line, not the file's start", async () => {
		const root = await repo(SOURCE);
		const index = await SearchIndex.open(root);
		const hits = await index.search({ text: "backoff" });
		expect(hits[0]?.line).toBe(7);
	});

	it("returns nothing rather than noise for an absent term", async () => {
		const root = await repo(SOURCE);
		const index = await SearchIndex.open(root);
		expect(await index.search({ text: "kubernetes helm chart" })).toEqual([]);
	});

	it("restricts to a tenant when asked", async () => {
		const root = await repo(SOURCE);
		const index = await SearchIndex.open(root);
		expect(await index.search({ text: "wiki", kinds: ["wiki"] })).toEqual([]);
		expect((await index.search({ text: "wiki", kinds: ["symbol"] })).length).toBeGreaterThan(0);
	});
});

describe("wiki tenant", () => {
	const WIKI = {
		".kaioken/wiki/core/overview.md": [
			"# Retrieval overview",
			"",
			"## Ranking",
			"",
			"Lexical ranking always runs and needs no credentials whatsoever.",
			"",
			"## Storage",
			"",
			"The index is persisted under the kaioken directory as plain JSON.",
			"",
		].join("\n"),
	};

	it("indexes generated chapters alongside declarations", async () => {
		const root = await repo({ ...SOURCE, ...WIKI });
		const index = await SearchIndex.open(root);
		expect(index.kinds()).toEqual({ wiki: 1, symbol: 2 });
	});

	it("returns the section that answers, not the whole chapter", async () => {
		const root = await repo({ ...SOURCE, ...WIKI });
		const index = await SearchIndex.open(root);
		const hits = await index.search({ text: "persisted json", kinds: ["wiki"] });
		expect(hits[0]?.heading).toBe("Storage");
		expect(hits[0]?.title).toBe("Retrieval overview");
	});
});

/**
 * The two tenants the agent's `wiki_search` advertises but nothing collected
 * until now. A tool that promises to reach cards and skills and silently reaches
 * neither is worse than one that never claimed to.
 */
describe("card tenant", () => {
	const CARDS = {
		".kaioken/cards/retrieval.json": JSON.stringify({
			moduleId: "retrieval",
			name: "Retrieval",
			summary: "Ranks every indexed passage against a query.",
			keyPoints: ["Reciprocal-rank fusion, never score-space arithmetic."],
			entryPoints: [{ name: "handleWikiSearch", file: "src/wiki.ts", note: "the entry point" }],
			sources: [],
		}),
	};

	it("indexes a generated card without depending on the package that wrote it", async () => {
		const root = await repo({ ...SOURCE, ...CARDS });
		const index = await SearchIndex.open(root);
		expect(index.kinds()).toEqual({ card: 1, symbol: 2 });
	});

	it("matches a card on its key points as well as its summary", async () => {
		const root = await repo({ ...SOURCE, ...CARDS });
		const index = await SearchIndex.open(root);
		const hits = await index.search({ text: "reciprocal rank fusion", kinds: ["card"] });
		expect(hits[0]?.title).toBe("Retrieval");
	});

	it("skips a corrupt card rather than losing the rest of the corpus", async () => {
		const root = await repo({ ...SOURCE, ".kaioken/cards/broken.json": "{ not json" });
		const index = await SearchIndex.open(root);
		expect(index.kinds()).toEqual({ symbol: 2 });
	});
});

describe("skill tenant", () => {
	const SKILLS = {
		".kaioken/skills/release.md": [
			"---",
			"name: release",
			"description: Cut a release.",
			"---",
			"",
			"## Tagging",
			"",
			"Tag the commit after the version bump lands on the main branch.",
			"",
		].join("\n"),
	};

	it("indexes a handwritten skill under its declared name", async () => {
		const root = await repo({ ...SOURCE, ...SKILLS });
		const index = await SearchIndex.open(root);
		expect(index.kinds()).toEqual({ skill: 1, symbol: 2 });

		const hits = await index.search({ text: "tag the commit", kinds: ["skill"] });
		expect(hits[0]?.title).toBe("release");
		// The frontmatter is stripped, so a query never matches on the metadata
		// block that every skill shares.
		expect(hits[0]?.snippet).not.toContain("description:");
	});
});

describe("chunking", () => {
	it("splits at headings and records the starting line", () => {
		const chunks = splitMarkdown(
			["# Title", "", "Intro paragraph long enough to be kept as a chunk here.", "", "## Second", "", "Another passage that is comfortably past the minimum length."].join("\n"),
			0,
		);
		expect(chunks.map((c) => c.heading)).toEqual(["Title", "Second"]);
		expect(chunks[1]?.line).toBe(5);
	});

	it("does not treat a heading inside a fence as structure", () => {
		const chunks = splitMarkdown(
			["# Real", "", "```md", "# Not a heading, this is sample output inside a fence", "```", "", "Trailing prose that is long enough to survive the minimum."].join("\n"),
			0,
		);
		expect(chunks.map((c) => c.heading)).toEqual(["Real"]);
	});

	it("drops a table of contents, which would match everything and answer nothing", () => {
		const chunks = splitMarkdown(
			["## Contents", "", "- [One](one.md)", "- [Two](two.md)", "- [Three](three.md)", "- [Four](four.md)"].join("\n"),
			0,
		);
		expect(chunks).toEqual([]);
	});
});

describe("rebuild detection", () => {
	it("reuses the persisted index when nothing changed", async () => {
		const root = await repo(SOURCE);
		const first = await SearchIndex.open(root);
		const second = await SearchIndex.open(root);
		expect(second.fingerprint).toBe(first.fingerprint);
	});

	it("rebuilds when the underlying knowledge moved", async () => {
		const root = await repo(SOURCE);
		const first = await SearchIndex.open(root);

		await writeFile(
			join(root, "src/wiki.ts"),
			`${SOURCE["src/wiki.ts"]}\nexport function addedLater(): void {}\n`,
			"utf8",
		);
		const scanned = await scan(root);
		await writeScanArtifact(root, scanned);
		const { index } = await buildIndex(scanned);
		await writeIndexArtifact(root, index);

		const second = await SearchIndex.open(root);
		expect(second.fingerprint).not.toBe(first.fingerprint);
		expect((await second.search({ text: "addedLater" })).length).toBeGreaterThan(0);
	});
});

/**
 * The degradation contract. The lower layer must never depend on the higher one:
 * strip every credential and search still indexes, still ranks, still answers.
 */
describe("degrades to zero dependencies", () => {
	it("ranks with no provider and reports that semantic ranking is off", async () => {
		const root = await repo(SOURCE);
		const index = await SearchIndex.open(root);
		expect(index.semantic).toBe(false);
		const hits = await index.search({ text: "wiki search" });
		expect(hits.length).toBeGreaterThan(0);
		expect(hits[0]?.via).toEqual(["lexical"]);
	});

	it("never reaches the network while indexing or searching", async () => {
		const root = await repo(SOURCE);
		const original = globalThis.fetch;
		const spy = vi.fn(() => {
			throw new Error("network access attempted in the lexical layer");
		});
		globalThis.fetch = spy as unknown as typeof fetch;
		try {
			const index = await SearchIndex.open(root, { force: true });
			await index.search({ text: "wiki search" });
			expect(spy).not.toHaveBeenCalled();
		} finally {
			globalThis.fetch = original;
		}
	});

	it("fuses both rankings when a provider is supplied", async () => {
		const root = await repo(SOURCE);
		// A deterministic stand-in: the seam is what is under test, not a model.
		const provider: EmbeddingProvider = {
			embed: async (texts) => texts.map((t) => [t.length, t.split(/\s+/).length]),
		};
		const index = await SearchIndex.build(root, provider);
		expect(index.semantic).toBe(true);

		const hits = await index.search({ text: "wiki search" }, provider);
		expect(hits.length).toBeGreaterThan(0);
		expect(hits.some((h) => h.via.includes("semantic"))).toBe(true);
	});

	it("falls back to lexical when the provider fails mid-query", async () => {
		const root = await repo(SOURCE);
		const working: EmbeddingProvider = {
			embed: async (texts) => texts.map((t) => [t.length, 1]),
		};
		const index = await SearchIndex.build(root, working);

		const broken: EmbeddingProvider = {
			embed: async () => {
				throw new Error("provider unavailable");
			},
		};
		// An embedding failure is not fatal: BM25 already has an answer.
		const hits = await index.search({ text: "wiki search" }, broken);
		expect(hits.length).toBeGreaterThan(0);
		expect(hits[0]?.via).toEqual(["lexical"]);
	});
});

describe("hybrid search with no lexical terms", () => {
	/** Returns the same vector for everything, so every chunk ranks equally. */
	const flatProvider: EmbeddingProvider = {
		async embed(texts) {
			return texts.map(() => [1, 0, 0]);
		},
	};

	it("still runs semantic ranking when the query is all stopwords", async () => {
		const root = await repo(SOURCE);
		const index = await SearchIndex.build(root, flatProvider);

		// The analyzer strips stopwords, so lexical ranking has nothing to
		// score. Returning early there disabled the half of hybrid search that
		// never sees the analyzer in the first place.
		const hits = await index.search({ text: "how it is", limit: 3 }, flatProvider);

		expect(hits.length).toBeGreaterThan(0);
		expect(hits[0]?.via).toEqual(["semantic"]);
	});

	it("still returns nothing for a stopword query with no embedding provider", async () => {
		const root = await repo(SOURCE);
		const index = await SearchIndex.open(root);

		expect(await index.search({ text: "how it is" })).toEqual([]);
	});
});
