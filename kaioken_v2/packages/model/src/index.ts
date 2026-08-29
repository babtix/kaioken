/**
 * The seam between the knowledge layer and a model.
 *
 * This package never constructs a client, never reads a credential and never
 * imports a transport. The caller supplies one of these, which is what keeps
 * every stage below testable offline with a scripted double — and what makes
 * "if a stage needs an API key to be tested, it is designed wrong" enforceable
 * rather than aspirational.
 */

export interface ModelRequest {
	/** Names the stage, so a caller can route or log per stage. */
	purpose: string;
	system: string;
	prompt: string;
	/** Upper bound on the reply, derived from the multiplier. */
	maxOutputTokens?: number;
}

export interface ModelClient {
	complete(request: ModelRequest): Promise<string>;
}

/**
 * The one dial.
 *
 * Below the threshold it buys breadth — more modules, more detail per card.
 * Above it, breadth stops improving quality (you get longer output, not better
 * output), so it starts buying passes instead: self-critique, then correction
 * against the verifier's findings.
 */
export const MIN_MULTIPLIER = 1;
export const MAX_MULTIPLIER = 10;

/** Past this, more breadth stops helping and scrutiny starts. */
export const BREADTH_THRESHOLD = 5;

export interface Depth {
	multiplier: number;
	/** Rough number of leaf modules to aim for. */
	targetModules: number;
	/** Key points requested per card. */
	keyPoints: number;
	/** Declarations shown per file in a module bundle. */
	declarationsPerFile: number;
	/** Output budget per generative call. */
	maxOutputTokens: number;
	/** Extra critique-and-revise passes. Zero below the threshold. */
	refinementPasses: number;
}

export function parseMultiplier(raw: string | number | undefined): number | null {
	if (raw === undefined) return MIN_MULTIPLIER;
	const text = String(raw).trim().toLowerCase();
	const match = /^x?(\d+)$/.exec(text);
	if (!match) return null;
	const value = Number.parseInt(match[1] as string, 10);
	if (value < MIN_MULTIPLIER || value > MAX_MULTIPLIER) return null;
	return value;
}

export function depthFor(multiplier: number): Depth {
	const n = Math.min(Math.max(multiplier, MIN_MULTIPLIER), MAX_MULTIPLIER);
	const breadth = Math.min(n, BREADTH_THRESHOLD);

	return {
		multiplier: n,
		targetModules: 4 + breadth * 3,
		keyPoints: 2 + breadth,
		declarationsPerFile: 20 + breadth * 20,
		maxOutputTokens: 1500 + breadth * 900,
		// Each level past the threshold buys one more adversarial pass.
		refinementPasses: Math.max(0, n - BREADTH_THRESHOLD),
	};
}

/**
 * Pull a JSON value out of a model reply.
 *
 * Models wrap JSON in prose and fences no matter how firmly they are asked not
 * to. Treating that as a protocol error would make the pipeline fail on a reply
 * whose content is fine, so the extraction is tolerant while the validation that
 * follows it is not.
 */
export function extractJson<T>(reply: string): T {
	const candidates: string[] = [];

	const fenced = /```(?:json)?\s*\n([\s\S]*?)```/g;
	for (let match = fenced.exec(reply); match; match = fenced.exec(reply)) {
		candidates.push(match[1] as string);
	}
	candidates.push(reply);

	// Last resort: the outermost balanced object or array in the reply.
	const spans = [balancedSpan(reply, "{", "}"), balancedSpan(reply, "[", "]")];
	for (const span of spans) if (span) candidates.push(span);

	for (const candidate of candidates) {
		const trimmed = candidate.trim();
		if (!trimmed) continue;
		try {
			return JSON.parse(trimmed) as T;
		} catch {
			// Try the next candidate.
		}
	}

	throw new Error("model reply contained no parseable JSON");
}

function balancedSpan(text: string, open: string, close: string): string | null {
	const start = text.indexOf(open);
	if (start === -1) return null;

	let depth = 0;
	let inString = false;
	let escaped = false;

	for (let i = start; i < text.length; i++) {
		const ch = text[i] as string;

		if (escaped) {
			escaped = false;
			continue;
		}
		if (ch === "\\") {
			escaped = true;
			continue;
		}
		if (ch === '"') {
			inString = !inString;
			continue;
		}
		if (inString) continue;

		if (ch === open) depth++;
		else if (ch === close) {
			depth--;
			if (depth === 0) return text.slice(start, i + 1);
		}
	}
	return null;
}
