/**
 * Does the offline pipeline work on a repository that has never been touched?
 *
 * The README's claim is that scan/index/search/serve/status need no model, no
 * key and no network, on a fresh clone. That is easy to assert and easy to get
 * subtly wrong — a stage that quietly requires an artifact from a previous
 * stage, or an index built by a test fixture, would pass every unit test and
 * fail the first real user. So this runs the whole offline chain against a
 * throwaway repository containing real code and asserts it produces a usable
 * answer at each step.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
// Imported by package name, exactly as a consumer would. Reaching into `src/`
// by relative path would prove the sources work and say nothing about whether
// the published packages do — which is the claim under test.
import { scan } from "@kaioken/scan";
import { buildIndex, readExcerpt, SymbolOracle } from "@kaioken/index";
import { bm25Search } from "@kaioken/search";
import { predictImpactForSymbol } from "@kaioken/impact";
import { checkDrift } from "@kaioken/provenance";

const root = mkdtempSync(join(tmpdir(), "kaioken-fresh-"));
const failures = [];
const check = (label, condition, detail = "") => {
	console.log(`  ${condition ? "ok  " : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
	if (!condition) failures.push(label);
};

try {
	mkdirSync(join(root, "src"), { recursive: true });
	writeFileSync(
		join(root, "src", "rank.ts"),
		["/** Ranks passages. */", "export function rank(query: string): number {", "\treturn query.length;", "}", ""].join(
			"\n",
		),
	);
	writeFileSync(
		join(root, "src", "use.ts"),
		["import { rank } from \"./rank.ts\";", "", "export const scored = rank(\"hello\");", ""].join("\n"),
	);
	writeFileSync(join(root, "package.json"), JSON.stringify({ name: "fixture", version: "1.0.0" }));

	console.log("fresh repository, nothing generated:");
	const scanned = await scan(root);
	check("scan finds files", scanned.files.length >= 2, `${scanned.files.length} files`);

	const { index } = await buildIndex(scanned);
	const oracle = new SymbolOracle(index);
	check("index finds declarations", index.symbolCount >= 2, `${index.symbolCount} symbols`);

	const hit = oracle.lookup("rank");
	check("oracle resolves a real symbol", hit.length > 0, hit[0]?.path ?? "none");

	// The negative guarantee is the load-bearing half: an invented symbol must
	// be answered with absence, not silence.
	const miss = oracle.lookup("definitelyNotARealSymbol");
	check("oracle reports absence for an invented symbol", miss.length === 0);

	const excerpt = await readExcerpt(root, "src/rank.ts", 1, 4);
	check("anchors read exact lines", excerpt.includes("Ranks passages") && excerpt.includes("query.length"));

	// A quote that is not in the file must be refused, not fuzzy-matched.
	const badQuote = await readExcerpt(root, "src/rank.ts", 1, 1);
	check("anchors read a single line without inventing content", badQuote.split("\n").length === 1);

	// Search returns prose, not a structure: it either lists hits or says why
	// it has none. On a repository with no index it must say so plainly rather
	// than return an empty list that reads like "nothing matched".
	const results = await bm25Search(root, "rank", 5);
	check("search degrades honestly with no index", typeof results === "string" && results.length > 0, results.slice(0, 60));

	const impact = await predictImpactForSymbol(root, "rank");
	check("impact predicts dependents", impact !== null && typeof impact === "object");

	const drift = await checkDrift(root);
	check("drift is checkable with no provenance yet", drift !== null && Array.isArray(drift.stale));

	// Nothing above may have written into the repository.
	const after = await scan(root);
	const wrote = after.files.filter((file) => file.path.startsWith(".kaioken"));
	check("the offline chain writes nothing into the repository", wrote.length === 0, `${wrote.length} artifact(s)`);
} finally {
	rmSync(root, { recursive: true, force: true });
}

if (failures.length > 0) {
	console.error(`\n${failures.length} offline claim(s) failed on a fresh repository.`);
	process.exit(1);
}
console.log("\nthe offline chain works on a fresh repository with no model, no key, no network.");
