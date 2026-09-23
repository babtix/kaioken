import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import type { Dirent } from "node:fs";
import { open, readdir, stat } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { StringDecoder } from "node:string_decoder";
import { DEFAULT_IGNORES, IgnoreStack, readIgnoreFiles } from "./ignore.ts";
import { detectLanguage } from "./language.ts";
import { classifyRisk, hasCredentialContent, hasPrivateKeyContent, isBinary } from "./risk.ts";
import type { FileRecord, Risk, ScanOptions, ScanResult } from "./types.ts";

/** Bytes read for language, binary and risk detection when a file is not read whole. */
const DETECTION_WINDOW = 64 * 1024;

const DEFAULT_MAX_READ_BYTES = 4 * 1024 * 1024;
const DEFAULT_MAX_SECRET_SCAN_BYTES = 16 * 1024 * 1024;
const DEFAULT_LARGE_BINARY_BYTES = 1024 * 1024;

/**
 * One traversal of the working tree. Everything the pipeline knows about the
 * file set originates here, which is why risk flagging is folded in rather than
 * given its own pass — the bytes are only paid for once.
 */
export async function scan(root: string, options: ScanOptions = {}): Promise<ScanResult> {
	const absRoot = resolve(root);
	const maxReadBytes = options.maxReadBytes ?? DEFAULT_MAX_READ_BYTES;
	const maxSecretScanBytes = options.maxSecretScanBytes ?? DEFAULT_MAX_SECRET_SCAN_BYTES;
	const largeBinaryBytes = options.largeBinaryBytes ?? DEFAULT_LARGE_BINARY_BYTES;
	const ignoreCase = options.ignoreCase ?? (process.platform === "win32");

	const rootPatterns = [...DEFAULT_IGNORES, ...(options.ignore ?? [])];
	let stack = IgnoreStack.fromPatterns(rootPatterns, { ignoreCase });
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
		// hardlinked or junctioned directory can still reappear. Preserve case on
		// case-sensitive platforms so sibling directories like Component/ and component/
		// are not conflated.
		const realKey = ignoreCase ? absDir.toLowerCase() : absDir;
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

		if (readWhole) {
			let handle: Awaited<ReturnType<typeof open>>;
			try {
				handle = await open(absPath, "r");
			} catch {
				return null;
			}
			let head: Buffer;
			let hash: string;
			try {
				const buf = await handle.readFile();
				head = buf;
				hash = createHash("sha256").update(buf).digest("hex");
			} catch {
				return null;
			} finally {
				await handle.close();
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

		// Too large to hold in memory whole: read detection window for language/binary,
		// stream hash and scan for secrets across chunks.
		let head: Buffer;
		try {
			head = await readHead(absPath, DETECTION_WINDOW);
		} catch {
			return null;
		}

		const window = head.subarray(0, DETECTION_WINDOW);
		const binary = isBinary(window);
		const language = detectLanguage(relPath, binary ? null : window);
		const text = binary ? "" : head.toString("utf8");
		const risks = new Set<Risk>(
			classifyRisk({ path: relPath, size, binary, text, largeBinaryBytes }),
		);

		let hash: string;
		try {
			const streamResult = await streamHashAndScan(absPath, {
				scanSecrets: !binary,
				maxSecretScanBytes,
				hasCredentials: risks.has("credentials"),
				hasPrivateKey: risks.has("private_key"),
			});
			hash = streamResult.hash;
			if (streamResult.hasCredentials) risks.add("credentials");
			if (streamResult.hasPrivateKey) risks.add("private_key");
		} catch {
			return null;
		}

		return {
			path: relPath,
			hash,
			size,
			language,
			binary,
			risk: [...risks].sort(),
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

function streamHashAndScan(
	absPath: string,
	options: {
		scanSecrets: boolean;
		maxSecretScanBytes: number;
		hasCredentials: boolean;
		hasPrivateKey: boolean;
	},
): Promise<{ hash: string; hasCredentials: boolean; hasPrivateKey: boolean }> {
	return new Promise((resolvePromise, rejectPromise) => {
		const hash = createHash("sha256");
		const stream = createReadStream(absPath);
		const decoder = new StringDecoder("utf8");
		let scannedBytes = 0;
		let overlap = "";
		let hasCredentials = options.hasCredentials;
		let hasPrivateKey = options.hasPrivateKey;
		const scanSecrets = options.scanSecrets;
		const maxBytes = options.maxSecretScanBytes;

		stream.on("data", (chunk: string | Buffer) => {
			const buf = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
			hash.update(buf);

			if (scanSecrets && scannedBytes < maxBytes && (!hasCredentials || !hasPrivateKey)) {
				scannedBytes += buf.length;
				const text = typeof chunk === "string" ? chunk : decoder.write(chunk);
				const textChunk = overlap + text;
				if (!hasPrivateKey && hasPrivateKeyContent(textChunk)) {
					hasPrivateKey = true;
				}
				if (!hasCredentials && hasCredentialContent(textChunk)) {
					hasCredentials = true;
				}
				overlap = textChunk.slice(-4096);
			}
		});

		stream.on("error", rejectPromise);
		stream.on("end", () => {
			if (scanSecrets && (!hasCredentials || !hasPrivateKey)) {
				const remaining = overlap + decoder.end();
				if (!hasPrivateKey && hasPrivateKeyContent(remaining)) {
					hasPrivateKey = true;
				}
				if (!hasCredentials && hasCredentialContent(remaining)) {
					hasCredentials = true;
				}
			}
			resolvePromise({
				hash: hash.digest("hex"),
				hasCredentials,
				hasPrivateKey,
			});
		});
	});
}

/** Normalise a native path to the repo-relative POSIX form used in artifacts. */
export function toPosix(path: string): string {
	return sep === "/" ? path : path.split(sep).join("/");
}
