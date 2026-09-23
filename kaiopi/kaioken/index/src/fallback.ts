import type { ExtractInput } from "./extract.ts";
import type { ReExportRecord, SymbolKind, SymbolRecord } from "./types.ts";

export interface FallbackExtractResult {
	symbols: SymbolRecord[];
	reexports: ReExportRecord[];
}

/**
 * Regex-based declaration extractor used when Tree-sitter WASM grammars are unavailable.
 * Delivers fail-soft resiliency (Invariant 10) across 10 major programming languages.
 */
export function extractFallbackDeclarations(input: ExtractInput): FallbackExtractResult {
	const symbols: SymbolRecord[] = [];
	const reexports: ReExportRecord[] = [];
	const lines = input.source.split(/\r?\n/);
	const lang = input.language.toLowerCase();

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i]!.trim();
		const lineNum = i + 1;
		if (!line || line.startsWith("//") || line.startsWith("#") || line.startsWith("--")) {
			continue;
		}

		switch (lang) {
			case "typescript":
			case "tsx":
			case "javascript":
			case "jsx": {
				// Re-exports: export { foo as bar } from "./baz" or export * from "./baz"
				const reMatch = line.match(/^export\s+(?:\{([^}]+)\}|\*\s+as\s+(\w+)|\*)\s+from\s+['"]([^'"]+)['"]/);
				if (reMatch) {
					const [_, named, ns, from] = reMatch;
					if (from) {
						if (ns) {
							reexports.push({ name: ns, importedName: "*", from });
						} else if (named) {
							for (const part of named.split(",")) {
								const trimmed = part.trim();
								if (!trimmed) continue;
								const asMatch = trimmed.match(/^(\w+)(?:\s+as\s+(\w+))?$/);
								if (asMatch) {
									const imp = asMatch[1]!;
									const exp = asMatch[2] ?? imp;
									reexports.push({ name: exp, importedName: imp, from });
								}
							}
						} else {
							reexports.push({ name: "*", from });
						}
					}
				}

				// Declarations
				const fnMatch = line.match(/^(?:export\s+)?(?:async\s+)?function\s+(\w+)/);
				if (fnMatch) {
					symbols.push(buildRecord(fnMatch[1]!, "function", line, lineNum, line.startsWith("export")));
					continue;
				}
				const classMatch = line.match(/^(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/);
				if (classMatch) {
					symbols.push(buildRecord(classMatch[1]!, "class", line, lineNum, line.startsWith("export")));
					continue;
				}
				const ifaceMatch = line.match(/^(?:export\s+)?interface\s+(\w+)/);
				if (ifaceMatch) {
					symbols.push(buildRecord(ifaceMatch[1]!, "interface", line, lineNum, line.startsWith("export")));
					continue;
				}
				const typeMatch = line.match(/^(?:export\s+)?type\s+(\w+)\s*=/);
				if (typeMatch) {
					symbols.push(buildRecord(typeMatch[1]!, "type", line, lineNum, line.startsWith("export")));
					continue;
				}
				const constMatch = line.match(/^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=/);
				if (constMatch) {
					symbols.push(buildRecord(constMatch[1]!, "const", line, lineNum, line.startsWith("export")));
					continue;
				}
				break;
			}

			case "python": {
				const fromMatch = line.match(/^from\s+([.\w]+)\s+import\s+(.+)$/);
				if (fromMatch) {
					const [_, from, items] = fromMatch;
					if (from && items) {
						if (items.trim() === "*") {
							reexports.push({ name: "*", from });
						} else {
							for (const item of items.split(",")) {
								const t = item.trim();
								const asMatch = t.match(/^(\w+)(?:\s+as\s+(\w+))?$/);
								if (asMatch) {
									const imp = asMatch[1]!;
									const exp = asMatch[2] ?? imp;
									reexports.push({ name: exp, importedName: imp, from });
								}
							}
						}
					}
				}

				const defMatch = line.match(/^(?:async\s+)?def\s+(\w+)/);
				if (defMatch) {
					symbols.push(buildRecord(defMatch[1]!, "function", line, lineNum, !defMatch[1]!.startsWith("_")));
					continue;
				}
				const classMatch = line.match(/^class\s+(\w+)/);
				if (classMatch) {
					symbols.push(buildRecord(classMatch[1]!, "class", line, lineNum, !classMatch[1]!.startsWith("_")));
					continue;
				}
				break;
			}

			case "go": {
				const funcMatch = line.match(/^func\s+(?:\([^)]+\)\s+)?(\w+)/);
				if (funcMatch) {
					const name = funcMatch[1]!;
					const isExp = name.charAt(0) === name.charAt(0).toUpperCase();
					symbols.push(buildRecord(name, "function", line, lineNum, isExp));
					continue;
				}
				const typeMatch = line.match(/^type\s+(\w+)\s+(struct|interface)/);
				if (typeMatch) {
					const name = typeMatch[1]!;
					const kind: SymbolKind = typeMatch[2] === "struct" ? "struct" : "interface";
					const isExp = name.charAt(0) === name.charAt(0).toUpperCase();
					symbols.push(buildRecord(name, kind, line, lineNum, isExp));
					continue;
				}
				break;
			}

			case "rust": {
				const fnMatch = line.match(/^(?:pub(?:\([^)]+\))?\s+)?(?:async\s+)?fn\s+(\w+)/);
				if (fnMatch) {
					symbols.push(buildRecord(fnMatch[1]!, "function", line, lineNum, line.startsWith("pub")));
					continue;
				}
				const structMatch = line.match(/^(?:pub(?:\([^)]+\))?\s+)?struct\s+(\w+)/);
				if (structMatch) {
					symbols.push(buildRecord(structMatch[1]!, "struct", line, lineNum, line.startsWith("pub")));
					continue;
				}
				const traitMatch = line.match(/^(?:pub(?:\([^)]+\))?\s+)?trait\s+(\w+)/);
				if (traitMatch) {
					symbols.push(buildRecord(traitMatch[1]!, "trait", line, lineNum, line.startsWith("pub")));
					continue;
				}
				break;
			}

			case "java": {
				const classMatch = line.match(/^(?:public\s+)?(?:final\s+|abstract\s+)?(class|interface|record|enum)\s+(\w+)/);
				if (classMatch) {
					const kind: SymbolKind = classMatch[1] === "interface" ? "interface" : classMatch[1] === "enum" ? "enum" : "class";
					symbols.push(buildRecord(classMatch[2]!, kind, line, lineNum, line.startsWith("public")));
					continue;
				}
				break;
			}

			case "c":
			case "cpp": {
				const structMatch = line.match(/^(?:typedef\s+)?(struct|class)\s+(\w+)/);
				if (structMatch) {
					symbols.push(buildRecord(structMatch[2]!, structMatch[1] === "class" ? "class" : "struct", line, lineNum, true));
					continue;
				}
				break;
			}

			case "c_sharp":
			case "csharp": {
				const csMatch = line.match(/^(?:public\s+)?(?:partial\s+)?(class|interface|struct|record)\s+(\w+)/);
				if (csMatch) {
					const kind: SymbolKind = csMatch[1] === "interface" ? "interface" : csMatch[1] === "struct" ? "struct" : "class";
					symbols.push(buildRecord(csMatch[2]!, kind, line, lineNum, line.startsWith("public")));
					continue;
				}
				break;
			}

			case "ruby": {
				const defMatch = line.match(/^def\s+(\w+)/);
				if (defMatch) {
					symbols.push(buildRecord(defMatch[1]!, "function", line, lineNum, true));
					continue;
				}
				const modMatch = line.match(/^(class|module)\s+(\w+)/);
				if (modMatch) {
					symbols.push(buildRecord(modMatch[2]!, modMatch[1] === "module" ? "module" : "class", line, lineNum, true));
					continue;
				}
				break;
			}

			case "sql": {
				const tableMatch = line.match(/^create\s+table\s+(?:if\s+not\s+exists\s+)?([`"']?\w+[`"']?)/i);
				if (tableMatch) {
					const name = tableMatch[1]!.replace(/[`"']/g, "");
					symbols.push(buildRecord(name, "struct", line, lineNum, true));
					continue;
				}
				break;
			}
		}
	}

	return { symbols, reexports };
}

function buildRecord(
	name: string,
	kind: SymbolKind,
	signature: string,
	lineNum: number,
	exported: boolean,
): SymbolRecord {
	return {
		name,
		kind,
		signature,
		startLine: lineNum,
		endLine: lineNum,
		exported,
		doc: "",
	};
}
