/**
 * cycle.ts — Transitive dependent tree calculator with circular dependency
 * cycle guards (UX-0901–UX-0910).
 *
 * Builds a full import-adjacency graph from scan results and then performs a
 * BFS traversal starting from seed files.  DFS is used internally to detect
 * back-edges (A → B → A), which are recorded in `cycles` and then skipped so
 * the traversal always terminates.
 *
 * Invariant: zero network dependencies — fully offline-testable.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A detected circular dependency chain. */
export interface CycleEntry {
	/** The file that closes the cycle. */
	path: string;
	/** The full path sequence that forms the loop, ending at `path`. */
	cyclePath: string[];
}

/** Result of a transitive dependent scan. */
export interface TransitiveDependentTree {
	/**
	 * Adjacency map: file path → direct import targets (resolved to known
	 * paths only).  Built once and shared across queries.
	 */
	graph: ReadonlyMap<string, ReadonlySet<string>>;
	/**
	 * All files (transitively) that import — directly or indirectly — from at
	 * least one seed file.  Seeds themselves are NOT included.
	 */
	transitiveDependents: ReadonlySet<string>;
	/** Every cycle detected during the traversal. */
	cycles: CycleEntry[];
}

// ---------------------------------------------------------------------------
// Import-specifier extraction (shared with predict.ts sweep)
// ---------------------------------------------------------------------------

/**
 * Extract raw import/require specifiers from source text.
 * Supports TypeScript/JS ESM, CommonJS require(), and Python imports.
 */
export function extractImportSpecifiers(content: string): string[] {
	const specs: string[] = [];
	const push = (spec: string): void => {
		const trimmed = spec.trim();
		if (trimmed) specs.push(trimmed);
	};
	let match: RegExpExecArray | null;
	// ESM from-imports
	const fromRe = /(?:import|export)\s+(?:type\s+)?[^\n;]*?\sfrom\s*['"]([^'"]+)['"]/g;
	while ((match = fromRe.exec(content)) !== null) push(match[1] as string);
	// Side-effect imports
	const sideEffectRe = /import\s*['"]([^'"]+)['"]/g;
	while ((match = sideEffectRe.exec(content)) !== null) push(match[1] as string);
	// Dynamic imports + require()
	const dynamicRe = /(?:import\s*\(\s*|require\s*\(\s*)['"]([^'"]+)['"]\s*\)/g;
	while ((match = dynamicRe.exec(content)) !== null) push(match[1] as string);
	// Python from-imports
	const pyFromRe = /^\s*from\s+([\w.]+)\s+import\b/gm;
	while ((match = pyFromRe.exec(content)) !== null) push(match[1] as string);
	// Python bare imports
	const pyImportRe = /^\s*import\s+([\w.]+(?:\s*,\s*[\w.]+)*)/gm;
	while ((match = pyImportRe.exec(content)) !== null) {
		const group = match[1] as string;
		for (const part of group.split(",")) {
			const head = part.split(/\s+as\s+/)[0]?.trim() ?? "";
			if (/^[\w.]+$/.test(head)) push(head);
		}
	}
	return specs;
}

// ---------------------------------------------------------------------------
// Path resolution
// ---------------------------------------------------------------------------

/** Normalise a posix-style path (handles ./ and ../). */
function normalizePosix(raw: string): string {
	const parts: string[] = [];
	for (const seg of raw.split("/")) {
		if (seg === "" || seg === ".") continue;
		if (seg === "..") parts.pop();
		else parts.push(seg);
	}
	return parts.join("/");
}

function tryResolveBase(base: string, known: ReadonlySet<string>): string | null {
	const candidates = [
		base,
		`${base}.ts`,
		`${base}.tsx`,
		`${base}.js`,
		`${base}.jsx`,
		`${base}.py`,
		`${base}.go`,
		`${base}.rs`,
		`${base}/index.ts`,
		`${base}/index.tsx`,
		`${base}/index.js`,
		`${base}/index.jsx`,
		`${base}/__init__.py`,
	];
	for (const c of candidates) if (known.has(c)) return c;
	return null;
}

function tryPythonCandidates(base: string, known: ReadonlySet<string>): string | null {
	for (const c of [`${base}.py`, `${base}/__init__.py`]) if (known.has(c)) return c;
	return null;
}

function resolvePythonModule(importer: string, spec: string, known: ReadonlySet<string>): string | null {
	const leadingMatch = /^\.+/.exec(spec);
	const leading = leadingMatch ? (leadingMatch[0] as string).length : 0;
	const rest = leading > 0 ? spec.slice(leading) : spec;
	const dir = importer.includes("/") ? importer.slice(0, importer.lastIndexOf("/")) : "";
	if (leading > 0) {
		const parts = dir ? dir.split("/") : [];
		const baseParts = parts.slice(0, Math.max(0, parts.length - (leading - 1)));
		const restParts = rest ? rest.split(".").filter((p) => p.length > 0) : [];
		const base = [...baseParts, ...restParts].join("/");
		return tryResolveBase(base, known) ?? tryPythonCandidates(base, known);
	}
	const dotted = spec.split(".").join("/");
	return tryResolveBase(dotted, known) ?? tryPythonCandidates(dotted, known);
}

/**
 * Resolve a raw import specifier to a known file path.
 * Returns `null` when the specifier is external or unresolvable.
 */
export function resolveImportSpec(importer: string, spec: string, known: ReadonlySet<string>): string | null {
	const trimmed = spec.trim();
	if (!trimmed) return null;
	if (trimmed.startsWith("node:") || trimmed.startsWith("http:") || trimmed.startsWith("https:")) return null;
	// Python dotted module
	if (/^[\w.]+$/.test(trimmed) && trimmed.includes(".") && !trimmed.includes("/")) {
		const py = resolvePythonModule(importer, trimmed, known);
		if (py) return py;
	}
	// Relative specifier
	if (trimmed.startsWith(".")) {
		const dir = importer.includes("/") ? importer.slice(0, importer.lastIndexOf("/")) : "";
		const raw = dir ? `${dir}/${trimmed}` : trimmed;
		return tryResolveBase(normalizePosix(raw), known);
	}
	// Bare / aliased specifier
	const stripped = trimmed.replace(/^@\//, "").replace(/^~\//, "").replace(/^\//, "");
	const direct = tryResolveBase(normalizePosix(stripped), known);
	if (direct) return direct;
	if (/^[A-Za-z0-9_./-]+$/.test(stripped) && stripped.includes("/")) {
		const suffix = `/${stripped}`;
		for (const p of known) {
			if (p === stripped || p.endsWith(suffix)) return p;
			if (p.endsWith(`${suffix}.ts`) || p.endsWith(`${suffix}.tsx`)) return p;
			if (p.endsWith(`${suffix}.js`) || p.endsWith(`${suffix}.py`)) return p;
		}
	}
	return null;
}

// ---------------------------------------------------------------------------
// Graph builder
// ---------------------------------------------------------------------------

export interface FileEntry {
	path: string;
	content: string;
}

/**
 * Build a forward-import adjacency map from the given file entries.
 * `graph.get(A)` returns the set of files that `A` imports.
 */
export function buildDependencyGraph(files: readonly FileEntry[], knownPaths: ReadonlySet<string>): Map<string, Set<string>> {
	const graph = new Map<string, Set<string>>();
	for (const file of files) {
		const targets = new Set<string>();
		for (const spec of extractImportSpecifiers(file.content)) {
			const resolved = resolveImportSpec(file.path, spec, knownPaths);
			if (resolved && resolved !== file.path) targets.add(resolved);
		}
		graph.set(file.path, targets);
	}
	return graph;
}

// ---------------------------------------------------------------------------
// Transitive traversal with cycle guards
// ---------------------------------------------------------------------------

/**
 * Find all files that transitively import from any seed.
 *
 * Direction: we want files that DEPEND ON seeds, so we first build a
 * reverse-graph (importedBy) from the forward graph.
 *
 * Cycle detection: iterative DFS with an explicit `onStack` set; when a
 * back-edge is encountered we record the cycle and do not recurse further.
 */
export function findTransitiveDependents(
	seeds: ReadonlySet<string>,
	forwardGraph: ReadonlyMap<string, ReadonlySet<string>>,
): { transitiveDependents: Set<string>; cycles: CycleEntry[] } {
	// Build reverse graph: target → set of importers
	const reverseGraph = new Map<string, Set<string>>();
	for (const [importer, targets] of forwardGraph) {
		for (const target of targets) {
			let set = reverseGraph.get(target);
			if (!set) {
				set = new Set<string>();
				reverseGraph.set(target, set);
			}
			set.add(importer);
		}
	}

	const visited = new Set<string>();
	const cycles: CycleEntry[] = [];
	const result = new Set<string>();

	// Iterative DFS from each seed through the reverse graph
	for (const seed of seeds) {
		const stack: Array<{ node: string; path: string[] }> = [{ node: seed, path: [seed] }];
		while (stack.length > 0) {
			const frame = stack.pop();
			if (!frame) continue;
			const { node, path: currentPath } = frame;
			const importers = reverseGraph.get(node) ?? new Set<string>();
			for (const importer of importers) {
				// Cycle detection: importer already appears in the current DFS path
				const cycleIndex = currentPath.indexOf(importer);
				if (cycleIndex !== -1) {
					cycles.push({
						path: importer,
						cyclePath: [...currentPath.slice(cycleIndex), importer],
					});
					continue; // skip to avoid infinite loop
				}
				if (seeds.has(importer)) continue; // don't recurse through other seeds
				if (visited.has(importer)) continue;
				visited.add(importer);
				result.add(importer);
				stack.push({ node: importer, path: [...currentPath, importer] });
			}
		}
	}

	return { transitiveDependents: result, cycles };
}
