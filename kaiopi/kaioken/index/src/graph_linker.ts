import type { FileMap, IndexResult, SymbolKind, SymbolRecord } from "./types.ts";

export type SymbolEdgeKind =
	| "extends"
	| "implements"
	| "contains"
	| "references"
	| "calls"
	| "reexports"
	| "foreign_key"
	| "annotated_by";

export interface SymbolGraphNode {
	id: string;
	name: string;
	kind: SymbolKind;
	path: string;
	language: string;
	exported: boolean;
	signature: string;
	startLine: number;
	endLine: number;
	parent?: string;
	decorators?: string[];
	annotations?: string[];
}

export interface SymbolGraphEdge {
	fromId: string;
	toId: string;
	kind: SymbolEdgeKind;
	description?: string;
}

export interface LinkerOptions {
	includeReexports?: boolean;
	languages?: string[];
}

/**
 * Structural symbol dependency graph connecting declarations, scopes,
 * inheritance hierarchies, implementations, and cross-file references across:
 * 1. TypeScript / TSX class and interface declarations (UX-0691)
 * 2. JavaScript / JSX function and constant exports (UX-0692)
 * 3. Python classes, methods, and decorated functions (UX-0693)
 * 4. Go struct, interface, and package functions (UX-0694)
 * 5. Rust structs, traits, enums, and impl blocks (UX-0695)
 * 6. Java classes, records, and spring annotations (UX-0696)
 * 7. C/C++ structs, namespaces, and template functions (UX-0697)
 * 8. C# classes, interfaces, and record types (UX-0698)
 * 9. Ruby module definitions and method symbols (UX-0699)
 * 10. SQL schema tables, procedures, and view definitions (UX-0700)
 */
export class SymbolDependencyGraph {
	private readonly nodes = new Map<string, SymbolGraphNode>();
	private readonly outgoing = new Map<string, SymbolGraphEdge[]>();
	private readonly incoming = new Map<string, SymbolGraphEdge[]>();
	private readonly byName = new Map<string, string[]>();

	addNode(node: SymbolGraphNode): void {
		this.nodes.set(node.id, node);
		const list = this.byName.get(node.name) ?? [];
		if (!list.includes(node.id)) {
			list.push(node.id);
			this.byName.set(node.name, list);
		}
	}

	addEdge(edge: SymbolGraphEdge): void {
		// Ensure edge not already present
		const outList = this.outgoing.get(edge.fromId) ?? [];
		if (!outList.some((e) => e.toId === edge.toId && e.kind === edge.kind)) {
			outList.push(edge);
			this.outgoing.set(edge.fromId, outList);
		}

		const inList = this.incoming.get(edge.toId) ?? [];
		if (!inList.some((e) => e.fromId === edge.fromId && e.kind === edge.kind)) {
			inList.push(edge);
			this.incoming.set(edge.toId, inList);
		}
	}

	getNode(id: string): SymbolGraphNode | undefined {
		return this.nodes.get(id);
	}

	findNodes(symbolName: string): SymbolGraphNode[] {
		const ids = this.byName.get(symbolName) ?? [];
		return ids.map((id) => this.nodes.get(id)!).filter(Boolean);
	}

	getOutgoing(id: string): SymbolGraphEdge[] {
		return this.outgoing.get(id) ?? [];
	}

	getIncoming(id: string): SymbolGraphEdge[] {
		return this.incoming.get(id) ?? [];
	}

	getDependencies(symbolName: string, path?: string): SymbolGraphNode[] {
		const targetNodes = this.findNodes(symbolName);
		const relevant = path ? targetNodes.filter((n) => n.path === path) : targetNodes;
		const results = new Set<string>();

		for (const node of relevant) {
			for (const edge of this.getOutgoing(node.id)) {
				results.add(edge.toId);
			}
		}

		return Array.from(results)
			.map((id) => this.nodes.get(id)!)
			.filter(Boolean);
	}

	getDependents(symbolName: string, path?: string): SymbolGraphNode[] {
		const targetNodes = this.findNodes(symbolName);
		const relevant = path ? targetNodes.filter((n) => n.path === path) : targetNodes;
		const results = new Set<string>();

		for (const node of relevant) {
			for (const edge of this.getIncoming(node.id)) {
				results.add(edge.fromId);
			}
		}

		return Array.from(results)
			.map((id) => this.nodes.get(id)!)
			.filter(Boolean);
	}

	getTypeHierarchy(symbolName: string): { parents: SymbolGraphNode[]; children: SymbolGraphNode[] } {
		const targetNodes = this.findNodes(symbolName);
		const parentIds = new Set<string>();
		const childIds = new Set<string>();

		for (const node of targetNodes) {
			// Outgoing extends/implements are parents
			for (const edge of this.getOutgoing(node.id)) {
				if (edge.kind === "extends" || edge.kind === "implements") {
					parentIds.add(edge.toId);
				}
			}
			// Incoming extends/implements are children
			for (const edge of this.getIncoming(node.id)) {
				if (edge.kind === "extends" || edge.kind === "implements") {
					childIds.add(edge.fromId);
				}
			}
		}

		return {
			parents: Array.from(parentIds).map((id) => this.nodes.get(id)!).filter(Boolean),
			children: Array.from(childIds).map((id) => this.nodes.get(id)!).filter(Boolean),
		};
	}

	getGraphStats(): {
		nodeCount: number;
		edgeCount: number;
		byKind: Record<string, number>;
		byLanguage: Record<string, number>;
		byEdgeKind: Record<string, number>;
	} {
		let edgeCount = 0;
		const byKind: Record<string, number> = {};
		const byLanguage: Record<string, number> = {};
		const byEdgeKind: Record<string, number> = {};

		for (const node of this.nodes.values()) {
			byKind[node.kind] = (byKind[node.kind] ?? 0) + 1;
			byLanguage[node.language] = (byLanguage[node.language] ?? 0) + 1;
		}

		for (const edges of this.outgoing.values()) {
			edgeCount += edges.length;
			for (const edge of edges) {
				byEdgeKind[edge.kind] = (byEdgeKind[edge.kind] ?? 0) + 1;
			}
		}

		return {
			nodeCount: this.nodes.size,
			edgeCount,
			byKind,
			byLanguage,
			byEdgeKind,
		};
	}

	exportMermaid(options?: { language?: string; path?: string; maxNodes?: number }): string {
		const lines: string[] = ["graph TD"];
		const maxNodes = options?.maxNodes ?? 50;
		let count = 0;

		const sanitize = (id: string) => id.replace(/[^a-zA-Z0-9_]/g, "_");

		for (const node of this.nodes.values()) {
			if (options?.language && node.language.toLowerCase() !== options.language.toLowerCase()) {
				continue;
			}
			if (options?.path && node.path !== options.path) {
				continue;
			}

			const nid = sanitize(node.id);
			lines.push(`    ${nid}["${node.name} (${node.kind})"]`);
			count++;
			if (count >= maxNodes) break;
		}

		let edgeCount = 0;
		for (const edges of this.outgoing.values()) {
			for (const edge of edges) {
				const fromNode = this.nodes.get(edge.fromId);
				const toNode = this.nodes.get(edge.toId);
				if (!fromNode || !toNode) continue;

				if (options?.language) {
					const lang = options.language.toLowerCase();
					if (fromNode.language.toLowerCase() !== lang && toNode.language.toLowerCase() !== lang) {
						continue;
					}
				}

				const fromId = sanitize(edge.fromId);
				const toId = sanitize(edge.toId);
				lines.push(`    ${fromId} -->|${edge.kind}| ${toId}`);
				edgeCount++;
				if (edgeCount >= maxNodes * 2) break;
			}
		}

		return lines.join("\n");
	}
}

/**
 * Link symbol records into a structural symbol dependency graph.
 */
export function linkSymbolDependencyGraph(
	index: IndexResult,
	options: LinkerOptions = {},
): SymbolDependencyGraph {
	const graph = new SymbolDependencyGraph();
	const allowedLangs = options.languages ? new Set(options.languages.map((l) => l.toLowerCase())) : null;

	const makeId = (path: string, symbol: SymbolRecord) =>
		`${path}::${symbol.parent ? symbol.parent + "." : ""}${symbol.name}`;

	// 1. Populate all nodes
	for (const file of index.files) {
		const lang = file.language.toLowerCase();
		if (allowedLangs && !allowedLangs.has(lang)) continue;

		for (const symbol of file.symbols) {
			const id = makeId(file.path, symbol);
			graph.addNode({
				id,
				name: symbol.name,
				kind: symbol.kind,
				path: file.path,
				language: file.language,
				exported: symbol.exported,
				signature: symbol.signature,
				startLine: symbol.startLine,
				endLine: symbol.endLine,
				parent: symbol.parent,
				decorators: symbol.decorators,
				annotations: symbol.annotations,
			});
		}
	}

	// 2. Link relationships
	for (const file of index.files) {
		const lang = file.language.toLowerCase();
		if (allowedLangs && !allowedLangs.has(lang)) continue;

		// Re-exports
		if (options.includeReexports !== false && file.reexports) {
			for (const re of file.reexports) {
				const reName = re.name === "*" ? re.importedName ?? "*" : re.name;
				const sourceNodes = graph.findNodes(reName);
				for (const src of sourceNodes) {
					const reId = `${file.path}::reexport:${re.name}`;
					graph.addNode({
						id: reId,
						name: re.name,
						kind: "var",
						path: file.path,
						language: file.language,
						exported: true,
						signature: `export { ${re.name} } from "${re.from}"`,
						startLine: 1,
						endLine: 1,
					});
					graph.addEdge({
						fromId: reId,
						toId: src.id,
						kind: "reexports",
					});
				}
			}
		}

		for (const symbol of file.symbols) {
			const symId = makeId(file.path, symbol);

			// A. Scope containment (class contains method, etc.)
			if (symbol.parent) {
				const parentCandidates = file.symbols.filter((s) => s.name === symbol.parent);
				for (const p of parentCandidates) {
					graph.addEdge({
						fromId: makeId(file.path, p),
						toId: symId,
						kind: "contains",
					});
				}
			}

			// B. Annotations / decorators
			if (symbol.annotations || symbol.decorators) {
				const allAnns = [...(symbol.annotations ?? []), ...(symbol.decorators ?? [])];
				for (const ann of allAnns) {
					const annNameMatch = ann.match(/[@\[](\w+)/);
					if (annNameMatch) {
						const annName = annNameMatch[1]!;
						const annTargets = graph.findNodes(annName);
						for (const target of annTargets) {
							graph.addEdge({
								fromId: symId,
								toId: target.id,
								kind: "annotated_by",
							});
						}
					}
				}
			}

			const sig = symbol.signature;

			// C. Language-specific structural links
			switch (lang) {
				case "typescript":
				case "tsx":
				case "javascript":
				case "jsx": {
					// class Sub extends Base
					const extMatch = sig.match(/\bextends\s+([A-Za-z0-9_]+)/);
					if (extMatch) {
						linkToSymbol(graph, symId, extMatch[1]!, "extends");
					}
					// class Sub implements Iface1, Iface2
					const impMatch = sig.match(/\bimplements\s+([^\{]+)/);
					if (impMatch) {
						const ifaces = impMatch[1]!.split(",");
						for (const iface of ifaces) {
							const name = iface.trim().split("<")[0]!.trim();
							if (name) linkToSymbol(graph, symId, name, "implements");
						}
					}
					break;
				}

				case "python": {
					// class Sub(Base, Mixin):
					const pyMatch = sig.match(/^class\s+\w+\(([^)]+)\):/);
					if (pyMatch) {
						const bases = pyMatch[1]!.split(",");
						for (const b of bases) {
							const name = b.trim();
							if (name && name !== "object") linkToSymbol(graph, symId, name, "extends");
						}
					}
					break;
				}

				case "go": {
					// Receiver method: func (r *Receiver) Method()
					if (symbol.parent) {
						linkToSymbol(graph, makeId(file.path, symbol), symbol.parent, "contains");
					}
					break;
				}

				case "rust": {
					// impl Trait for Struct
					const implMatch = sig.match(/^impl(?:\s+<[^>]+>)?\s+(?:(\w+)\s+for\s+)?(\w+)/);
					if (implMatch && implMatch[1]) {
						const traitName = implMatch[1];
						const structName = implMatch[2]!;
						linkToSymbol(graph, symId, traitName, "implements");
						linkToSymbol(graph, symId, structName, "references");
					}
					break;
				}

				case "java": {
					// class Sub extends Base implements Iface1, Iface2
					const extMatch = sig.match(/\bextends\s+([A-Za-z0-9_]+)/);
					if (extMatch) {
						linkToSymbol(graph, symId, extMatch[1]!, "extends");
					}
					const impMatch = sig.match(/\bimplements\s+([^\{]+)/);
					if (impMatch) {
						const ifaces = impMatch[1]!.split(",");
						for (const iface of ifaces) {
							const name = iface.trim().split("<")[0]!.trim();
							if (name) linkToSymbol(graph, symId, name, "implements");
						}
					}
					break;
				}

				case "c":
				case "cpp": {
					// class Sub : public Base
					const cppMatch = sig.match(/:\s*(?:public|protected|private)?\s*([A-Za-z0-9_]+)/);
					if (cppMatch) {
						linkToSymbol(graph, symId, cppMatch[1]!, "extends");
					}
					break;
				}

				case "c_sharp":
				case "csharp": {
					// class Sub : Base, Iface
					const csMatch = sig.match(/:\s*([^{]+)/);
					if (csMatch) {
						const parts = csMatch[1]!.split(",");
						if (parts.length > 0) {
							linkToSymbol(graph, symId, parts[0]!.trim(), "extends");
							for (let k = 1; k < parts.length; k++) {
								linkToSymbol(graph, symId, parts[k]!.trim(), "implements");
							}
						}
					}
					break;
				}

				case "ruby": {
					// class Sub < Base
					const rbMatch = sig.match(/<\s*([A-Za-z0-9_:]+)/);
					if (rbMatch) {
						const base = rbMatch[1]!.split("::").pop()!;
						linkToSymbol(graph, symId, base, "extends");
					}
					break;
				}

				case "sql": {
					// Foreign key: REFERENCES target_table(col)
					const refMatch = sig.match(/references\s+([`"']?\w+[`"']?)/i);
					if (refMatch) {
						const targetTable = refMatch[1]!.replace(/[`"']/g, "");
						linkToSymbol(graph, symId, targetTable, "foreign_key");
					}
					// View: CREATE VIEW x AS SELECT ... FROM target_table
					const fromMatch = sig.match(/from\s+([`"']?\w+[`"']?)/i);
					if (fromMatch && symbol.kind === "type") {
						const targetTable = fromMatch[1]!.replace(/[`"']/g, "");
						linkToSymbol(graph, symId, targetTable, "references");
					}
					break;
				}
			}
		}
	}

	return graph;
}

function linkToSymbol(
	graph: SymbolDependencyGraph,
	fromId: string,
	targetName: string,
	kind: SymbolEdgeKind,
): void {
	const targets = graph.findNodes(targetName);
	for (const t of targets) {
		graph.addEdge({
			fromId,
			toId: t.id,
			kind,
		});
	}
}
