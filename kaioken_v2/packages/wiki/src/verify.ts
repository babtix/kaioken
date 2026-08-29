import { resolveExcerpt, resolveRange, type SymbolOracle } from "@kaioken/index";
import { extractClaims, findPadding } from "./claims.js";
import type { Claim, Defect, VerificationReport } from "./types.js";

/**
 * The adversarial pass.
 *
 * Every claim the document makes is checked against the structural index built
 * in phase 1 — which is exactly why that index was built to serve three roles
 * rather than one. Here it is the grounding oracle and the anchor resolver at
 * the same time.
 *
 * A confidently wrong document is worse than a missing one, so an unverifiable
 * claim becomes a reported defect rather than shipped prose.
 */

export interface VerifyInput {
	body: string;
	oracle: SymbolOracle;
	/** Files this document was written from; claims outside are still checked. */
	scope: readonly string[];
	/** Reads a source file's current content, for excerpt resolution. */
	readSource: (path: string) => Promise<string | null>;
	/** Every path the scan saw, so "not indexed" is not mistaken for "absent". */
	knownFiles: ReadonlySet<string>;
}

export async function verifyDocument(input: VerifyInput): Promise<VerificationReport> {
	const claims = extractClaims(input.body);
	const defects: Defect[] = [];
	let grounded = 0;

	// The scope's own source, concatenated once. See `checkClaim` for why: the
	// index records declarations, but documentation legitimately names fields,
	// parameters, enum members and literal values too.
	const scopeText = await readScope(input);

	for (const claim of claims) {
		const defect = await checkClaim(claim, input, scopeText);
		if (defect) defects.push(defect);
		else grounded++;
	}

	// Padding is a defect on equal footing with error: prose that would read
	// identically for any codebase is worthless, however accurate it is.
	for (const { phrase, line } of findPadding(input.body)) {
		defects.push({
			kind: "padding",
			claim: phrase,
			line,
			detail: `"${phrase}" would read identically for any codebase`,
		});
	}

	const { uncovered, coverage } = coverageOf(input.body, input.oracle, input.scope);
	for (const name of uncovered.slice(0, 25)) {
		defects.push({
			kind: "uncovered_export",
			claim: name,
			detail: "exported declaration in scope that the document never mentions",
		});
	}

	return { grounded, defects, uncovered, coverage };
}

/**
 * Grounding is two-tier, and the second tier is what keeps this honest.
 *
 * The index records *declarations*. A document about a scanner will correctly
 * write `large_binary`, `maxReadBytes` or `id_rsa` — an enum value, an options
 * field, a matched filename — none of which is a declaration. Flagging those
 * would bury the one defect that matters under forty that do not.
 *
 * So: a name the index declares is grounded outright; a name that appears
 * verbatim in the source the document was written from is grounded too; a name
 * that appears in neither is invention, and that is what gets reported.
 */
async function checkClaim(
	claim: Claim,
	input: VerifyInput,
	scopeText: string,
): Promise<Defect | null> {
	switch (claim.kind) {
		case "file": {
			if (input.knownFiles.has(claim.text)) return null;
			// A shorthand reference — `scan.ts` for `packages/scan/src/scan.ts` —
			// is a normal thing to write and not a false claim.
			const base = claim.text.slice(claim.text.lastIndexOf("/") + 1);
			for (const known of input.knownFiles) {
				if (known.endsWith(`/${base}`) || known === base) return null;
			}
			// A path the code itself constructs, such as an output artifact.
			if (scopeText.includes(base)) return null;
			return {
				kind: "unknown_file",
				claim: claim.text,
				line: claim.line,
				detail: "the repository contains no such file",
			};
		}

		case "symbol": {
			// A document writes `Owner.method`; the index stores the bare name
			// with a parent. Checking only the literal string would flag a
			// perfectly correct reference.
			for (const candidate of nameCandidates(claim.text)) {
				if (input.oracle.has(candidate)) return null;
			}
			if (appearsInSource(scopeText, claim.text)) return null;
			return {
				kind: "unknown_symbol",
				claim: claim.text,
				line: claim.line,
				detail: "appears nowhere in the source this document was written from",
			};
		}

		case "anchor": {
			const file = claim.file as string;
			if (!input.knownFiles.has(file)) {
				return {
					kind: "unknown_file",
					claim: claim.text,
					line: claim.line,
					detail: "the repository contains no such file",
				};
			}
			const resolved = resolveRange(
				input.oracle.file(file),
				claim.startLine ?? 1,
				claim.endLine ?? claim.startLine ?? 1,
			);
			if (resolved.resolved) return null;
			return {
				kind: "bad_anchor",
				claim: claim.text,
				line: claim.line,
				detail:
					resolved.reason === "file_not_indexed"
						? "the file has no declaration index, so the range cannot be confirmed"
						: "the file does not have those lines",
			};
		}

		case "excerpt": {
			const file = claim.file as string;
			if (!input.knownFiles.has(file)) {
				return {
					kind: "unknown_file",
					claim: file,
					line: claim.line,
					detail: "the excerpt is attributed to a file the repository does not contain",
				};
			}
			const source = await input.readSource(file);
			if (source === null) {
				return {
					kind: "unknown_file",
					claim: file,
					line: claim.line,
					detail: "the attributed file could not be read",
				};
			}
			const resolved = resolveExcerpt(input.oracle.file(file), source, claim.text);
			if (resolved.resolved) return null;
			return {
				kind: resolved.reason === "excerpt_ambiguous" ? "excerpt_ambiguous" : "excerpt_not_found",
				claim: firstLine(claim.text),
				line: claim.line,
				detail:
					resolved.reason === "excerpt_ambiguous"
						? `the excerpt appears in ${resolved.matchCount} places, so the citation is not specific`
						: "the attributed file does not contain that text",
			};
		}
	}
}

/**
 * Coverage against the rubric: every exported declaration in the document's
 * scope should be mentioned somewhere.
 *
 * A plain substring search, deliberately. Requiring a code span would punish a
 * document for writing a name in ordinary prose, which is exactly what good
 * documentation does.
 */
export function coverageOf(
	body: string,
	oracle: SymbolOracle,
	scope: readonly string[],
): { uncovered: string[]; coverage: number } {
	const exported = new Set<string>();
	for (const path of scope) {
		for (const location of oracle.exported(path)) exported.add(location.symbol.name);
	}

	if (exported.size === 0) return { uncovered: [], coverage: 1 };

	const uncovered = [...exported].filter((name) => !mentions(body, name)).sort();
	return {
		uncovered,
		coverage: (exported.size - uncovered.length) / exported.size,
	};
}

async function readScope(input: VerifyInput): Promise<string> {
	const parts: string[] = [];
	for (const path of input.scope) {
		const source = await input.readSource(path);
		if (source !== null) parts.push(source);
	}
	return parts.join("\n");
}

/**
 * Whole-word, so `walk` is not evidence for `walkTree`. A dotted reference is
 * satisfied by its last segment, which is how a method appears in source.
 */
function appearsInSource(source: string, name: string): boolean {
	for (const candidate of nameCandidates(name)) {
		if (mentions(source, candidate)) return true;
	}
	// Prose capitalises what code lowercases — a document writes "Dockerfile"
	// where the lookup table has "dockerfile". This fallback applies only to the
	// source-appearance tier; a declaration is still matched exactly.
	const lowered = source.toLowerCase();
	for (const candidate of nameCandidates(name)) {
		if (mentions(lowered, candidate.toLowerCase())) return true;
	}
	return false;
}

/** Whole-word match, so `walk` does not count as a mention of `walkTree`. */
function mentions(body: string, name: string): boolean {
	const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	return new RegExp(`(?<![A-Za-z0-9_$])${escaped}(?![A-Za-z0-9_$])`).test(body);
}

function nameCandidates(written: string): string[] {
	const out = [written];
	const dot = written.lastIndexOf(".");
	if (dot > 0 && dot < written.length - 1) out.push(written.slice(dot + 1));
	return out;
}

function firstLine(text: string): string {
	const newline = text.indexOf("\n");
	const line = newline === -1 ? text : text.slice(0, newline);
	return line.length > 80 ? `${line.slice(0, 79)}…` : line;
}

/** Group defects for a report, most severe kind first. */
export function summariseDefects(defects: readonly Defect[]): Record<string, number> {
	const out: Record<string, number> = {};
	for (const defect of defects) out[defect.kind] = (out[defect.kind] ?? 0) + 1;
	return out;
}

/** Defects that mean the document asserts something untrue, as opposed to thin. */
export function groundingDefects(defects: readonly Defect[]): Defect[] {
	return defects.filter(
		(d) =>
			d.kind === "unknown_file" ||
			d.kind === "unknown_symbol" ||
			d.kind === "bad_anchor" ||
			d.kind === "excerpt_not_found" ||
			d.kind === "excerpt_ambiguous",
	);
}
