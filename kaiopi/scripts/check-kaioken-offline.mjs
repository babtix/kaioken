#!/usr/bin/env node
/**
 * Assert that the offline core never reaches the network.
 *
 * Invariant 2 says `scan`, `index`, `search`, `provenance`, `impact`, `graph`,
 * `verify`, `verifycore`, `skills`, `plan`, `wiki`, `skillgen`, `modelport`,
 * `evals` and `completion` use zero network and zero keys. That is
 * the load-bearing claim of the whole architecture — it is what makes the truth
 * layer deterministic and the suite runnable without a credential — so it is
 * checked mechanically rather than asserted in prose.
 *
 * `research` is deliberately *not* in the list, though it also imports no
 * transport: it is the one core package whose job is the web, and it stays
 * offline-testable by receiving network access as injected ports from the Pi
 * bridge (`WebSearchPort`/`WebFetchPort`) rather than importing it.
 *
 * `serve` is handled separately, because it is a genuine exception rather than
 * a loophole: it must *listen* on loopback so a human can preview the wiki, and
 * must never *reach out*. Listening is not calling, so a blanket ban on
 * `node:http` would be the wrong rule — the right rule is that it binds
 * loopback only and imports no client.
 *
 * A Node script rather than a shell pipeline so it behaves identically on
 * Windows, macOS and Linux.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/** Packages that must import no transport module at all. */
const PURE_OFFLINE = [
	"kaioken/scan",
	"kaioken/index",
	"kaioken/search",
	"kaioken/provenance",
	"kaioken/impact",
	"kaioken/graph",
	"kaioken/verify",
	"kaioken/verifycore",
	"kaioken/skills",
	"kaioken/plan",
	"kaioken/wiki",
	"kaioken/skillgen",
	"kaioken/modelport",
	"kaioken/evals",
	"kaioken/completion",
];

/** Node builtins that constitute reaching the network. */
const FORBIDDEN = new Set([
	"http",
	"https",
	"net",
	"tls",
	"dns",
	"node:http",
	"node:https",
	"node:net",
	"node:tls",
	"node:dns",
]);

/** Any bare import of an HTTP client library. */
const FORBIDDEN_PACKAGES = [/^undici$/, /^axios$/, /^node-fetch$/, /^got$/, /^superagent$/];

function collectTypeScriptFiles(directory) {
	const out = [];
	let entries;
	try {
		entries = readdirSync(directory, { withFileTypes: true });
	} catch {
		return out;
	}
	for (const entry of entries) {
		const path = join(directory, entry.name);
		if (entry.isDirectory()) {
			if (entry.name === "node_modules" || entry.name === "dist" || entry.name === "fixtures") continue;
			out.push(...collectTypeScriptFiles(path));
		} else if (entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts")) {
			out.push(path);
		}
	}
	return out;
}

/** Every import specifier in a file, from `import`, `export ... from` and dynamic `import()`. */
function specifiersOf(source) {
	const out = [];
	const patterns = [
		/\bfrom\s+["']([^"']+)["']/g,
		/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
		/\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
	];
	for (const pattern of patterns) {
		for (const match of source.matchAll(pattern)) out.push(match[1]);
	}
	return out;
}

const violations = [];

for (const packageDir of PURE_OFFLINE) {
	try {
		if (!statSync(packageDir).isDirectory()) continue;
	} catch {
		continue;
	}

	for (const file of collectTypeScriptFiles(packageDir)) {
		const source = readFileSync(file, "utf8");
		for (const specifier of specifiersOf(source)) {
			const bare = specifier.replace(/^node:/, "");
			if (FORBIDDEN.has(specifier) || FORBIDDEN.has(bare)) {
				violations.push(`${relative(process.cwd(), file)} imports "${specifier}"`);
			}
			if (FORBIDDEN_PACKAGES.some((pattern) => pattern.test(specifier))) {
				violations.push(`${relative(process.cwd(), file)} imports "${specifier}"`);
			}
		}
	}
}

// `serve` may listen, but only on loopback, and must import no client.
for (const file of collectTypeScriptFiles("kaioken/serve")) {
	const source = readFileSync(file, "utf8");
	const name = relative(process.cwd(), file);

	for (const specifier of specifiersOf(source)) {
		if (FORBIDDEN_PACKAGES.some((pattern) => pattern.test(specifier))) {
			violations.push(`${name} imports the HTTP client "${specifier}"`);
		}
	}

	// The only permitted network builtin here is the listener itself.
	for (const specifier of specifiersOf(source)) {
		const bare = specifier.replace(/^node:/, "");
		if (bare === "http" && !/listen\(/.test(source)) {
			violations.push(`${name} imports node:http but never listens`);
		}
		if (["https", "net", "tls", "dns"].includes(bare)) {
			violations.push(`${name} imports "${specifier}", which is never needed to serve local files`);
		}
	}

	// A server that binds 0.0.0.0 publishes the repository to the network.
	if (/listen\(/.test(source) && !/127\.0\.0\.1|localhost/.test(source)) {
		violations.push(`${name} listens without a loopback address, which would expose the repository`);
	}
}

if (violations.length > 0) {
	console.error("The offline core must not reach the network (Invariant 2):");
	for (const violation of violations) console.error(`  ${violation}`);
	process.exit(1);
}

console.log(
	`No network access in ${PURE_OFFLINE.length} offline core package(s); serve binds loopback only.`,
);

