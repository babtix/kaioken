#!/usr/bin/env node
/**
 * Build the publishable `kaioken-pi` package.
 *
 * Pi loads extensions as TypeScript source, so the bundle ships `.ts` and lets
 * Pi compile it — there is no bundler step and no build artifact to go stale.
 * What it does need is a faithful rewrite of the bridge's imports: inside this
 * repository the bridge reaches core code by relative path, because that is the
 * source of truth here, but an installed package must import `@kaioken/scan` by
 * name. `scripts/check-kaioken-barrels.mjs` proves every symbol the bridge wants
 * is reachable from a package barrel, so the rewrite cannot silently break.
 *
 * The output is a staging directory, not a committed tree: it is built by
 * `npm run pack:kaioken` and published from there.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const ROOT = resolve(process.cwd());
const OUT = join(ROOT, "kaioken-pi");
const BRIDGE = join(ROOT, ".pi", "extensions", "kaioken");

/**
 * Packages the bridge depends on at runtime, by directory name.
 *
 * `verifycore` and `evals` are deliberately absent: the bridge never imports
 * them, and a declared dependency that nothing uses is a version to keep in
 * sync for no reason. They remain installed transitively where they are needed.
 */
const CORE = [
	"scan",
	"index",
	"search",
	"provenance",
	"graph",
	"impact",
	"gitops",
	"verify",
	"skills",
	"serve",
	"modelport",
	"plan",
	"wiki",
	"research",
	"skillgen",
];

function walk(dir) {
	const out = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) {
			if (entry.name === "node_modules" || entry.name === "dist") continue;
			out.push(...walk(path));
		} else {
			out.push(path);
		}
	}
	return out;
}

/** `../../../../kaioken/scan/src/scan.ts` -> `@kaioken/scan` */
function rewriteSpecifier(specifier) {
	const cross = /(?:\.\.\/)+kaioken\/([a-z]+)\/src\//.exec(specifier);
	return cross ? `@kaioken/${cross[1]}` : null;
}

function rewriteImports(source) {
	// Statements are matched whole so a multi-line import is rewritten once.
	return source.replace(/(\bfrom\s+["'])([^"']+)(["'])/g, (whole, open, specifier, close) => {
		const pkg = rewriteSpecifier(specifier);
		return pkg ? `${open}${pkg}${close}` : whole;
	});
}

// ---------------------------------------------------------------------------

if (existsSync(OUT)) rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, "extensions"), { recursive: true });

// 1. The extension itself, with imports pointed at package names.
let rewritten = 0;
for (const file of walk(BRIDGE)) {
	const rel = relative(BRIDGE, file);
	// Tests are development-only; the shipped extension is index + commands +
	// hooks + tools + prompts + ui.
	if (rel.startsWith("test" + "/") || rel.startsWith("test\\")) continue;
	// `ui/preview.ts` renders the banner to stdout so a layout change can be
	// looked at. It is a development tool, not part of the extension.
	if (rel === join("ui", "preview.ts")) continue;
	if (rel === "package.json") continue;

	const target = join(OUT, "extensions", rel);
	mkdirSync(join(target, ".."), { recursive: true });

	const source = readFileSync(file, "utf8");
	const next = rewriteImports(source);
	if (next !== source) rewritten++;
	writeFileSync(target, next, "utf8");
}

// 2. Skills and themes are resources Pi discovers by convention.
//
// `.pi/prompts/` is deliberately not copied. Those six files (`cl.md`,
// `deslop.md`, `is.md`, `pr.md`, `sa.md`, `wr.md`) are the upstream Pi
// repository's own development workflow prompts. Shipping them inside a
// package named kaioken-pi would hand a stranger someone else's prompt library
// under our name, and none of them is part of what this package does.
for (const [from, to] of [
	[join(ROOT, ".pi", "skills"), join(OUT, "skills")],
	[join(ROOT, ".pi", "themes"), join(OUT, "themes")],
]) {
	if (existsSync(from)) cpSync(from, to, { recursive: true });
}

// 3. The manifest. Core packages are declared as dependencies so `npm install`
//    in a consumer's tree fetches them, and the versions come from the
//    repository so the bundle cannot claim a version it was not built against.
const deps = {};
for (const name of CORE) {
	const manifest = JSON.parse(readFileSync(join(ROOT, "kaioken", name, "package.json"), "utf8"));
	deps[manifest.name] = manifest.version;
}

const manifest = {
	name: "kaioken-pi",
	version: "0.1.0",
	description:
		"Deterministic truth layer for Pi: an offline symbol oracle, provenance-tracked wiki, and a verification gate that refuses to call work done until tests pass.",
	// The repository's own LICENSE is copied in rather than a licence invented
	// here. Declaring terms this bundle is not actually under would be worse
	// than declaring none.
	license: "MIT",
	type: "module",
	keywords: ["pi-package", "kaioken", "grounding", "wiki", "provenance"],
	files: ["extensions", "skills", "themes", "README.md", "LICENSE"],
	pi: {
		extensions: ["./extensions"],
		skills: ["./skills"],
		themes: ["./themes"],
	},
	peerDependencies: {
		"@earendil-works/pi-ai": "*",
		"@earendil-works/pi-coding-agent": "*",
		typebox: "*",
	},
	dependencies: deps,
	engines: { node: ">=22" },
};

writeFileSync(join(OUT, "package.json"), `${JSON.stringify(manifest, null, "\t")}\n`, "utf8");

// The licence travels with the package, so a consumer can read the terms they
// actually received.
const license = join(ROOT, "LICENSE");
if (existsSync(license)) cpSync(license, join(OUT, "LICENSE"));

// A package that installs into someone else's repository has to say what it
// did to it and how to undo that, or it is a surprise.
writeFileSync(
	join(OUT, "README.md"),
	`# kaioken-pi

A deterministic truth layer for [Pi](https://pi.dev). It answers questions about
a repository from an index of the repository rather than from a model's memory,
and it refuses to call work finished until the tests say so.

## Install

\`\`\`bash
pi install npm:kaioken-pi
\`\`\`

## What you get

A header, seven tools, sixteen commands, two themes, and a hook that blocks
destructive shell commands.

### The header

The KAIOKEN wordmark under its amber→red gradient, beside a panel that shows
what you otherwise cannot see together: repo, branch, model, provider, whether
a key is set, and what \`.kaioken/\` currently holds — including how much of it is
still true.

It animates twice and then stops. A boot curtain on startup (the wordmark rises
a row at a time, an aura opens under it, three lines type themselves out) and a
CRT power-off on quit. Nothing else moves: DESIGN.md's axiom is *if everything
glows, nothing communicates*, so the only other motion is a rule that sweeps
while a run is actually in flight.

Set \`NO_MOTION=1\` or \`NO_COLOR=1\` to switch all of it off.

### The tools

| Tool | What it answers |
| --- | --- |
| \`kaio_symbol_lookup\` | Does this symbol exist, and where? Or a negative guarantee. |
| \`kaio_read_file\` | Exact line ranges with verified anchors, for quoting code. |
| \`kaio_wiki_search\` | Search the generated wiki, cards and skills. |
| \`kaio_impact\` | What breaks if this symbol changes. |
| \`kaio_skill_load\` | Load a task procedure distilled from this repository. |
| \`kaio_status\` | What has drifted since the documents were written. |
| \`kaio_verify\` | Run the repository's own tests, build and lint. |

### The commands

Sixteen \`/kaio-*\` commands for the pipeline: \`scan\`, \`symbols\`,
\`search\`, \`status\`, \`verify\`, \`graph\`, \`serve\`, \`export\`, \`plan\`,
\`cards\`, \`wiki\`, \`update\`, \`research\`, \`skills\`, \`delegate\`,
\`merge\`.

## What it costs

Nothing until you ask for it. The scanning, indexing, search, graph, impact and
verification paths are entirely offline — no network, no API key, no model. They
run on a fresh clone with no configuration.

The generative stages (\`plan\`, \`cards\`, \`wiki\`, \`update\`, \`research\`,
\`skills\`) need a model bound to the session. Every one of them estimates its
cost from the active model's published rates and asks before spending, and the
multiplier dial (\`×1\`–\`×10\`) sets the budget up front.

## What it writes

Everything goes under \`.kaioken/\` in the repository being worked on:

| Path | Contents |
| --- | --- |
| \`.kaioken/scan.json\` | Every file, with hashes. |
| \`.kaioken/index.json\` | Every declaration, by AST. |
| \`.kaioken/search-index/\` | The BM25 corpus. |
| \`.kaioken/wiki/\` | Generated chapters. |
| \`.kaioken/cards/\` | Per-module knowledge cards. |
| \`.kaioken/skills/\` | Task procedures. |
| \`.kaioken/provenance.json\` | What each document was written from. |
| \`.kaioken/verification.json\` | Which claims held up, and which did not. |

Nothing outside \`.kaioken/\` is written, and nothing is written outside the
repository. Delete \`.kaioken/\` to remove every trace.

## Honest limits

- The wiki, cards and skills are model output. Every claim in them is checked
  against the index at generation time and the failures are recorded in
  \`.kaioken/verification.json\`, but a claim that passed is still a claim.
  Where a document and the code disagree, the code is right.
- Grounding is only as good as the index. A language without a parser is
  indexed by file, not by declaration, and the oracle will say so rather than
  guess.
- The verifier runs your repository's own tests. It has no opinion about
  whether those tests are any good.
`,
	"utf8",
);

const skillCount = existsSync(join(OUT, "skills"))
	? walk(join(OUT, "skills")).filter((f) => f.endsWith(".md")).length
	: 0;
const themeCount = existsSync(join(OUT, "themes"))
	? walk(join(OUT, "themes")).filter((f) => f.endsWith(".json")).length
	: 0;

console.log(`built kaioken-pi/`);
console.log(`  extensions   ${rewritten} file(s) rewritten to package specifiers`);
console.log(`  dependencies ${Object.keys(deps).length} @kaioken/* package(s)`);
console.log(`  skills       ${skillCount}`);
console.log(`  themes       ${themeCount}`);
