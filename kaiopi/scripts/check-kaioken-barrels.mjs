#!/usr/bin/env node
/**
 * Which core symbols does the bridge reach for, and does each package barrel
 * actually export them?
 *
 * The bridge imports core code by relative path (`../../../../kaioken/scan/src/scan.ts`)
 * because in the repository that is the source of truth. A published Pi package
 * cannot: it installs `@kaioken/*` from npm and must import through the package
 * name. That rewrite is only faithful if every symbol the bridge imports is
 * reachable from the barrel — a barrel gap would turn into a runtime crash in a
 * stranger's session, which is precisely the failure the whole design exists to
 * prevent. So it is measured here rather than discovered there.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const BRIDGE = ".pi/extensions/kaioken";

function walk(dir) {
	const out = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) out.push(...walk(path));
		else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts")) out.push(path);
	}
	return out;
}

/** Named bindings introduced by an import statement. */
function namedBindings(clause) {
	const braces = /\{([\s\S]*)\}/.exec(clause);
	if (!braces) return [];
	return braces[1]
		.split(",")
		.map((part) => part.trim())
		.filter(Boolean)
		.map((part) => {
			// `type Foo` and `Foo as Bar` both bind the first identifier.
			const bare = part.replace(/^type\s+/, "");
			const as = /^(\w+)\s+as\s+/.exec(bare);
			return as ? as[1] : bare.trim();
		})
		.filter((name) => /^[A-Za-z_$][\w$]*$/.test(name));
}

/**
 * Exported names reachable from a barrel.
 *
 * Two forms matter and both are easy to miss: `export type { ... }` is not
 * `export { ... }`, and `export * from "./x.ts"` re-exports everything in `x`.
 * An earlier version of this script handled neither and reported eight symbols
 * as missing that the barrels plainly contained — the tool was wrong, not the
 * code, which is why its output is read before anything is "fixed".
 */
function barrelExports(file, seen = new Set()) {
	if (seen.has(file)) return new Set();
	seen.add(file);

	let source;
	try {
		source = readFileSync(file, "utf8");
	} catch {
		return new Set();
	}

	const names = new Set();
	const dir = file.slice(0, file.lastIndexOf("/"));

	// `export { a, type B as C } from "..."`, with or without `type` after export.
	for (const match of source.matchAll(/export\s+(?:type\s+)?\{([\s\S]*?)\}\s*(?:from\s*["']([^"']+)["'])?/g)) {
		for (const part of match[1].split(",")) {
			const bare = part.trim().replace(/^type\s+/, "");
			if (!bare) continue;
			const as = /^\w+\s+as\s+(\w+)$/.exec(bare);
			names.add(as ? as[1] : bare);
		}
	}

	// `export * from "./x.ts"` re-exports whatever x exports.
	for (const match of source.matchAll(/export\s+\*\s+from\s+["']([^"']+)["']/g)) {
		if (!match[1].startsWith(".")) continue;
		// A declaration file re-exports `./gate.ts` while the emitted file on
		// disk is `gate.d.ts`. Following the specifier literally looks for a
		// file that does not exist, which is how `verify` was reported as
		// missing `runVerify` when its dist plainly re-exported it.
		const specifier = file.endsWith(".d.ts") ? match[1].replace(/\.ts$/, ".d.ts") : match[1];
		const target = `${dir}/${specifier}`.replace(/\/\.\//g, "/");
		for (const name of barrelExports(target, seen)) names.add(name);
	}

	// Declarations, including the `declare` a .d.ts puts before const/function.
	for (const match of source.matchAll(
		/export\s+(?:declare\s+)?(?:async\s+)?(?:function|const|let|var|class|interface|type|enum)\s+(\w+)/g,
	)) {
		names.add(match[1]);
	}
	return names;
}

/**
 * The file a consumer actually imports.
 *
 * This matters more than it looks. `@kaioken/scan` resolves through the
 * package's `exports` to `dist/index.d.ts`, not to `src/index.ts`. An earlier
 * version of this script read the source barrel and reported success while
 * three packages shipped a stale `dist` missing symbols the bridge imports —
 * the check was green and the package was broken. Reading the resolved entry
 * point means this asserts what an installed consumer sees.
 */
function barrelOf(pkg) {
	const dir = `kaioken/${pkg.replace("@kaioken/", "")}`;
	let manifest;
	try {
		manifest = JSON.parse(readFileSync(`${dir}/package.json`, "utf8"));
	} catch {
		return null;
	}
	const entry =
		manifest.exports?.["."]?.types ?? manifest.exports?.["."]?.default ?? manifest.types ?? manifest.main;
	if (!entry) return null;
	return `${dir}/${entry.replace(/^\.\//, "")}`;
}

/**
 * Split a file into import statements.
 *
 * A regex over the whole file cannot do this: `import { a } from "x"` on one
 * line and `import { b } from "../../kaioken/y/src/z.ts"` on the next would be
 * read as a single statement, attributing `a` to the wrong package. Statements
 * are cut at the semicolon that ends them, which is unambiguous in this codebase
 * because every import is a single statement terminated that way.
 */
function importStatements(source) {
	return source.match(/\bimport\b[^;]*;/g) ?? [];
}

/** `import { a, type B as C } from "spec"` -> { clause, specifier }. */
function parseImport(statement) {
	const from = /\sfrom\s+["']([^"']+)["']/.exec(statement);
	if (!from) return null;
	const clause = statement.slice(statement.indexOf("import") + "import".length, from.index);
	return { clause, specifier: from[1] };
}

const wanted = new Map();
const files = walk(BRIDGE);

for (const file of files) {
	const source = readFileSync(file, "utf8");
	for (const statement of importStatements(source)) {
		const parsed = parseImport(statement);
		if (!parsed) continue;
		// Only imports that cross from the bridge into a kaioken package.
		const cross = /(?:\.\.\/)+kaioken\/([a-z]+)\/src\/([^"']+)$/.exec(parsed.specifier);
		if (!cross) continue;

		const pkg = `@kaioken/${cross[1]}`;
		if (!wanted.has(pkg)) wanted.set(pkg, new Map());
		const bySymbol = wanted.get(pkg);
		for (const name of namedBindings(parsed.clause)) {
			if (!bySymbol.has(name)) bySymbol.set(name, new Set());
			bySymbol.get(name).add(cross[2]);
		}
	}
}

let missing = 0;
let checked = 0;

for (const pkg of [...wanted.keys()].sort()) {
	const barrel = barrelOf(pkg);
	let exports;
	try {
		if (!barrel || !statSync(barrel).isFile()) throw new Error("no barrel");
		exports = barrelExports(barrel);
	} catch {
		console.log(`\n${pkg}: NO ENTRY POINT at ${barrel ?? "(unresolvable)"}`);
		missing += wanted.get(pkg).size;
		continue;
	}

	const gaps = [...wanted.get(pkg).keys()].filter((name) => !exports.has(name)).sort();
	checked += wanted.get(pkg).size;
	console.log(
		`\n${pkg}: ${wanted.get(pkg).size} symbol(s) wanted, ${gaps.length} missing from the barrel`,
	);
	for (const gap of gaps) {
		missing++;
		console.log(`  MISSING ${gap}  (from ${[...wanted.get(pkg).get(gap)].join(", ")})`);
	}
}

console.log(`\n${checked} symbol(s) checked across ${wanted.size} package(s); ${missing} unreachable.`);
process.exit(missing > 0 ? 1 : 0);
