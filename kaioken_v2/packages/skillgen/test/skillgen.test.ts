import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { loadSkills } from "@kaioken/agent";
import { buildIndex } from "@kaioken/index";
import { scan } from "@kaioken/scan";
import { afterEach, describe, expect, it } from "vitest";
import { proposeSkills, skillExists, slug, writeSkill } from "../dist/index.js";

const roots: string[] = [];

afterEach(async () => {
	await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function repo(files: Record<string, string>): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), "kaioken-skillgen-"));
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
	"package.json": '{"name":"demo"}',
	"src/commands/add.ts": "export function runAdd(): number {\n\treturn 1;\n}\n",
};

function client(reply: string) {
	return { async complete() { return reply; } };
}

describe("proposing skills", () => {
	it("keeps the model's proposals, sluggified and deduplicated", async () => {
		const root = await repo(SAMPLE);
		const { scan: scanResult, index } = await artifacts(root);

		const proposals = await proposeSkills({
			scan: scanResult,
			index,
			client: client(
				JSON.stringify({
					skills: [
						{ name: "Add a CLI command", description: "when adding a command", task: "add a command", files: ["src/commands"] },
						{ name: "add-a-cli-command", description: "duplicate", task: "dup", files: [] },
						{ name: "", description: "nameless", task: "x", files: [] },
					],
				}),
			),
		});

		// A duplicate name would mean the second generation silently overwrote
		// the first on disk — one paid-for skill destroying another.
		expect(proposals.map((p) => p.name)).toEqual(["add-a-cli-command"]);
	});

	it("falls back to the task sentence when a proposal has no description", async () => {
		const root = await repo(SAMPLE);
		const { scan: scanResult, index } = await artifacts(root);

		const [proposal] = await proposeSkills({
			scan: scanResult,
			index,
			client: client(JSON.stringify({ skills: [{ name: "run-tests", task: "run the test suite" }] })),
		});
		// The description is what a runtime matches on; without one the skill
		// would never load.
		expect(proposal?.description).toBe("run the test suite");
	});

	it("fails loudly when the model answers with prose instead of a plan", async () => {
		const root = await repo(SAMPLE);
		const { scan: scanResult, index } = await artifacts(root);
		// The caller reports this and stops. Treating an unparseable plan as
		// "no skills" would look identical to a repository that genuinely has
		// no recurring tasks, which is never true.
		await expect(
			proposeSkills({ scan: scanResult, index, client: client("I cannot help with that") }),
		).rejects.toThrow(/JSON/);
	});
});

describe("writing one skill", () => {
	const proposal = {
		name: "add-a-cli-command",
		description: "Load when adding a command to the CLI.",
		task: "add a CLI command",
		files: ["src/commands"],
	};

	it("writes a skill the loader can read back", async () => {
		const root = await repo(SAMPLE);
		const { scan: scanResult, index } = await artifacts(root);

		const written = await writeSkill({
			root,
			proposal,
			scan: scanResult,
			index,
			client: client("# Add a CLI command\n\n1. Edit `src/commands/add.ts`.\n"),
		});

		expect(written.sources).toContain("src/commands/add.ts");
		expect(await skillExists(root, proposal.name)).toBe(true);

		const { skills, problems } = await loadSkills(root);
		expect(problems).toEqual([]);
		expect(skills[0]?.name).toBe("add-a-cli-command");
		expect(skills[0]?.description).toBe(proposal.description);
	});

	it("reports a cited path the repository does not contain", async () => {
		const root = await repo(SAMPLE);
		const { scan: scanResult, index } = await artifacts(root);

		const written = await writeSkill({
			root,
			proposal,
			scan: scanResult,
			index,
			client: client("# Add a CLI command\n\n1. Edit `src/commands/add.ts`.\n2. Register it in `src/registry.ts`.\n"),
		});

		// A step pointing at a file that does not exist is the one defect that
		// makes a skill worse than no skill: the agent will believe it.
		expect(written.ungrounded).toEqual(["src/registry.ts"]);
	});

	it("does not flag a command in backticks as a missing file", async () => {
		const root = await repo(SAMPLE);
		const { scan: scanResult, index } = await artifacts(root);

		const written = await writeSkill({
			root,
			proposal,
			scan: scanResult,
			index,
			client: client("# Add a CLI command\n\nRun `npm test` and `git status`.\n"),
		});
		expect(written.ungrounded).toEqual([]);
	});

	it("refuses an empty body instead of writing an empty skill", async () => {
		const root = await repo(SAMPLE);
		const { scan: scanResult, index } = await artifacts(root);

		await expect(
			writeSkill({ root, proposal, scan: scanResult, index, client: client("   ") }),
		).rejects.toThrow(/empty body/);
	});

	it("strips a fence the model wrapped the whole document in", async () => {
		const root = await repo(SAMPLE);
		const { scan: scanResult, index } = await artifacts(root);

		await writeSkill({
			root,
			proposal,
			scan: scanResult,
			index,
			client: client("```markdown\n# Add a CLI command\n\nSteps.\n```"),
		});
		const body = await readFile(join(root, ".kaioken/skills/add-a-cli-command.md"), "utf8");
		expect(body).not.toContain("```markdown");
	});
});

describe("the name slug", () => {
	it("makes a model's phrasing safe to be a file name", () => {
		expect(slug("Add an API endpoint!")).toBe("add-an-api-endpoint");
		expect(slug("../../etc/passwd")).toBe("etc-passwd");
		expect(slug("   ")).toBe("");
	});
});
