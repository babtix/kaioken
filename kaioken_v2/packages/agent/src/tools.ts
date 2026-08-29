import { readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import type { SymbolRecord } from "@kaioken/index";
import { computeStaleness, invalidatedBy } from "@kaioken/provenance";
import type { Kind } from "@kaioken/search";
import type { KnowledgeContext, KnowledgeTool, ToolResult } from "./types.js";

/**
 * The knowledge layer, as tools.
 *
 * Everything here answers from phases 1-5 rather than from the model's memory of
 * the code, and each tool is written so that a *negative* answer is as usable as
 * a positive one. "This repository declares no symbol by that name" is the whole
 * point of having an index: it is the one answer a language model cannot give
 * itself, because absence is exactly what it hallucinates over.
 */

const MAX_MATCHES = 25;
const MAX_READ_LINES = 400;
const MAX_READ_CHARS = 40_000;

export const KNOWLEDGE_TOOLS: KnowledgeTool[] = [
	symbolLookup(),
	wikiSearch(),
	impact(),
	skillLoad(),
	readFileTool(),
];

export function toolByName(name: string): KnowledgeTool | undefined {
	return KNOWLEDGE_TOOLS.find((tool) => tool.name === name);
}

/**
 * The grounding oracle, handed to the model.
 *
 * The description tells it to reach for this *before* asserting that something
 * exists, because that is the failure this tool prevents. A model that has read
 * three files will happily reference a fourth symbol that was never written.
 */
function symbolLookup(): KnowledgeTool {
	return {
		name: "symbol_lookup",
		label: "symbol",
		description:
			"Look up a declaration in this repository's structural index. Give `name` to find " +
			"where a symbol is declared, or `path` to list what a file declares. The answer is " +
			"definitive: if it reports that no such symbol is declared, the repository does not " +
			"declare it. Use this before claiming any function, type or constant exists.",
		params: {
			name: { type: "string", description: "Symbol name to locate." },
			path: { type: "string", description: "Repository-relative file path to list." },
			exported: { type: "boolean", description: "Restrict to exported declarations." },
		},
		async run(args, ctx): Promise<ToolResult> {
			const name = str(args["name"]);
			const path = str(args["path"]);
			const exportedOnly = args["exported"] === true;

			if (!name && !path) {
				return { text: "give either `name` or `path`.", isError: true };
			}

			if (path) {
				const file = ctx.oracle.file(posix(path));
				if (!file) {
					return {
						text:
							`not indexed: ${path}\n` +
							"The scan did not include this file. Check the path, or the ignore rules.",
						details: { path, indexed: false },
					};
				}
				const symbols = exportedOnly ? file.symbols.filter((s) => s.exported) : file.symbols;
				const lines = [`${file.path}  (${file.language}, ${file.lineCount} lines)`];
				if (file.unparsed) {
					lines.push("no grammar is bound for this language, so nothing was indexed.");
				} else if (symbols.length === 0) {
					lines.push(exportedOnly ? "no exported declarations." : "no declarations.");
				} else {
					for (const symbol of symbols.slice(0, MAX_MATCHES)) lines.push(render(symbol));
					if (symbols.length > MAX_MATCHES) {
						lines.push(`… ${symbols.length - MAX_MATCHES} more.`);
					}
				}
				return {
					text: lines.join("\n"),
					details: { path: file.path, language: file.language, symbols },
				};
			}

			const target = name as string;
			const found = ctx.oracle.lookup(target);
			const matches = exportedOnly ? found.filter((m) => m.symbol.exported) : found;

			if (matches.length === 0) {
				return {
					text:
						`not declared: ${target}\n` +
						"This repository declares no symbol by that name. Do not assume it exists.",
					details: { query: target, declared: false, matches: [] },
				};
			}

			const lines = [`${target} — ${matches.length} declaration${matches.length === 1 ? "" : "s"}`];
			for (const match of matches.slice(0, MAX_MATCHES)) {
				lines.push(`${match.path}:${match.symbol.startLine}`);
				lines.push(render(match.symbol));
			}
			if (matches.length > MAX_MATCHES) lines.push(`… ${matches.length - MAX_MATCHES} more.`);

			return {
				text: lines.join("\n"),
				details: {
					query: target,
					declared: true,
					matches: matches.map((m) => ({ path: m.path, ...m.symbol })),
				},
			};
		},
	};
}

/**
 * Retrieval across every tenant at once.
 *
 * The corpus is shared, so one query reaches generated chapters and raw
 * declarations together and their ranks are comparable. `via` is reported
 * because whether semantic ranking ran changes how much a low-ranked miss means.
 */
function wikiSearch(): KnowledgeTool {
	return {
		name: "wiki_search",
		label: "search",
		description:
			"Search everything this engine has indexed — generated wiki chapters, knowledge " +
			"cards, skills and raw declarations — and get back ranked passages with the file " +
			"and line they came from. Use this to find where a topic is described or handled " +
			"before reading files at random.",
		params: {
			query: { type: "string", description: "What to look for.", required: true },
			kind: {
				type: "string",
				description: "Restrict to one tenant.",
				choices: ["wiki", "card", "skill", "symbol"],
			},
			limit: { type: "number", description: "How many passages to return. Default 8." },
		},
		async run(args, ctx): Promise<ToolResult> {
			const query = str(args["query"]);
			if (!query) return { text: "give a `query`.", isError: true };

			if (!ctx.search) {
				return {
					text:
						"no search index is available in this repository. " +
						"`symbol_lookup` still answers structural questions.",
					isError: true,
				};
			}

			const kind = str(args["kind"]);
			const limit = clamp(num(args["limit"]) ?? 8, 1, 25);
			const hits = await ctx.search.search({
				text: query,
				limit,
				...(kind ? { kinds: [kind as Kind] } : {}),
			});

			if (hits.length === 0) {
				return {
					text: `nothing indexed matches "${query}".`,
					details: { query, hits: [] },
				};
			}

			const lines = hits.map((hit, i) => {
				const where = `${hit.path}:${hit.line}`;
				const via = hit.via.join("+");
				return [
					`${i + 1}. [${hit.kind}] ${where}  (${via})`,
					hit.heading ? `   ${hit.heading}` : "",
					`   ${collapse(hit.snippet)}`,
				]
					.filter(Boolean)
					.join("\n");
			});

			return { text: lines.join("\n\n"), details: { query, hits } };
		},
	};
}

/**
 * What a change costs the documentation.
 *
 * This is provenance being cashed in as a prediction rather than a report: every
 * generated document records the files it was written from, pinned to their
 * hashes, so "which documents does touching this file obsolete?" is answerable
 * exactly, before the change is made.
 *
 * It is deliberately not sold as a dependency graph. It says what the
 * documentation covers, and — just as usefully — when the answer is "nothing",
 * which means a change here is invisible to every document in the wiki.
 */
function impact(): KnowledgeTool {
	return {
		name: "impact",
		label: "impact",
		description:
			"Report which generated documents a change to given files would invalidate, using " +
			"the recorded provenance of every chapter and card. Call it with `paths` before " +
			"editing to see the documentation cost of a change; call it with no arguments to " +
			"see what has already drifted out of date.",
		params: {
			paths: {
				type: "string[]",
				description: "Repository-relative paths a change would touch.",
			},
		},
		async run(args, ctx): Promise<ToolResult> {
			const paths = strings(args["paths"]).map(posix);

			if (ctx.provenance.length === 0) {
				return {
					text:
						"nothing has been generated for this repository yet, so no document can " +
						"be invalidated. Run `kaioken cards` or `kaioken wiki` first.",
					details: { documents: [] },
				};
			}

			if (paths.length === 0) {
				const report = computeStaleness(ctx.provenance, ctx.scan);
				const lines = [
					`${Math.round(report.freshness * 100)}% of ${report.documents.length} documents still match their sources.`,
				];
				if (report.stale.length === 0 && report.orphaned.length === 0) {
					lines.push("Nothing is stale.");
				}
				for (const doc of report.stale) {
					lines.push(`stale: ${doc.document}  (${doc.changed.length} source(s) changed)`);
				}
				for (const doc of report.orphaned) {
					lines.push(`orphaned: ${doc.document}  (every source it cited is gone)`);
				}
				return { text: lines.join("\n"), details: report };
			}

			const known = new Set(ctx.scan.files.map((file) => file.path));
			const unknown = paths.filter((path) => !known.has(path));
			const documents = invalidatedBy(ctx.provenance, paths);

			const lines: string[] = [];
			if (documents.length === 0) {
				lines.push(
					`no generated document was written from ${paths.join(", ")}.`,
					"A change there is invisible to the wiki — which may itself be worth fixing.",
				);
			} else {
				lines.push(
					`changing ${paths.join(", ")} invalidates ${documents.length} document${documents.length === 1 ? "" : "s"}:`,
				);
				for (const document of documents) lines.push(`  ${document}`);
				lines.push("Regenerate them with `kaioken update` after the change lands.");
			}
			if (unknown.length > 0) {
				lines.push(`not in the scan: ${unknown.join(", ")} (new file, or ignored).`);
			}

			return { text: lines.join("\n"), details: { paths, documents, unknown } };
		},
	};
}

/**
 * Procedure on demand.
 *
 * Listing is cheap and loading is not, so the two are the same tool: the model
 * sees the catalogue in the system prompt, and pays for a skill's full text only
 * when it decides the skill applies.
 */
function skillLoad(): KnowledgeTool {
	return {
		name: "skill_load",
		label: "skill",
		description:
			"Load the full text of one of this repository's skills — a written procedure for " +
			"a task here. Call with no `name` to list what is available. Load a skill before " +
			"carrying out a task it covers; the procedure is authoritative over your defaults.",
		params: {
			name: { type: "string", description: "Skill to load. Omit to list them." },
		},
		async run(args, ctx): Promise<ToolResult> {
			const name = str(args["name"]);

			if (ctx.skills.length === 0) {
				return {
					text: `this repository defines no skills (none found under .kaioken/skills).`,
					details: { skills: [] },
				};
			}

			if (!name) {
				const lines = ctx.skills.map((skill) => `${skill.name} — ${skill.description}`);
				return {
					text: `${ctx.skills.length} skill(s):\n${lines.join("\n")}`,
					details: { skills: ctx.skills.map((s) => ({ name: s.name, path: s.path })) },
				};
			}

			const wanted = name.toLowerCase();
			const skill =
				ctx.skills.find((s) => s.name.toLowerCase() === wanted) ??
				ctx.skills.find((s) => s.name.toLowerCase().includes(wanted));

			if (!skill) {
				const names = ctx.skills.map((s) => s.name).join(", ");
				return {
					text: `no skill named "${name}". Available: ${names}.`,
					details: { requested: name, found: false },
					isError: true,
				};
			}

			return {
				text: `# ${skill.name}\n(from ${skill.path})\n\n${skill.content}`,
				details: { name: skill.name, path: skill.path },
			};
		},
	};
}

/**
 * Reading, bounded and confined.
 *
 * The agent needs the source itself, not only what the index says about it. Two
 * limits are load-bearing: the path is resolved and checked to be inside the
 * repository root before anything is opened, and the slice returned is capped —
 * a 12,000-line generated file would otherwise consume the context window in one
 * call and end the session's usefulness.
 */
function readFileTool(): KnowledgeTool {
	return {
		name: "read_file",
		label: "read",
		description:
			"Read a slice of a file in this repository, with line numbers. Give `start` and " +
			"`end` to read a region; without them the first lines are returned. Paths are " +
			"repository-relative.",
		params: {
			path: { type: "string", description: "Repository-relative file path.", required: true },
			start: { type: "number", description: "First line to read, 1-based." },
			end: { type: "number", description: "Last line to read, inclusive." },
		},
		async run(args, ctx): Promise<ToolResult> {
			const path = str(args["path"]);
			if (!path) return { text: "give a `path`.", isError: true };

			const inside = resolveInside(ctx.root, path);
			if (!inside) {
				return {
					text: `refused: ${path} is outside the repository root.`,
					isError: true,
				};
			}

			let raw: string;
			try {
				raw = await readFile(inside, "utf8");
			} catch {
				return { text: `cannot read ${path} — no such file.`, isError: true };
			}

			const lines = raw.replace(/\r\n/g, "\n").split("\n");
			const start = clamp(num(args["start"]) ?? 1, 1, Math.max(lines.length, 1));
			const requestedEnd = num(args["end"]) ?? start + MAX_READ_LINES - 1;
			const end = clamp(requestedEnd, start, Math.min(lines.length, start + MAX_READ_LINES - 1));

			const width = String(end).length;
			let body = lines
				.slice(start - 1, end)
				.map((line, i) => `${String(start + i).padStart(width)}  ${line}`)
				.join("\n");

			let truncated = end < lines.length;
			if (body.length > MAX_READ_CHARS) {
				body = body.slice(0, MAX_READ_CHARS);
				truncated = true;
			}

			const header = `${posix(path)}  lines ${start}-${end} of ${lines.length}`;
			const footer = truncated ? "\n… truncated. Ask for a later range to continue." : "";

			return {
				text: `${header}\n${body}${footer}`,
				details: { path: posix(path), start, end, total: lines.length, truncated },
			};
		},
	};
}

function render(symbol: SymbolRecord): string {
	const visibility = symbol.exported ? "+" : "-";
	const owner = symbol.parent ? `${symbol.parent}.` : "";
	const head = `  ${visibility} ${symbol.kind} ${owner}${symbol.name}  [${symbol.startLine}-${symbol.endLine}]`;
	const signature = `      ${cut(symbol.signature, 160)}`;
	return symbol.doc ? `${head}\n${signature}\n      ${cut(firstLine(symbol.doc), 160)}` : `${head}\n${signature}`;
}

/**
 * Keep a path from escaping the repository.
 *
 * Returning null rather than clamping is deliberate: a tool that quietly reads
 * something other than what it was asked for is worse than one that refuses.
 */
export function resolveInside(root: string, path: string): string | null {
	const absoluteRoot = resolve(root);
	const target = isAbsolute(path) ? resolve(path) : resolve(absoluteRoot, path);
	const rel = relative(absoluteRoot, target);
	if (rel === "") return target;
	if (rel.startsWith("..") || isAbsolute(rel)) return null;
	return target;
}

function posix(path: string): string {
	return path.split("\\").join("/");
}

function str(value: unknown): string {
	return typeof value === "string" ? value.trim() : "";
}

function num(value: unknown): number | null {
	if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
	if (typeof value === "string") {
		const parsed = Number.parseInt(value, 10);
		if (Number.isFinite(parsed)) return parsed;
	}
	return null;
}

function strings(value: unknown): string[] {
	if (Array.isArray(value)) {
		return value.filter((entry): entry is string => typeof entry === "string" && entry.trim() !== "");
	}
	// Models pass a single path as a bare string often enough that refusing it
	// would spend a turn teaching the model its own schema.
	if (typeof value === "string" && value.trim()) return [value.trim()];
	return [];
}

function clamp(value: number, low: number, high: number): number {
	return Math.min(Math.max(value, low), high);
}

function firstLine(text: string): string {
	const newline = text.indexOf("\n");
	return newline === -1 ? text : text.slice(0, newline);
}

function cut(text: string, max: number): string {
	return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function collapse(text: string): string {
	return cut(text.replace(/\s+/g, " ").trim(), 300);
}
