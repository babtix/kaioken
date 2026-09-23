/**
 * Buffer slab pool for high-throughput zero-allocation file scanning.
 * Eliminates GC pressure and heap thrashing during rapid directory traversals.
 */
export class BufferPool {
	private readonly slabSize: number;
	private readonly maxPoolSize: number;
	private readonly pool: Buffer[] = [];

	constructor(slabSize = 64 * 1024, maxPoolSize = 32) {
		this.slabSize = slabSize;
		this.maxPoolSize = maxPoolSize;
	}

	/**
	 * Acquire a buffer from the pool or allocate a new slab if empty.
	 */
	acquire(): Buffer {
		const buf = this.pool.pop();
		if (buf) {
			buf.fill(0);
			return buf;
		}
		return Buffer.alloc(this.slabSize);
	}

	/**
	 * Return a loaned buffer back to the pool if it matches slab size and pool is not full.
	 */
	release(buf: Buffer): void {
		if (buf.length === this.slabSize && this.pool.length < this.maxPoolSize) {
			this.pool.push(buf);
		}
	}

	/**
	 * Clear all pooled buffers to free memory.
	 */
	clear(): void {
		this.pool.length = 0;
	}

	/**
	 * Current number of idle slabs in pool.
	 */
	get size(): number {
		return this.pool.length;
	}

	get slabBytes(): number {
		return this.slabSize;
	}
}

export const defaultBufferPool = new BufferPool();
