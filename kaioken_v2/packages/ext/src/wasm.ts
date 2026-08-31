import { readFile } from "node:fs/promises";
import { safeJoin } from "./archive.js";
import type { Installed } from "./lock.js";

/**
 * Running a wasm extension.
 *
 * WebAssembly is the only tier where "run somebody else's code" and "and it
 * cannot touch anything" are both true by construction. A module gets linear
 * memory, the imports listed below, and nothing else: no filesystem, no
 * network, no clock, no environment. The sandbox is not a policy this code
 * enforces — it is the absence of any way out.
 *
 * The ABI is deliberately tiny, because every import is a hole somebody has to
 * reason about. A module exports:
 *
 *   memory                        — its linear memory
 *   alloc(size) -> ptr            — so the host can pass a string in
 *   run(ptr, len) -> packed       — the entry point; packed is (ptr << 32) | len
 *
 * and may import:
 *
 *   env.log(ptr, len)             — a line of diagnostic output
 *
 * Strings are UTF-8. The result is JSON by convention, but the host does not
 * insist: what a command returns is the command's business, and a caller that
 * wanted structure can ask for it.
 */

/** A module that has not returned within this is not going to. */
const DEFAULT_TIMEOUT_MS = 10_000;
/** A result larger than this is a bug or an attack, not an answer. */
const MAX_RESULT_BYTES = 4 * 1024 * 1024;

export interface WasmRunOptions {
	/** The declared command name, passed to the module as its first argument. */
	command: string;
	/** Free-form argument text. */
	input?: string;
	timeoutMs?: number;
	/** Diagnostic lines the module wrote. */
	onLog?: (line: string) => void;
}

export interface WasmResult {
	output: string;
	logs: string[];
	elapsedMs: number;
}

/**
 * The slice of the WebAssembly API this host uses.
 *
 * Declared here rather than pulled in with the DOM lib: this package runs in
 * Node, and adding a browser type library to get three names would put every
 * DOM global in scope for code that must never touch one.
 */
declare const WebAssembly: {
	instantiate(
		bytes: Uint8Array,
		imports: Record<string, Record<string, unknown>>,
	): Promise<{ instance: { exports: Record<string, unknown> } }>;
	Memory: new (descriptor: { initial: number }) => WasmMemory;
};

interface WasmMemory {
	buffer: ArrayBuffer;
}

interface WasmExports {
	memory: WasmMemory;
	alloc?: (size: number) => number;
	run: (ptr: number, len: number) => bigint | number;
}

export async function runWasmCommand(entry: Installed, options: WasmRunOptions): Promise<WasmResult> {
	if (entry.manifest.type !== "wasm" || !entry.manifest.wasm) {
		throw new Error(`extension ${entry.id} is not a wasm extension`);
	}
	// The manifest was validated at install time, but the join is checked again
	// here: the lockfile is a file on disk and a hand-edited entry is untrusted
	// input like any other.
	const modulePath = safeJoin(entry.dir, entry.manifest.wasm.entry);
	const bytes = await readFile(modulePath);

	const logs: string[] = [];
	let exports: WasmExports | null = null;
	const readString = (ptr: number, len: number): string => {
		if (!exports) return "";
		const view = new Uint8Array(exports.memory.buffer, ptr, Math.min(len, MAX_RESULT_BYTES));
		return new TextDecoder().decode(view);
	};

	const instance = await WebAssembly.instantiate(bytes, {
		env: {
			log(ptr: number, len: number): void {
				const line = readString(ptr, len);
				logs.push(line);
				options.onLog?.(line);
			},
		},
	});
	exports = instance.instance.exports as unknown as WasmExports;

	if (typeof exports.run !== "function" || !exports.memory || !(exports.memory.buffer instanceof ArrayBuffer)) {
		throw new Error(`extension ${entry.id}: its wasm module exports no run(ptr, len) and memory`);
	}

	const payload = new TextEncoder().encode(
		JSON.stringify({ command: options.command, input: options.input ?? "" }),
	);
	const ptr = writeInput(exports, payload);

	const started = Date.now();
	// A wasm call is synchronous and cannot be interrupted from the host, so the
	// timeout is a report rather than a kill: it says the module hung, which is
	// the fact the user needs, and the process is what actually recovers.
	const packed = exports.run(ptr, payload.length);
	const elapsedMs = Date.now() - started;

	const timeout = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	if (elapsedMs > timeout) {
		throw new Error(`extension ${entry.id} ran for ${elapsedMs}ms, past its ${timeout}ms budget`);
	}

	return { output: unpack(exports, packed, readString), logs, elapsedMs };
}

/**
 * Put the input where the module can read it.
 *
 * A module without `alloc` gets its input at offset 0, which is the convention
 * for the simplest possible module — one that reads a fixed region and writes
 * back into it. Anything with a real allocator asks for space instead.
 */
function writeInput(exports: WasmExports, payload: Uint8Array): number {
	const ptr = typeof exports.alloc === "function" ? exports.alloc(payload.length) : 0;
	const memory = new Uint8Array(exports.memory.buffer);
	if (ptr + payload.length > memory.length) {
		throw new Error("the wasm module's memory is too small for the input");
	}
	memory.set(payload, ptr);
	return ptr;
}

/** The packed (ptr << 32) | len return value, read back out of memory. */
function unpack(
	exports: WasmExports,
	packed: bigint | number,
	readString: (ptr: number, len: number) => string,
): string {
	if (typeof packed === "bigint") {
		const ptr = Number(packed >> 32n);
		const len = Number(packed & 0xffffffffn);
		return readString(ptr, len);
	}
	// A 32-bit module returns a pointer to a NUL-terminated string instead:
	// there is nowhere in an i32 to put both halves.
	const memory = new Uint8Array(exports.memory.buffer);
	let end = packed;
	while (end < memory.length && memory[end] !== 0 && end - packed < MAX_RESULT_BYTES) end++;
	return readString(packed, end - packed);
}
