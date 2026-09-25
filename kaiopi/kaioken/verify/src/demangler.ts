import { stripAnsi } from "./streaming.ts";
import type {
	AssertionDiff,
	DemangledFrame,
	DemangledTrace,
	DemangleFormatOptions,
	VerifySuiteType,
} from "./types.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function cleanLines(output: string): string[] {
	return stripAnsi(output)
		.replace(/\r\n/g, "\n")
		.split("\n")
		.map((l) => l.trimEnd());
}

// ---------------------------------------------------------------------------
// 1. Node.js Demangler (UX-1061)
// ---------------------------------------------------------------------------
export function demangleNodeJsStack(output: string): DemangledTrace {
	const lines = cleanLines(output);
	const userFrames: DemangledFrame[] = [];
	let filteredFramesCount = 0;
	let cleanMessage = "";
	let targetFile: string | undefined;
	let targetLine: number | undefined;
	let targetCol: number | undefined;

	const nodeFrameRe = /^\s*at\s+(?:(.+?)\s+\((.+):(\d+):(\d+)\)|(.+):(\d+):(\d+))$/;
	const errorHeadRe = /^(?:[A-Za-z_$][\w$]*Error|Error|AssertionError):\s*(.*)$/;

	for (const line of lines) {
		const errMatch = errorHeadRe.exec(line.trim());
		if (errMatch && !cleanMessage) {
			cleanMessage = line.trim();
			continue;
		}

		const match = nodeFrameRe.exec(line);
		if (match) {
			const symbol = match[1];
			const file = match[2] || match[5] || "";
			const lineNum = parseInt(match[3] || match[6] || "0", 10);
			const col = parseInt(match[4] || match[7] || "0", 10);

			const isInternal =
				file.includes("node_modules") ||
				file.includes(".pnpm/") ||
				file.includes("node:internal") ||
				file.startsWith("internal/") ||
				file.includes("bun:jsc") ||
				file.includes("bun:main");

			if (isInternal) {
				filteredFramesCount++;
			} else if (file) {
				if (!targetFile) {
					targetFile = file;
					targetLine = lineNum;
					targetCol = col;
				}
				userFrames.push({
					file,
					line: lineNum,
					col,
					symbol: symbol?.trim(),
					isUserCode: true,
					raw: line.trim(),
				});
			}
		}
	}

	if (!cleanMessage) {
		const firstNonEmpty = lines.find((l) => l.trim().length > 0) || "Node.js suite failure";
		cleanMessage = firstNonEmpty.trim();
	}

	const summaryLine = targetFile
		? `Node.js Failure: ${cleanMessage} at ${targetFile}:${targetLine || 1}`
		: `Node.js Failure: ${cleanMessage}`;

	return {
		suite: "nodejs",
		originalOutput: output,
		cleanMessage,
		targetFile,
		line: targetLine,
		col: targetCol,
		userFrames,
		filteredFramesCount,
		summaryLine,
	};
}

// ---------------------------------------------------------------------------
// 2. Python Demangler (UX-1062)
// ---------------------------------------------------------------------------
export function demanglePythonStack(output: string): DemangledTrace {
	const lines = cleanLines(output);
	const userFrames: DemangledFrame[] = [];
	let filteredFramesCount = 0;
	let cleanMessage = "";
	let targetFile: string | undefined;
	let targetLine: number | undefined;
	let diffSnippet: AssertionDiff | undefined;

	const pyFrameRe = /^\s*File\s+"([^"]+)",\s+line\s+(\d+)(?:,\s+in\s+(.+))?$/;
	const pytestFailRe = /^FAILED\s+([^:\s]+)::(\S+)(?:\s+-\s+(.*))?$/;
	const pyAssertRe = /^\s*E\s+(?:assert\s+(.+?)\s*(==|!=|<|>|<=|>=|in|is)\s*(.+)|(.*))$/;

	for (const line of lines) {
		const failMatch = pytestFailRe.exec(line.trim());
		if (failMatch) {
			targetFile = failMatch[1];
			cleanMessage = failMatch[3] || `Failed test ${failMatch[2]}`;
		}

		const assertMatch = pyAssertRe.exec(line);
		if (assertMatch) {
			if (assertMatch[1] && assertMatch[2] && assertMatch[3]) {
				diffSnippet = {
					expected: assertMatch[3].trim(),
					actual: assertMatch[1].trim(),
					operator: assertMatch[2].trim(),
				};
				if (!cleanMessage) {
					cleanMessage = `Assertion failed: ${assertMatch[1].trim()} ${assertMatch[2]} ${assertMatch[3].trim()}`;
				}
			} else if (assertMatch[4] && !cleanMessage) {
				cleanMessage = assertMatch[4].trim();
			}
		}

		const frameMatch = pyFrameRe.exec(line);
		if (frameMatch) {
			const file = frameMatch[1] || "";
			const lineNum = parseInt(frameMatch[2] || "0", 10);
			const symbol = frameMatch[3];

			const isInternal =
				file.includes("site-packages") ||
				file.includes("/lib/python") ||
				file.includes("\\lib\\python") ||
				file.includes("_pytest") ||
				file.includes("pluggy");

			if (isInternal) {
				filteredFramesCount++;
			} else if (file) {
				if (!targetFile) targetFile = file;
				if (!targetLine) targetLine = lineNum;
				userFrames.push({
					file,
					line: lineNum,
					symbol: symbol?.trim(),
					isUserCode: true,
					raw: line.trim(),
				});
			}
		}
	}

	if (!cleanMessage) cleanMessage = "Python test failure";
	const summaryLine = targetFile
		? `Python Failure: ${cleanMessage} at ${targetFile}:${targetLine || 1}`
		: `Python Failure: ${cleanMessage}`;

	return {
		suite: "python",
		originalOutput: output,
		cleanMessage,
		targetFile,
		line: targetLine,
		diffSnippet,
		userFrames,
		filteredFramesCount,
		summaryLine,
	};
}

// ---------------------------------------------------------------------------
// 3. Go Demangler (UX-1063)
// ---------------------------------------------------------------------------
export function demangleGoStack(output: string): DemangledTrace {
	const lines = cleanLines(output);
	const userFrames: DemangledFrame[] = [];
	let filteredFramesCount = 0;
	let cleanMessage = "";
	let targetFile: string | undefined;
	let targetLine: number | undefined;

	const goFailRe = /^---\s*FAIL:\s*([^\s(]+)(?:\s+\(([^)]+)\))?/;
	const goLineRe = /^\s*([^\s:]+\.go):(\d+):\s*(.*)$/;
	const goRuntimeRe = /runtime\/|testing(?:\.go|\/)/;

	for (const line of lines) {
		const failMatch = goFailRe.exec(line.trim());
		if (failMatch && !cleanMessage) {
			cleanMessage = `Failed ${failMatch[1]}`;
		}

		const lineMatch = goLineRe.exec(line);
		if (lineMatch) {
			const file = lineMatch[1]!;
			const lineNum = parseInt(lineMatch[2]!, 10);
			const msg = lineMatch[3]!;

			if (goRuntimeRe.test(file)) {
				filteredFramesCount++;
			} else {
				if (!targetFile) {
					targetFile = file;
					targetLine = lineNum;
					if (msg) cleanMessage = msg;
				}
				userFrames.push({
					file,
					line: lineNum,
					symbol: cleanMessage,
					isUserCode: true,
					raw: line.trim(),
				});
			}
		}
	}

	if (!cleanMessage) cleanMessage = "Go test failure";
	const summaryLine = targetFile
		? `Go Failure: ${cleanMessage} at ${targetFile}:${targetLine || 1}`
		: `Go Failure: ${cleanMessage}`;

	return {
		suite: "go",
		originalOutput: output,
		cleanMessage,
		targetFile,
		line: targetLine,
		userFrames,
		filteredFramesCount,
		summaryLine,
	};
}

// ---------------------------------------------------------------------------
// 4. Rust Demangler (UX-1064)
// ---------------------------------------------------------------------------
export function demangleRustStack(output: string): DemangledTrace {
	const lines = cleanLines(output);
	const userFrames: DemangledFrame[] = [];
	let filteredFramesCount = 0;
	let cleanMessage = "";
	let targetFile: string | undefined;
	let targetLine: number | undefined;
	let diffSnippet: AssertionDiff | undefined;

	const cargoFailRe = /^test\s+([^\s]+)\s+\.\.\.\s+FAILED/;
	const panicRe = /thread\s+'[^']+'\s+panicked\s+at\s+'([^']+)',\s+([^:]+):(\d+):(\d+)/;
	const panicAltRe = /panicked at\s+([^:]+):(\d+):(\d+):\s*(.*)/;
	const leftRe = /^\s*left:\s*`?([^`]+)`?,?$/;
	const rightRe = /^\s*right:\s*`?([^`]+)`?,?$/;
	const rustFrameRe = /^\s*\d+:\s*(?:0x[0-9a-f]+\s+-\s+)?([^\n]+)$/;
	const rustSourceLineRe = /^\s*at\s+([^:]+):(\d+)(?::(\d+))?$/;

	let pendingLeft: string | undefined;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i]!;

		const failMatch = cargoFailRe.exec(line.trim());
		if (failMatch && !cleanMessage) {
			cleanMessage = `Test ${failMatch[1]} failed`;
		}

		const pMatch = panicRe.exec(line);
		if (pMatch) {
			cleanMessage = pMatch[1]!;
			targetFile = pMatch[2];
			targetLine = parseInt(pMatch[3]!, 10);
		}

		const pAltMatch = panicAltRe.exec(line);
		if (pAltMatch && !targetFile) {
			targetFile = pAltMatch[1];
			targetLine = parseInt(pAltMatch[2]!, 10);
			if (pAltMatch[4]) cleanMessage = pAltMatch[4].trim();
		}

		const lMatch = leftRe.exec(line);
		if (lMatch) pendingLeft = lMatch[1]!.trim();
		const rMatch = rightRe.exec(line);
		if (rMatch && pendingLeft) {
			diffSnippet = {
				expected: rMatch[1]!.trim(),
				actual: pendingLeft,
				operator: "==",
			};
		}

		const frameMatch = rustFrameRe.exec(line);
		if (frameMatch) {
			let rawSymbol = frameMatch[1]!.trim();
			// Demangle hash like ::h12345678abcdef0 or ::h4c59a35e7df
			rawSymbol = rawSymbol.replace(/::h[0-9a-f]{8,16}$/i, "");

			const isInternal =
				rawSymbol.startsWith("std::") ||
				rawSymbol.startsWith("core::") ||
				rawSymbol.startsWith("alloc::") ||
				rawSymbol.startsWith("rustc_");

			if (isInternal) {
				filteredFramesCount++;
			} else if (i + 1 < lines.length) {
				const nextLine = lines[i + 1]!;
				const sourceMatch = rustSourceLineRe.exec(nextLine);
				if (sourceMatch) {
					const file = sourceMatch[1]!;
					const lineNum = parseInt(sourceMatch[2]!, 10);
					const col = sourceMatch[3] ? parseInt(sourceMatch[3], 10) : undefined;

					if (!targetFile && !file.includes(".cargo")) {
						targetFile = file;
						targetLine = lineNum;
					}

					userFrames.push({
						file,
						line: lineNum,
						col,
						symbol: rawSymbol,
						isUserCode: !file.includes(".cargo"),
						raw: `${rawSymbol} at ${file}:${lineNum}`,
					});
				}
			}
		}
	}

	if (!cleanMessage) cleanMessage = "Rust cargo test failure";
	const summaryLine = targetFile
		? `Rust Failure: ${cleanMessage} at ${targetFile}:${targetLine || 1}`
		: `Rust Failure: ${cleanMessage}`;

	return {
		suite: "rust",
		originalOutput: output,
		cleanMessage,
		targetFile,
		line: targetLine,
		diffSnippet,
		userFrames,
		filteredFramesCount,
		summaryLine,
	};
}

// ---------------------------------------------------------------------------
// 5. Deno Demangler (UX-1065)
// ---------------------------------------------------------------------------
export function demangleDenoStack(output: string): DemangledTrace {
	const lines = cleanLines(output);
	const userFrames: DemangledFrame[] = [];
	let filteredFramesCount = 0;
	let cleanMessage = "";
	let targetFile: string | undefined;
	let targetLine: number | undefined;
	let targetCol: number | undefined;

	const permDeniedRe = /PermissionDenied:\s*(Requires\s+[^,\n]+(?:,\s*run\s+again\s+with\s+([^\n.]+))?)/i;
	const denoFrameRe = /^\s*at\s+(?:(.+?)\s+\((.+):(\d+):(\d+)\)|(.+):(\d+):(\d+))$/;

	for (const line of lines) {
		const permMatch = permDeniedRe.exec(line);
		if (permMatch && !cleanMessage) {
			cleanMessage = `PermissionDenied: ${permMatch[1]}`;
			if (permMatch[2]) {
				cleanMessage += ` (Run with ${permMatch[2]})`;
			}
		}

		const frameMatch = denoFrameRe.exec(line);
		if (frameMatch) {
			const symbol = frameMatch[1];
			const file = frameMatch[2] || frameMatch[5] || "";
			const lineNum = parseInt(frameMatch[3] || frameMatch[6] || "0", 10);
			const col = parseInt(frameMatch[4] || frameMatch[7] || "0", 10);

			const isInternal =
				file.startsWith("ext:") ||
				file.startsWith("deno:") ||
				file.includes("deno_core");

			if (isInternal) {
				filteredFramesCount++;
			} else if (file) {
				if (!targetFile) {
					targetFile = file;
					targetLine = lineNum;
					targetCol = col;
				}
				userFrames.push({
					file,
					line: lineNum,
					col,
					symbol: symbol?.trim(),
					isUserCode: true,
					raw: line.trim(),
				});
			}
		}
	}

	if (!cleanMessage) {
		const firstNonEmpty = lines.find((l) => l.trim().length > 0) || "Deno test failure";
		cleanMessage = firstNonEmpty.trim();
	}

	const summaryLine = targetFile
		? `Deno Failure: ${cleanMessage} at ${targetFile}:${targetLine || 1}`
		: `Deno Failure: ${cleanMessage}`;

	return {
		suite: "deno",
		originalOutput: output,
		cleanMessage,
		targetFile,
		line: targetLine,
		col: targetCol,
		userFrames,
		filteredFramesCount,
		summaryLine,
	};
}

// ---------------------------------------------------------------------------
// 6. Make Demangler (UX-1066)
// ---------------------------------------------------------------------------
export function demangleMakeStack(output: string): DemangledTrace {
	const lines = cleanLines(output);
	const userFrames: DemangledFrame[] = [];
	let filteredFramesCount = 0;
	let cleanMessage = "";
	let targetFile: string | undefined;
	let targetLine: number | undefined;

	const makeNoiseRe = /^make(?:\[\d+\])?:\s*(?:Entering|Leaving)\s+directory/;
	const makeErrorRe = /^make(?:\[\d+\])?:\s*\*\*\*\s*\[([^\]]+)\]\s*Error\s*(\d+)/;
	const makefileLineRe = /^([^:\s]+):(\d+):\s*(.*)$/;

	const relevantOutputLines: string[] = [];

	for (const line of lines) {
		if (makeNoiseRe.test(line.trim())) {
			filteredFramesCount++;
			continue;
		}

		const makeErr = makeErrorRe.exec(line.trim());
		if (makeErr) {
			if (!cleanMessage) cleanMessage = `Target '${makeErr[1]}' failed with exit code ${makeErr[2]}`;
			filteredFramesCount++;
			continue;
		}

		const lineMatch = makefileLineRe.exec(line.trim());
		if (lineMatch) {
			const file = lineMatch[1]!;
			const lineNum = parseInt(lineMatch[2]!, 10);
			const msg = lineMatch[3]!;

			if (!targetFile && (file.toLowerCase().includes("makefile") || file.endsWith(".mk") || file.endsWith(".c") || file.endsWith(".ts"))) {
				targetFile = file;
				targetLine = lineNum;
				if (msg) cleanMessage = msg;
			}

			userFrames.push({
				file,
				line: lineNum,
				symbol: msg,
				isUserCode: true,
				raw: line.trim(),
			});
		} else if (line.trim()) {
			relevantOutputLines.push(line.trim());
		}
	}

	if (!cleanMessage && relevantOutputLines.length > 0) {
		cleanMessage = relevantOutputLines[relevantOutputLines.length - 1]!;
	}
	if (!cleanMessage) cleanMessage = "Make target execution failure";

	const summaryLine = targetFile
		? `Make Failure: ${cleanMessage} at ${targetFile}:${targetLine || 1}`
		: `Make Failure: ${cleanMessage}`;

	return {
		suite: "make",
		originalOutput: output,
		cleanMessage,
		targetFile,
		line: targetLine,
		userFrames,
		filteredFramesCount,
		summaryLine,
	};
}

// ---------------------------------------------------------------------------
// 7. Snapshots Demangler (UX-1067)
// ---------------------------------------------------------------------------
export function demangleSnapshotStack(output: string): DemangledTrace {
	const lines = cleanLines(output);
	const userFrames: DemangledFrame[] = [];
	let filteredFramesCount = 0;
	let cleanMessage = "";
	let targetFile: string | undefined;
	let targetLine: number | undefined;
	let diffSnippet: AssertionDiff | undefined;

	const snapshotNameRe = /(?:Snapshot|Snapshot name):\s*`?([^`\n]+)`?/i;
	const diffExpRe = /^\s*-\s*Snapshot(?:\s+-\s+\d+)?\s*$/i;
	const diffRecRe = /^\s*\+\s*Received(?:\s+\+\s+\d+)?\s*$/i;
	const lineMinus = /^\s*-\s+(.*)$/;
	const linePlus = /^\s*\+\s+(.*)$/;
	const vitestSnapFileRe = /^\s*(?:FAIL|at)\s+([^\s:]+\.(?:test|spec)\.[jt]sx?)(?::(\d+))?/;

	let inDiff = false;
	const expectedLines: string[] = [];
	const receivedLines: string[] = [];

	for (const line of lines) {
		const nameMatch = snapshotNameRe.exec(line);
		if (nameMatch && !cleanMessage) {
			cleanMessage = `Snapshot mismatch: "${nameMatch[1]}"`;
		}

		const fileMatch = vitestSnapFileRe.exec(line);
		if (fileMatch) {
			if (!targetFile) targetFile = fileMatch[1];
			if (fileMatch[2]) targetLine = parseInt(fileMatch[2], 10);
			if (
				!userFrames.some(
					(f) =>
						f.file === fileMatch[1] &&
						f.line === (fileMatch[2] ? parseInt(fileMatch[2], 10) : 1),
				)
			) {
				userFrames.push({
					file: fileMatch[1]!,
					line: fileMatch[2] ? parseInt(fileMatch[2], 10) : 1,
					isUserCode: true,
					raw: line.trim(),
				});
			}
		}

		if (diffExpRe.test(line) || diffRecRe.test(line)) {
			inDiff = true;
			continue;
		}

		if (inDiff) {
			const mMinus = lineMinus.exec(line);
			if (mMinus) {
				expectedLines.push(mMinus[1]!);
				continue;
			}
			const mPlus = linePlus.exec(line);
			if (mPlus) {
				receivedLines.push(mPlus[1]!);
				continue;
			}
			if (line.trim().startsWith("at ")) {
				inDiff = false;
			}
		}
	}

	if (expectedLines.length > 0 || receivedLines.length > 0) {
		diffSnippet = {
			expected: expectedLines.join("\n"),
			actual: receivedLines.join("\n"),
			operator: "snapshot_match",
		};
	}

	if (!cleanMessage) cleanMessage = "Snapshot assertion mismatch (use -u to update if intentional)";
	const summaryLine = targetFile
		? `Snapshot Failure: ${cleanMessage} in ${targetFile}`
		: `Snapshot Failure: ${cleanMessage}`;

	return {
		suite: "snapshots",
		originalOutput: output,
		cleanMessage,
		targetFile,
		line: targetLine,
		diffSnippet,
		userFrames,
		filteredFramesCount,
		summaryLine,
	};
}

// ---------------------------------------------------------------------------
// 8. TypeScript Demangler (UX-1068)
// ---------------------------------------------------------------------------
export function demangleTypeScriptStack(output: string): DemangledTrace {
	const lines = cleanLines(output);
	const userFrames: DemangledFrame[] = [];
	let filteredFramesCount = 0;
	let cleanMessage = "";
	let targetFile: string | undefined;
	let targetLine: number | undefined;
	let targetCol: number | undefined;
	let ruleOrCode: string | undefined;

	const tsErrorRe =
		/^\s*([^\s()]+\.(?:[jt]sx?|m[jt]s|c[jt]s|d\.ts))\s*\((?:(\d+),(\d+)|(\d+))\):\s*error\s*(TS\d+):\s*(.*)$/;

	const seenFiles = new Set<string>();

	for (const line of lines) {
		const match = tsErrorRe.exec(line);
		if (match) {
			const file = match[1]!;
			const lineNum = parseInt(match[2] || match[4] || "1", 10);
			const col = match[3] ? parseInt(match[3], 10) : undefined;
			const code = match[5]!;
			const msg = match[6]!;

			if (!cleanMessage) {
				cleanMessage = msg;
				targetFile = file;
				targetLine = lineNum;
				targetCol = col;
				ruleOrCode = code;
			}

			if (seenFiles.has(file)) {
				// Count secondary errors in same file as filtered cascade frames
				filteredFramesCount++;
			} else {
				seenFiles.add(file);
				userFrames.push({
					file,
					line: lineNum,
					col,
					symbol: `${code}: ${msg}`,
					isUserCode: true,
					raw: line.trim(),
				});
			}
		}
	}

	if (!cleanMessage) cleanMessage = "TypeScript compiler diagnostic error";
	const summaryLine = targetFile
		? `TypeScript [${ruleOrCode || "TS Error"}]: ${cleanMessage} at ${targetFile}:${targetLine || 1}`
		: `TypeScript Error: ${cleanMessage}`;

	return {
		suite: "typescript",
		originalOutput: output,
		cleanMessage,
		targetFile,
		line: targetLine,
		col: targetCol,
		ruleOrCode,
		userFrames,
		filteredFramesCount,
		summaryLine,
	};
}

// ---------------------------------------------------------------------------
// 9. Lint Demangler (UX-1069)
// ---------------------------------------------------------------------------
export function demangleLintStack(output: string): DemangledTrace {
	const lines = cleanLines(output);
	const userFrames: DemangledFrame[] = [];
	let filteredFramesCount = 0;
	let cleanMessage = "";
	let targetFile: string | undefined;
	let targetLine: number | undefined;
	let targetCol: number | undefined;
	let ruleOrCode: string | undefined;
	let isAutoFixable = false;

	const lintLineRe =
		/^\s*([^\s:]+\.(?:[jt]sx?|m[jt]s|c[jt]s|json|py|rs|go)):(\d+):(\d+)(?:\s*-\s*|\s+)(error|warning):\s*(.*?)(?:\s+\[([^\]]+)\]|\s+\(([^)]+)\))?$/i;
	const fixableCheckRe = /potentially fixable with the `--fix` option|\[fixable\]|auto-fixable/i;

	for (const line of lines) {
		if (fixableCheckRe.test(line)) {
			isAutoFixable = true;
		}

		const match = lintLineRe.exec(line);
		if (match) {
			const file = match[1]!;
			const lineNum = parseInt(match[2]!, 10);
			const col = parseInt(match[3]!, 10);
			const severity = match[4]!.toLowerCase();
			const msg = match[5]!;
			const rule = match[6] || match[7] || "style";

			if (severity === "warning" && cleanMessage) {
				filteredFramesCount++;
				continue;
			}

			if (!cleanMessage) {
				cleanMessage = msg;
				targetFile = file;
				targetLine = lineNum;
				targetCol = col;
				ruleOrCode = rule;
			}

			userFrames.push({
				file,
				line: lineNum,
				col,
				symbol: `${rule} (${severity})`,
				isUserCode: true,
				raw: line.trim(),
			});
		}
	}

	if (!cleanMessage) cleanMessage = "Code lint/formatting violation";
	const summaryLine = targetFile
		? `Lint [${ruleOrCode || "Rule"}]: ${cleanMessage} at ${targetFile}:${targetLine || 1}${isAutoFixable ? " [auto-fixable]" : ""}`
		: `Lint Error: ${cleanMessage}`;

	return {
		suite: "lint",
		originalOutput: output,
		cleanMessage,
		targetFile,
		line: targetLine,
		col: targetCol,
		ruleOrCode,
		isAutoFixable,
		userFrames,
		filteredFramesCount,
		summaryLine,
	};
}

// ---------------------------------------------------------------------------
// 10. E2E Demangler (UX-1070)
// ---------------------------------------------------------------------------
export function demangleE2EStack(output: string): DemangledTrace {
	const lines = cleanLines(output);
	const userFrames: DemangledFrame[] = [];
	const artifactPaths: string[] = [];
	let filteredFramesCount = 0;
	let cleanMessage = "";
	let targetFile: string | undefined;
	let targetLine: number | undefined;

	const pwTimeoutRe = /Timeout\s+(\d+ms)\s+exceeded/i;
	const pwLocatorRe = /waiting for locator\(`([^`]+)`\)/i;
	const pwErrorRe = /Error:\s*(.*)/;
	const e2eFrameRe = /^\s*at\s+(?:(.+?)\s+\((.+):(\d+):(\d+)\)|(.+):(\d+):(\d+))$/;
	const artifactRe = /(?:screenshot|video|trace|attachment|artifact):\s*([^\s]+\.(?:png|webm|zip|log))/i;

	for (const line of lines) {
		const artMatch = artifactRe.exec(line);
		if (artMatch) {
			artifactPaths.push(artMatch[1]!);
		}

		const timeoutMatch = pwTimeoutRe.exec(line);
		if (timeoutMatch && !cleanMessage) {
			cleanMessage = `E2E Timeout: ${timeoutMatch[0]}`;
		}

		const locatorMatch = pwLocatorRe.exec(line);
		if (locatorMatch && cleanMessage) {
			cleanMessage += ` while waiting for locator "${locatorMatch[1]}"`;
		}

		const errMatch = pwErrorRe.exec(line);
		if (errMatch && !cleanMessage) {
			cleanMessage = errMatch[1]!;
		}

		const frameMatch = e2eFrameRe.exec(line);
		if (frameMatch) {
			const symbol = frameMatch[1];
			const file = frameMatch[2] || frameMatch[5] || "";
			const lineNum = parseInt(frameMatch[3] || frameMatch[6] || "0", 10);
			const col = parseInt(frameMatch[4] || frameMatch[7] || "0", 10);

			const isInternal =
				file.includes("node_modules") ||
				file.includes("playwright") ||
				file.includes("cypress") ||
				file.includes("puppeteer") ||
				file.includes("protocol") ||
				file.includes("connection");

			if (isInternal) {
				filteredFramesCount++;
			} else if (file) {
				if (!targetFile) {
					targetFile = file;
					targetLine = lineNum;
				}
				userFrames.push({
					file,
					line: lineNum,
					col,
					symbol: symbol?.trim(),
					isUserCode: true,
					raw: line.trim(),
				});
			}
		}
	}

	if (!cleanMessage) cleanMessage = "E2E integration test suite failure";
	const summaryLine = targetFile
		? `E2E Failure: ${cleanMessage} at ${targetFile}:${targetLine || 1}`
		: `E2E Failure: ${cleanMessage}`;

	return {
		suite: "e2e",
		originalOutput: output,
		cleanMessage,
		targetFile,
		line: targetLine,
		artifactPaths: artifactPaths.length > 0 ? artifactPaths : undefined,
		userFrames,
		filteredFramesCount,
		summaryLine,
	};
}

// ---------------------------------------------------------------------------
// Unified Dispatcher
// ---------------------------------------------------------------------------
export function demangleSuiteStack(output: string, suite: VerifySuiteType): DemangledTrace {
	switch (suite) {
		case "nodejs":
			return demangleNodeJsStack(output);
		case "python":
			return demanglePythonStack(output);
		case "go":
			return demangleGoStack(output);
		case "rust":
			return demangleRustStack(output);
		case "deno":
			return demangleDenoStack(output);
		case "make":
			return demangleMakeStack(output);
		case "snapshots":
			return demangleSnapshotStack(output);
		case "typescript":
			return demangleTypeScriptStack(output);
		case "lint":
			return demangleLintStack(output);
		case "e2e":
			return demangleE2EStack(output);
	}
}

// ---------------------------------------------------------------------------
// Terminal Formatter
// ---------------------------------------------------------------------------
export function formatDemangledTraceTerminal(
	trace: DemangledTrace,
	options: DemangleFormatOptions = {},
): string {
	const maxFrames = options.maxFrames ?? 3;
	const parts: string[] = [];

	parts.push(`✖ [${trace.suite.toUpperCase()}] ${trace.summaryLine}`);

	if (trace.ruleOrCode) {
		parts.push(`  Code / Rule: ${trace.ruleOrCode}`);
	}

	if (trace.diffSnippet && (options.showDiff ?? true)) {
		parts.push(`  Diff:`);
		if (trace.diffSnippet.expected !== undefined) {
			parts.push(`    - Expected: ${trace.diffSnippet.expected}`);
		}
		if (trace.diffSnippet.actual !== undefined) {
			parts.push(`    + Received: ${trace.diffSnippet.actual}`);
		}
	}

	if (trace.artifactPaths && trace.artifactPaths.length > 0) {
		parts.push(`  Artifacts: ${trace.artifactPaths.join(", ")}`);
	}

	if (trace.userFrames.length > 0) {
		parts.push(`  User Frames:`);
		const framesToShow = trace.userFrames.slice(0, maxFrames);
		for (const f of framesToShow) {
			parts.push(`    → ${f.file}:${f.line}${f.symbol ? ` in ${f.symbol}` : ""}`);
		}
	}

	if (trace.filteredFramesCount > 0) {
		parts.push(`  (${trace.filteredFramesCount} noisy internal framework frames filtered)`);
	}

	return parts.join("\n");
}
