import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadSkills, parseSkill } from "../dist/index.js";

/**
 * Skills are the one tenant a human writes by hand, which means the loader's
 * job is not only to read the good ones — it is to say why it rejected the rest.
 * A skill that vanishes silently is a skill its author never learns is broken.
 */

const roots: string[] = [];

afterEach(async () => {
	await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function repo(files: Record<string, string>): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), "kaioken-skills-"));
	roots.push(root);
	for (const [path, content] of Object.entries(files)) {
		const abs = join(root, path);
		await mkdir(dirname(abs), { recursive: true });
		await writeFile(abs, content, "utf8");
	}
	return root;
}

const RELEASE = [
	"---",
	"name: release",
	"description: Cut a release of this package.",
	"---",
	"",
	"1. Bump the version.",
	"2. Tag it.",
	"",
].join("\n");

describe("loadSkills", () => {
	it("finds nothing, without complaint, in a repository with no skills", async () => {
		const root = await repo({ "README.md": "# demo\n" });

		const loaded = await loadSkills(root);

		expect(loaded.skills).toEqual([]);
		expect(loaded.problems).toEqual([]);
	});

	it("reads both layouts", async () => {
		const root = await repo({
			".kaioken/skills/release.md": RELEASE,
			".kaioken/skills/migrate/SKILL.md": [
				"---",
				"description: Run a schema migration safely.",
				"---",
				"",
				"Take a backup first.",
				"",
			].join("\n"),
		});

		const loaded = await loadSkills(root);

		expect(loaded.skills.map((skill) => skill.name).sort()).toEqual(["migrate", "release"]);
		// A skill with no declared name takes the one its directory already has.
		const migrate = loaded.skills.find((skill) => skill.name === "migrate");
		expect(migrate?.path).toBe(".kaioken/skills/migrate/SKILL.md");
		expect(migrate?.content).toContain("backup");
	});

	it("reports a skill with no description instead of dropping it", async () => {
		const root = await repo({
			".kaioken/skills/broken.md": "---\nname: broken\n---\n\nSome body.\n",
			".kaioken/skills/release.md": RELEASE,
		});

		const loaded = await loadSkills(root);

		// Nothing can guess when a skill applies, so a missing description is
		// fatal to the skill — but it must be a visible failure.
		expect(loaded.skills.map((skill) => skill.name)).toEqual(["release"]);
		expect(loaded.problems).toEqual([
			{ path: ".kaioken/skills/broken.md", reason: "frontmatter has no description" },
		]);
	});

	it("reports two skills claiming the same name", async () => {
		const root = await repo({
			".kaioken/skills/a.md": RELEASE,
			".kaioken/skills/b.md": RELEASE,
		});

		const loaded = await loadSkills(root);

		expect(loaded.problems.map((problem) => problem.reason)).toEqual([
			'duplicate skill name "release"',
		]);
	});
});

describe("parseSkill", () => {
	it("takes the name from the frontmatter over the filename", () => {
		const parsed = parseSkill(RELEASE, "ignored");

		expect(parsed).toMatchObject({ name: "release", description: "Cut a release of this package." });
	});

	it("refuses a file with no frontmatter", () => {
		expect(parseSkill("# Just a document\n", "doc")).toEqual({ reason: "no frontmatter block" });
	});

	it("refuses a skill with nothing in it", () => {
		const raw = "---\nname: empty\ndescription: Does nothing.\n---\n\n";

		expect(parseSkill(raw, "empty")).toEqual({ reason: "skill has no body" });
	});

	it("survives CRLF line endings", () => {
		const parsed = parseSkill(RELEASE.replace(/\n/g, "\r\n"), "fallback");

		expect(parsed).toMatchObject({ name: "release" });
	});
});
