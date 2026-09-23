import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { main } from "../dist/main.js";

const exec = promisify(execFile);

/**
 * `init`, `onboard` and `hook` are the three setup commands, and the property
 * they share is the one worth testing: none of them needs a model, and none of
 * them destroys a decision somebody already made.
 */

const roots: string[] = [];
let stdout: string;
let stderr: string;

/**
 * Kaioken reads the model from the environment when a flag does not name one,
 * so a developer's own `KAIOKEN_MODEL` and API key would otherwise turn these
 * into live, billed calls. Every test here runs with that environment removed:
 * the model path is exercised as far as resolution and no further.
 */
const savedEnv = {
	KAIOKEN_MODEL: process.env.KAIOKEN_MODEL,
	ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
	OPENAI_API_KEY: process.env.OPENAI_API_KEY,
	OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
};

beforeEach(() => {
	stdout = "";
	stderr = "";
	for (const name of Object.keys(savedEnv)) delete process.env[name];
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
	for (const [name, value] of Object.entries(savedEnv)) {
		if (value === undefined) delete process.env[name];
		else process.env[name] = value;
	}
	await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function repo(files: Record<string, string>): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), "kaioken-setup-"));
	roots.push(root);
	for (const [path, content] of Object.entries(files)) {
		const abs = join(root, path);
		await mkdir(join(abs, ".."), { recursive: true });
		await writeFile(abs, content, "utf8");
	}
	return root;
}

const SAMPLE = {
	"package.json": '{"name":"demo","scripts":{"test":"vitest run"}}',
	"src/lib.ts": "export function add(a: number, b: number): number {\n\treturn a + b;\n}\n",
	"README.md": "# demo\n",
};

/**
 * The generous timeout is for the provider catalog: the first command in the
 * file to reach `resolveModelClient` pays a cold import of the whole pi-ai
 * package, which is slower than anything these commands do themselves.
 */
describe("kaioken init", () => {
	it("scans and indexes without a model, and says AGENTS.md was skipped", async () => {
		const root = await repo(SAMPLE);
		const code = await main(["init", "--root", root]);

		expect(code).toBe(0);
		expect(stdout).toContain("scanned");
		expect(stdout).toContain("indexed");
		// The scan and the index are what make a repository queryable. Refusing
		// to do them because no API key is configured would be the wrong trade.
		expect(stdout).toContain("AGENTS.md skipped");
		await expect(readFile(join(root, ".kaioken", "scan.json"), "utf8")).resolves.toContain("lib.ts");
	}, 60_000);

	it("records a model passed on the command line", async () => {
		const root = await repo(SAMPLE);
		await main(["init", "--root", root, "--model", "acme/does-not-exist"]);

		const saved = JSON.parse(await readFile(join(root, ".kaioken", "model.json"), "utf8"));
		expect(saved.model).toBe("acme/does-not-exist");
	}, 60_000);

	it("never overwrites a model already chosen", async () => {
		const root = await repo({ ...SAMPLE, ".kaioken/model.json": '{"model":"openai/gpt-5"}' });
		await main(["init", "--root", root, "--model", "acme/does-not-exist"]);

		const saved = JSON.parse(await readFile(join(root, ".kaioken", "model.json"), "utf8"));
		expect(saved.model).toBe("openai/gpt-5");
		expect(stdout).toContain("left alone");
	}, 60_000);

	it("leaves an existing AGENTS.md alone rather than rewriting its prose", async () => {
		const root = await repo({ ...SAMPLE, "AGENTS.md": "# AGENTS.md\n\nHand-written and load-bearing.\n" });
		await main(["init", "--root", root]);

		const body = await readFile(join(root, "AGENTS.md"), "utf8");
		expect(body).toContain("Hand-written and load-bearing.");
	});
});

describe("kaioken onboard", () => {
	it("writes ONBOARDING.md from what is on disk, naming what is missing", async () => {
		const root = await repo(SAMPLE);
		const code = await main(["onboard", "--root", root]);

		expect(code).toBe(0);
		const body = await readFile(join(root, "ONBOARDING.md"), "utf8");
		expect(body).toContain("# Onboarding");
		// A half-generated knowledge base still yields a useful guide: the
		// empty sections say which command would fill them in.
		expect(body).toContain("run `kaioken wiki`");
		expect(body).toContain("package.json");
	});
});

describe("kaioken hook", () => {
	it("reports rather than installing when no action is given", async () => {
		const root = await repo(SAMPLE);
		await exec("git", ["init", "--quiet"], { cwd: root });

		expect(await main(["hook", "--root", root])).toBe(0);
		expect(stdout).toContain("not installed");
		// Writing into another project's git hooks is not something to do
		// because an argument was forgotten.
		await expect(readFile(join(root, ".git", "hooks", "post-commit"), "utf8")).rejects.toThrow();
	});

	it("installs, reports installed, and removes again", async () => {
		const root = await repo(SAMPLE);
		await exec("git", ["init", "--quiet"], { cwd: root });

		expect(await main(["hook", "install", "--root", root])).toBe(0);
		expect(stdout).toContain("installed the post-commit hook");

		stdout = "";
		await main(["hook", "status", "--root", root]);
		expect(stdout).toContain("installed —");

		stdout = "";
		await main(["hook", "remove", "--root", root]);
		expect(stdout).toContain("removed the kaioken post-commit block");
	});

	it("refuses a directory that is not a repository", async () => {
		const root = await repo(SAMPLE);
		expect(await main(["hook", "install", "--root", root])).toBe(1);
		expect(stderr).toContain("not a git repository");
	});
});
