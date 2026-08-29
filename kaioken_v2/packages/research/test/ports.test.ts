import { describe, expect, it } from "vitest";
import { dedupeHits, isFetchableUrl, numberSources } from "../src/ports.js";
import type { ResearchSource } from "../src/types.js";

describe("dedupeHits", () => {
	it("drops repeat URLs, preserving first-seen order", () => {
		const hits = [
			{ url: "https://a.example/x", title: "A" },
			{ url: "https://b.example/", title: "B" },
			{ url: "https://a.example/x#section", title: "A again" },
			{ url: "https://b.example", title: "B again" },
		];
		const deduped = dedupeHits(hits);
		expect(deduped.map((h) => h.url)).toEqual(["https://a.example/x", "https://b.example/"]);
	});
});

describe("isFetchableUrl", () => {
	it("allows public http(s) pages", () => {
		expect(isFetchableUrl("https://example.com/page")).toBe(true);
	});

	it("blocks non-http schemes, loopback, private ranges and internal hosts", () => {
		expect(isFetchableUrl("file:///etc/passwd")).toBe(false);
		expect(isFetchableUrl("ftp://example.com")).toBe(false);
		expect(isFetchableUrl("http://localhost:8080/admin")).toBe(false);
		expect(isFetchableUrl("http://127.0.0.1/x")).toBe(false);
		expect(isFetchableUrl("http://10.0.0.1/x")).toBe(false);
		expect(isFetchableUrl("http://192.168.1.4/x")).toBe(false);
		expect(isFetchableUrl("http://172.16.0.9/x")).toBe(false);
		expect(isFetchableUrl("http://169.254.169.254/latest/meta-data")).toBe(false);
		expect(isFetchableUrl("http://service.internal/x")).toBe(false);
		expect(isFetchableUrl("not a url")).toBe(false);
	});
});

describe("numberSources", () => {
	it("assigns [1]..[N] in order", () => {
		const sources: ResearchSource[] = [
			{ number: 0, url: "a", title: "a", hash: "h1", fetched: true },
			{ number: 0, url: "b", title: "b", hash: "h2", fetched: true },
		];
		expect(numberSources(sources).map((s) => s.number)).toEqual([1, 2]);
	});
});
