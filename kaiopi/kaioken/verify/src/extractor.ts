import { stripAnsi, tail } from "./streaming.ts";
import type {
	AssertionDiff,
	FailureCategory,
	StackFrame,
	StructuredFailure,
	TestFailure,
} from "./types.ts";

// Regex patterns for various test runners and diagnostic output
const vitestFailFileRe = /^\s*FAIL\s+([^\s:]+\.(?:[jt]sx?|m[jt]s|c[jt]s|py|go|rs))/;
const vitestArrowRe =
	/^\s*❯\s+(?:([^\s:]+\.(?:[jt]sx?|m[jt]s|c[jt]s)):(\d+):(\d+)\s+>\s+)?(.*)$/;
const jestBulletRe = /^\s*●\s+(.+)$/;
const crossRe = /^\s*[✕✖×]\s+(.+?)(?:\s+\(\d+.*?\))?$/;
const pytestRe = /^FAILED\s+([^:\s]+)::(\S+)(?:\s+-\s+(.*))?$/;
const goFailRe = /^---\s*FAIL:\s*([^\s(]+)/;
const cargoFailRe = /^test\s+([^\s]+)\s+\.\.\.\s+FAILED$/;
const tsErrorRe =
	/^\s*([^\s()]+\.(?:[jt]sx?|m[jt]s|c[jt]s|d\.ts))\s*\((?:(\d+),(\d+)|(\d+))\):\s*error\s*(TS\d+):\s*(.*)$/;
const lintErrorRe =
	/^\s*([^\s:]+\.(?:[jt]sx?|m[jt]s|c[jt]s|json|py|rs|go)):(\d+):(\d+)(?:\s*-\s*|\s+)(error|warning):\s*(.*)$/i;

const diffExpectedRe = /^\s*-\s*Expected(?:\s+-\s+\d+)?\s*$/i;
const diffReceivedRe = /^\s*\+\s*Received(?:\s+\+\s+\d+)?\s*$/i;
const diffLineMinusRe = /^\s*-\s+(.*)$/;
const diffLinePlusRe = /^\s*\+\s+(.*)$/;
const pytestExpectedActualRe = /^\s*E\s+assert\s+(.+?)\s*(==|!=|<|>|<=|>=|in|is)\s*(.+)$/;
const cargoLeftRightRe = /^\s*left:\s*(.+)$/;

export function demangleStack(stackTrace: string): StackFrame[] {
	const lines = stackTrace.split("\n");
	const frames: StackFrame[] = [];

	const nodeFrameRe = /^\s*at\s+(?:(.+?)\s+\((.+):(\d+):(\d+)\)|(.+):(\d+):(\d+))$/;
	const pyFrameRe = /^\s*File\s+"([^"]+)",\s+line\s+(\d+)(?:,\s+in\s+(.+))?$/;

	for (const line of lines) {
		const nodeMatch = nodeFrameRe.exec(line);
		if (nodeMatch) {
			const symbol = nodeMatch[1];
			const file = nodeMatch[2] || nodeMatch[5] || "";
			const lineNum = parseInt(nodeMatch[3] || nodeMatch[6] || "0", 10);
			const col = parseInt(nodeMatch[4] || nodeMatch[7] || "0", 10);

			const isInternal =
				file.includes("node_modules") ||
				file.includes("node:internal") ||
				file.startsWith("internal/");

			frames.push({
				file,
				line: lineNum,
				col,
				symbol,
				isUserCode: !isInternal && Boolean(file),
				raw: line.trim(),
			});
			continue;
		}

		const pyMatch = pyFrameRe.exec(line);
		if (pyMatch) {
			const file = pyMatch[1] || "";
			const lineNum = parseInt(pyMatch[2] || "0", 10);
			const symbol = pyMatch[3];
			const isInternal = file.includes("site-packages") || file.includes("/lib/python");

			frames.push({
				file,
				line: lineNum,
				symbol,
				isUserCode: !isInternal && Boolean(file),
				raw: line.trim(),
			});
		}
	}

	return frames;
}

/**
 * Backwards-compatible failure extractor returning clean TestFailure[] objects.
 */
export function extractFailures(output: string): TestFailure[] {
	const clean = stripAnsi(output).replace(/\r\n/g, "\n");
	const lines = clean.split("\n");
	const failures: TestFailure[] = [];
	const seen = new Set<string>();

	let currentFile: string | undefined;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i]!;

		const fileMatch = vitestFailFileRe.exec(line);
		if (fileMatch) {
			currentFile = fileMatch[1];
		}

		const pyMatch = pytestRe.exec(line);
		if (pyMatch) {
			const file = pyMatch[1];
			const testName = pyMatch[2];
			const message = pyMatch[3]?.trim();
			const key = `${file}::${testName}`;
			if (!seen.has(key)) {
				seen.add(key);
				const failure: TestFailure = { file, testName };
				if (message) failure.message = message;
				failures.push(failure);
			}
			continue;
		}

		const goMatch = goFailRe.exec(line);
		if (goMatch) {
			const testName = goMatch[1];
			let file: string | undefined;
			let message: string | undefined;
			if (i + 1 < lines.length) {
				const nextLine = lines[i + 1]!;
				const locMatch = /^\s*([^\s:]+\.go:\d+)(?::\s*(.*))?$/.exec(nextLine);
				if (locMatch) {
					file = locMatch[1];
					message = locMatch[2]?.trim();
				}
			}
			const key = `${file || ""}:${testName}`;
			if (!seen.has(key)) {
				seen.add(key);
				const failure: TestFailure = { file, testName };
				if (message) failure.message = message;
				failures.push(failure);
			}
			continue;
		}

		const cargoMatch = cargoFailRe.exec(line);
		if (cargoMatch) {
			const testName = cargoMatch[1];
			const key = `cargo:${testName}`;
			if (!seen.has(key)) {
				seen.add(key);
				failures.push({ testName });
			}
			continue;
		}

		const arrowMatch = vitestArrowRe.exec(line);
		if (arrowMatch) {
			const file = arrowMatch[1] || currentFile;
			const testName = arrowMatch[4]?.trim();
			if (testName && !testName.startsWith("FAIL") && !testName.includes("Error:") && !testName.includes("Test Files")) {
				const key = `${file || ""}:${testName}`;
				if (!seen.has(key)) {
					seen.add(key);
					failures.push({ file, testName });
				}
			}
			continue;
		}

		const jestMatch = jestBulletRe.exec(line);
		if (jestMatch) {
			const testName = jestMatch[1]?.trim();
			const key = `${currentFile || ""}:${testName}`;
			if (!seen.has(key)) {
				seen.add(key);
				failures.push({ file: currentFile, testName });
			}
			continue;
		}

		const crossMatch = crossRe.exec(line);
		if (crossMatch) {
			const testName = crossMatch[1]?.trim();
			if (
				testName &&
				!testName.includes("failed") &&
				!testName.includes("Tests ") &&
				!testName.includes("Test Files")
			) {
				const key = `${currentFile || ""}:${testName}`;
				if (!seen.has(key)) {
					seen.add(key);
					failures.push({ file: currentFile, testName });
				}
			}
			continue;
		}
	}

	return failures;
}

/**
 * Deep diagnostic extractor returning rich StructuredFailure[] with lines, cols, diffs, and stacks.
 */
export function extractStructuredFailures(output: string): StructuredFailure[] {
	const clean = stripAnsi(output).replace(/\r\n/g, "\n");
	const lines = clean.split("\n");
	const failures: StructuredFailure[] = [];
	const seen = new Set<string>();

	let currentFile: string | undefined;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i]!;

		const fileMatch = vitestFailFileRe.exec(line);
		if (fileMatch) {
			currentFile = fileMatch[1];
		}

		// TypeScript compile error
		const tsMatch = tsErrorRe.exec(line);
		if (tsMatch) {
			const file = tsMatch[1];
			const lineNum = parseInt(tsMatch[2] || tsMatch[4] || "0", 10);
			const col = tsMatch[3] ? parseInt(tsMatch[3], 10) : undefined;
			const code = tsMatch[5];
			const msg = tsMatch[6]?.trim();
			const key = `ts:${file}:${lineNum}:${code}`;
			if (!seen.has(key)) {
				seen.add(key);
				failures.push({
					file,
					line: lineNum,
					column: col,
					message: `[${code}] ${msg}`,
					category: "type",
					rawOutput: line,
				});
			}
			continue;
		}

		// Linter error
		const lintMatch = lintErrorRe.exec(line);
		if (lintMatch) {
			const file = lintMatch[1];
			const lineNum = parseInt(lintMatch[2] || "0", 10);
			const col = parseInt(lintMatch[3] || "0", 10);
			const msg = lintMatch[5]?.trim();
			const key = `lint:${file}:${lineNum}:${col}`;
			if (!seen.has(key)) {
				seen.add(key);
				failures.push({
					file,
					line: lineNum,
					column: col,
					message: msg,
					category: "syntax",
					rawOutput: line,
				});
			}
			continue;
		}

		// Pytest
		const pyMatch = pytestRe.exec(line);
		if (pyMatch) {
			const file = pyMatch[1];
			const testName = pyMatch[2];
			const message = pyMatch[3]?.trim();
			const key = `py:${file}::${testName}`;

			let diff: AssertionDiff | undefined;
			for (let j = i + 1; j < Math.min(i + 15, lines.length); j++) {
				const diffMatch = pytestExpectedActualRe.exec(lines[j]!);
				if (diffMatch) {
					diff = {
						actual: diffMatch[1]?.trim(),
						operator: diffMatch[2],
						expected: diffMatch[3]?.trim(),
					};
					break;
				}
			}

			if (!seen.has(key)) {
				seen.add(key);
				failures.push({
					file,
					testName,
					message,
					category: "assertion",
					diff,
					rawOutput: line,
				});
			}
			continue;
		}

		// Go test
		const goMatch = goFailRe.exec(line);
		if (goMatch) {
			const testName = goMatch[1];
			let file: string | undefined;
			let lineNum: number | undefined;
			let message: string | undefined;

			if (i + 1 < lines.length) {
				const locMatch = /^\s*([^\s:]+\.go):(\d+)(?::\s*(.*))?$/.exec(lines[i + 1]!);
				if (locMatch) {
					file = locMatch[1];
					lineNum = parseInt(locMatch[2] || "0", 10);
					message = locMatch[3]?.trim();
				}
			}

			const key = `go:${file || ""}:${testName}`;
			if (!seen.has(key)) {
				seen.add(key);
				failures.push({
					file,
					line: lineNum,
					testName,
					message,
					category: "assertion",
					rawOutput: line,
				});
			}
			continue;
		}

		// Cargo test
		const cargoMatch = cargoFailRe.exec(line);
		if (cargoMatch) {
			const testName = cargoMatch[1];
			let file: string | undefined;
			let lineNum: number | undefined;
			let col: number | undefined;
			let diff: AssertionDiff | undefined;

			for (let j = i + 1; j < Math.min(i + 25, lines.length); j++) {
				const locMatch = /^\s*location:\s*([^\s:]+\.rs):(\d+):(\d+)$/.exec(lines[j]!);
				if (locMatch) {
					file = locMatch[1];
					lineNum = parseInt(locMatch[2] || "0", 10);
					col = parseInt(locMatch[3] || "0", 10);
				}
				const leftMatch = cargoLeftRightRe.exec(lines[j]!);
				if (leftMatch && j + 1 < lines.length) {
					const rightMatch = /^\s*right:\s*(.+)$/.exec(lines[j + 1]!);
					if (rightMatch) {
						diff = {
							actual: leftMatch[1]?.trim(),
							expected: rightMatch[1]?.trim(),
						};
					}
				}
			}

			const key = `cargo:${testName}`;
			if (!seen.has(key)) {
				seen.add(key);
				failures.push({
					file,
					line: lineNum,
					column: col,
					testName,
					category: "assertion",
					diff,
					rawOutput: line,
				});
			}
			continue;
		}

		// Vitest arrow
		const arrowMatch = vitestArrowRe.exec(line);
		if (arrowMatch) {
			const file = arrowMatch[1] || currentFile;
			const lineNum = arrowMatch[2] ? parseInt(arrowMatch[2], 10) : undefined;
			const col = arrowMatch[3] ? parseInt(arrowMatch[3], 10) : undefined;
			const rawTest = (arrowMatch[4] || "").trim();

			if (
				rawTest &&
				!rawTest.startsWith("FAIL") &&
				!rawTest.includes("Error:") &&
				!rawTest.includes("Test Files ")
			) {
				const key = `vitest:${file || ""}:${rawTest}`;
				if (!seen.has(key)) {
					seen.add(key);
					const diff = extractVitestDiff(lines, i);
					failures.push({
						file,
						line: lineNum,
						column: col,
						testName: rawTest,
						category: "assertion",
						diff,
						rawOutput: line,
					});
				}
			}
			continue;
		}

		// Jest bullet
		const jestMatch = jestBulletRe.exec(line);
		if (jestMatch) {
			const rawTest = jestMatch[1]?.trim();
			if (rawTest && !rawTest.includes("failed") && !rawTest.includes("Tests ")) {
				const key = `jest:${currentFile || ""}:${rawTest}`;
				if (!seen.has(key)) {
					seen.add(key);
					const diff = extractVitestDiff(lines, i);
					failures.push({
						file: currentFile,
						testName: rawTest,
						category: "assertion",
						diff,
						rawOutput: line,
					});
				}
			}
			continue;
		}
	}

	return failures;
}

function extractVitestDiff(lines: string[], startIndex: number): AssertionDiff | undefined {
	let expected: string | undefined;
	let actual: string | undefined;

	for (let j = startIndex; j < Math.min(startIndex + 30, lines.length); j++) {
		const line = lines[j]!;
		const expDirect = /^\s*Expected:\s*(.*)$/.exec(line);
		if (expDirect) expected = expDirect[1]?.trim();

		const recDirect = /^\s*Received:\s*(.*)$/.exec(line);
		if (recDirect) actual = recDirect[1]?.trim();

		const minusMatch = diffLineMinusRe.exec(line);
		if (minusMatch && !diffExpectedRe.test(line)) {
			if (!expected) expected = minusMatch[1]?.trim();
		}

		const plusMatch = diffLinePlusRe.exec(line);
		if (plusMatch && !diffReceivedRe.test(line)) {
			if (!actual) actual = plusMatch[1]?.trim();
		}

		if (expected && actual) break;
	}

	if (expected || actual) {
		return { expected, actual };
	}
	return undefined;
}

export function formatFailureSummary(rawOutput: string): string {
	const trimmed = rawOutput.replace(/\r\n/g, "\n").trim();
	if (!trimmed) return "";
	if (trimmed.startsWith("Failed tests (")) return trimmed;

	const failures = extractFailures(trimmed);
	const rawTail = tail(trimmed);

	if (failures.length === 0) {
		return rawTail;
	}

	const headerLines = [
		`Failed tests (${failures.length}):`,
		...failures.map((f) => {
			if (f.file && f.testName) return `  - ${f.file}: ${f.testName}`;
			if (f.file) return `  - ${f.file}`;
			return `  - ${f.testName ?? "unknown test"}`;
		}),
		"",
		"--- Output tail ---",
		rawTail,
	];

	return headerLines.join("\n");
}
