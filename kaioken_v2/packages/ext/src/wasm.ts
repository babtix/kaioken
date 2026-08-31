import { Worker } from "node:worker_threads";
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
 *
 * The module runs in a worker thread, because a wasm call is synchronous and
 * cannot be interrupted from the thread that made it — the loop the module
 * never exits would otherwise be this process's loop. A budget that expires
 * terminates the worker: the caller gets its error, and the hung module gets
 * a thread that no longer exists.
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
 * The worker, as source rather than a compiled file.
 *
 * Everything about the ABI — instantiate, the log import, the packed-result
 * unpack — lives inside this string, and the only values that cross the
 * boundary are the input, the log lines and the answer. `eval` keeps the
 * build graph flat: a second entry file would need its own tsconfig project,
 * and a build order that quietly made every package depend on this one.
 */
const WORKER_SOURCE = `
const { parentPort, workerData } = require("node:worker_threads");
const { readFile } = require("node:fs/promises");
const MAX_RESULT_BYTES = ${MAX_RESULT_BYTES};

let exports = null;
const readString = (ptr, len) => {
	if (!exports || ptr < 0 || len < 0) return "";
	const memory = new Uint8Array(exports.memory.buffer);
	const end = Math.min(ptr + Math.min(len, MAX_RESULT_BYTES), memory.length);
	return new TextDecoder().decode(new Uint8Array(exports.memory.buffer, ptr, Math.max(0, end - ptr)));
};

(async () => {
	const bytes = await readFile(workerData.modulePath);
	const instance = await WebAssembly.instantiate(bytes, {
		env: {
			log(ptr, len) {
				parentPort.postMessage({ type: "log", line: readString(ptr, len) });
			},
		},
	});
	exports = instance.instance.exports;
	if (
		typeof exports.run !== "function" ||
		!exports.memory ||
		!(exports.memory.buffer instanceof ArrayBuffer)
	) {
		throw new Error("its wasm module exports no run(ptr, len) and memory");
	}

	const payload = new TextEncoder().encode(
		JSON.stringify({ command: workerData.command, input: workerData.input }),
	);
	const ptr = typeof exports.alloc === "function" ? exports.alloc(payload.length) : 0;
	const memory = new Uint8Array(exports.memory.buffer);
	if (ptr + payload.length > memory.length) {
		throw new Error("the wasm module's memory is too small for the input");
	}
	memory.set(payload, ptr);

	const started = Date.now();
	const packed = exports.run(ptr, payload.length);
	const elapsedMs = Date.now() - started;

	let output;
	if (typeof packed === "bigint") {
		output = readString(Number(packed >> 32n), Number(packed & 0xffffffffn));
	} else {
		// A 32-bit module returns a pointer to a NUL-terminated string instead:
		// there is nowhere in an i32 to put both halves.
		let end = packed;
		while (end < memory.length && memory[end] !== 0 && end - packed < MAX_RESULT_BYTES) end++;
		output = readString(packed, end - packed);
	}
	parentPort.postMessage({ type: "done", output, elapsedMs });
})().catch((error) => {
	parentPort.postMessage({
		type: "error",
		message: error instanceof Error ? error.message : String(error),
	});
});
`;

export async function runWasmCommand(entry: Installed, options: WasmRunOptions): Promise<WasmResult> {
	if (entry.manifest.type !== "wasm" || !entry.manifest.wasm) {
		throw new Error(`extension ${entry.id} is not a wasm extension`);
	}
	// The manifest was validated at install time, but the join is checked again
	// here: the lockfile is a file on disk and a hand-edited entry is untrusted
	// input like any other.
	const modulePath = safeJoin(entry.dir, entry.manifest.wasm.entry);
	const timeout = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

	const logs: string[] = [];
	return new Promise<WasmResult>((settle) => {
		const worker = new Worker(WORKER_SOURCE, {
			eval: true,
			workerData: { modulePath, command: options.command, input: options.input ?? "" },
		});

		let settled = false;
		let timer: NodeJS.Timeout;
		const finish = (settlement: () => void): void => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			// A settled worker is terminated even on success: it has delivered
			// its answer and holds nothing the caller needs.
			void worker.terminate();
			settlement();
		};

		timer = setTimeout(() => {
			finish(() =>
				settle(
					Promise.reject(
						new Error(`extension ${entry.id} ran past its ${timeout}ms budget and was terminated`),
					),
				),
			);
		}, timeout);

		worker.on("message", (message: { type: string; line?: string; output?: string; elapsedMs?: number; message?: string }) => {
			if (message.type === "log" && typeof message.line === "string") {
				logs.push(message.line);
				options.onLog?.(message.line);
				return;
			}
			if (message.type === "error") {
				finish(() =>
					settle(Promise.reject(new Error(`extension ${entry.id}: ${message.message ?? "the module failed"}`))),
				);
				return;
			}
			if (message.type === "done") {
				finish(() =>
					settle({
						output: String(message.output ?? ""),
						logs,
						elapsedMs: Number(message.elapsedMs ?? 0),
					}),
				);
			}
		});
		worker.on("error", (error: Error) => {
			finish(() => settle(Promise.reject(error)));
		});
		worker.on("exit", (code: number) => {
			// An exit without a settlement means the worker died mid-run.
			finish(() =>
				settle(
					Promise.reject(
						new Error(`extension ${entry.id}: its worker exited (code ${code}) before returning`),
					),
				),
			);
		});
	});
}
