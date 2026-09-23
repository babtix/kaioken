import { describe, expect, it } from "vitest";
import { gatherSources, generateResearch, pathFor } from "../src/run.js";
import { depthFor } from "../src/types.js";
import type { WebFetchPort, WebSearchPort } from "../src/ports.js";

const PAGE_A = "<html><head><title>Page A</title></head><body><h1>Alpha</h1><p>The library launched in March 2019 with three modules.</p></body></html>";
const PAGE_B = "<html><body><p>Benchmarks show a 40% improvement over the prior release, per independent testing.</p></body></html>";

function scriptedSearch(): WebSearchPort {
	return {
		async search(query) {
			if (query.includes("nothing")) return [];
			return [
				{ url: "https://a.example/page", title: "Page A" },
				{ url: "https://a.example/page#frag", title: "Page A dupe" },
				{ url: "https://b.example/", title: "Page B" },
				{ url: "http://localhost:9/x", title: "internal" },
			];
		},
	};
}

function scriptedFetch(): WebFetchPort {
	return {
		async fetch(url) {
			if (url.startsWith("https://a.example")) return { status: 200, body: PAGE_A, title: "Page A" };
			if (url === "https://b.example/") return { status: 200, body: PAGE_B, title: "Page B" };
			return { error: "connection refused" };
		},
	};
}

const client = {
	async complete({ prompt }: { prompt: string }) {
		return JSON.stringify({
			title: "Answer",
			body:
				'The library launched in March 2019 [1], and benchmarks show a "40% improvement" [2].\n' +
				"A hallucinated claim about source seven [7].",
		});
	},
};

describe("gatherSources", () => {
	it("searches, dedupes, fetches and numbers sources", async () => {
		const result = await gatherSources({
			question: "when did the library launch?",
			depth: depthFor(1),
			search: scriptedSearch(),
			fetch: scriptedFetch(),
		});

		const fetched = result.sources.filter((s) => s.fetched);
		expect(fetched.map((s) => s.number)).toEqual([1, 2]);
		expect(fetched[0]).toMatchObject({ url: "https://a.example/page", title: "Page A" });
		expect(fetched[0].hash).not.toBe("");
		expect(result.skipped.some((s) => s.url.includes("localhost"))).toBe(true);
	});

	it("pins page content into sanitised excerpts the model will see", async () => {
		const result = await gatherSources({
			question: "benchmarks?",
			depth: depthFor(1),
			search: scriptedSearch(),
			fetch: scriptedFetch(),
		});
		const all = result.excerpts.map((e) => e.text).join("\n");
		expect(all).toContain("40% improvement");
		expect(all).not.toContain("<p>");
	});

	it("records a page that fails to fetch as a numbered but unfetchable source", async () => {
		const search: WebSearchPort = {
			async search() {
				return [{ url: "https://dead.example/", title: "Dead" }];
			},
		};
		const result = await gatherSources({
			question: "q",
			depth: depthFor(1),
			search,
			fetch: scriptedFetch(),
		});
		expect(result.sources).toHaveLength(1);
		expect(result.sources[0]).toMatchObject({ fetched: false });
	});
});

describe("generateResearch", () => {
	it("writes a document whose good citations verify and whose bad ones are defects", async () => {
		const gathered = await gatherSources({
			question: "when did the library launch?",
			depth: depthFor(1),
			search: scriptedSearch(),
			fetch: scriptedFetch(),
		});
		const { document } = await generateResearch({
			question: "when did the library launch?",
			gathered,
			depth: depthFor(1),
			client,
		});

		expect(document.title).toBe("Answer");
		expect(document.verification.grounded).toBe(2);
		expect(document.verification.defects[0]).toMatchObject({ kind: "unknown_source" });
		// Provenance covers exactly the fetched pages, pinned by content hash.
		expect(document.sourcesAsProvenance).toHaveLength(2);
	});

	it("refuses to write with zero fetched sources rather than inventing one", async () => {
		const search: WebSearchPort = {
			async search() {
				return [{ url: "https://dead.example/", title: "Dead" }];
			},
		};
		const gathered = await gatherSources({
			question: "q",
			depth: depthFor(1),
			search,
			fetch: scriptedFetch(),
		});
		await expect(
			generateResearch({ question: "q", gathered, depth: depthFor(1), client }),
		).rejects.toThrow(/nothing to research/);
	});
});

describe("pathFor", () => {
	it("turns a question into a filesystem-safe name", () => {
		expect(pathFor("What is X? (2026)")).toMatch(/^what-is-x-2026\.md$/);
	});
});

/**
 * A failed fetch still occupies a citation number, and the numbering has to
 * survive that. Getting it wrong is invisible in a run where every page loads,
 * which is exactly why it needs a test rather than a live trial.
 */
describe("citation numbering when a fetch fails", () => {
	const searchWithDeadFirst: WebSearchPort = {
		async search() {
			return [
				{ url: "https://dead.example/gone", title: "Dead" },
				{ url: "https://b.example/", title: "Page B" },
			];
		},
	};

	const fetchWithDeadFirst: WebFetchPort = {
		async fetch(url) {
			if (url === "https://b.example/") return { status: 200, body: PAGE_B, title: "Page B" };
			return { error: "404 not found" };
		},
	};

	it("gives the surviving page the number its own source record carries", async () => {
		const gathered = await gatherSources({
			question: "how fast is it?",
			search: searchWithDeadFirst,
			fetch: fetchWithDeadFirst,
			depth: depthFor(1),
		});

		const dead = gathered.sources.find((s) => !s.fetched);
		const live = gathered.sources.find((s) => s.fetched);

		expect(dead?.number).toBe(1);
		expect(live?.number).toBe(2);
		expect(gathered.excerpts).toHaveLength(1);

		// The excerpt the model is shown as [2] must be source 2. Numbering it
		// by its own index made it [1] — the dead link — so every citation the
		// model wrote was rejected as citing a page that could not be fetched,
		// and the bibliography credited the quote to a page nobody read.
		expect(gathered.excerpts[0]?.sourceNumber).toBe(live?.number);
	});
});
