import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { KAIOKEN_DIR } from "@kaioken/scan";
import { analyze } from "./analyze.js";
import { cosine, Lexicon, phraseBonus, type Ranked, rrf, topN } from "./bm25.js";
import { type Chunk, collect, type Corpus, type Doc, type Kind } from "./corpus.js";

export const SEARCH_DIR = join(KAIOKEN_DIR, "search-index");

export function searchIndexPath(root: string): string {
	return join(resolve(root), SEARCH_DIR, "index.json");
}

/** The persisted form. Tokens are recomputed on load — they would triple the file. */
interface PersistedIndex {
	version: 1;
	builtAt: string;
	fingerprint: string;
	docs: Doc[];
	chunks: Chunk[];
	/** Parallel to `chunks`. Absent unless an embedding provider ran. */
	vectors?: (number[] | null)[];
}

export interface SearchQuery {
	text: string;
	limit?: number;
	/** Restrict to one or more tenants. */
	kinds?: Kind[];
	section?: string;
}

export interface SearchHit {
	score: number;
	kind: Kind;
	path: string;
	section: string;
	title: string;
	heading: string;
	line: number;
	snippet: string;
	/** Which rankings contributed. Makes it visible when semantic ranking is off. */
	via: ("lexical" | "semantic")[];
}

/**
 * Supplied by a higher layer when one is configured. The index never constructs
 * one and never imports a client to make one — that inversion is what keeps the
 * lexical layer free of every dependency the semantic layer has.
 */
export interface EmbeddingProvider {
	embed(texts: string[]): Promise<number[][]>;
}

export class SearchIndex {
	private readonly tokens: string[][];
	private readonly lexicon: Lexicon;

	private constructor(private readonly data: PersistedIndex) {
		this.tokens = data.chunks.map((chunk) => analyze(`${chunk.heading}\n${chunk.text}`));
		this.lexicon = new Lexicon(this.tokens);
	}

	static async build(root: string, provider?: EmbeddingProvider): Promise<SearchIndex> {
		const corpus = await collect(root);
		const data: PersistedIndex = {
			version: 1,
			builtAt: new Date().toISOString(),
			fingerprint: corpus.fingerprint,
			docs: corpus.docs,
			chunks: corpus.chunks,
		};

		const index = new SearchIndex(data);
		if (provider) await index.embedAll(provider);
		return index;
	}

	/**
	 * Load from disk, rebuilding when the corpus has moved. Returning a stale
	 * index silently would make search quietly wrong, which is worse than slow.
	 */
	static async open(root: string, options: { force?: boolean } = {}): Promise<SearchIndex> {
		if (!options.force) {
			const existing = await SearchIndex.load(root);
			if (existing) {
				const current = await collect(root);
				if (current.fingerprint === existing.fingerprint) return existing;
			}
		}
		const built = await SearchIndex.build(root);
		await built.save(root);
		return built;
	}

	static async load(root: string): Promise<SearchIndex | null> {
		try {
			const data = JSON.parse(await readFile(searchIndexPath(root), "utf8")) as PersistedIndex;
			if (data.version !== 1) return null;
			return new SearchIndex(data);
		} catch {
			return null;
		}
	}

	async save(root: string): Promise<string> {
		const path = searchIndexPath(root);
		await mkdir(dirname(path), { recursive: true });
		await writeFile(path, `${JSON.stringify(this.data, null, 2)}\n`, "utf8");
		return path;
	}

	get fingerprint(): string {
		return this.data.fingerprint;
	}

	get docCount(): number {
		return this.data.docs.length;
	}

	get chunkCount(): number {
		return this.data.chunks.length;
	}

	/** True when vectors are present, so callers can report honestly what ran. */
	get semantic(): boolean {
		return (this.data.vectors ?? []).some((v) => v !== null && v !== undefined);
	}

	kinds(): Record<string, number> {
		const out: Record<string, number> = {};
		for (const doc of this.data.docs) out[doc.kind] = (out[doc.kind] ?? 0) + 1;
		return out;
	}

	/**
	 * Rank a query.
	 *
	 * Lexical ranking always runs. Semantic ranking runs only if vectors are
	 * present and the caller supplies a provider to embed the query; when either
	 * is missing the result is plain BM25 rather than an error. Degradation is
	 * silent and total by design.
	 */
	async search(query: SearchQuery, provider?: EmbeddingProvider): Promise<SearchHit[]> {
		const limit = query.limit ?? 10;
		const terms = analyze(query.text);
		if (terms.length === 0) return [];

		const candidates = this.filter(query);

		const lexical = topN(
			candidates.map((id) => ({
				id,
				score:
					this.lexicon.score(terms, this.tokens[id] as string[]) +
					phraseBonus(query.text, (this.data.chunks[id] as Chunk).text),
			})),
			// Fuse over a deeper slice than we return, so a result ranked
			// modestly by both signals can still surface.
			limit * 5,
		).filter((r) => r.score > 0);

		const semantic = await this.semanticRank(query.text, candidates, limit * 5, provider);

		if (semantic.length === 0) return this.materialize(lexical, limit, ["lexical"]);

		const fused = rrf([lexical, semantic], limit);
		const lexicalIds = new Set(lexical.map((r) => r.id));
		const semanticIds = new Set(semantic.map((r) => r.id));

		return fused.map((entry) => {
			const via: ("lexical" | "semantic")[] = [];
			if (lexicalIds.has(entry.id)) via.push("lexical");
			if (semanticIds.has(entry.id)) via.push("semantic");
			return this.hit(entry, via);
		});
	}

	private async semanticRank(
		text: string,
		candidates: number[],
		limit: number,
		provider?: EmbeddingProvider,
	): Promise<Ranked[]> {
		const vectors = this.data.vectors;
		if (!provider || !vectors) return [];

		let queryVector: number[] | undefined;
		try {
			queryVector = (await provider.embed([text]))[0];
		} catch {
			// An embedding failure mid-query is not fatal: BM25 already has an
			// answer, and returning it beats returning an error.
			return [];
		}
		if (!queryVector) return [];

		const ranked: Ranked[] = [];
		for (const id of candidates) {
			const vector = vectors[id];
			if (!vector) continue;
			ranked.push({ id, score: cosine(queryVector, vector) });
		}
		return topN(ranked, limit).filter((r) => r.score > 0);
	}

	private filter(query: SearchQuery): number[] {
		const kinds = query.kinds && query.kinds.length > 0 ? new Set(query.kinds) : null;
		const out: number[] = [];

		for (let id = 0; id < this.data.chunks.length; id++) {
			const doc = this.data.docs[(this.data.chunks[id] as Chunk).doc] as Doc;
			if (kinds && !kinds.has(doc.kind)) continue;
			if (query.section && doc.section !== query.section) continue;
			out.push(id);
		}
		return out;
	}

	private materialize(ranked: Ranked[], limit: number, via: ("lexical" | "semantic")[]): SearchHit[] {
		return ranked.slice(0, limit).map((entry) => this.hit(entry, via));
	}

	private hit(entry: Ranked, via: ("lexical" | "semantic")[]): SearchHit {
		const chunk = this.data.chunks[entry.id] as Chunk;
		const doc = this.data.docs[chunk.doc] as Doc;
		return {
			score: entry.score,
			kind: doc.kind,
			path: doc.path,
			section: doc.section,
			title: doc.title,
			heading: chunk.heading,
			line: chunk.line,
			snippet: snippet(chunk.text),
			via,
		};
	}

	private async embedAll(provider: EmbeddingProvider): Promise<void> {
		const texts = this.data.chunks.map((c) => `${c.heading}\n${c.text}`);
		try {
			this.data.vectors = await provider.embed(texts);
		} catch {
			// Leaving vectors absent degrades to lexical, which is the whole point.
			this.data.vectors = undefined as unknown as PersistedIndex["vectors"];
		}
	}
}

const SNIPPET_CHARS = 240;

function snippet(text: string): string {
	const flat = text.replace(/\s+/g, " ").trim();
	return flat.length <= SNIPPET_CHARS ? flat : `${flat.slice(0, SNIPPET_CHARS - 1)}…`;
}

export type { Corpus, Doc, Chunk, Kind };
