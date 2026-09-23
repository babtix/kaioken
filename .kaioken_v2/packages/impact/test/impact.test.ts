import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { buildIndex } from "@kaioken/index";
import { scan } from "@kaioken/scan";
import { afterEach, describe, expect, it } from "vitest";
import { predictImpact, renderImpact } from "../dist/index.js";

/**
 * The claim this package makes is that nothing in its report is invented. Most
 * of these tests are that claim, asked from different directions.
 */

const roots: string[] = [];

afterEach(async () => {
	await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function repo(files: Record<string, string>): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), "kaioken-impact-"));
	roots.push(root);
	for (const [path, content] of Object.entries(files)) {
		const abs = join(root, path);
		await mkdir(dirname(abs), { recursive: true });
		await writeFile(abs, content, "utf8");
	}
	return root;
}

async function artifacts(root: string) {
	const scanResult = await scan(root);
	const { index } = await buildIndex(scanResult, {});
	return { scan: scanResult, index };
}

const SAMPLE = {
	"src/config.ts": "export function loadConfig(): string {\n\treturn \"ok\";\n}\n",
	"src/app.ts": "import { loadConfig } from './config.js';\n\nexport function start() {\n\treturn loadConfig();\n}\n",
	"src/unrelated.ts": "export function unrelated(): number {\n\treturn 1;\n}\n",
};

describe("impact prediction", () => {
	it("finds the declaration and everything that mentions it", async () => {
		const root = await repo(SAMPLE);
		const { scan: scanResult, index } = await artifacts(root);

		const report = await predictImpact({ root, description: "rename loadConfig", scan: scanResult, index });

		expect(report.symbols.map((s) => s.path)).toEqual(["src/config.ts"]);
		expect(report.dependents.map((d) => d.path)).toEqual(["src/app.ts"]);
		// A file that never names it is not in the blast radius, and padding the
		// list with it would make the whole report untrustworthy.
		expect(report.dependents.map((d) => d.path)).not.toContain("src/unrelated.ts");
	});

	it("says plainly when nothing else refers to a symbol", async () => {
		const root = await repo(SAMPLE);
		const { scan: scanResult, index } = await artifacts(root);

		const report = await predictImpact({ root, description: "change unrelated", scan: scanResult, index });
		expect(report.symbols).toHaveLength(1);
		expect(report.dependents).toEqual([]);
		expect(renderImpact(report).join("\n")).toContain("nothing outside the declaring files");
	});

	it("reports a name the repository does not declare rather than inventing one", async () => {
		const root = await repo(SAMPLE);
		const { scan: scanResult, index } = await artifacts(root);

		const report = await predictImpact({
			root,
			description: "rename parseSettings",
			scan: scanResult,
			index,
		});
		expect(report.symbols).toEqual([]);
		expect(report.unknown).toContain("parseSettings");
		expect(renderImpact(report).join("\n")).toContain("nothing in this repository matches");
	});

	it("does not report ordinary words in the description as missing symbols", async () => {
		const root = await repo(SAMPLE);
		const { scan: scanResult, index } = await artifacts(root);

		const report = await predictImpact({
			root,
			description: "rename the config loader and update every caller",
			scan: scanResult,
			index,
		});
		// Every word of the sentence is a candidate. Listing "rename", "config"
		// and "caller" as things the repository does not declare buries the one
		// name that would have mattered.
		expect(report.unknown).toEqual([]);
	});

	it("still reports a missing name that was written as an identifier", async () => {
		const root = await repo(SAMPLE);
		const { scan: scanResult, index } = await artifacts(root);

		const report = await predictImpact({ root, description: "rename parseSettings", scan: scanResult, index });
		// "the repository has no parseSettings" is often the most useful line
		// in the answer, and this is how it stays in it.
		expect(report.unknown).toContain("parseSettings");
	});

	it("discards a model's guesses that do not exist, and keeps the ones that do", async () => {
		const root = await repo(SAMPLE);
		const { scan: scanResult, index } = await artifacts(root);

		const report = await predictImpact({
			root,
			description: "the settings reader",
			scan: scanResult,
			index,
			client: {
				async complete() {
					return JSON.stringify({ symbols: ["loadConfig", "readSettings"], files: ["src/nope.ts"] });
				},
			},
		});

		expect(report.symbols.map((s) => s.name)).toEqual(["loadConfig"]);
		// A name the model proposed is a claim even when it reads like prose,
		// so it is reported whatever its shape.
		expect(report.unknown).toContain("readSettings");
		expect(report.unknown).toContain("src/nope.ts");
	});

	it("still answers when the model fails", async () => {
		const root = await repo(SAMPLE);
		const { scan: scanResult, index } = await artifacts(root);

		// The deterministic half is the grounded half; losing the model must not
		// cost the answer.
		const report = await predictImpact({
			root,
			description: "rename loadConfig",
			scan: scanResult,
			index,
			client: {
				async complete() {
					throw new Error("no network");
				},
			},
		});
		expect(report.symbols.map((s) => s.name)).toEqual(["loadConfig"]);
	});

	it("names the skills whose steps point at an affected file", async () => {
		const root = await repo({
			...SAMPLE,
			".kaioken/skills/wire-config.md": [
				"---",
				"name: wire-config",
				"description: How to add a config option here.",
				"---",
				"",
				"1. Edit `src/config.ts`.",
				"",
			].join("\n"),
		});
		const { scan: scanResult, index } = await artifacts(root);

		const report = await predictImpact({ root, description: "rename loadConfig", scan: scanResult, index });
		// Nothing else in the system would notice that a checklist had gone
		// wrong: a skill is prose, and prose has no provenance record.
		expect(report.skills.map((s) => s.name)).toEqual(["wire-config"]);
	});
});
