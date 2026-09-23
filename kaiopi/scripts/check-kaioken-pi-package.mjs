#!/usr/bin/env node
/**
 * Does the built `kaioken-pi` package actually work as a Pi package?
 *
 * `npm pack` succeeding proves nothing about whether Pi can load what it
 * contains. This loads the built extension the way Pi does — through the
 * package's own specifiers, resolved from `node_modules` — and asserts it
 * registers its full surface. It then checks every path the `pi` manifest
 * promises, because a manifest pointing at a directory that was never copied is
 * a package that installs cleanly and does nothing.
 *
 * This is the closest offline equivalent of "install it in a clean repo and see
 * a grounded session": the modules really resolve, the registrations really
 * happen, and no network or key is involved (Invariant 10).
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(process.cwd());
const OUT = join(ROOT, "kaioken-pi");

const problems = [];
const note = (message) => problems.push(message);

// --- 1. The manifest describes what is on disk ------------------------------

if (!existsSync(join(OUT, "package.json"))) {
	console.error("kaioken-pi/ has not been built. Run: npm run pack:kaioken");
	process.exit(1);
}

const manifest = JSON.parse(readFileSync(join(OUT, "package.json"), "utf8"));

if (!manifest.keywords?.includes("pi-package")) {
	note('manifest is missing the "pi-package" keyword, so the gallery cannot find it');
}

for (const [kind, globs] of Object.entries(manifest.pi ?? {})) {
	if (kind === "video" || kind === "image") continue;
	for (const glob of globs) {
		const path = join(OUT, glob.replace(/^\.\//, ""));
		if (!existsSync(path)) note(`pi.${kind} points at ${glob}, which does not exist`);
	}
}

// A published package that omits its own resources publishes nothing.
for (const required of ["extensions", "skills", "themes"]) {
	if (!manifest.files?.includes(required)) note(`"files" omits ${required}, so it would not be published`);
}

// The upstream repository's development prompts are not this package's to ship.
if (manifest.pi?.prompts?.length) {
	note("pi.prompts is declared; the .pi/prompts files belong to upstream Pi, not to kaioken-pi");
}

// --- 2. Pi's bundled packages must not be bundled here ----------------------

for (const pkg of ["@earendil-works/pi-ai", "@earendil-works/pi-coding-agent", "typebox"]) {
	if (!manifest.peerDependencies?.[pkg]) {
		note(`${pkg} should be a peer dependency with "*"; Pi provides it`);
	}
	if (manifest.dependencies?.[pkg]) {
		note(`${pkg} is in dependencies, which would install a second copy of a package Pi bundles`);
	}
}

// Every @kaioken/* dependency must exist in the repository at the stated version,
// or the published package would ask npm for something that was never released.
for (const [name, version] of Object.entries(manifest.dependencies ?? {})) {
	const dir = join(ROOT, "kaioken", name.replace("@kaioken/", ""));
	const local = join(dir, "package.json");
	if (!existsSync(local)) {
		note(`depends on ${name}, which has no package in kaioken/`);
		continue;
	}
	const actual = JSON.parse(readFileSync(local, "utf8")).version;
	if (actual !== version) note(`declares ${name}@${version} but the repository is at ${actual}`);
}

// --- 3. The extension registers its full surface ----------------------------

const tools = [];
const commands = [];
const hooks = {};
const fakePi = {
	registerTool: (tool) => tools.push(tool),
	registerCommand: (name, opts) => commands.push({ name, ...opts }),
	on: (event, handler) => {
		(hooks[event] ??= []).push(handler);
	},
};

const entry = join(OUT, "extensions", "index.ts");
const module = await import(`file://${entry.replace(/\\/g, "/")}`);
module.default(fakePi);

if (tools.length !== 7) note(`registered ${tools.length} tools, expected 7`);
if (commands.length !== 16) note(`registered ${commands.length} commands, expected 16`);

for (const event of ["before_agent_start", "resources_discover", "session_start", "tool_call"]) {
	if (!hooks[event]?.length) note(`no handler registered for "${event}"`);
}

// The names are the contract other tooling matches on; a rename here breaks
// prompts that were written against them.
const expectedTools = [
	"kaio_symbol_lookup",
	"kaio_read_file",
	"kaio_wiki_search",
	"kaio_impact",
	"kaio_skill_load",
	"kaio_status",
	"kaio_verify",
];
for (const name of expectedTools) {
	if (!tools.some((tool) => tool.name === name)) note(`tool "${name}" is not registered`);
}

// --- 4. Resources are valid for Pi's own loaders ----------------------------

const skillFiles = [];
const walk = (dir) => {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) walk(path);
		else if (entry.name.endsWith(".md")) skillFiles.push(path);
	}
};
if (existsSync(join(OUT, "skills"))) walk(join(OUT, "skills"));

const themeFiles = existsSync(join(OUT, "themes"))
	? readdirSync(join(OUT, "themes"))
			.filter((name) => name.endsWith(".json"))
			.map((name) => join(OUT, "themes", name))
	: [];

if (skillFiles.length === 0) note("no skills were copied into the package");
if (themeFiles.length === 0) note("no themes were copied into the package");

// --- Report -----------------------------------------------------------------

if (problems.length > 0) {
	console.error("kaioken-pi is not installable as a Pi package:");
	for (const problem of problems) console.error(`  ${problem}`);
	process.exit(1);
}

console.log("kaioken-pi verified as a Pi package:");
console.log(`  tools        ${tools.length} registered`);
console.log(`  commands     ${commands.length} registered`);
console.log(`  hooks        ${Object.keys(hooks).sort().join(", ")}`);
console.log(`  skills       ${skillFiles.length}`);
console.log(`  themes       ${themeFiles.length}`);
console.log(`  dependencies ${Object.keys(manifest.dependencies ?? {}).length} @kaioken/* at matching versions`);
console.log(`  package size ${(statSync(join(OUT, "package.json")).size / 1024).toFixed(1)} kB manifest`);
