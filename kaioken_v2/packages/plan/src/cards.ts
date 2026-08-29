import { type IndexResult, SymbolOracle } from "@kaioken/index";
import { gatherModuleEvidence, type ModuleEvidence } from "./evidence.js";
import { type Depth, depthFor, extractJson, type ModelClient } from "@kaioken/model";
import type { Card, CardEntryPoint, CardVerification, Module, ModulePlan } from "./types.js";
import { moduleScope } from "./validate.js";

const SYSTEM = `You write a knowledge card for one module of a repository.

A card is compact and factual. It is read by an agent about to do work here, and
by a person trying to orient quickly.

Rules:
- Use only declarations and file paths given in the evidence. Never invent one.
- Entry points must name a declaration that appears in the evidence, with the
  file it appears in.
- Say what the code does and why it is shaped that way. Prose that would read
  identically for any repository is worthless — be specific to this one.
- No filler. No "this module provides functionality for".

Reply with JSON only:
{"summary":"...","keyPoints":["..."],"entryPoints":[{"name":"Sym","file":"path","note":"..."}]}`;

const CRITIQUE_SYSTEM = `You revise a knowledge card against a defect report.

Fix exactly what the report names: remove claims about declarations or files
that do not exist, and add coverage the report says is missing. Change nothing
else. Keep the same JSON shape.`;

export interface CardResult {
	card: Card;
	evidence: ModuleEvidence;
	reply: string;
}

/**
 * Generate one module's card, then check it.
 *
 * Generation is a claim; verification is the product. The model is asked not to
 * invent declarations, and then a separate deterministic pass checks whether it
 * did — because a request is not a guarantee, and a confidently wrong card is
 * worse than a missing one.
 */
export async function generateCard(
	module: Module,
	index: IndexResult | null,
	client: ModelClient,
	options: { multiplier?: number; oracle?: SymbolOracle; knownFiles?: ReadonlyMap<string, string> } = {},
): Promise<CardResult> {
	const depth = depthFor(options.multiplier ?? 1);
	const scope = moduleScope(module);
	const evidence = gatherModuleEvidence(index, scope, {
		maxDeclarationsPerFile: depth.declarationsPerFile,
		...(options.knownFiles ? { knownFiles: options.knownFiles } : {}),
	});
	const oracle = options.oracle ?? new SymbolOracle(index ?? emptyIndex());

	const reply = await client.complete({
		purpose: "card",
		system: SYSTEM,
		prompt: buildCardPrompt(module, evidence, depth),
		maxOutputTokens: depth.maxOutputTokens,
	});

	let draft = parseCard(reply);
	let verification = verifyCard(draft, module, evidence, oracle);

	// Above the breadth threshold the multiplier stops buying length and starts
	// buying scrutiny: each pass feeds the verifier's findings back for repair.
	for (let pass = 0; pass < depth.refinementPasses; pass++) {
		if (verification.ungrounded.length === 0 && verification.unknownFiles.length === 0) break;

		const revised = await client.complete({
			purpose: "card-correct",
			system: CRITIQUE_SYSTEM,
			prompt: buildCorrectionPrompt(draft, verification, evidence),
			maxOutputTokens: depth.maxOutputTokens,
		});

		try {
			const candidate = parseCard(revised);
			const candidateVerification = verifyCard(candidate, module, evidence, oracle);
			// Only accept a revision that actually improved grounding; a model
			// asked to fix things can make them worse.
			if (defectCount(candidateVerification) < defectCount(verification)) {
				draft = candidate;
				verification = candidateVerification;
			}
		} catch {
			break;
		}
	}

	const card: Card = {
		moduleId: module.id,
		name: module.name,
		generatedAt: new Date().toISOString(),
		summary: draft.summary,
		keyPoints: draft.keyPoints,
		entryPoints: draft.entryPoints,
		// Provenance is machinery: staleness and invalidation read this, so it
		// records the files actually bundled, not the files the model mentioned,
		// pinned to the content they had when the card was written.
		sources: evidence.files.map((f) => ({
			path: f.path,
			hash: options.knownFiles?.get(f.path) ?? "",
		})),
		verification,
	};

	return { card, evidence, reply };
}

interface CardDraft {
	summary: string;
	keyPoints: string[];
	entryPoints: CardEntryPoint[];
}

/**
 * The adversarial pass.
 *
 * Every claim the card makes about a declaration or a file is checked against
 * the structural index. Unverifiable claims are reported as defects rather than
 * shipped silently.
 */
export function verifyCard(
	draft: CardDraft,
	module: Module,
	evidence: ModuleEvidence,
	oracle: SymbolOracle,
): CardVerification {
	const inScope = new Set(evidence.files.map((f) => f.path));
	const ungrounded: string[] = [];
	const unknownFiles: string[] = [];
	let grounded = 0;

	for (const entry of draft.entryPoints) {
		if (entry.file && !inScope.has(entry.file)) unknownFiles.push(entry.file);

		// A card naturally writes a method as "Owner.method"; the index stores the
		// bare name with a parent. Checking only the literal string would flag a
		// perfectly correct reference.
		const candidates = nameCandidates(entry.name);

		// Prefer the scoped check: a name that exists elsewhere in the repository
		// is still wrong if this module does not declare it.
		const scoped = entry.file
			? candidates.some((name) => oracle.lookupIn(entry.file, name) !== null)
			: false;
		if (scoped) {
			grounded++;
			continue;
		}
		if (!entry.file && candidates.some((name) => oracle.has(name))) {
			grounded++;
			continue;
		}
		ungrounded.push(entry.name);
	}

	const mentioned = new Set(draft.entryPoints.flatMap((e) => nameCandidates(e.name)));
	const uncovered = [...new Set(evidence.exportedSymbols)].filter((name) => !mentioned.has(name));

	// A module's own claimed files that the index never had.
	for (const missing of evidence.missing) unknownFiles.push(missing);

	return {
		grounded,
		ungrounded,
		unknownFiles: [...new Set(unknownFiles)],
		uncovered,
	};
}

/**
 * The forms a written reference may take: the literal string, and — for a
 * dotted reference — its last segment, which is how the index records a method.
 */
function nameCandidates(written: string): string[] {
	const out = [written];
	const dot = written.lastIndexOf(".");
	if (dot > 0 && dot < written.length - 1) out.push(written.slice(dot + 1));
	return out;
}

function defectCount(verification: CardVerification): number {
	return verification.ungrounded.length + verification.unknownFiles.length;
}

export function buildCardPrompt(module: Module, evidence: ModuleEvidence, depth: Depth): string {
	const lines: string[] = [
		`Module: ${module.name} (id: ${module.id})`,
		module.purpose ? `Stated purpose: ${module.purpose}` : "",
		"",
		`Write ${depth.keyPoints} key points.`,
		"",
		`Files in scope (${evidence.files.length}), with their declarations:`,
		"",
	];

	for (const file of evidence.files) {
		lines.push(`--- ${file.path}  (${file.language}, ${file.lineCount} lines)`);
		if (file.declarations.length === 0) lines.push("  (no declarations indexed)");
		for (const declaration of file.declarations) lines.push(`  ${declaration}`);
		lines.push("");
	}

	return lines.filter((l) => l !== undefined).join("\n");
}

function buildCorrectionPrompt(
	draft: CardDraft,
	verification: CardVerification,
	evidence: ModuleEvidence,
): string {
	const lines = [
		"Your previous card:",
		JSON.stringify(draft, null, 2),
		"",
		"Defect report:",
	];

	if (verification.ungrounded.length > 0) {
		lines.push(
			`- These entry points name declarations this module does not declare: ${verification.ungrounded.join(", ")}`,
		);
	}
	if (verification.unknownFiles.length > 0) {
		lines.push(`- These files are not in scope: ${verification.unknownFiles.join(", ")}`);
	}
	if (verification.uncovered.length > 0) {
		lines.push(
			`- Exported declarations never mentioned: ${verification.uncovered.slice(0, 30).join(", ")}`,
		);
	}

	lines.push("", "Declarations that do exist, by file:", "");
	for (const file of evidence.files) {
		lines.push(`--- ${file.path}`);
		for (const declaration of file.declarations) lines.push(`  ${declaration}`);
	}

	return lines.join("\n");
}

function parseCard(reply: string): CardDraft {
	const raw = extractJson<Record<string, unknown>>(reply);

	const entryPoints = Array.isArray(raw["entryPoints"])
		? (raw["entryPoints"] as unknown[])
				.map((item) => {
					if (!item || typeof item !== "object") return null;
					const source = item as Record<string, unknown>;
					const name = typeof source["name"] === "string" ? source["name"].trim() : "";
					if (!name) return null;
					return {
						name,
						file: typeof source["file"] === "string" ? source["file"].trim() : "",
						note: typeof source["note"] === "string" ? source["note"].trim() : "",
					};
				})
				.filter((e): e is CardEntryPoint => e !== null)
		: [];

	return {
		summary: typeof raw["summary"] === "string" ? raw["summary"].trim() : "",
		keyPoints: Array.isArray(raw["keyPoints"])
			? (raw["keyPoints"] as unknown[]).filter((p): p is string => typeof p === "string")
			: [],
		entryPoints,
	};
}

/** Generate cards for every module in a plan, skipping ones already current. */
export async function generateCards(
	plan: ModulePlan,
	index: IndexResult | null,
	client: ModelClient,
	options: {
		multiplier?: number;
		only?: string[];
		/**
		 * Path -> content hash from the scan. Lets the verifier tell "no
		 * declarations" from "no such file", and supplies provenance hashes.
		 */
		knownFiles?: ReadonlyMap<string, string>;
		onProgress?: (moduleId: string, done: number, total: number) => void;
	} = {},
): Promise<CardResult[]> {
	const oracle = new SymbolOracle(index ?? emptyIndex());
	const wanted = options.only && options.only.length > 0 ? new Set(options.only) : null;

	// The plan is authoritative: cards are generated for exactly the modules the
	// plan declares, in the order it declares them. Editing the plan is how you
	// change what gets generated.
	const modules = flattenLeaves(plan).filter((m) => !wanted || wanted.has(m.id));

	const out: CardResult[] = [];
	for (let i = 0; i < modules.length; i++) {
		const module = modules[i] as Module;
		options.onProgress?.(module.id, i, modules.length);
		out.push(
			await generateCard(module, index, client, {
				...(options.multiplier !== undefined ? { multiplier: options.multiplier } : {}),
				...(options.knownFiles ? { knownFiles: options.knownFiles } : {}),
				oracle,
			}),
		);
	}
	return out;
}

/**
 * Every module that owns files. A parent that only groups children gets no card
 * of its own — its children's cards already cover the same ground.
 */
function flattenLeaves(plan: ModulePlan): Module[] {
	const out: Module[] = [];
	const walk = (modules: readonly Module[]) => {
		for (const module of modules) {
			if (module.files.length > 0) out.push(module);
			if (module.children) walk(module.children);
		}
	};
	walk(plan.modules);
	return out;
}

function emptyIndex(): IndexResult {
	return {
		root: "",
		builtAt: "",
		fileCount: 0,
		symbolCount: 0,
		unparsedLanguages: {},
		files: [],
	};
}
