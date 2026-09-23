import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { loadSkills } from "@kaioken/agent";
import { SymbolOracle, type IndexResult } from "@kaioken/index";
import { extractJson, type ModelClient } from "@kaioken/model";
import { readCards } from "@kaioken/plan";
import type { ScanResult } from "@kaioken/scan";
import { readProvenance } from "@kaioken/wiki";

/**
 * What would a change actually touch?
 *
 * The question people ask before a refactor is not "what does this code do" but
 * "what breaks if I move it", and that is a different query: it runs backwards,
 * from a declaration to everything that mentions it, and then outwards from the
 * files to the documentation written from those files.
 *
 * A model is used for exactly one step — turning "rename the config loader" into
 * candidate identifiers — and its output is filtered against the symbol index
 * before anything else happens. Every name in the report is a name this
 * repository declares; nothing here can invent a blast radius.
 */

export interface ImpactReport {
	description: string;
	/** Declarations the description resolves to, with where they live. */
	symbols: Array<{ name: string; path: string; kind: string; exported: boolean }>;
	/** Files that declare a matched symbol, or that the description named. */
	seeds: string[];
	/** Files that mention a matched symbol without declaring it. */
	dependents: Array<{ path: string; mentions: string[] }>;
	/** Modules whose cards were written from an affected file. */
	modules: Array<{ id: string; name: string; files: string[] }>;
	/** Wiki documents written from an affected file. */
	documents: Array<{ id: string; files: string[] }>;
	/** Skills whose steps name an affected file. */
	skills: Array<{ name: string; path: string }>;
	/** Candidate names the model proposed that the repository does not declare. */
	unknown: string[];
	/** True when the file sweep stopped at its budget. */
	partial: boolean;
}

export interface PredictInput {
	root: string;
	description: string;
	scan: ScanResult;
	index: IndexResult | null;
	/** Optional: turns prose into candidate identifiers. */
	client?: ModelClient;
	/** How many dependent files to report. */
	limit?: number;
}

/** A repository with no index still answers — with nothing declared in it. */
const EMPTY_INDEX: IndexResult = {
	root: "",
	builtAt: "",
	fileCount: 0,
	symbolCount: 0,
	unparsedLanguages: {},
	files: [],
};

/** Files bigger than this are not searched: a minified bundle is not evidence. */
const MAX_FILE_BYTES = 512 * 1024;
/** A ceiling on the sweep, so a monorepo cannot turn this into a full-text scan. */
const MAX_FILES_SWEPT = 8000;

export async function predictImpact(input: PredictInput): Promise<ImpactReport> {
	const oracle = new SymbolOracle(input.index ?? EMPTY_INDEX);
	const knownPaths = new Set(input.scan.files.map((file) => file.path));

	const proposed = await candidateNames(input);
	const symbols: ImpactReport["symbols"] = [];
	const unknown: string[] = [];
	const names = new Set<string>();

	for (const name of proposed.symbols) {
		const found = oracle.lookup(name);
		if (found.length === 0) {
			// Reported rather than dropped: "the repository has no `loadConfig`"
			// is often the most useful line in the answer — but only when the
			// word was a claim about a symbol. Every word of "rename the config
			// loader" becomes a candidate, and listing "rename" and "loader" as
			// things the repository does not declare buries the one name that
			// matters. A name the model proposed is always a claim; a word
			// lifted out of the sentence has to look like code to count as one.
			if (proposed.fromModel.has(name) || looksLikeIdentifier(name)) unknown.push(name);
			continue;
		}
		names.add(name);
		for (const location of found) {
			symbols.push({
				name,
				path: location.path,
				kind: location.symbol.kind,
				exported: location.symbol.exported,
			});
		}
	}

	const seeds = new Set<string>(symbols.map((symbol) => symbol.path));
	for (const path of proposed.files) {
		if (knownPaths.has(path)) seeds.add(path);
		else unknown.push(path);
	}

	const { dependents, partial } = await sweep(input, names, seeds);
	const limit = input.limit ?? 40;
	const affected = new Set([...seeds, ...dependents.map((entry) => entry.path)]);

	return {
		description: input.description,
		symbols,
		seeds: [...seeds].sort(),
		dependents: dependents.slice(0, limit),
		modules: await affectedModules(input.root, affected),
		documents: await affectedDocuments(input.root, affected),
		skills: await affectedSkills(input.root, affected),
		unknown: [...new Set(unknown)].sort(),
		partial,
	};
}

/**
 * The names to trace.
 *
 * Without a model this falls back to identifiers picked straight out of the
 * description, which is enough when someone names the symbol they mean — and
 * that is the common case for the question this answers.
 */
async function candidateNames(
	input: PredictInput,
): Promise<{ symbols: string[]; files: string[]; fromModel: Set<string> }> {
	const literal = {
		symbols: [...new Set(input.description.match(/[A-Za-z_][A-Za-z0-9_]{2,}/g) ?? [])],
		files: [...new Set(input.description.match(/[\w./-]+\.[A-Za-z0-9]{1,8}/g) ?? [])].map((path) =>
			path.replace(/^\.\//, ""),
		),
	};
	if (!input.client) return { ...literal, fromModel: new Set<string>() };

	try {
		const raw = await input.client.complete({
			system: EXTRACT_SYSTEM,
			prompt: `Change described: ${input.description}`,
			purpose: "impact candidates",
			maxOutputTokens: 400,
		});
		const parsed = extractJson<{ symbols?: unknown; files?: unknown }>(raw);
		const symbols = stringsOf(parsed?.symbols);
		const files = stringsOf(parsed?.files);
		// Union rather than replacement: the model is better at "the config
		// loader" and worse at a name the user typed verbatim.
		return {
			symbols: [...new Set([...symbols, ...literal.symbols])],
			files: [...new Set([...files, ...literal.files])],
			fromModel: new Set([...symbols, ...files]),
		};
	} catch {
		// A model that cannot be reached does not make the deterministic half
		// unavailable, and the deterministic half is the part that is grounded.
		return { ...literal, fromModel: new Set<string>() };
	}
}

const EXTRACT_SYSTEM = `You turn a described code change into the identifiers it is about.

Given a plain-English description of a refactor or change, list the declaration names
(functions, types, classes, constants) and file paths it most likely concerns.

Guess names in the style the description implies; a name that does not exist will be
discarded by the caller, so propose the plausible spellings rather than hedging.

Return ONLY JSON: {"symbols":["..."],"files":["..."]}`;

/**
 * Does this word claim to be a declaration name?
 *
 * Anything with internal capitals or an underscore was written as an
 * identifier; an all-lowercase English word was not. The test is deliberately
 * conservative in one direction only — a real lowercase symbol that nothing
 * declares goes unreported, which costs a line, where reporting every word of
 * the sentence costs the reader the whole answer.
 */
function looksLikeIdentifier(name: string): boolean {
	if (name.includes("_")) return true;
	// camelCase, PascalCase, SCREAMING_CASE — a capital past the first letter,
	// or a leading capital on a word that is not simply a capitalised sentence
	// start, both read as code.
	return /[a-z][A-Z]/.test(name) || /^[A-Z][a-z0-9]*[A-Z]/.test(name);
}

function stringsOf(value: unknown): string[] {
	return Array.isArray(value)
		? value.filter((entry): entry is string => typeof entry === "string" && entry.trim() !== "")
		: [];
}

/**
 * Which files mention a matched name without declaring it.
 *
 * A word-boundary text search rather than a call graph: the index records
 * declarations, not references, and a text match is both honest about what it
 * is and language-agnostic. It over-reports — a comment counts — which is the
 * right direction for a question about what to go and check.
 */
async function sweep(
	input: PredictInput,
	names: ReadonlySet<string>,
	seeds: ReadonlySet<string>,
): Promise<{ dependents: Array<{ path: string; mentions: string[] }>; partial: boolean }> {
	if (names.size === 0) return { dependents: [], partial: false };

	const patterns = [...names].map((name) => ({
		name,
		regex: new RegExp(`\\b${escapeRegex(name)}\\b`),
	}));

	const dependents: Array<{ path: string; mentions: string[] }> = [];
	let swept = 0;
	let partial = false;

	for (const file of input.scan.files) {
		if (file.binary || file.size > MAX_FILE_BYTES) continue;
		if (file.risk.includes("generated") || file.risk.includes("lockfile")) continue;
		if (seeds.has(file.path)) continue;
		if (swept >= MAX_FILES_SWEPT) {
			partial = true;
			break;
		}
		swept++;

		let text: string;
		try {
			text = await readFile(join(input.root, file.path), "utf8");
		} catch {
			continue;
		}
		const mentions = patterns.filter((pattern) => pattern.regex.test(text)).map((pattern) => pattern.name);
		if (mentions.length > 0) dependents.push({ path: file.path, mentions });
	}

	// Most mentions first: the file that names three of the changed symbols is
	// the one to open.
	dependents.sort((a, b) => b.mentions.length - a.mentions.length || a.path.localeCompare(b.path));
	return { dependents, partial };
}

async function affectedModules(
	root: string,
	affected: ReadonlySet<string>,
): Promise<ImpactReport["modules"]> {
	const out: ImpactReport["modules"] = [];
	for (const card of await readCards(root)) {
		const files = card.sources.map((source) => source.path).filter((path) => affected.has(path));
		if (files.length > 0) out.push({ id: card.moduleId, name: card.name, files: files.sort() });
	}
	return out.sort((a, b) => a.id.localeCompare(b.id));
}

async function affectedDocuments(
	root: string,
	affected: ReadonlySet<string>,
): Promise<ImpactReport["documents"]> {
	const provenance = await readProvenance(root);
	const out: ImpactReport["documents"] = [];
	for (const record of provenance?.documents ?? []) {
		const files = record.sources.map((source) => source.path).filter((path) => affected.has(path));
		if (files.length > 0) out.push({ id: record.document, files: files.sort() });
	}
	return out.sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Skills whose steps name an affected file.
 *
 * A skill is a checklist of real paths; when one of those paths moves, the
 * checklist is wrong, and nothing else in the system would notice.
 */
async function affectedSkills(
	root: string,
	affected: ReadonlySet<string>,
): Promise<ImpactReport["skills"]> {
	const { skills } = await loadSkills(root);
	const out: ImpactReport["skills"] = [];
	for (const skill of skills) {
		const mentions = [...affected].some((path) => skill.content.includes(path));
		if (mentions) out.push({ name: skill.name, path: skill.path });
	}
	return out;
}

function escapeRegex(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
