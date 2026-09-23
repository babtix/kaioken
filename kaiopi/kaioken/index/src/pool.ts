import { availableParallelism } from "node:os";
import { Language, Parser } from "web-tree-sitter";

export interface ParserPoolOptions {
	maxSize?: number;
	maxIdleMs?: number;
	recycleLimit?: number;
}

export interface PoolStats {
	language: string;
	activeCount: number;
	idleCount: number;
	totalCreated: number;
	totalRecycled: number;
	totalAcquired: number;
	totalReleased: number;
	totalEvicted: number;
}

interface PooledItem {
	parser: Parser;
	lastUsed: number;
	useCount: number;
}

const DEFAULT_MAX_POOL_SIZE =
	typeof availableParallelism === "function" ? availableParallelism() : 4;
const DEFAULT_MAX_IDLE_MS = 60_000;
const DEFAULT_RECYCLE_LIMIT = 500;

export class LanguageParserPool {
	private readonly available: PooledItem[] = [];
	private inUse = 0;
	private readonly waiting: Array<(item: PooledItem) => void> = [];
	private readonly language: Language;
	public readonly languageName: string;
	private readonly maxSize: number;
	private readonly maxIdleMs: number;
	private readonly recycleLimit: number;

	private created = 0;
	private recycled = 0;
	private acquired = 0;
	private released = 0;
	private evicted = 0;

	constructor(
		language: Language,
		languageName: string,
		options: ParserPoolOptions | number = {},
	) {
		const opts: ParserPoolOptions =
			typeof options === "number" ? { maxSize: options } : options;
		this.language = language;
		this.languageName = languageName;
		this.maxSize = opts.maxSize ?? DEFAULT_MAX_POOL_SIZE;
		this.maxIdleMs = opts.maxIdleMs ?? DEFAULT_MAX_IDLE_MS;
		this.recycleLimit = opts.recycleLimit ?? DEFAULT_RECYCLE_LIMIT;
	}

	async acquire(): Promise<Parser> {
		this.acquired++;
		if (this.available.length > 0) {
			const item = this.available.pop()!;
			this.inUse++;
			item.lastUsed = Date.now();
			item.useCount++;
			return item.parser;
		}

		if (this.inUse < this.maxSize) {
			const parser = new Parser();
			parser.setLanguage(this.language);
			this.created++;
			this.inUse++;
			const item: PooledItem = {
				parser,
				lastUsed: Date.now(),
				useCount: 1,
			};
			return item.parser;
		}

		return new Promise<Parser>((resolve) => {
			this.waiting.push((item) => {
				this.inUse++;
				item.lastUsed = Date.now();
				item.useCount++;
				resolve(item.parser);
			});
		});
	}

	release(parser: Parser): void {
		this.released++;
		let shouldRetire = false;

		try {
			parser.reset();
		} catch {
			shouldRetire = true;
		}

		let itemUseCount = 1;
		if (shouldRetire) {
			try {
				parser.delete();
			} catch {}
			this.evicted++;
			this.inUse--;
			return;
		}

		this.inUse--;
		this.recycled++;

		const item: PooledItem = {
			parser,
			lastUsed: Date.now(),
			useCount: itemUseCount,
		};

		const next = this.waiting.shift();
		if (next) {
			next(item);
		} else {
			this.available.push(item);
		}
	}

	pruneIdle(maxIdleMs?: number): number {
		const threshold = Date.now() - (maxIdleMs ?? this.maxIdleMs);
		const retained: PooledItem[] = [];
		let pruned = 0;

		for (const item of this.available) {
			if (item.lastUsed < threshold) {
				try {
					item.parser.delete();
				} catch {}
				pruned++;
				this.evicted++;
			} else {
				retained.push(item);
			}
		}

		this.available.length = 0;
		this.available.push(...retained);
		return pruned;
	}

	clear(): void {
		for (const item of this.available) {
			try {
				item.parser.delete();
			} catch {}
			this.evicted++;
		}
		this.available.length = 0;
	}

	get availableCount(): number {
		return this.available.length;
	}

	get inUseCount(): number {
		return this.inUse;
	}

	get stats(): PoolStats {
		return {
			language: this.languageName,
			activeCount: this.inUse,
			idleCount: this.available.length,
			totalCreated: this.created,
			totalRecycled: this.recycled,
			totalAcquired: this.acquired,
			totalReleased: this.released,
			totalEvicted: this.evicted,
		};
	}
}

const parserPools = new Map<string, LanguageParserPool>();

export function getParserPool(
	languageName: string,
	language: Language,
	options?: ParserPoolOptions | number,
): LanguageParserPool {
	const opts: ParserPoolOptions =
		typeof options === "number" ? { maxSize: options } : (options ?? {});
	let pool = parserPools.get(languageName);
	if (!pool) {
		pool = new LanguageParserPool(language, languageName, opts);
		parserPools.set(languageName, pool);
	}
	return pool;
}

export async function withParser<T>(
	languageName: string,
	language: Language,
	fn: (parser: Parser) => Promise<T> | T,
	options?: ParserPoolOptions | number,
): Promise<T> {
	const pool = getParserPool(languageName, language, options);
	const parser = await pool.acquire();
	try {
		return await fn(parser);
	} finally {
		pool.release(parser);
	}
}

export function clearParserPools(): void {
	for (const pool of parserPools.values()) {
		pool.clear();
	}
	parserPools.clear();
}

export function getAllPoolStats(): Record<string, PoolStats> {
	const result: Record<string, PoolStats> = {};
	for (const [lang, pool] of parserPools.entries()) {
		result[lang] = pool.stats;
	}
	return result;
}

export function pruneAllIdleParsers(maxIdleMs?: number): number {
	let totalPruned = 0;
	for (const pool of parserPools.values()) {
		totalPruned += pool.pruneIdle(maxIdleMs);
	}
	return totalPruned;
}
