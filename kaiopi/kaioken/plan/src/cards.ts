import { type IndexResult, SymbolOracle } from "@kaioken/index";
import { type Depth, depthFor, extractJson, type ModelClient } from "@kaioken/modelport";
import { readCards } from "./artifact.ts";
import { gatherModuleEvidence, type ModuleEvidence } from "./evidence.ts";
import type { Card, Card3DRenderOptions, CardEntryPoint, CardVerification, Module, ModulePlan } from "./types.ts";
import { moduleScope } from "./validate.ts";

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

	let draft: CardDraft;
	try {
		draft = parseCard(reply);
	} catch (err) {
		try {
			const repairReply = await client.complete({
				purpose: "card-repair-json",
				system: "You fix malformed JSON. Return valid JSON only, conforming to the requested schema.",
				prompt: `Your previous reply could not be parsed as JSON: ${err instanceof Error ? err.message : String(err)}\n\nRaw output:\n${reply}`,
				maxOutputTokens: depth.maxOutputTokens,
			});
			draft = parseCard(repairReply);
		} catch {
			draft = { summary: "", keyPoints: [], entryPoints: [] };
		}
	}
	let verification = verifyCard(draft, module, evidence, oracle);

	// Above the breadth threshold the multiplier stops buying length and starts
	// buying scrutiny: each pass feeds the verifier's findings back for repair.
	for (let pass = 0; pass < depth.repairPasses; pass++) {
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
	_module: Module,
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
		let matchedRecord: { startLine?: number; kind?: string; exported?: boolean } | null = null;

		// Prefer the scoped check: a name that exists elsewhere in the repository
		// is still wrong if this module does not declare it.
		if (entry.file) {
			for (const cand of candidates) {
				const rec = oracle.lookupIn(entry.file, cand);
				if (rec) {
					matchedRecord = rec;
					break;
				}
			}
		}

		if (!matchedRecord && !entry.file) {
			for (const cand of candidates) {
				const locs = oracle.lookup(cand);
				if (locs.length > 0 && locs[0]?.symbol) {
					matchedRecord = locs[0].symbol;
					break;
				}
			}
		}

		if (matchedRecord) {
			grounded++;
			if (matchedRecord.startLine !== undefined) entry.line = matchedRecord.startLine;
			if (matchedRecord.kind !== undefined) entry.kind = matchedRecord.kind;
			if (matchedRecord.exported !== undefined) entry.exported = matchedRecord.exported;
		} else {
			ungrounded.push(entry.name);
		}
	}

	const mentioned = new Set(draft.entryPoints.flatMap((e) => nameCandidates(e.name)));
	const uncovered = [...new Set(evidence.exportedSymbols)].filter((name) => !mentioned.has(name));

	// A module's own claimed files that the index never had.
	for (const missing of evidence.missing) unknownFiles.push(missing);

	const total = grounded + ungrounded.length;
	const score = total > 0 ? Math.round((grounded / total) * 100) : 100;
	const status: "grounded" | "defects" | "partial" =
		ungrounded.length === 0 && unknownFiles.length === 0
			? "grounded"
			: grounded > 0
				? "partial"
				: "defects";

	return {
		grounded,
		ungrounded,
		unknownFiles: [...new Set(unknownFiles)],
		uncovered,
		score,
		status,
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
	const lines = ["Your previous card:", JSON.stringify(draft, null, 2), "", "Defect report:"];

	if (verification.ungrounded.length > 0) {
		lines.push(
			`- These entry points name declarations this module does not declare: ${verification.ungrounded.join(", ")}`,
		);
	}
	if (verification.unknownFiles.length > 0) {
		lines.push(`- These files are not in scope: ${verification.unknownFiles.join(", ")}`);
	}
	if (verification.uncovered.length > 0) {
		lines.push(`- Exported declarations never mentioned: ${verification.uncovered.slice(0, 30).join(", ")}`);
	}

	lines.push("", "Declarations that do exist, by file:", "");
	for (const file of evidence.files) {
		lines.push(`--- ${file.path}`);
		for (const declaration of file.declarations) lines.push(`  ${declaration}`);
	}

	return lines.join("\n");
}

function parseCard(reply: string): CardDraft {
	let raw: Record<string, unknown>;
	try {
		raw = extractJson<Record<string, unknown>>(reply);
	} catch (err) {
		const stripped = reply.replace(/,\s*([}\]])/g, "$1");
		try {
			raw = extractJson<Record<string, unknown>>(stripped);
		} catch {
			throw err;
		}
	}

	const entryPoints = Array.isArray(raw.entryPoints)
		? (raw.entryPoints as unknown[])
				.map((item) => {
					if (!item || typeof item !== "object") return null;
					const source = item as Record<string, unknown>;
					const name = typeof source.name === "string" ? source.name.trim() : "";
					if (!name) return null;
					return {
						name,
						file: typeof source.file === "string" ? source.file.trim() : "",
						note: typeof source.note === "string" ? source.note.trim() : "",
					};
				})
				.filter((e): e is CardEntryPoint => e !== null)
		: [];

	return {
		summary: typeof raw.summary === "string" ? raw.summary.trim() : "",
		keyPoints: Array.isArray(raw.keyPoints)
			? (raw.keyPoints as unknown[]).filter((p): p is string => typeof p === "string")
			: [],
		entryPoints,
	};
}

/** Generate cards for every module in a plan. */
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
		/**
		 * Fires when a card job starts, before its model call.
		 *
		 * `onProgress` fires at the same point today, but a live log needs an
		 * explicit start signal distinct from completion reporting.
		 */
		onTaskStart?: (moduleId: string, index: number, total: number) => void;
		/**
		 * When true, only regenerate cards whose source files changed or are missing.
		 */
		incremental?: boolean;
		/** Existing cards to consider for reuse when incremental is enabled. */
		existingCards?: readonly Card[];
		/** Repository root directory to load existing cards from if existingCards is not provided. */
		root?: string;
	} = {},
): Promise<CardResult[]> {
	const oracle = new SymbolOracle(index ?? emptyIndex());
	const wanted = options.only && options.only.length > 0 ? new Set(options.only) : null;
	const depth = depthFor(options.multiplier ?? 1);

	let existing: readonly Card[] = options.existingCards ?? [];
	if (options.incremental && existing.length === 0 && options.root) {
		try {
			existing = await readCards(options.root);
		} catch {
			existing = [];
		}
	}
	const existingByModule = new Map<string, Card>(existing.map((c) => [c.moduleId, c]));

	// The plan is authoritative: cards are generated for exactly the modules the
	// plan declares, in the order it declares them. Editing the plan is how you
	// change what gets generated.
	const modules = flattenLeaves(plan).filter((m) => !wanted || wanted.has(m.id));

	const out: CardResult[] = [];
	for (let i = 0; i < modules.length; i++) {
		const module = modules[i] as Module;
		options.onTaskStart?.(module.id, i, modules.length);
		options.onProgress?.(module.id, i, modules.length);

		if (options.incremental) {
			const existingCard = existingByModule.get(module.id);
			if (isCardFresh(existingCard, module, options.knownFiles)) {
				const scope = moduleScope(module);
				const evidence = gatherModuleEvidence(index, scope, {
					maxDeclarationsPerFile: depth.declarationsPerFile,
					...(options.knownFiles ? { knownFiles: options.knownFiles } : {}),
				});
				out.push({
					card: existingCard!,
					evidence,
					reply: "",
				});
				continue;
			}
		}

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

function isCardFresh(
	card: Card | undefined,
	module: Module,
	knownFiles?: ReadonlyMap<string, string>,
): boolean {
	if (!card) return false;
	const scope = moduleScope(module);
	if (card.sources.length !== scope.length) return false;
	const sourcePaths = new Set(card.sources.map((s) => s.path));
	for (const path of scope) {
		if (!sourcePaths.has(path)) return false;
	}
	if (knownFiles) {
		for (const source of card.sources) {
			const currentHash = knownFiles.get(source.path);
			if (currentHash === undefined || currentHash !== source.hash) {
				return false;
			}
		}
	}
	return true;
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

/**
 * Format a visual status badge for a card verification record.
 * [GROUNDED 100%] | [PARTIAL 75%] | [DEFECTS: 2 ungrounded]
 */
export function formatCardBadge(
	verification: CardVerification | undefined,
	options: { unicode?: boolean } = {},
): string {
	if (!verification) return "[UNVERIFIED]";
	const useUnicode = options.unicode ?? true;
	const grounded = verification.grounded;
	const ungroundedCount = verification.ungrounded.length;
	const total = grounded + ungroundedCount;
	const score = verification.score ?? (total > 0 ? Math.round((grounded / total) * 100) : 100);

	const isGrounded =
		verification.status === "grounded" ||
		(ungroundedCount === 0 && verification.unknownFiles.length === 0);

	if (isGrounded) {
		return useUnicode ? `[✔ GROUNDED ${score}%]` : `[GROUNDED ${score}%]`;
	}
	if (verification.status === "partial" || grounded > 0) {
		return useUnicode ? `[⚠ PARTIAL ${score}%]` : `[PARTIAL ${score}%]`;
	}
	return useUnicode
		? `[✖ DEFECTS: ${ungroundedCount} ungrounded]`
		: `[DEFECTS: ${ungroundedCount} ungrounded]`;
}

/**
 * Visual citation density gauge measuring evidence ratio (grounded citations / total citations).
 * e.g. [████████░░] 80% (4/5 verified)
 */
export function formatCitationDensityGauge(
	card: Card,
	options: { width?: number; unicode?: boolean } = {},
): string {
	const width = options.width ?? 12;
	const useUnicode = options.unicode ?? true;
	const grounded = card.verification?.grounded ?? 0;
	const ungrounded = card.verification?.ungrounded.length ?? 0;
	const total = grounded + ungrounded || card.entryPoints.length || 1;
	const ratio = Math.min(1, Math.max(0, grounded / total));
	const filled = Math.round(ratio * width);
	const empty = Math.max(0, width - filled);

	const fillChar = useUnicode ? "█" : "#";
	const emptyChar = useUnicode ? "░" : "-";
	const bar = fillChar.repeat(filled) + emptyChar.repeat(empty);
	const pct = Math.round(ratio * 100);

	return `[${bar}] ${pct}% (${grounded}/${total} verified)`;
}

/**
 * Check whether a card cites any symbols that were modified or removed.
 * Returns true if the card is stale at the symbol level.
 */
export function isCardSymbolStale(
	card: Card,
	modifiedSymbols?: ReadonlySet<string>,
	oracle?: SymbolOracle,
): boolean {
	if (!modifiedSymbols || modifiedSymbols.size === 0) return false;

	for (const ep of card.entryPoints) {
		const candidates = nameCandidates(ep.name);
		for (const cand of candidates) {
			if (modifiedSymbols.has(cand)) return true;
		}
		if (oracle && ep.file) {
			const loc = oracle.lookupIn(ep.file, ep.name);
			if (!loc) return true; // symbol no longer exists in scope
		}
	}
	return false;
}

/**
 * Wrap text lines cleanly to fit within target width.
 */
function wrapText(text: string, maxWidth: number): string[] {
	if (!text) return [];
	const words = text.split(/\s+/);
	const lines: string[] = [];
	let current = "";

	for (const word of words) {
		if (!current) {
			current = word;
		} else if (current.length + 1 + word.length <= maxWidth) {
			current += ` ${word}`;
		} else {
			lines.push(current);
			current = word;
		}
	}
	if (current) lines.push(current);
	return lines;
}

/**
 * Render an interactive 3D-styled terminal card flip viewer (UX-1301 to UX-1310).
 * Simulates isometric terminal depth with shaded right/bottom borders and front/back views.
 */
export function renderCard3D(card: Card, options: Card3DRenderOptions = {}): string {
	const side = options.side ?? "front";
	const targetWidth = Math.max(48, Math.min(100, options.width ?? 68));
	const innerWidth = targetWidth - 4; // account for borders "│ " and " │"
	const u = options.unicode ?? true;

	const cTopLeft = u ? "╭" : "+";
	const cTopRight = u ? "╮" : "+";
	const cBottomLeft = u ? "╰" : "+";
	const cBottomRight = u ? "╯" : "+";
	const cHoriz = u ? "─" : "-";
	const cVert = u ? "│" : "|";
	const cDivider = u ? "├" : "+";
	const cDividerR = u ? "┤" : "+";
	const shadowRight = u ? "█" : "#";
	const shadowBottom = u ? "▀" : "-";

	const lines: string[] = [];

	const formatRow = (content: string): string => {
		const strippedLength = content.replace(/\u001b\[\d+m/g, "").length;
		const padding = Math.max(0, innerWidth - strippedLength);
		return `${cVert} ${content}${" ".repeat(padding)} ${cVert}${shadowRight}`;
	};

	const dividerRow = (): string => {
		return `${cDivider}${cHoriz.repeat(innerWidth + 2)}${cDividerR}${shadowRight}`;
	};

	// Top border
	lines.push(`${cTopLeft}${cHoriz.repeat(innerWidth + 2)}${cTopRight}`);

	if (side === "front") {
		// FRONT SIDE
		const badge = formatCardBadge(card.verification, { unicode: u });
		const gauge = formatCitationDensityGauge(card, { unicode: u, width: 10 });

		lines.push(formatRow(`[FRONT] 📇 MODULE: ${card.moduleId.toUpperCase()} — ${card.name}`));
		lines.push(formatRow(`Status: ${badge}  Density: ${gauge}`));
		lines.push(dividerRow());

		lines.push(formatRow("SUMMARY:"));
		const summaryLines = wrapText(card.summary || "(No summary generated)", innerWidth);
		for (const sl of summaryLines) {
			lines.push(formatRow(`  ${sl}`));
		}

		lines.push(formatRow(""));
		lines.push(formatRow(`KEY POINTS (${card.keyPoints.length}):`));
		for (const kp of card.keyPoints) {
			const kpLines = wrapText(kp, innerWidth - 4);
			if (kpLines.length > 0) {
				lines.push(formatRow(`  • ${kpLines[0]}`));
				for (let k = 1; k < kpLines.length; k++) {
					lines.push(formatRow(`    ${kpLines[k]}`));
				}
			}
		}

		lines.push(dividerRow());
		lines.push(formatRow(`Sources: ${card.sources.length} file(s) | Entry Points: ${card.entryPoints.length}`));
		lines.push(formatRow("Tip: Flip to back view with --flip to inspect verified symbols & lines"));
	} else {
		// BACK SIDE
		const badge = formatCardBadge(card.verification, { unicode: u });
		lines.push(formatRow(`[BACK] 🔍 CITATIONS & DECLARATIONS: ${card.moduleId}`));
		lines.push(formatRow(`Status: ${badge} | Generated: ${card.generatedAt.slice(0, 19).replace("T", " ")}`));
		lines.push(dividerRow());

		lines.push(formatRow("VERIFIED ENTRY POINTS:"));
		if (card.entryPoints.length === 0) {
			lines.push(formatRow("  (No entry points declared)"));
		} else {
			for (const ep of card.entryPoints) {
				const lineInfo = ep.line ? `:${ep.line}` : "";
				const kindInfo = ep.kind ? ` [${ep.kind}]` : "";
				const statusTag = ep.line ? "[VERIFIED]" : "[UNGROUNDED]";
				const main = `${ep.name} -> ${ep.file}${lineInfo}${kindInfo} ${statusTag}`;
				const epLines = wrapText(main, innerWidth - 4);
				lines.push(formatRow(`  • ${epLines[0]}`));
				for (let k = 1; k < epLines.length; k++) {
					lines.push(formatRow(`    ${epLines[k]}`));
				}
				if (ep.note) {
					const noteLines = wrapText(`Note: ${ep.note}`, innerWidth - 6);
					for (const nl of noteLines) {
						lines.push(formatRow(`      ${nl}`));
					}
				}
			}
		}

		lines.push(dividerRow());
		lines.push(formatRow(`PROVENANCE SOURCES (${card.sources.length}):`));
		for (const s of card.sources.slice(0, 5)) {
			const hashShort = s.hash ? ` (${s.hash.slice(0, 8)})` : "";
			lines.push(formatRow(`  - ${s.path}${hashShort}`));
		}
		if (card.sources.length > 5) {
			lines.push(formatRow(`    ... and ${card.sources.length - 5} more sources`));
		}
		lines.push(dividerRow());
		lines.push(formatRow("Tip: Flip to front view with --3d to review executive summary & key points"));
	}

	// Bottom border with isometric shadow
	lines.push(`${cBottomLeft}${cHoriz.repeat(innerWidth + 2)}${cBottomRight}${shadowRight}`);
	lines.push(`  ${shadowBottom.repeat(innerWidth + 2)}`);

	return lines.join("\n");
}

/**
 * Render both front and back views of a card as a 3D flip pair.
 */
export function renderCardPair(card: Card, options: Card3DRenderOptions = {}): string {
	const front = renderCard3D(card, { ...options, side: "front" });
	const back = renderCard3D(card, { ...options, side: "back" });
	const separator = `\n${" ".repeat(18)}│▲│ [ 3D CARD ROTATION FLIP ] │▼│\n`;
	return `${front}${separator}${back}`;
}

/**
 * Incrementally update cards, regenerating only cards whose cited symbols or source files changed.
 */
export async function updateCardsIncrementally(
	plan: ModulePlan,
	existingCards: readonly Card[],
	index: IndexResult | null,
	client: ModelClient,
	options: {
		modifiedFiles?: ReadonlySet<string>;
		modifiedSymbols?: ReadonlySet<string>;
		knownFiles?: ReadonlyMap<string, string>;
		multiplier?: number;
		onTaskStart?: (moduleId: string, index: number, total: number) => void;
		onProgress?: (moduleId: string, done: number, total: number) => void;
	} = {},
): Promise<{ cards: Card[]; regenerated: string[]; reused: string[] }> {
	const oracle = new SymbolOracle(index ?? emptyIndex());
	const existingByModule = new Map<string, Card>(existingCards.map((c) => [c.moduleId, c]));
	const modules = flattenLeaves(plan);

	const cards: Card[] = [];
	const regenerated: string[] = [];
	const reused: string[] = [];

	for (let i = 0; i < modules.length; i++) {
		const mod = modules[i] as Module;
		options.onTaskStart?.(mod.id, i, modules.length);
		options.onProgress?.(mod.id, i, modules.length);

		const existing = existingByModule.get(mod.id);

		let needsRegen = false;
		if (!existing) {
			needsRegen = true;
		} else {
			// Check file freshness
			if (!isCardFresh(existing, mod, options.knownFiles)) {
				// If files changed, check if modified symbols touched this card
				if (options.modifiedSymbols && options.modifiedSymbols.size > 0) {
					needsRegen = isCardSymbolStale(existing, options.modifiedSymbols, oracle);
				} else {
					needsRegen = true;
				}
			} else if (options.modifiedSymbols && isCardSymbolStale(existing, options.modifiedSymbols, oracle)) {
				needsRegen = true;
			}
		}

		if (!needsRegen && existing) {
			// Re-verify deterministically without LLM inference
			const scope = moduleScope(mod);
			const evidence = gatherModuleEvidence(index, scope, {
				maxDeclarationsPerFile: 10,
				...(options.knownFiles ? { knownFiles: options.knownFiles } : {}),
			});
			const verification = verifyCard(
				{ summary: existing.summary, keyPoints: existing.keyPoints, entryPoints: existing.entryPoints },
				mod,
				evidence,
				oracle,
			);
			cards.push({ ...existing, verification });
			reused.push(mod.id);
		} else {
			const res = await generateCard(mod, index, client, {
				...(options.multiplier !== undefined ? { multiplier: options.multiplier } : {}),
				...(options.knownFiles ? { knownFiles: options.knownFiles } : {}),
				oracle,
			});
			cards.push(res.card);
			regenerated.push(mod.id);
		}
	}

	return { cards, regenerated, reused };
}

