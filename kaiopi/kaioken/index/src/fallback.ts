import type { ExtractInput } from "./extract.ts";
import type { ReExportRecord, SymbolKind, SymbolRecord } from "./types.ts";

export interface FallbackExtractResult {
	symbols: SymbolRecord[];
	reexports: ReExportRecord[];
}

/**
 * Regex-based declaration extractor used when Tree-sitter WASM grammars are unavailable.
 * Delivers fail-soft resiliency (Invariant 10) across 10 major programming languages:
 * 1. TypeScript / TSX: class and interface declarations, types, functions, consts, enums (UX-0661)
 * 2. JavaScript / JSX: function and constant exports, classes (UX-0662)
 * 3. Python: classes, methods, and decorated functions (UX-0663)
 * 4. Go: struct, interface, package functions, and receiver methods (UX-0664)
 * 5. Rust: structs, traits, enums, impl blocks, and functions (UX-0665)
 * 6. Java: classes, records, enums, interfaces, and Spring annotations (UX-0666)
 * 7. C/C++: structs, classes, namespaces, and template functions (UX-0667)
 * 8. C#: classes, interfaces, record types, and structs (UX-0668)
 * 9. Ruby: module definitions, class definitions, and method symbols (UX-0669)
 * 10. SQL: schema tables, procedures, and view definitions (UX-0670)
 */
export function extractFallbackDeclarations(input: ExtractInput): FallbackExtractResult {
	const symbols: SymbolRecord[] = [];
	const reexports: ReExportRecord[] = [];
	const lines = input.source.split(/\r?\n/);
	const lang = input.language.toLowerCase();

	// State tracking for multi-line context (decorators, current enclosing class, etc.)
	let pendingDecorators: string[] = [];
	let currentParent: string | undefined;

	for (let i = 0; i < lines.length; i++) {
		const rawLine = lines[i]!;
		const line = rawLine.trim();
		const lineNum = i + 1;

		if (!line || line.startsWith("//") || line.startsWith("--")) {
			continue;
		}

		// Python comment check (unless SQL or other languages)
		if (line.startsWith("#") && lang !== "ruby") {
			continue;
		}

		switch (lang) {
			case "typescript":
			case "tsx":
			case "javascript":
			case "jsx": {
				// Decorators (@Component, @Injectable)
				if (line.startsWith("@") && /^@\w+/.test(line)) {
					pendingDecorators.push(line);
					continue;
				}

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
				const fnMatch = line.match(/^(?:export\s+)?(?:default\s+)?(?:async\s+)?function(?:\s+(\w+)|(?=\s*\())/);
				if (fnMatch) {
					const name = fnMatch[1] ?? "default";
					symbols.push(
						buildRecord(name, "function", line, lineNum, line.startsWith("export"), {
							decorators: pendingDecorators.length ? [...pendingDecorators] : undefined,
						}),
					);
					pendingDecorators = [];
					continue;
				}

				const classMatch = line.match(/^(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+(\w+)/);
				if (classMatch) {
					currentParent = classMatch[1]!;
					symbols.push(
						buildRecord(classMatch[1]!, "class", line, lineNum, line.startsWith("export"), {
							decorators: pendingDecorators.length ? [...pendingDecorators] : undefined,
						}),
					);
					pendingDecorators = [];
					continue;
				}

				const ifaceMatch = line.match(/^(?:export\s+)?interface\s+(\w+)/);
				if (ifaceMatch) {
					symbols.push(
						buildRecord(ifaceMatch[1]!, "interface", line, lineNum, line.startsWith("export"), {
							decorators: pendingDecorators.length ? [...pendingDecorators] : undefined,
						}),
					);
					pendingDecorators = [];
					continue;
				}

				const typeMatch = line.match(/^(?:export\s+)?type\s+(\w+)\s*(?:<[^>]+>)?\s*=/);
				if (typeMatch) {
					symbols.push(buildRecord(typeMatch[1]!, "type", line, lineNum, line.startsWith("export")));
					continue;
				}

				const enumMatch = line.match(/^(?:export\s+)?(?:const\s+)?enum\s+(\w+)/);
				if (enumMatch) {
					symbols.push(buildRecord(enumMatch[1]!, "enum", line, lineNum, line.startsWith("export")));
					continue;
				}

				// Constant & arrow function exports: export const fn = (...) => or const X = ...
				const constMatch = line.match(/^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*(?::\s*[^=]+)?\s*=/);
				if (constMatch) {
					const isArrowFn = line.includes("=>") || line.includes("function");
					symbols.push(
						buildRecord(constMatch[1]!, isArrowFn ? "function" : "const", line, lineNum, line.startsWith("export")),
					);
					continue;
				}
				break;
			}

			case "python": {
				// Capture decorators: @dataclass, @app.route(...), @staticmethod, etc.
				if (line.startsWith("@")) {
					pendingDecorators.push(line);
					continue;
				}

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

				const classMatch = line.match(/^class\s+(\w+)(?:\([^)]*\))?:/);
				if (classMatch) {
					currentParent = classMatch[1]!;
					symbols.push(
						buildRecord(classMatch[1]!, "class", line, lineNum, !classMatch[1]!.startsWith("_"), {
							decorators: pendingDecorators.length ? [...pendingDecorators] : undefined,
						}),
					);
					pendingDecorators = [];
					continue;
				}

				const defMatch = line.match(/^(?:async\s+)?def\s+(\w+)\s*\(([^)]*)\)/);
				if (defMatch) {
					const name = defMatch[1]!;
					const isIndented = /^\s+/.test(rawLine);
					const isMethod = isIndented && currentParent !== undefined;
					const kind: SymbolKind = isMethod ? "method" : "function";

					symbols.push(
						buildRecord(name, kind, line, lineNum, !name.startsWith("_"), {
							parent: isMethod ? currentParent : undefined,
							decorators: pendingDecorators.length ? [...pendingDecorators] : undefined,
						}),
					);
					pendingDecorators = [];
					continue;
				}

				// Reset parent if unindented non-comment/def line
				if (!/^\s+/.test(rawLine) && !line.startsWith("@")) {
					currentParent = undefined;
				}
				break;
			}

			case "go": {
				// Package function or receiver method: func (r *Receiver) Method() or func Function()
				const methodMatch = line.match(/^func\s+\((?:[^)]*\s+)?\*?(\w+)\)\s+(\w+)/);
				if (methodMatch) {
					const receiverType = methodMatch[1]!;
					const name = methodMatch[2]!;
					const isExp = name.charAt(0) === name.charAt(0).toUpperCase();
					symbols.push(
						buildRecord(name, "method", line, lineNum, isExp, {
							parent: receiverType,
						}),
					);
					continue;
				}

				const funcMatch = line.match(/^func\s+(\w+)/);
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

				// Rust enums (UX-0665)
				const enumMatch = line.match(/^(?:pub(?:\([^)]+\))?\s+)?enum\s+(\w+)/);
				if (enumMatch) {
					symbols.push(buildRecord(enumMatch[1]!, "enum", line, lineNum, line.startsWith("pub")));
					continue;
				}

				// Rust impl blocks (UX-0665): impl Foo or impl Trait for Foo
				const implMatch = line.match(/^impl(?:\s+<[^>]+>)?\s+(?:(\w+)\s+for\s+)?(\w+)/);
				if (implMatch) {
					const traitName = implMatch[1];
					const targetType = implMatch[2]!;
					const name = traitName ? `${traitName} for ${targetType}` : targetType;
					symbols.push(buildRecord(name, "impl", line, lineNum, true));
					continue;
				}
				break;
			}

			case "java": {
				// Spring and standard Java annotations (UX-0666)
				if (line.startsWith("@")) {
					pendingDecorators.push(line);
					continue;
				}

				// Java classes, records, enums, interfaces
				const classMatch = line.match(
					/^(?:public\s+|protected\s+|private\s+)?(?:static\s+)?(?:final\s+|abstract\s+)?(class|interface|record|enum)\s+(\w+)/,
				);
				if (classMatch) {
					const rawKind = classMatch[1]!;
					const name = classMatch[2]!;
					const kind: SymbolKind =
						rawKind === "interface" ? "interface" : rawKind === "enum" ? "enum" : "class";
					const isPublic = line.includes("public");

					symbols.push(
						buildRecord(name, kind, line, lineNum, isPublic, {
							annotations: pendingDecorators.length ? [...pendingDecorators] : undefined,
						}),
					);
					pendingDecorators = [];
					continue;
				}
				break;
			}

			case "c":
			case "cpp": {
				// C/C++ namespaces (UX-0667)
				const nsMatch = line.match(/^namespace\s+(\w+)/);
				if (nsMatch) {
					currentParent = nsMatch[1]!;
					symbols.push(buildRecord(nsMatch[1]!, "module", line, lineNum, true));
					continue;
				}

				// C/C++ template functions and classes (UX-0667)
				const templateMatch = line.match(/^template\s*<[^>]+>\s*(?:class|struct)\s+(\w+)/);
				if (templateMatch) {
					symbols.push(buildRecord(templateMatch[1]!, "class", line, lineNum, true));
					continue;
				}

				const structMatch = line.match(/^(?:typedef\s+)?(?:struct|class)\s+(\w+)/);
				if (structMatch) {
					const kind: SymbolKind = line.includes("class") ? "class" : "struct";
					symbols.push(
						buildRecord(structMatch[1]!, kind, line, lineNum, true, {
							parent: currentParent,
						}),
					);
					continue;
				}
				break;
			}

			case "c_sharp":
			case "csharp": {
				// C# attributes: [ApiController], [HttpGet]
				if (line.startsWith("[") && line.endsWith("]")) {
					pendingDecorators.push(line);
					continue;
				}

				// C# classes, interfaces, record types (UX-0668)
				const csMatch = line.match(
					/^(?:public\s+|protected\s+|internal\s+|private\s+)?(?:partial\s+)?(?:static\s+|abstract\s+|sealed\s+)?(class|interface|struct|record(?:\s+class|\s+struct)?)\s+(\w+)/,
				);
				if (csMatch) {
					const rawKind = csMatch[1]!;
					const name = csMatch[2]!;
					const kind: SymbolKind =
						rawKind === "interface" ? "interface" : rawKind === "struct" ? "struct" : "class";
					const isPublic = line.includes("public");

					symbols.push(
						buildRecord(name, kind, line, lineNum, isPublic, {
							annotations: pendingDecorators.length ? [...pendingDecorators] : undefined,
						}),
					);
					pendingDecorators = [];
					continue;
				}
				break;
			}

			case "ruby": {
				// Ruby method definitions (UX-0669)
				const defMatch = line.match(/^def\s+(\w+(?:\.\w+)?)/);
				if (defMatch) {
					symbols.push(buildRecord(defMatch[1]!, "function", line, lineNum, true));
					continue;
				}

				// Ruby class and module definitions
				const modMatch = line.match(/^(class|module)\s+(\w+)/);
				if (modMatch) {
					symbols.push(buildRecord(modMatch[2]!, modMatch[1] === "module" ? "module" : "class", line, lineNum, true));
					continue;
				}

				// Ruby method symbols (attr_accessor, attr_reader)
				const attrMatch = line.match(/^(?:attr_accessor|attr_reader|attr_writer)\s+((?::\w+(?:,\s*)?)+)/);
				if (attrMatch) {
					const rawNames = attrMatch[1]!.split(",");
					for (const raw of rawNames) {
						const attrName = raw.trim().replace(/^:/, "");
						if (attrName) {
							symbols.push(buildRecord(attrName, "const", line, lineNum, true));
						}
					}
					continue;
				}
				break;
			}

			case "sql": {
				// SQL schema tables (UX-0670)
				const tableMatch = line.match(/^create\s+table\s+(?:if\s+not\s+exists\s+)?([`"']?\w+[`"']?)/i);
				if (tableMatch) {
					const name = tableMatch[1]!.replace(/[`"']/g, "");
					symbols.push(buildRecord(name, "struct", line, lineNum, true));
					continue;
				}

				// SQL procedures & functions (UX-0670)
				const procMatch = line.match(/^create\s+(?:or\s+replace\s+)?(?:procedure|function)\s+([`"']?\w+[`"']?)/i);
				if (procMatch) {
					const name = procMatch[1]!.replace(/[`"']/g, "");
					symbols.push(buildRecord(name, "function", line, lineNum, true));
					continue;
				}

				// SQL views and materialized views (UX-0670)
				const viewMatch = line.match(
					/^create\s+(?:or\s+replace\s+)?(?:materialized\s+)?view\s+([`"']?\w+[`"']?)/i,
				);
				if (viewMatch) {
					const name = viewMatch[1]!.replace(/[`"']/g, "");
					symbols.push(buildRecord(name, "type", line, lineNum, true));
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
	options?: {
		parent?: string;
		doc?: string;
		decorators?: string[];
		annotations?: string[];
	},
): SymbolRecord {
	return {
		name,
		kind,
		signature,
		startLine: lineNum,
		endLine: lineNum,
		exported,
		doc: options?.doc ?? "",
		parent: options?.parent,
		decorators: options?.decorators,
		annotations: options?.annotations,
	};
}
