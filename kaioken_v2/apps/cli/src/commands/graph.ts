import { resolve } from "node:path";
import {
	buildGraph,
	graphPath,
	graphStats,
	renderGraphMarkdown,
	splitDocumentId,
	writeGraph,
	type GraphBuildInput,
} from "@kaioken/graph";
import { readCards } from "@kaioken/plan";
import { readScanArtifact, scan, writeScanArtifact } from "@kaioken/scan";
import { readProvenance, wikiDir } from "@kaioken/wiki";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import type { Flags } from "../main.js";
import { gatherProvenance } from "./status.js";

/**
 * The knowledge graph, derived and shown.
 *
 * No model, no credentials: everything here is a comparison of artifacts that
 * already exist. The command exists because the relationships the graph makes
 * explicit — which documents share ground, what a handoff would carry — are
 * easier to inspect as a rendered summary than as JSON, and because writing
 * `.kaioken/graph.json` gives `export` (and anything else) a stable artifact
 * to read instead of re-deriving the graph per consumer.
 */
export async function runGraph(flags: Flags): Promise<number> {
	const root = resolve(flags.root);
	const input = await gatherInput(root);

	if (input.provenance.length === 0 && (input.skills?.length ?? 0) === 0) {
		process.stderr.write(
			"kaioken graph: nothing to derive a graph from — run `kaioken cards` or `kaioken wiki` first\n",
		);
		return 1;
	}

	const graph = buildGraph(input);
	await writeGraph(root, graph);
	const stats = graphStats(graph, { scanPaths: input.scanPaths });

	if (flags.json) {
		process.stdout.write(`${JSON.stringify({ graph, stats }, null, 2)}\n`);
		return 0;
	}

	process.stdout.write(renderGraphMarkdown(graph, stats));
	process.stdout.write(`\nwrote ${graphPath(root)}\n`);
	return 0;
}

/**
 * Every tenant's contribution to the graph, read from where each one stores it.
 *
 * The claims come off disk too: a chapter's Markdown re-parsed for code spans
 * would fork the claim logic, and `extractClaims` already exists — but the
 * stored documents are the artifact of record, and re-deriving claims at graph
 * time would silently diverge from what verification actually checked. Code
 * spans are re-extracted here with the same rules wiki verification used,
 * which is acceptable only because the extraction is a pure function; if it
 * ever stops being one, the claims must move into the artifact instead.
 */
async function gatherInput(root: string): Promise<GraphBuildInput> {
	const records = await gatherProvenance(root);
	const titles: Record<string, string> = {};
	const paths: Record<string, string> = {};
	const claims: Record<string, string[]> = {};

	const wikiRoot = wikiDir(root);
	for (const record of records) {
		if (splitDocumentId(record.document).kind === "card") continue;
		try {
			const body = await readFile(join(wikiRoot, record.document), "utf8");
			claims[record.document] = extractCodeSpans(body);
			titles[record.document] = firstHeading(body) ?? record.document;
			paths[record.document] = record.document;
		} catch {
			// A provenance record whose document is gone still belongs in the
			// graph: it is the honest record of what was generated.
		}
	}

	for (const card of await readCards(root)) {
		const id = `card:${card.moduleId}`;
		titles[id] = card.name;
		claims[id] = card.entryPoints.map((entry) => entry.file);
	}

	const skills: { name: string; path: string }[] = [];
	const skillsRoot = join(root, ".kaioken", "skills");
	try {
		for (const entry of await readdir(skillsRoot, { withFileTypes: true })) {
			if (entry.isFile() && entry.name.endsWith(".md")) {
				skills.push({ name: entry.name, path: join(".kaioken", "skills", entry.name) });
			}
		}
	} catch {
		// No skills directory: the graph covers the other tenants.
	}

	const scanResult = (await readScanArtifact(root)) ?? (await (async () => {
		const fresh = await scan(root);
		await writeScanArtifact(root, fresh);
		return fresh;
	})());

	return {
		provenance: records,
		claims,
		titles,
		paths,
		skills,
		scanPaths: scanResult.files.filter((f) => !f.binary).map((f) => f.path),
	};
}

/** The same gatherProvenance as `status`: one list, all tenants. */
const CODE_SPAN = /`([^`\n]+)`/g;
const PATH_LIKE = /^[\w.\-/]+\.\w{1,10}$/;

/**
 * Code spans that look like repository paths.
 *
 * Narrower than the wiki verifier's claim set on purpose: the graph only
 * derives *cross-document* edges, and only a path can resolve to another
 * document's ground. Symbols would need the oracle, and `references` derived
 * from shared symbols would connect nearly every document to nearly every
 * other — edges that say nothing.
 */
function extractCodeSpans(body: string): string[] {
	const out: string[] = [];
	const seen = new Set<string>();
	for (const match of body.matchAll(CODE_SPAN)) {
		const span = (match[1] ?? "").trim();
		if (!span || !PATH_LIKE.test(span) || seen.has(span)) continue;
		seen.add(span);
		out.push(span);
	}
	return out;
}

function firstHeading(body: string): string | null {
	for (const line of body.split(/\r?\n/)) {
		const heading = /^#\s+(.+)$/.exec(line);
		if (heading) return (heading[1] as string).trim();
	}
	return null;
}
