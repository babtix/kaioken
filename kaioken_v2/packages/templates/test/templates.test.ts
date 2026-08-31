import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { expandTemplate, listTemplates, loadTemplate } from "../dist/index.js";

/**
 * The interesting behaviour is what happens to a placeholder nothing filled:
 * it has to stay visible. Everything else here is bookkeeping.
 */

const roots: string[] = [];

afterEach(async () => {
	await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function repo(files: Record<string, string>): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), "kaioken-templates-"));
	roots.push(root);
	for (const [path, content] of Object.entries(files)) {
		const abs = join(root, path);
		await mkdir(dirname(abs), { recursive: true });
		await writeFile(abs, content, "utf8");
	}
	return root;
}

describe("prompt templates", () => {
	it("lists them by name, with the placeholders each one needs", async () => {
		const root = await repo({
			".kaioken/templates/review.md": "Review {{file}} for {{concern}}. {{args}}",
			".kaioken/templates/audit.md": "Audit this repository.",
			".kaioken/templates/notes.txt": "not a template",
		});

		const templates = await listTemplates(root);
		expect(templates.map((t) => t.name)).toEqual(["audit", "review"]);
		expect(templates[1]?.vars).toEqual(["file", "concern"]);
		// `args` is the catch-all, not something the caller has to supply.
		expect(templates[1]?.vars).not.toContain("args");
	});

	it("has no templates rather than failing when the directory is missing", async () => {
		expect(await listTemplates(await repo({}))).toEqual([]);
	});

	it("fills named placeholders and sweeps the rest into args", async () => {
		const root = await repo({
			".kaioken/templates/review.md": "Review {{file}} for {{concern}}.\n\nAlso: {{args}}",
		});
		const template = await loadTemplate(root, "review");
		const { prompt, missing } = expandTemplate(
			template as NonNullable<typeof template>,
			"file=src/app.ts concern=races be quick about it",
		);

		expect(missing).toEqual([]);
		expect(prompt).toContain("Review src/app.ts for races.");
		expect(prompt).toContain("Also: be quick about it");
	});

	it("leaves an unfilled placeholder literal, and says which one", async () => {
		const root = await repo({ ".kaioken/templates/review.md": "Review {{file}} for {{concern}}." });
		const template = await loadTemplate(root, "review");
		const { prompt, missing } = expandTemplate(template as NonNullable<typeof template>, "file=src/app.ts");

		expect(missing).toEqual(["concern"]);
		// Blanking the hole would send a subtly different question and hide the
		// mistake from the only person able to fix it.
		expect(prompt).toContain("{{concern}}");
	});

	it("does not treat an = inside prose as a binding", async () => {
		const root = await repo({ ".kaioken/templates/why.md": "Explain: {{args}}" });
		const template = await loadTemplate(root, "why");
		const { prompt } = expandTemplate(template as NonNullable<typeof template>, "why is x=y here");

		expect(prompt).toBe("Explain: why is x=y here");
	});

	it("drops an empty args placeholder instead of leaving a hole", async () => {
		const root = await repo({ ".kaioken/templates/audit.md": "Audit this.{{args}}" });
		const template = await loadTemplate(root, "audit");
		const { prompt, missing } = expandTemplate(template as NonNullable<typeof template>, "");

		expect(missing).toEqual([]);
		expect(prompt).toBe("Audit this.");
	});

	it("refuses a name that is a path", async () => {
		const root = await repo({ ".kaioken/templates/ok.md": "fine" });
		expect(await loadTemplate(root, "../../../etc/passwd")).toBeNull();
		expect(await loadTemplate(root, "sub/dir")).toBeNull();
		expect(await loadTemplate(root, "missing")).toBeNull();
	});
});
