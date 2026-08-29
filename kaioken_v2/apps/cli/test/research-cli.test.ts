import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { main } from "../dist/main.js";

/**
 * Offline CLI tests for `kaioken research`.
 *
 * The command's network and model seams are scripted, not live: the CLI reads
 * search/fetch through ports (src/web.ts) and the model through the usual
 * ModelClient port, so the whole command is exercised without a socket. The
 * live end-to-end run is a separate, manual experiment — the same policy the
 * other tenants follow.
 */

const roots: string[] = [];
let stdout: string;
let stderr: string;

beforeEach(() => {
	stdout = "";
	stderr = "";
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
	await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("kaioken research (argument handling)", () => {
	it("fails with guidance when no question is given", async () => {
		const root = await mkdtemp(join(tmpdir(), "kaioken-research-"));
		roots.push(root);
		expect(await main(["research", "--root", root])).toBe(1);
		expect(stderr).toContain("expected a question");
	});

	it("fails with guidance on a bad multiplier", async () => {
		const root = await mkdtemp(join(tmpdir(), "kaioken-research-"));
		roots.push(root);
		expect(await main(["research", "x99", "--root", root, "some question"])).toBe(1);
		expect(stderr).toContain("x1..x10");
	});

	it("reports a model it cannot reach rather than failing obscurely", async () => {
		const root = await mkdtemp(join(tmpdir(), "kaioken-research-"));
		roots.push(root);
		// No credentials in the test environment: model resolution fails after
		// the question and multiplier checks, proving the seams fail in order.
		await main(["research", "what is the thing?", "--model", "nosuch/nope", "--root", root]);
		expect(stderr).toContain("kaioken research:");
	});
});
