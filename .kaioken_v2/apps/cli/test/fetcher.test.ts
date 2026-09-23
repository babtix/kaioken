import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFetcherMode, resolveFetchPort, writeFetcherMode } from "../dist/fetcher.js";
import { main } from "../dist/main.js";

/**
 * The setting and the run resolve through the same function, so what this
 * command reports and what a research run actually does cannot drift apart.
 * These tests hold that line.
 */

const roots: string[] = [];
let stdout: string;
let stderr: string;
const savedKey = process.env.FIRECRAWL_API_KEY;

beforeEach(() => {
	stdout = "";
	stderr = "";
	delete process.env.FIRECRAWL_API_KEY;
	vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
		stdout += String(chunk);
		return true;
	});
	vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
		stderr += String(chunk);
		return true;
	});
});

afterEach(async () => {
	vi.restoreAllMocks();
	if (savedKey === undefined) delete process.env.FIRECRAWL_API_KEY;
	else process.env.FIRECRAWL_API_KEY = savedKey;
	await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function repo(): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), "kaioken-fetcher-"));
	roots.push(root);
	return root;
}

describe("kaioken fetcher", () => {
	it("reports the default without writing anything", async () => {
		const root = await repo();
		expect(await main(["fetcher", "--root", root])).toBe(0);
		expect(stdout).toContain("fetcher: auto");
		await expect(readFile(join(root, ".kaioken", "research.json"), "utf8")).rejects.toThrow();
	});

	it("records a mode and reads it back", async () => {
		const root = await repo();
		expect(await main(["fetcher", "http", "--root", root])).toBe(0);
		expect(stdout).toContain("fetcher → http");
		expect(await readFetcherMode(root)).toBe("http");
	});

	it("refuses a mode it does not have, by name", async () => {
		const root = await repo();
		// "local" was a real mode in the interface this engine grew from. A user
		// who types it deserves to be told the capability is absent, not that
		// the word is wrong.
		expect(await main(["fetcher", "local", "--root", root])).toBe(1);
		expect(stderr).toContain("no local browser reader");
	});

	it("fails the api mode when there is no key, rather than downgrading silently", async () => {
		const root = await repo();
		await writeFetcherMode(root, "api");
		expect(await main(["fetcher", "--root", root])).toBe(1);
		expect(stdout).toContain("FIRECRAWL_API_KEY");
	});

	it("uses the API reader in auto when a key is present", () => {
		process.env.FIRECRAWL_API_KEY = "fc-test";
		expect(resolveFetchPort("auto").describe).toContain("Firecrawl");
		delete process.env.FIRECRAWL_API_KEY;
		// Holding the key is the whole signal: without one, nothing is spent.
		expect(resolveFetchPort("auto").describe).toContain("HTTP");
	});

	it("never spends a credit in http mode, key or no key", () => {
		process.env.FIRECRAWL_API_KEY = "fc-test";
		expect(resolveFetchPort("http").describe).toBe("pages read over HTTP only");
	});
});
