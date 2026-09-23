import { describe, expect, it } from "vitest";
import { computeLineDiff, formatUnifiedDiff } from "../src/diff.ts";
import {
	generateDriftMarkdownReport,
	inspectDocumentDrift,
	renderTerminalDrift,
} from "../src/inspector.ts";
import type { Provenance, StalenessReport } from "../src/types.ts";

describe("Pure TS Diff Engine & DriftInspector", () => {
	it("computes unified diff between two text versions without external git", () => {
		const oldText = `line 1\nline 2\nline 3\nline 4\n`;
		const newText = `line 1\nline 2 modified\nline 3\nline 4\nline 5\n`;

		const hunks = computeLineDiff(oldText, newText);
		expect(hunks.length).toBeGreaterThan(0);

		const patch = formatUnifiedDiff("test.ts", hunks);
		expect(patch).toContain("--- a/test.ts");
		expect(patch).toContain("+++ b/test.ts");
		expect(patch).toContain("-line 2");
		expect(patch).toContain("+line 2 modified");
		expect(patch).toContain("+line 5");
	});

	it("returns empty hunks for identical content", () => {
		const text = `const x = 1;\nconst y = 2;\n`;
		const hunks = computeLineDiff(text, text);
		expect(hunks).toEqual([]);
	});

	it("inspects drift on symbol-bound provenance and detects signature changes", () => {
		const doc: Provenance = {
			document: "wiki/arch.md",
			generatedAt: "2026-01-01",
			sources: [
				{
					path: "src/calc.ts",
					hash: "old-hash",
					symbol: "add",
					startLine: 1,
					endLine: 3,
				},
			],
		};

		const oldContent = "export function add(a: number): number {\n    return a;\n}\n";
		const newContent = "export function add(a: number, b: number): number {\n    return a + b;\n}\n";

		const report = inspectDocumentDrift(
			doc,
			() => oldContent,
			() => newContent,
		);

		expect(report.freshness).toBe("stale");
		expect(report.changedSources).toHaveLength(1);
		expect(report.changedSources[0]?.driftKind).toBe("signature_changed");
		expect(report.changedSources[0]?.additions).toBeGreaterThan(0);
		expect(report.changedSources[0]?.deletions).toBeGreaterThan(0);
	});

	it("identifies deleted source file as source_deleted", () => {
		const doc: Provenance = {
			document: "card:legacy",
			generatedAt: "",
			sources: [{ path: "src/old.ts", hash: "123" }],
		};

		const report = inspectDocumentDrift(
			doc,
			() => "export const old = true;\n",
			() => null, // File deleted
		);

		expect(report.freshness).toBe("orphaned");
		expect(report.changedSources[0]?.driftKind).toBe("source_deleted");
	});

	it("generates markdown compliance audit reports", () => {
		const stalenessReport: StalenessReport = {
			ok: false,
			freshness: 0.5,
			changedFiles: ["src/api.ts"],
			deletedFiles: [],
			undocumentedFiles: [],
			documents: [
				{
					document: "wiki/api.md",
					freshness: "stale",
					changed: ["src/api.ts"],
					deleted: [],
					unchanged: [],
					generatedAt: "",
				},
			],
			current: [],
			stale: [
				{
					document: "wiki/api.md",
					freshness: "stale",
					changed: ["src/api.ts"],
					deleted: [],
					unchanged: [],
					generatedAt: "",
				},
			],
			orphaned: [],
		};

		const md = generateDriftMarkdownReport(stalenessReport);
		expect(md).toContain("# Documentation Drift & Staleness Compliance Report");
		expect(md).toContain("| `wiki/api.md` | **STALE** |");
		expect(md).toContain("## Stale Documents & Invalidating Diffs");
	});

	it("renders colorized terminal drift output", () => {
		const doc: Provenance = {
			document: "wiki/api.md",
			generatedAt: "",
			sources: [{ path: "src/api.ts", hash: "hash1" }],
		};

		const drift = inspectDocumentDrift(
			doc,
			() => "const a = 1;\n",
			() => "const a = 2;\n",
		);

		const term = renderTerminalDrift(drift, { color: true });
		expect(term).toContain("Drift Inspector: wiki/api.md");
		expect(term).toContain("--- src/api.ts");
		expect(term).toContain("\x1b[32m+ const a = 2;\x1b[0m");
	});
});
