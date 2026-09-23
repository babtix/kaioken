// One-shot maintenance script: give every kaioken workspace package a `test`
// script and a pinned vitest devDependency so `npm test -ws` actually covers
// the ported offline suites (Invariant 10: offline test discipline).
import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const VITEST = "4.1.9";
const roots = ["kaioken", ".pi/extensions/kaioken"];

const targets = [];
for (const root of roots) {
	if (!existsSync(root)) continue;
	for (const entry of readdirSync(root, { withFileTypes: true })) {
		if (!entry.isDirectory()) continue;
		const dir = join(root, entry.name);
		if (existsSync(join(dir, "package.json")) && existsSync(join(dir, "test"))) targets.push(dir);
	}
	// The bridge itself lives at the root of `.pi/extensions/kaioken`.
	if (root.startsWith(".") && existsSync(join(root, "package.json")) && existsSync(join(root, "test"))) {
		targets.push(root);
	}
}

const changed = [];
for (const dir of targets) {
	const pkgPath = join(dir, "package.json");
	const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
	let touched = false;

	pkg.scripts ??= {};
	if (pkg.scripts.test !== "vitest --run") {
		pkg.scripts.test = "vitest --run";
		touched = true;
	}

	pkg.devDependencies ??= {};
	if (pkg.devDependencies.vitest !== VITEST) {
		pkg.devDependencies.vitest = VITEST;
		touched = true;
	}

	if (touched) {
		writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");
		changed.push(dir);
	}
}

console.log(`patched ${changed.length} package(s):`);
for (const dir of changed) console.log(`  ${dir}`);
