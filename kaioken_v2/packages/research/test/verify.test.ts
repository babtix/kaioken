import { describe, expect, it } from "vitest";
import { uncitedSentences, verifyCitations } from "../src/verify.js";
import type { ResearchSource, SourceExcerpt } from "../src/types.js";

const excerpts: SourceExcerpt[] = [
	{ sourceNumber: 1, text: "The library was released in March 2019 and has since grown rapidly.", truncated: false },
	{ sourceNumber: 2, text: "Benchmarks show a 40% improvement over the previous version.", truncated: false },
	{ sourceNumber: 3, text: "failed page", truncated: false },
];

const sources: ResearchSource[] = [
	{ number: 1, url: "https://a", title: "A", hash: "h1", fetched: true },
	{ number: 2, url: "https://b", title: "B", hash: "h2", fetched: true },
	{ number: 3, url: "https://c", title: "C", hash: "", fetched: false, error: "timeout" },
];

describe("verifyCitations", () => {
	it("grounds a citation to a fetched source", () => {
		const v = verifyCitations("It launched in 2019 [1].", sources, excerpts);
		expect(v.defects).toEqual([]);
		expect(v.grounded).toBe(1);
	});

	it("grounds an attributed quote only when the quote is really there", () => {
		const good = verifyCitations('The page says "released in March 2019" [1].', sources, excerpts);
		expect(good.defects).toEqual([]);

		const bad = verifyCitations('The page says "written in 1492" [1].', sources, excerpts);
		expect(bad.defects).toHaveLength(1);
		expect(bad.defects[0]).toMatchObject({ kind: "quote_not_found", line: 1 });
	});

	it("flags a citation to a number that was never fetched", () => {
		const v = verifyCitations("According to reports [9], this is true.", sources, excerpts);
		expect(v.defects[0]).toMatchObject({ kind: "unknown_source" });
	});

	it("refuses to let a failed fetch be cited", () => {
		const v = verifyCitations("The docs say otherwise [3].", sources, excerpts);
		expect(v.defects[0]).toMatchObject({ kind: "cites_failed_fetch" });
	});

	it("locates defects by line", () => {
		const body = "intro\n\nThe claim appears here [1].\nAnd a bad one [7].";
		const v = verifyCitations(body, sources, excerpts);
		expect(v.grounded).toBe(1);
		expect(v.defects[0]).toMatchObject({ kind: "unknown_source", line: 4 });
	});

	it("counts groundedRatio against citations, not lines", () => {
		const v = verifyCitations("A [1]. B [2]. C [9].", sources, excerpts);
		expect(v.grounded).toBe(2);
		expect(v.groundedRatio).toBeCloseTo(2 / 3);
	});
});

describe("uncitedSentences", () => {
	it("reports long prose lines with no citation", () => {
		const body =
			"# Header\n" +
			"- a list item\n" +
			"This long sentence draws no numbered source anywhere at all, so it is synthesis.\n" +
			"Short one [1].";
		const uncited = uncitedSentences(body);
		expect(uncited).toHaveLength(1);
		expect(uncited[0]).toMatchObject({ line: 3 });
	});
});
