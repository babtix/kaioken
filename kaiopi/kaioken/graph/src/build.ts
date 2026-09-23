import type {
	CodeGraphInput,
	GraphBuildInput,
	GraphEdge,
	GraphNode,
	KnowledgeGraph,
	NodeKind,
} from "./types.ts";

/** Guarantee that every edge endpoint refers to a registered node in the graph. */
export function assertGraphIntegrity(graph: KnowledgeGraph): void {
	const nodeIds = new Set(graph.nodes.map((n) => n.id));
	for (const edge of graph.edges) {
		if (!nodeIds.has(edge.from)) {
			throw new Error(`Integrity violation: edge from="${edge.from}" does not exist in graph nodes`);
		}
		if (!nodeIds.has(edge.to)) {
			throw new Error(`Integrity violation: edge to="${edge.to}" does not exist in graph nodes`);
		}
	}
}

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
	const nodeMap = new Map<string, GraphNode>();
	const records = input.provenance;

	for (const record of records) {
		nodeMap.set(record.document, {
			id: record.document,
			kind: nodeKindFor(record),
			title: input.titles?.[record.document] ?? record.document,
			...(input.paths?.[record.document] ? { path: input.paths[record.document] } : {}),
		});

		// Register every source.path as a node so written_from edges never dangle
		for (const source of record.sources) {
			if (!nodeMap.has(source.path)) {
				nodeMap.set(source.path, {
					id: source.path,
					kind: "source",
					title: source.path,
					path: source.path,
				});
			}
		}
	}

	for (const skill of input.skills ?? []) {
		// A skill has no provenance record, but it is knowledge a consumer of
		// the export should see.
		const id = `skill:${skill.name}`;
		nodeMap.set(id, {
			id,
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

		// One edge per document referenced, carrying every path that grounds the
		// reference. Emitting one edge per *path* meant a document naming two
		// files that belong to the same chapter produced two identical
		// `references` edges, which double-counted in the stats and rendered as
		// a repeated bullet.
		const byTarget = new Map<string, string[]>();
		for (const [path, via] of [...byPath].sort(([a], [b]) => a.localeCompare(b))) {
			for (const [target, sources] of sourcesByDocument) {
				if (target === record.document || !sources.has(path)) continue;
				const merged = byTarget.get(target) ?? [];
				for (const claim of via) if (!merged.includes(claim)) merged.push(claim);
				byTarget.set(target, merged);
			}
		}

		for (const [target, via] of [...byTarget].sort(([a], [b]) => a.localeCompare(b))) {
			edges.push({ from: record.document, to: target, kind: "references", via });
		}
	}

	const nodes = [...nodeMap.values()].sort((a, b) => a.id.localeCompare(b.id));
	const nodeIds = new Set(nodes.map((n) => n.id));
	const validEdges = edges
		.filter((e) => nodeIds.has(e.from) && nodeIds.has(e.to))
		.sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to));

	const graph: KnowledgeGraph = {
		version: 1,
		generatedAt: input.generatedAt ?? new Date().toISOString(),
		nodes,
		edges: validEdges,
	};

	assertGraphIntegrity(graph);
	return graph;
}

/**
 * Build a code dependency graph of file and module imports/re-exports.
 */
export function buildCodeGraph(input: CodeGraphInput): KnowledgeGraph {
	const nodeMap = new Map<string, GraphNode>();
	const knownFiles = new Set<string>();

	for (const p of input.scanPaths ?? []) {
		knownFiles.add(toPosix(p));
	}
	for (const f of input.files ?? []) {
		knownFiles.add(toPosix(f.path));
	}
	for (const f of input.index?.files ?? []) {
		knownFiles.add(toPosix(f.path));
	}
	if (input.imports) {
		for (const p of Object.keys(input.imports)) {
			knownFiles.add(toPosix(p));
		}
	}

	for (const filePath of knownFiles) {
		nodeMap.set(filePath, {
			id: filePath,
			kind: "file",
			title: filePath,
			path: filePath,
		});
	}

	const edges: GraphEdge[] = [];
	const seenEdges = new Map<string, GraphEdge>();

	const addEdge = (from: string, to: string, kind: "imports" | "reexports", via: string) => {
		if (from === to) return;
		if (!knownFiles.has(from) || !knownFiles.has(to)) return;

		const key = `${from}\0${to}\0${kind}`;
		const existing = seenEdges.get(key);
		if (existing) {
			if (!existing.via.includes(via)) existing.via.push(via);
		} else {
			const edge: GraphEdge = { from, to, kind, via: [via] };
			seenEdges.set(key, edge);
			edges.push(edge);
		}
	};

	for (const file of input.files ?? []) {
		const fromPath = toPosix(file.path);

		for (const spec of file.imports ?? []) {
			const target = resolveImportSpecifier(fromPath, spec, knownFiles);
			if (target) addEdge(fromPath, target, "imports", spec);
		}

		for (const re of file.reexports ?? []) {
			const target = resolveImportSpecifier(fromPath, re.from, knownFiles);
			if (target) addEdge(fromPath, target, "reexports", re.from);
		}

		const sourceCode = file.content ?? file.source;
		if (sourceCode) {
			for (const spec of extractImportsFromSource(sourceCode)) {
				const target = resolveImportSpecifier(fromPath, spec, knownFiles);
				if (target) addEdge(fromPath, target, "imports", spec);
			}
		}
	}

	for (const file of input.index?.files ?? []) {
		const fromPath = toPosix(file.path);
		for (const re of file.reexports ?? []) {
			const target = resolveImportSpecifier(fromPath, re.from, knownFiles);
			if (target) addEdge(fromPath, target, "reexports", re.from);
		}
	}

	if (input.imports) {
		for (const [from, specifiers] of Object.entries(input.imports)) {
			const fromPath = toPosix(from);
			for (const spec of specifiers) {
				const target = resolveImportSpecifier(fromPath, spec, knownFiles);
				if (target) addEdge(fromPath, target, "imports", spec);
			}
		}
	}

	const nodes = [...nodeMap.values()].sort((a, b) => a.id.localeCompare(b.id));
	const nodeIds = new Set(nodes.map((n) => n.id));
	const validEdges = edges
		.filter((e) => nodeIds.has(e.from) && nodeIds.has(e.to))
		.sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to));

	const graph: KnowledgeGraph = {
		version: 1,
		generatedAt: input.generatedAt ?? new Date().toISOString(),
		nodes,
		edges: validEdges,
	};

	assertGraphIntegrity(graph);
	return graph;
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

function toPosix(path: string): string {
	return path.replace(/\\/g, "/");
}

function resolveRelative(fromFile: string, specifier: string): string {
	const lastSlash = fromFile.lastIndexOf("/");
	const baseDir = lastSlash === -1 ? "" : fromFile.slice(0, lastSlash);
	const raw = baseDir ? `${baseDir}/${specifier}` : specifier;
	const parts: string[] = [];
	for (const segment of raw.split("/")) {
		if (segment === "" || segment === ".") continue;
		if (segment === "..") {
			parts.pop();
		} else {
			parts.push(segment);
		}
	}
	return parts.join("/");
}

const EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".py", ".rs", ".go"];

function resolveImportSpecifier(
	fromFile: string,
	specifier: string,
	knownFiles: ReadonlySet<string>,
): string | null {
	const norm = toPosix(specifier);
	if (norm.startsWith("./") || norm.startsWith("../")) {
		const target = resolveRelative(fromFile, norm);
		if (knownFiles.has(target)) return target;

		for (const ext of EXTENSIONS) {
			if (knownFiles.has(`${target}${ext}`)) return `${target}${ext}`;
		}
		for (const ext of EXTENSIONS) {
			if (knownFiles.has(`${target}/index${ext}`)) return `${target}/index${ext}`;
		}
		return null;
	}

	if (knownFiles.has(norm)) return norm;
	for (const ext of EXTENSIONS) {
		if (knownFiles.has(`${norm}${ext}`)) return `${norm}${ext}`;
	}
	return null;
}

function extractImportsFromSource(source: string): string[] {
	const specifiers: string[] = [];
	const esMatches = source.matchAll(/(?:import|export)\s+(?:[\s\S]*?from\s+)?["']([^"']+)["']/g);
	for (const match of esMatches) {
		if (match[1]) specifiers.push(match[1]);
	}
	const reqMatches = source.matchAll(/\brequire\s*\(\s*["']([^"']+)["']\s*\)/g);
	for (const match of reqMatches) {
		if (match[1]) specifiers.push(match[1]);
	}
	return specifiers;
}

