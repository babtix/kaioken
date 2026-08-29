import type { Claim } from "./types.js";

/**
 * Pull every checkable claim out of a generated document.
 *
 * The generation prompt asks the model not to invent files, symbols or
 * excerpts. A request is not a guarantee — so this pass extracts what the
 * document actually claims, and the verifier checks each one. Nothing here
 * consults the repository; it only reads the prose.
 */

/** `path/to/file.ext` or `path/to/file.ext:12` or `:12-40`, inside backticks. */
const CODE_SPAN = /`([^`\n]+)`/g;

/** A path-looking token: at least one slash or a known-ish extension. */
const PATH_LIKE = /^[A-Za-z0-9._\-/]+\.[A-Za-z0-9]{1,10}$/;
const ANCHOR = /^([A-Za-z0-9._\-/]+\.[A-Za-z0-9]{1,10}):(\d+)(?:-(\d+))?$/;

/** An identifier a document would write for a declaration. */
const SYMBOL_LIKE = /^[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*$/;

/**
 * Words that make a code span prose rather than a claim: a document may write
 * `true` or `null` without asserting the repository declares them.
 */
const NOT_SYMBOLS = new Set([
	"true",
	"false",
	"null",
	"nil",
	"none",
	"undefined",
	"string",
	"number",
	"boolean",
	"int",
	"bool",
	"void",
	"any",
	"object",
	"array",
	"error",
	"this",
	"self",
	"new",
	"return",
	"import",
	"export",
	"const",
	"let",
	"var",
	"if",
	"else",
	"for",
	"while",
	"async",
	"await",
	"json",
	"yaml",
	"http",
	"https",
	"npm",
	"git",
	"ok",
	"n",
	"x",
	"y",
]);

export function extractClaims(body: string): Claim[] {
	const claims: Claim[] = [];
	const lines = body.split(/\r?\n/);

	let inFence = false;
	let fenceInfo = "";
	let fenceStart = 0;
	let fenceBuffer: string[] = [];

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i] as string;
		const lineNumber = i + 1;

		const fence = /^\s*(?:```|~~~)(.*)$/.exec(line);
		if (fence) {
			if (inFence) {
				const excerpt = fenceBuffer.join("\n");
				const attribution = parseFenceInfo(fenceInfo);
				// Only a fence that names a source file is a quotation. An
				// illustrative snippet claims nothing and must not be checked.
				if (attribution && excerpt.trim()) {
					claims.push({
						kind: "excerpt",
						text: excerpt,
						line: fenceStart,
						file: attribution.file,
						...(attribution.startLine !== undefined
							? { startLine: attribution.startLine }
							: {}),
						...(attribution.endLine !== undefined ? { endLine: attribution.endLine } : {}),
					});
				}
				inFence = false;
				fenceBuffer = [];
			} else {
				inFence = true;
				fenceInfo = (fence[1] ?? "").trim();
				fenceStart = lineNumber;
			}
			continue;
		}

		if (inFence) {
			fenceBuffer.push(line);
			continue;
		}

		for (const span of codeSpans(line)) {
			const claim = classify(span, lineNumber);
			if (claim) claims.push(claim);
		}
	}

	return dedupe(claims);
}

function codeSpans(line: string): string[] {
	const out: string[] = [];
	CODE_SPAN.lastIndex = 0;
	for (let m = CODE_SPAN.exec(line); m; m = CODE_SPAN.exec(line)) {
		const inner = (m[1] ?? "").trim();
		if (inner) out.push(inner);
	}
	return out;
}

function classify(span: string, line: number): Claim | null {
	const anchor = ANCHOR.exec(span);
	if (anchor) {
		const start = Number.parseInt(anchor[2] as string, 10);
		const end = anchor[3] ? Number.parseInt(anchor[3], 10) : start;
		return {
			kind: "anchor",
			text: span,
			line,
			file: anchor[1] as string,
			startLine: start,
			endLine: end,
		};
	}

	if (PATH_LIKE.test(span) && span.includes("/")) {
		return { kind: "file", text: span, line };
	}

	// A call written as `doThing()` still claims `doThing` exists.
	const call = /^([A-Za-z_$][A-Za-z0-9_$.]*)\(\s*\)?$/.exec(span);
	const candidate = call ? (call[1] as string) : span;

	if (
		SYMBOL_LIKE.test(candidate) &&
		!NOT_SYMBOLS.has(candidate.toLowerCase()) &&
		candidate.length > 2 &&
		// A bare lowercase word is almost always prose; a declaration reference
		// carries a case boundary, a dot, or an underscore.
		/[A-Z_.]/.test(candidate)
	) {
		return { kind: "symbol", text: candidate, line };
	}

	return null;
}

/**
 * A fence info string that attributes the excerpt: ```ts path/to/file.ts:10-20
 * Anything else is an illustration, not a quotation.
 */
function parseFenceInfo(info: string): { file: string; startLine?: number; endLine?: number } | null {
	for (const token of info.split(/\s+/).filter(Boolean)) {
		const anchor = ANCHOR.exec(token);
		if (anchor) {
			const start = Number.parseInt(anchor[2] as string, 10);
			return {
				file: anchor[1] as string,
				startLine: start,
				endLine: anchor[3] ? Number.parseInt(anchor[3], 10) : start,
			};
		}
		if (PATH_LIKE.test(token) && token.includes("/")) return { file: token };
	}
	return null;
}

function dedupe(claims: Claim[]): Claim[] {
	const seen = new Set<string>();
	const out: Claim[] = [];
	for (const claim of claims) {
		const key = `${claim.kind}\0${claim.file ?? ""}\0${claim.text}`;
		if (seen.has(key)) continue;
		seen.add(key);
		out.push(claim);
	}
	return out;
}

/**
 * Prose that would read identically for any codebase.
 *
 * The thesis treats padding as a defect on equal footing with error, so it gets
 * a deterministic detector rather than only a model's opinion. Deliberately
 * conservative: it looks for stock phrasing, not for writing it merely dislikes.
 */
const PADDING_PHRASES = [
	"provides functionality for",
	"is responsible for handling",
	"plays a crucial role",
	"plays a key role",
	"it is important to note that",
	"in today's fast-paced",
	"robust and scalable",
	"seamlessly integrates",
	"powerful and flexible",
	"a wide range of",
	"various different",
	"leverages the power of",
	"under the hood, this",
	"at its core, this module is",
	"this section will discuss",
	"as mentioned previously",
	"in conclusion",
];

export function findPadding(body: string): { phrase: string; line: number }[] {
	const out: { phrase: string; line: number }[] = [];
	const lines = body.split(/\r?\n/);

	for (let i = 0; i < lines.length; i++) {
		const lowered = (lines[i] as string).toLowerCase();
		for (const phrase of PADDING_PHRASES) {
			if (lowered.includes(phrase)) out.push({ phrase, line: i + 1 });
		}
	}
	return out;
}
