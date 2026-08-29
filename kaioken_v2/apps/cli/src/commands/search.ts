import { resolve } from "node:path";
import { type Kind, SearchIndex } from "@kaioken/search";
import { ensureIndex } from "../artifacts.js";
import type { Flags } from "../main.js";

const KINDS: Kind[] = ["wiki", "card", "skill", "symbol"];

/**
 * Lexical search over everything the engine knows. No credentials, no network,
 * no model — this command is the one that has to keep working when everything
 * above it is unavailable.
 */
export async function runSearch(flags: Flags): Promise<number> {
	const root = resolve(flags.root);
	const query = flags.positional.join(" ").trim();

	if (!query) {
		process.stderr.write("kaioken search: expected a query\n");
		return 1;
	}

	const kinds = flags.kind ? parseKinds(flags.kind) : undefined;
	if (flags.kind && !kinds) {
		process.stderr.write(`kaioken search: unknown kind "${flags.kind}" (${KINDS.join(", ")})\n`);
		return 1;
	}

	// The corpus is built from the phase-1 artifacts, so make sure they exist
	// before opening the index — `search` in a fresh clone should just work.
	await ensureIndex(root, flags.force);
	const index = await SearchIndex.open(root, { force: flags.force });
	const hits = await index.search({
		text: query,
		limit: flags.limit ?? 10,
		...(kinds ? { kinds } : {}),
	});

	if (flags.json) {
		process.stdout.write(
			`${JSON.stringify({ query, semantic: index.semantic, hits }, null, 2)}\n`,
		);
		return hits.length > 0 ? 0 : 2;
	}

	if (index.chunkCount === 0) {
		process.stdout.write("nothing indexed yet — run `kaioken scan` first\n");
		return 2;
	}

	if (hits.length === 0) {
		process.stdout.write(`no results for "${query}"\n`);
		return 2;
	}

	const out: string[] = [];
	for (const hit of hits) {
		const where = hit.line ? `${hit.path}:${hit.line}` : hit.path;
		out.push(`${where}  [${hit.kind}]${hit.via.includes("semantic") ? " [semantic]" : ""}`);
		if (hit.heading) out.push(`  ${hit.heading}`);
		out.push(`  ${hit.snippet}`);
		out.push("");
	}

	// Say plainly which rankings ran, rather than letting the user assume both.
	out.push(
		index.semantic
			? `${hits.length} results — lexical + semantic ranking`
			: `${hits.length} results — lexical ranking only (no embedding provider configured)`,
	);

	process.stdout.write(`${out.join("\n")}\n`);
	return 0;
}

function parseKinds(raw: string): Kind[] | null {
	const parts = raw.split(",").map((p) => p.trim()).filter(Boolean);
	const out: Kind[] = [];
	for (const part of parts) {
		if (!KINDS.includes(part as Kind)) return null;
		out.push(part as Kind);
	}
	return out.length > 0 ? out : null;
}
