import type {
	GraphBuildInput,
	GraphEdge,
	GraphNode,
	KnowledgeGraph,
	NodeKind,
} from "./types.js";

/**
 * Derive the knowledge graph from artifacts that already exist.
 *
 * Deliberately a pure function of its input: nothing is read from disk here,
 * because the caller's mix of tenants differs (a repository may have cards but
 * no wiki, or neither), and because a graph that could only be built where the
 * filesystem looks one way would be a graph that tests could not build at all.
 *
 * The edge rules are conservative on purpose. `shared_source` connects two
 * documents that provably draw on the same file; `references` connects a
 * document to another whose *source* it names. Neither invents a semantic
 * similarity — a wrong-looking edge in a handoff artifact costs more trust
 * than a missing one.
 */
export function buildGraph(input: GraphBuildInput): KnowledgeGraph {
	const nodes: GraphNode[] = [];
	const records = input.provenance;

	for (const record of records) {
		nodes.push({
			id: record.document,
			kind: nodeKindFor(record),
			title: input.titles?.[record.document] ?? record.document,
			...(input.paths?.[record.document] ? { path: input.paths[record.document] } : {}),
		});
	}

	for (const skill of input.skills ?? []) {
		// A skill has no provenance record, but it is knowledge a consumer of
		// the export should see.
		nodes.push({
			id: `skill:${skill.name}`,
			kind: "skill",
			title: skill.name,
			path: skill.path,
		});
	}

	const edges: GraphEdge[] = [];

	// written_from: one edge per source file. It is the graph's ground truth,
	// and it is what makes shared_source derivable rather than guessed.
	for (const record of records) {
		for (const source of record.sources) {
			edges.push({
				from: record.document,
				to: source.path,
				kind: "written_from",
				via: [source.path],
			});
		}
	}

	const sourcesByDocument = new Map(
		records.map((r) => [r.document, new Set(sourcePaths(r))]),
	);

	// shared_source: documents over the same ground. O(n^2) in documents, but
	// a repository's document count is tens, not thousands — and the pair
	// comparison is exactly the question being asked.
	for (let i = 0; i < records.length; i++) {
		for (let j = i + 1; j < records.length; j++) {
			const a = records[i] as (typeof records)[number];
			const b = records[j] as (typeof records)[number];
			const shared = [...intersection(sourcePaths(a), sourcePaths(b))];
			if (shared.length > 0) {
				edges.push({ from: a.document, to: b.document, kind: "shared_source", via: shared });
			}
		}
	}

	// references: a document names a file another document was written from.
	// Only cross-document paths count — naming your own sources is not a
	// reference, it is a citation of the ground you already stand on.
	for (const record of records) {
		const claims = input.claims?.[record.document] ?? [];
		const own = sourcesByDocument.get(record.document) as ReadonlySet<string>;
		const byPath = new Map<string, string[]>();

		for (const claim of claims) {
			if (!isPathLike(claim)) continue;
			for (const path of resolveClaim(claim, sourcesByDocument)) {
				if (own.has(path)) continue;
				const list = byPath.get(path) ?? [];
				if (!list.includes(claim)) list.push(claim);
				byPath.set(path, list);
			}
		}

		for (const [path, via] of [...byPath].sort()) {
			// One edge per target document the path grounds — several documents
			// may be written from the same file, and each is referenced.
			for (const [target, sources] of sourcesByDocument) {
				if (target === record.document || !sources.has(path)) continue;
				edges.push({ from: record.document, to: target, kind: "references", via });
			}
		}
	}

	return {
		version: 1,
		generatedAt: input.generatedAt ?? new Date().toISOString(),
		nodes: nodes.sort((a, b) => a.id.localeCompare(b.id)),
		edges: edges.sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to)),
	};
}

/**
 * Node kinds from a provenance document id.
 *
 * `card:<id>` and `skill:<id>` are namespaced; everything else is a wiki
 * path, and the record itself distinguishes a section (it carries a
 * sectionId) from a chapter (it does not).
 */
export function nodeKindFor(record: {
	document: string;
	sectionId?: string;
}): NodeKind {
	if (record.document.startsWith("card:")) return "card";
	if (record.document.startsWith("skill:")) return "skill";
	return record.sectionId ? "section" : "chapter";
}

/** Strip a namespace prefix, for consumers that want the bare id. */
export function splitDocumentId(document: string): { kind: NodeKind; id: string } {
	if (document.startsWith("card:")) return { kind: "card", id: document.slice(5) };
	if (document.startsWith("skill:")) return { kind: "skill", id: document.slice(6) };
	return { kind: "chapter", id: document };
}

function sourcePaths(record: { sources: readonly { path: string }[] }): string[] {
	return record.sources.map((s) => s.path);
}

function intersection(a: readonly string[], b: readonly string[]): string[] {
	const set = new Set(b);
	return a.filter((x) => set.has(x)).sort();
}

/**
 * Resolve a claimed path to the canonical source path it names.
 *
 * An exact match wins outright. Otherwise the claim is treated as shorthand —
 * `scan.ts` for `packages/scan/src/scan.ts` — and accepted only when every
 * suffix match agrees on one canonical path. Shorthand that resolves two ways
 * matches nothing: an ambiguous edge is a wrong edge, and the graph is only
 * worth what its edges cost.
 */
function resolveClaim(
	claim: string,
	sourcesByDocument: ReadonlyMap<string, ReadonlySet<string>>,
): string[] {
	const all = new Set<string>();
	for (const sources of sourcesByDocument.values()) {
		for (const path of sources) all.add(path);
	}

	const normalised = claim.split(BACKSLASH).join("/");
	if (all.has(normalised)) return [normalised];

	const lower = normalised.toLowerCase();
	const candidates = new Set<string>();
	for (const path of all) {
		const slashed = path.split(BACKSLASH).join("/");
		if (slashed.toLowerCase().endsWith(`/${lower}`)) candidates.add(slashed);
	}
	return candidates.size === 1 ? [...candidates] : [];
}

const BACKSLASH = "\\";

/** A path-looking token: a slash somewhere, or a known-ish extension at the end. */
function isPathLike(text: string): boolean {
	return text.includes("/") || /\.[A-Za-z0-9]{1,10}$/.test(text);
}
