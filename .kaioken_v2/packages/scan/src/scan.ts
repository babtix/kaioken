import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import type { Dirent } from "node:fs";
import { open, readdir, stat } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { DEFAULT_IGNORES, IgnoreStack, readIgnoreFiles } from "./ignore.js";
import { detectLanguage } from "./language.js";
import { classifyRisk, isBinary } from "./risk.js";
import type { FileRecord, ScanOptions, ScanResult } from "./types.js";

/** Bytes read for language, binary and risk detection when a file is not read whole. */
const DETECTION_WINDOW = 64 * 1024;

const DEFAULT_MAX_READ_BYTES = 4 * 1024 * 1024;
const DEFAULT_LARGE_BINARY_BYTES = 1024 * 1024;

/**
 * One traversal of the working tree. Everything the pipeline knows about the
 * file set originates here, which is why risk flagging is folded in rather than
 * given its own pass — the bytes are only paid for once.
 */
export async function scan(root: string, options: ScanOptions = {}): Promise<ScanResult> {
	const absRoot = resolve(root);
	const maxReadBytes = options.maxReadBytes ?? DEFAULT_MAX_READ_BYTES;
	const largeBinaryBytes = options.largeBinaryBytes ?? DEFAULT_LARGE_BINARY_BYTES;

	const rootPatterns = [...DEFAULT_IGNORES, ...(options.ignore ?? [])];
	let stack = IgnoreStack.fromPatterns(rootPatterns);
	if (!options.noIgnoreFiles) {
		const rootIgnores = readIgnoreFiles(absRoot);
		if (rootIgnores.length > 0) stack = stack.withLayer("", rootIgnores);
	}

	const files: FileRecord[] = [];
	const seenDirs = new Set<string>();

	await walk(absRoot, "", stack);

	files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

	return {
		root: absRoot,
		scannedAt: new Date().toISOString(),
		fileCount: files.length,
		totalBytes: files.reduce((sum, f) => sum + f.size, 0),
		files,
	};

	async function walk(absDir: string, relDir: string, inherited: IgnoreStack): Promise<void> {
		// Guard against symlink cycles even when following is off, since a
		// hardlinked or junctioned directory can still reappear.
		const realKey = absDir.toLowerCase();
		if (seenDirs.has(realKey)) return;
		seenDirs.add(realKey);

		let stack = inherited;
		if (!options.noIgnoreFiles && relDir !== "") {
			const patterns = readIgnoreFiles(absDir);
			if (patterns.length > 0) stack = stack.withLayer(relDir, patterns);
		}

		let entries: Dirent[];
		try {
			entries = await readdir(absDir, { withFileTypes: true });
		} catch {
			// An unreadable directory is reported by omission rather than by
			// aborting the scan — a partial inventory beats none.
			return;
		}

		for (const entry of entries) {
			const relPath = relDir === "" ? entry.name : `${relDir}/${entry.name}`;
			const absPath = join(absDir, entry.name);

			let isDir = entry.isDirectory();
			let isFile = entry.isFile();

			if (entry.isSymbolicLink()) {
				if (!options.followSymlinks) continue;
				try {
					const st = await stat(absPath);
					isDir = st.isDirectory();
					isFile = st.isFile();
				} catch {
					continue;
				}
			}

			if (isDir) {
				if (stack.ignores(`${relPath}/`)) continue;
				await walk(absPath, relPath, stack);
				continue;
			}

			if (!isFile) continue;
			if (stack.ignores(relPath)) continue;

			const record = await readFile(absPath, relPath);
			if (record) files.push(record);
		}
	}

	async function readFile(absPath: string, relPath: string): Promise<FileRecord | null> {
		let size: number;
		try {
			const st = await stat(absPath);
			size = st.size;
		} catch {
			return null;
		}

		const readWhole = size <= maxReadBytes;
		let head: Buffer;
		let hash: string;

		if (readWhole) {
			let handle: Awaited<ReturnType<typeof open>>;
			try {
				handle = await open(absPath, "r");
			} catch {
				return null;
			}
			try {
				const buf = await handle.readFile();
				head = buf;
				hash = createHash("sha256").update(buf).digest("hex");
			} catch {
				return null;
			} finally {
				await handle.close();
			}
		} else {
			// Too large to hold: stream the hash, read only the detection window.
			try {
				head = await readHead(absPath, DETECTION_WINDOW);
				hash = await hashStream(absPath);
			} catch {
				return null;
			}
		}

		const window = head.subarray(0, DETECTION_WINDOW);
		const binary = isBinary(window);
		const language = detectLanguage(relPath, binary ? null : window);
		const text = binary ? "" : head.toString("utf8");

		return {
			path: relPath,
			hash,
			size,
			language,
			binary,
			risk: classifyRisk({ path: relPath, size, binary, text, largeBinaryBytes }),
		};
	}
}

async function readHead(absPath: string, bytes: number): Promise<Buffer> {
	const handle = await open(absPath, "r");
	try {
		const buf = Buffer.alloc(bytes);
		const { bytesRead } = await handle.read(buf, 0, bytes, 0);
		return buf.subarray(0, bytesRead);
	} finally {
		await handle.close();
	}
}

function hashStream(absPath: string): Promise<string> {
	return new Promise((resolvePromise, rejectPromise) => {
		const hash = createHash("sha256");
		const stream = createReadStream(absPath);
		stream.on("data", (chunk) => hash.update(chunk));
		stream.on("error", rejectPromise);
		stream.on("end", () => resolvePromise(hash.digest("hex")));
	});
}

/** Normalise a native path to the repo-relative POSIX form used in artifacts. */
export function toPosix(path: string): string {
	return sep === "/" ? path : path.split(sep).join("/");
}
