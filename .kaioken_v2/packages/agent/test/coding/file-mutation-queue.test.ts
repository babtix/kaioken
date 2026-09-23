import { describe, expect, it } from "vitest";
import { withFileMutationQueue } from "../../dist/index.js";

describe("withFileMutationQueue", () => {
	it("serializes concurrent operations targeting the same file", async () => {
		const order: number[] = [];
		const filePath = "/workspace/src/app.ts";

		const op1 = withFileMutationQueue(filePath, async () => {
			await new Promise((r) => setTimeout(r, 50));
			order.push(1);
			return "first";
		});

		const op2 = withFileMutationQueue(filePath, async () => {
			order.push(2);
			return "second";
		});

		const [res1, res2] = await Promise.all([op1, op2]);

		expect(res1).toBe("first");
		expect(res2).toBe("second");
		expect(order).toEqual([1, 2]);
	});

	it("runs operations targeting different files in parallel", async () => {
		const started: string[] = [];
		const finished: string[] = [];

		const fileA = "/workspace/src/a.ts";
		const fileB = "/workspace/src/b.ts";

		let resolveA!: () => void;
		const barrierA = new Promise<void>((r) => {
			resolveA = r;
		});

		const opA = withFileMutationQueue(fileA, async () => {
			started.push("A");
			await barrierA;
			finished.push("A");
			return "doneA";
		});

		const opB = withFileMutationQueue(fileB, async () => {
			started.push("B");
			finished.push("B");
			return "doneB";
		});

		// opB should complete even while opA is waiting on barrierA
		const resB = await opB;
		expect(resB).toBe("doneB");
		expect(started).toContain("B");
		expect(finished).toContain("B");

		resolveA();
		const resA = await opA;
		expect(resA).toBe("doneA");
		expect(finished).toEqual(["B", "A"]);
	});

	it("releases lock and does not deadlock when an operation throws", async () => {
		const filePath = "/workspace/src/fail.ts";

		// op1 throws an error
		await expect(
			withFileMutationQueue(filePath, async () => {
				throw new Error("anchor text not found");
			}),
		).rejects.toThrow("anchor text not found");

		// op2 on the same file should still execute cleanly without deadlock
		const op2 = await withFileMutationQueue(filePath, async () => {
			return "recovered";
		});

		expect(op2).toBe("recovered");
	});
});
