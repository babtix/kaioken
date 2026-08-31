import { analyze, cosine, Lexicon, rrf, topN, type Ranked } from "@kaioken/search";
import type { EmbeddingProvider } from "@kaioken/search";
import type { ModelClient } from "@kaioken/model";
import { NO_PARENT, type Chunk, type ModuleData } from "./store.js";

/**
 * Retrieval over an imported corpus, in three layers.
 *
 *   - Hybrid search. BM25 and vector similarity run over the same children and
 *     are fused with reciprocal rank fusion, so a passage that wins on either
 *     leg can still reach the answer.
 *   - Parent expansion. What matched is a child; what reaches the model is the
 *     parent it came from, so the context reads as an argument rather than a
 *     fragment.
 *   - A corrective gate. Every fused child is graded for relevance before its
 *     parent is fetched.
 *
 * The gate is the part worth having. Retrieval returns the best matches it has,
 * which is not the same as returning matches that answer the question: a query
 * whose answer is simply absent still produces a full ranked list of the
 * least-bad chunks, and a model handed those will use them. Grading first means
 * "no source found" is an answer this can actually give.
 */

export interface RetrievalResult {
	/** Parent texts in fused rank order, ready for a prompt. */
	passages: Array<{ text: string; section?: string; document: string }>;
	/**
	 * A graded, query-relevant source backs these passages.
	 *
	 * When false the caller must tell the model no source was found rather than
	 * letting it answer as though one were present.
	 */
	sourceFound: boolean;
	/**
	 * The gate ran successfully on every candidate.
	 *
	 * False means the context is unverified, however good it looks. Kept apart
	 * from `sourceFound` deliberately: one flag cannot distinguish "the corpus
	 * has no answer" from "the checking is broken", and those call for opposite
	 * responses.
	 */
	graded: boolean;
	/** Retrieval ran on a reduced pipeline — no vectors, or an empty leg. */
	degraded: boolean;
	/** What actually happened, in one line, for a caller that reports it. */
	describe: string;
}

export interface RetrieveInput {
	data: ModuleData;
	query: string;
	/** How many passages to return. */
	limit?: number;
	/** How many children to fuse before grading. */
	candidates?: number;
	embeddings?: EmbeddingProvider;
	/** The relevance gate. Without one, nothing is graded and it says so. */
	grader?: ModelClient;
}

export async function retrieve(input: RetrieveInput): Promise<RetrievalResult> {
	const limit = input.limit ?? 5;
	const candidateCount = input.candidates ?? Math.max(limit * 3, 12);

	const children = input.data.chunks.filter((chunk) => chunk.type === "child");
	if (children.length === 0) {
		return {
			passages: [],
			sourceFound: false,
			graded: true,
			degraded: false,
			describe: "the module has no documents",
		};
	}

	const lexical = rankLexical(children, input.query, candidateCount);
	const { ranked: semantic, attempted } = await rankSemantic(input, children, candidateCount);

	// One leg is not a failure; it is a reduced pipeline, and a caller that
	// reports quality needs to know the difference.
	const degraded = attempted ? semantic.length === 0 : true;
	const fused = rrf([lexical, semantic].filter((list) => list.length > 0), candidateCount);

	if (fused.length === 0) {
		return {
			passages: [],
			sourceFound: false,
			graded: true,
			degraded,
			describe: "nothing in this module matched the question",
		};
	}

	const gate = await grade(input.grader, input.query, fused, (id) => (children[id] as Chunk).text);
	const kept = fused.filter((_, i) => gate.keep[i]);

	const passages = expand(input.data, children, kept, limit);
	const sourceFound = gate.graded && kept.length > 0;

	return {
		passages,
		sourceFound,
		graded: gate.graded,
		degraded,
		describe: describe({ degraded, graded: gate.graded, kept: kept.length, fused: fused.length }),
	};
}

/** BM25 over the children, with their section headings folded in. */
function rankLexical(children: readonly Chunk[], query: string, limit: number): Ranked[] {
	const tokens = children.map((child) => analyze(child.section ? `${child.section}\n${child.text}` : child.text));
	const lexicon = new Lexicon(tokens);
	const terms = analyze(query);
	if (terms.length === 0) return [];

	const scored: Ranked[] = [];
	for (let id = 0; id < tokens.length; id++) {
		const score = lexicon.score(terms, tokens[id] as string[]);
		if (score > 0) scored.push({ id, score });
	}
	return topN(scored, limit);
}

/**
 * Vector similarity, when the corpus has vectors and a provider to embed the
 * query with.
 *
 * `attempted` separates "no embeddings were configured" from "embedding the
 * query failed": the first is a corpus built lexically on purpose, the second
 * is a degraded run.
 */
async function rankSemantic(
	input: RetrieveInput,
	children: readonly Chunk[],
	limit: number,
): Promise<{ ranked: Ranked[]; attempted: boolean }> {
	const embedded = children.some((child) => child.vec >= 0);
	if (!embedded || !input.embeddings) return { ranked: [], attempted: false };

	let queryVector: number[] | undefined;
	try {
		[queryVector] = await input.embeddings.embed([input.query]);
	} catch {
		return { ranked: [], attempted: true };
	}
	if (!queryVector || queryVector.length === 0) return { ranked: [], attempted: true };

	const scored: Ranked[] = [];
	for (let id = 0; id < children.length; id++) {
		const child = children[id] as Chunk;
		if (child.vec < 0) continue;
		const vector = input.data.vectors[child.vec];
		if (!vector) continue;
		scored.push({ id, score: cosine(queryVector, vector) });
	}
	return { ranked: topN(scored, limit), attempted: true };
}

/** How many verdicts run at once. Every candidate costs a call. */
const GRADER_CONCURRENCY = 8;
/** Children target ~600 characters, so this only limits an oversized one. */
const GRADER_MAX_CHARS = 4000;

const GRADER_SYSTEM =
	"You are a strict relevance grader. You will receive a QUESTION and a TEXT CHUNK from a " +
	"document. Your sole job is to decide whether the chunk contains information that would " +
	"help answer the question. Reply with exactly one word: 'relevant' or 'irrelevant'. Do " +
	"not add any explanation, punctuation, or other text.";

/**
 * Score each candidate, keeping the ones that could answer the question.
 *
 * A failed call keeps the chunk but counts against `graded`. A dead grader that
 * silently approved everything would be indistinguishable from one that
 * examined everything and approved it — the caller would see a full context and
 * no indication that nothing had checked it. So failure is open on the chunk
 * and closed on the claim.
 */
async function grade(
	grader: ModelClient | undefined,
	query: string,
	ranked: readonly Ranked[],
	textFor: (id: number) => string,
): Promise<{ keep: boolean[]; graded: boolean }> {
	if (ranked.length === 0) return { keep: [], graded: true };
	// No grader configured. Everything passes, and the caller is told the gate
	// never ran.
	if (!grader) return { keep: ranked.map(() => true), graded: false };

	const verdicts: Array<boolean | null> = new Array(ranked.length).fill(null);
	let next = 0;

	const worker = async (): Promise<void> => {
		while (true) {
			const i = next++;
			if (i >= ranked.length) return;
			verdicts[i] = await gradeOne(grader, query, textFor((ranked[i] as Ranked).id));
		}
	};
	await Promise.all(
		Array.from({ length: Math.min(GRADER_CONCURRENCY, ranked.length) }, () => worker()),
	);

	const keep: boolean[] = [];
	let graded = true;
	for (const verdict of verdicts) {
		if (verdict === null) {
			keep.push(true);
			graded = false;
		} else {
			keep.push(verdict);
		}
	}
	return { keep, graded };
}

/**
 * One verdict.
 *
 * Null is deliberately distinct from false: the caller keeps the chunk either
 * way, but collapsing the two would make a dead grader look like one that
 * approved everything.
 */
async function gradeOne(grader: ModelClient, query: string, chunk: string): Promise<boolean | null> {
	try {
		const reply = await grader.complete({
			system: GRADER_SYSTEM,
			prompt: `QUESTION: ${query}\n\nTEXT CHUNK:\n${chunk.slice(0, GRADER_MAX_CHARS)}`,
			purpose: "relevance gate",
			maxOutputTokens: 8,
		});
		const verdict = reply.trim().toLowerCase();
		if (verdict.startsWith("irrelevant")) return false;
		if (verdict.startsWith("relevant")) return true;
		// Asked for one of two words and said something else. Treating that as a
		// verdict would be reading tea leaves; it is a failed call.
		return null;
	} catch {
		return null;
	}
}

/**
 * Children that survived, resolved to the parents that contain them.
 *
 * Deduplicated: two children of one parent are one passage, and sending the
 * same paragraph twice spends the context window to say nothing new.
 */
function expand(
	data: ModuleData,
	children: readonly Chunk[],
	kept: readonly Ranked[],
	limit: number,
): RetrievalResult["passages"] {
	const seen = new Set<number>();
	const out: RetrievalResult["passages"] = [];

	for (const hit of kept) {
		const child = children[hit.id] as Chunk;
		const parent = child.parentIndex === NO_PARENT ? child : data.chunks[child.parentIndex] ?? child;
		if (seen.has(parent.index)) continue;
		seen.add(parent.index);
		out.push({
			text: parent.text,
			document: parent.doc,
			...(parent.section ?? child.section ? { section: parent.section ?? child.section } : {}),
		});
		if (out.length >= limit) break;
	}
	return out;
}

function describe(state: { degraded: boolean; graded: boolean; kept: number; fused: number }): string {
	const parts: string[] = [];
	parts.push(`${state.kept} of ${state.fused} candidate passages kept`);
	if (!state.graded) parts.push("ungraded — no relevance gate ran, so the context is unverified");
	if (state.degraded) parts.push("lexical only — no vector leg");
	return parts.join(" · ");
}
