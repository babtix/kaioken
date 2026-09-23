import { describe, expect, it } from "vitest";
import {
	demangleStack,
	extractFailures,
	extractStructuredFailures,
	formatFailureSummary,
} from "../src/index.ts";

describe("demangleStack", () => {
	it("parses Node.js stack frames and filters out internal modules", () => {
		const stack = `
Error: AssertionError
    at Context.<anonymous> (/workspace/src/auth.ts:42:15)
    at processImmediate (node:internal/timers:478:21)
    at runTest (/workspace/node_modules/vitest/dist/runner.js:100:5)
`;
		const frames = demangleStack(stack);
		expect(frames).toHaveLength(3);

		expect(frames[0]?.file).toBe("/workspace/src/auth.ts");
		expect(frames[0]?.line).toBe(42);
		expect(frames[0]?.col).toBe(15);
		expect(frames[0]?.isUserCode).toBe(true);

		expect(frames[1]?.isUserCode).toBe(false);
		expect(frames[2]?.isUserCode).toBe(false);
	});

	it("parses Python stack frames and marks user vs site-packages", () => {
		const stack = `
Traceback (most recent call last):
  File "/env/lib/python3.11/site-packages/pytest.py", line 105, in run
  File "/workspace/app/test_db.py", line 28, in test_connection
`;
		const frames = demangleStack(stack);
		expect(frames).toHaveLength(2);
		expect(frames[0]?.isUserCode).toBe(false);
		expect(frames[1]?.isUserCode).toBe(true);
		expect(frames[1]?.file).toBe("/workspace/app/test_db.py");
		expect(frames[1]?.line).toBe(28);
	});
});

describe("extractStructuredFailures", () => {
	it("extracts TypeScript compiler errors with error codes and lines", () => {
		const output = `
src/server.ts(24,7): error TS2322: Type 'string' is not assignable to type 'number'.
src/index.ts(100): error TS2304: Cannot find name 'foo'.
`;
		const failures = extractStructuredFailures(output);
		expect(failures).toHaveLength(2);

		expect(failures[0]?.category).toBe("type");
		expect(failures[0]?.file).toBe("src/server.ts");
		expect(failures[0]?.line).toBe(24);
		expect(failures[0]?.column).toBe(7);
		expect(failures[0]?.message).toContain("[TS2322]");

		expect(failures[1]?.category).toBe("type");
		expect(failures[1]?.file).toBe("src/index.ts");
		expect(failures[1]?.line).toBe(100);
	});

	it("extracts Linter style errors", () => {
		const output = `
src/app.ts:15:3 - error: Missing semicolon [semi]
`;
		const failures = extractStructuredFailures(output);
		expect(failures).toHaveLength(1);
		expect(failures[0]?.category).toBe("syntax");
		expect(failures[0]?.file).toBe("src/app.ts");
		expect(failures[0]?.line).toBe(15);
		expect(failures[0]?.column).toBe(3);
		expect(failures[0]?.message).toBe("Missing semicolon [semi]");
	});

	it("extracts Vitest assertion diffs (expected vs received)", () => {
		const output = `
FAIL test/math.test.ts
 ❯ test/math.test.ts:12:4 > math module > adds correctly
   AssertionError: expected 5 to be 4

   - Expected  - 1
   + Received  + 1

   - 4
   + 5
`;
		const failures = extractStructuredFailures(output);
		expect(failures).toHaveLength(1);
		expect(failures[0]?.category).toBe("assertion");
		expect(failures[0]?.file).toBe("test/math.test.ts");
		expect(failures[0]?.line).toBe(12);
		expect(failures[0]?.column).toBe(4);
		expect(failures[0]?.diff?.expected).toBe("4");
		expect(failures[0]?.diff?.actual).toBe("5");
	});

	it("extracts Pytest expected vs actual assertions", () => {
		const output = `
FAILED tests/test_calc.py::test_sum - AssertionError: assert 10 == 20
E   assert 10 == 20
`;
		const failures = extractStructuredFailures(output);
		expect(failures).toHaveLength(1);
		expect(failures[0]?.category).toBe("assertion");
		expect(failures[0]?.file).toBe("tests/test_calc.py");
		expect(failures[0]?.testName).toBe("test_sum");
		expect(failures[0]?.diff?.actual).toBe("10");
		expect(failures[0]?.diff?.operator).toBe("==");
		expect(failures[0]?.diff?.expected).toBe("20");
	});
});
