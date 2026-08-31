import { gzipSync } from "node:zlib";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	compareSemver,
	contributedSkills,
	fetchRegistry,
	RegistryUnpublished,
	searchRegistry,
	extractTo,
	installExtension,
	isNewer,
	isTrusted,
	listInstalled,
	loadLock,
	parseSemver,
	readTar,
	removeExtension,
	setEnabled,
	trustExtension,
	validateManifest,
	type ArchiveEntry,
} from "../dist/index.js";

/**
 * The property under test throughout is that installing is not running. A
 * declarative extension contributes documents; anything that ships code lands
 * inert, and stays inert until its exact version is trusted.
 */

const homes: string[] = [];
const dirs: string[] = [];
const savedHome = process.env.KAIOKEN_HOME;

beforeEach(async () => {
	const home = await mkdtemp(join(tmpdir(), "kaioken-exthome-"));
	homes.push(home);
	process.env.KAIOKEN_HOME = home;
});

afterEach(async () => {
	if (savedHome === undefined) delete process.env.KAIOKEN_HOME;
	else process.env.KAIOKEN_HOME = savedHome;
	await Promise.all(
		[...homes.splice(0), ...dirs.splice(0)].map((dir) => rm(dir, { recursive: true, force: true })),
	);
});

async function packageDir(files: Record<string, string>): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), "kaioken-extsrc-"));
	dirs.push(dir);
	for (const [path, content] of Object.entries(files)) {
		const abs = join(dir, path);
		await mkdir(dirname(abs), { recursive: true });
		await writeFile(abs, content, "utf8");
	}
	return dir;
}

const DECLARATIVE = [
	"id: acme.docs",
	"name: Acme Documentation Pack",
	"version: 1.0.0",
	"description: Task guides for the Acme framework.",
	"type: declarative",
	"",
].join("\n");

const SKILL = [
	"---",
	"name: deploy",
	"description: Deploy an Acme service.",
	"---",
	"",
	"1. Run acme deploy.",
	"",
].join("\n");

describe("the manifest", () => {
	it("accepts a declarative extension with no type stated", () => {
		const manifest = validateManifest({ id: "acme.docs", name: "Docs", version: "1.0.0" });
		expect(manifest.type).toBe("declarative");
	});

	it("refuses an id that would escape the install directory", () => {
		expect(() => validateManifest({ id: "../evil", name: "x", version: "1.0.0" })).toThrow(/owner\.name/);
		expect(() => validateManifest({ id: "noowner", name: "x", version: "1.0.0" })).toThrow(/owner\.name/);
	});

	it("refuses a declarative extension that smuggles in an executable payload", () => {
		// This is the tier people install without thinking about it.
		expect(() =>
			validateManifest({ id: "acme.docs", name: "x", version: "1.0.0", mcp: { command: "node" } }),
		).toThrow(/must not declare an mcp server/);
	});

	it("refuses a wasm entry that points outside the package", () => {
		expect(() =>
			validateManifest({
				id: "acme.tool",
				name: "x",
				version: "1.0.0",
				type: "wasm",
				wasm: { entry: "../../../etc/passwd.wasm" },
			}),
		).toThrow(/inside the package/);
	});

	it("refuses a permission the host cannot grant", () => {
		// A capability that silently disappeared would leave the plugin failing
		// at runtime for a reason neither side can see.
		expect(() =>
			validateManifest({
				id: "acme.tool",
				name: "x",
				version: "1.0.0",
				type: "wasm",
				wasm: { entry: "m.wasm" },
				permissions: ["read_email"],
			}),
		).toThrow(/not supported/);
	});
});

describe("the registry", () => {
	it("reports an unpublished index as such, not as an HTTP failure", async () => {
		// A 404 is the ordinary case today. Reporting it as a status code sends
		// the reader hunting for a network problem they do not have.
		await expect(
			fetchRegistry({
				force: true,
				fetchJson: async () => {
					throw new RegistryUnpublished("https://example.invalid/registry.json");
				},
			}),
		).rejects.toBeInstanceOf(RegistryUnpublished);
	});

	it("matches on id, name and description", () => {
		const entries = [
			{ id: "acme.docs", name: "Acme Docs", repo: "acme/docs", description: "Guides for widgets." },
			{ id: "other.thing", name: "Other", repo: "other/thing" },
		];
		expect(searchRegistry(entries, "widget").map((e) => e.id)).toEqual(["acme.docs"]);
		expect(searchRegistry(entries, "").length).toBe(2);
	});
});

describe("semver", () => {
	it("ranks a release above its own prereleases", () => {
		expect(isNewer("1.0.0", "1.0.0-rc.1")).toBe(true);
		expect(isNewer("1.0.0-rc.1", "1.0.0")).toBe(false);
	});

	it("compares numeric prerelease identifiers numerically", () => {
		const a = parseSemver("1.0.0-rc.9");
		const b = parseSemver("1.0.0-rc.10");
		expect(compareSemver(a as NonNullable<typeof a>, b as NonNullable<typeof b>)).toBeLessThan(0);
	});

	it("treats an unparseable version as never newer", () => {
		expect(isNewer("latest", "1.0.0")).toBe(false);
	});
});

describe("archives", () => {
	function tarOf(entries: Array<{ path: string; body: string }>): Buffer {
		const blocks: Buffer[] = [];
		for (const entry of entries) {
			const header = Buffer.alloc(512);
			header.write(entry.path, 0, 100, "utf8");
			header.write("0000644\0", 100, 8, "utf8");
			header.write(`${Buffer.byteLength(entry.body).toString(8).padStart(11, "0")}\0`, 124, 12, "utf8");
			header.write("0", 156, 1, "utf8");
			// The checksum field is spaces while the checksum is computed; this
			// reader does not verify it, so spaces are enough to be well-formed.
			header.write("        ", 148, 8, "utf8");
			blocks.push(header);
			const body = Buffer.from(entry.body, "utf8");
			blocks.push(body, Buffer.alloc((512 - (body.length % 512)) % 512));
		}
		blocks.push(Buffer.alloc(1024));
		return Buffer.concat(blocks);
	}

	it("reads entries out of a tar", () => {
		const entries = readTar(tarOf([{ path: "pkg/extension.yaml", body: "id: a.b\n" }]));
		expect(entries.map((e) => e.path)).toEqual(["pkg/extension.yaml"]);
		expect(entries[0]?.body.toString("utf8")).toBe("id: a.b\n");
	});

	it("refuses an entry that escapes the destination", async () => {
		const dir = await mkdtemp(join(tmpdir(), "kaioken-extract-"));
		dirs.push(dir);
		const entries: ArchiveEntry[] = [
			{ path: "pkg/ok.txt", body: Buffer.from("fine") },
			{ path: "pkg/../../escaped.txt", body: Buffer.from("bad") },
		];
		// An archive is untrusted input by definition — that is what installing
		// one means — and this is the oldest trick there is.
		await expect(extractTo(entries, dir)).rejects.toThrow(/escapes/);
	});

	it("strips the single wrapping directory a release tarball carries", async () => {
		const dir = await mkdtemp(join(tmpdir(), "kaioken-extract-"));
		dirs.push(dir);
		await extractTo(
			[
				{ path: "owner-repo-abc123/extension.yaml", body: Buffer.from("id: a.b\n") },
				{ path: "owner-repo-abc123/skills/x.md", body: Buffer.from("body") },
			],
			dir,
		);
		expect(await readFile(join(dir, "extension.yaml"), "utf8")).toBe("id: a.b\n");
	});
});

describe("installing", () => {
	it("installs a declarative extension and loads its skills", async () => {
		const source = await packageDir({ "extension.yaml": DECLARATIVE, "skills/deploy.md": SKILL });
		const result = await installExtension({ source });

		expect(result.entry.id).toBe("acme.docs");
		expect(result.upgraded).toBe(false);
		// No trust prompt for this tier: nothing it ships is ever executed.
		expect(isTrusted(result.entry)).toBe(true);

		const { skills, problems } = await contributedSkills();
		expect(problems).toEqual([]);
		// Namespaced: two packs shipping a `deploy` skill are two procedures,
		// and a silent collision would be followed by an agent one day.
		expect(skills.map((skill) => skill.name)).toEqual(["acme.docs/deploy"]);
	});

	it("installs an executable extension inert", async () => {
		const source = await packageDir({
			"extension.yaml": [
				"id: acme.server",
				"name: Acme Server",
				"version: 1.0.0",
				"type: mcp",
				"mcp:",
				"  command: node",
				"  args: [server.js]",
				"",
			].join("\n"),
			"server.js": "// nothing",
		});
		const result = await installExtension({ source });
		expect(isTrusted(result.entry)).toBe(false);

		const trusted = await trustExtension("acme.server", true);
		expect(trusted && isTrusted(trusted)).toBe(true);
	});

	it("does not carry trust across an update", async () => {
		const files = {
			"extension.yaml": [
				"id: acme.server",
				"name: Acme Server",
				"version: 1.0.0",
				"type: mcp",
				"mcp:",
				"  command: node",
				"",
			].join("\n"),
		};
		const source = await packageDir(files);
		await installExtension({ source });
		await trustExtension("acme.server", true);

		await writeFile(join(source, "extension.yaml"), files["extension.yaml"].replace("1.0.0", "1.1.0"), "utf8");
		const updated = await installExtension({ source });

		// A new version is new code from somebody else. Inheriting the old
		// version's trust would run it before anyone had looked.
		expect(updated.entry.version).toBe("1.1.0");
		expect(isTrusted(updated.entry)).toBe(false);
	});

	it("keeps trust when a reinstall finds the same version", async () => {
		const source = await packageDir({
			"extension.yaml": [
				"id: acme.server",
				"name: Acme Server",
				"version: 1.0.0",
				"type: mcp",
				"mcp:",
				"  command: node",
				"",
			].join("\n"),
		});
		await installExtension({ source });
		await trustExtension("acme.server", true);

		// `ext update` reinstalls everything at once. Dropping trust on the
		// versions that did not change would disarm every extension the user
		// had trusted, and teach them to type `ext trust` without reading.
		const again = await installExtension({ source });
		expect(again.entry.version).toBe("1.0.0");
		expect(isTrusted(again.entry)).toBe(true);
	});

	it("keeps a disabled extension disabled across a reinstall", async () => {
		const source = await packageDir({ "extension.yaml": DECLARATIVE, "skills/deploy.md": SKILL });
		await installExtension({ source });
		await setEnabled("acme.docs", false);
		const again = await installExtension({ source });
		expect(again.entry.enabled).toBe(false);
	});

	it("refuses a host older than the extension needs", async () => {
		const source = await packageDir({
			"extension.yaml": ["id: acme.docs", "name: Docs", "version: 1.0.0", "minKaiokenVersion: 9.0.0", ""].join("\n"),
		});
		await expect(installExtension({ source, hostVersion: "2.0.0" })).rejects.toThrow(/needs Kaioken 9\.0\.0/);
		// A failed install leaves nothing behind for the next one to find.
		expect(await listInstalled()).toEqual([]);
	});

	it("installs from a fetched tarball without touching the network in a test", async () => {
		const tar = readTarFixture();
		const result = await installExtension({
			source: "acme/docs",
			fetchArchive: async () => gzipSync(tar),
		});
		expect(result.entry.id).toBe("acme.docs");
		expect(result.entry.source).toBe("acme/docs");
	});

	it("removes what it installed", async () => {
		const source = await packageDir({ "extension.yaml": DECLARATIVE, "skills/deploy.md": SKILL });
		await installExtension({ source });
		expect(await removeExtension("acme.docs")).toBe(true);
		expect((await loadLock()).extensions).toEqual([]);
		expect((await contributedSkills()).skills).toEqual([]);
	});

	it("reports a broken contributed skill instead of dropping it", async () => {
		const source = await packageDir({
			"extension.yaml": DECLARATIVE,
			"skills/broken.md": "no frontmatter here\n",
		});
		await installExtension({ source });
		const { skills, problems } = await contributedSkills();
		expect(skills).toEqual([]);
		expect(problems[0]?.reason).toContain("frontmatter");
	});
});

/** A tarball carrying one declarative extension, built in memory. */
function readTarFixture(): Buffer {
	const entries = [
		{ path: "acme-docs-abc/extension.yaml", body: DECLARATIVE },
		{ path: "acme-docs-abc/skills/deploy.md", body: SKILL },
	];
	const blocks: Buffer[] = [];
	for (const entry of entries) {
		const header = Buffer.alloc(512);
		header.write(entry.path, 0, 100, "utf8");
		header.write(`${Buffer.byteLength(entry.body).toString(8).padStart(11, "0")}\0`, 124, 12, "utf8");
		header.write("0", 156, 1, "utf8");
		header.write("        ", 148, 8, "utf8");
		blocks.push(header);
		const body = Buffer.from(entry.body, "utf8");
		blocks.push(body, Buffer.alloc((512 - (body.length % 512)) % 512));
	}
	blocks.push(Buffer.alloc(1024));
	return Buffer.concat(blocks);
}
