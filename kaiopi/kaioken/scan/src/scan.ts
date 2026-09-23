import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import type { Dirent } from "node:fs";
import { open, readdir, realpath, stat } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { detectHighEntropyStrings } from "./entropy.ts";
import { DEFAULT_IGNORES, IgnoreStack, readIgnoreFiles } from "./ignore.ts";
import { detectLanguage } from "./language.ts";
import { BufferPool, defaultBufferPool } from "./pool.ts";
import {
	classifyRisk,
	extractSecretFindings,
	hasCredentialContent,
	hasPrivateKeyContent,
	isBinary,
} from "./risk.ts";
import { SlidingWindowAnalyzer } from "./sliding-window.ts";
import type { FileRecord, Risk, ScanOptions, ScanProgress, ScanResult } from "./types.ts";
import type { SecretFinding } from "./quarantine.ts";

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
	const checkEntropy = options.checkEntropy ?? false;
	const entropyThreshold = options.entropyThreshold;
	const signal = options.signal;

	const rootPatterns = [...DEFAULT_IGNORES, ...(options.ignore ?? [])];
	let stack = IgnoreStack.fromPatterns(rootPatterns, { ignoreCase });
	if (!options.noIgnoreFiles) {
		const rootIgnores = readIgnoreFiles(absRoot);
		if (rootIgnores.length > 0) stack = stack.withLayer("", rootIgnores);
	}

	const files: FileRecord[] = [];
	const secretFindings: SecretFinding[] = [];
	const circularPaths: string[] = [];
	const seenDirs = new Set<string>();
	const activeAncestors = new Set<string>();

	let scannedFilesCount = 0;
	let scannedBytesCount = 0;
	let risksCount = 0;
	const startTime = Date.now();
	let lastProgressEmit = 0;

	const reportProgress = (currentFile: string, force = false) => {
		if (!options.onProgress) return;
		const now = Date.now();
		if (!force && now - lastProgressEmit < 50) return;
		lastProgressEmit = now;

		const elapsedMs = Math.max(1, now - startTime);
		const throughputFilesPerSec = Number(((scannedFilesCount / elapsedMs) * 1000).toFixed(1));
		const throughputBytesPerSec = Number(((scannedBytesCount / elapsedMs) * 1000).toFixed(0));

		options.onProgress({
			scannedFiles: scannedFilesCount,
			scannedBytes: scannedBytesCount,
			currentFile,
			throughputFilesPerSec,
			throughputBytesPerSec,
			elapsedMs,
			risksFound: risksCount,
		});
	};

	await walk(absRoot, "", stack);

	// Final progress update
	reportProgress("", true);

	files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

	return {
		root: absRoot,
		scannedAt: new Date().toISOString(),
		fileCount: files.length,
		totalBytes: files.reduce((sum, f) => sum + f.size, 0),
		files,
		secretFindings: secretFindings.length > 0 ? secretFindings : undefined,
		circularPaths: circularPaths.length > 0 ? circularPaths : undefined,
	};

	async function walk(absDir: string, relDir: string, inherited: IgnoreStack): Promise<void> {
		if (signal?.aborted) return;

		const realKey = ignoreCase ? absDir.toLowerCase() : absDir;
		if (seenDirs.has(realKey)) {
			if (activeAncestors.has(realKey)) {
				// Circular symlink loop or junction cycle detected
				circularPaths.push(relDir || absDir);
			}
			return;
		}
		seenDirs.add(realKey);
		activeAncestors.add(realKey);

		let stack = inherited;
		if (!options.noIgnoreFiles && relDir !== "") {
			const patterns = readIgnoreFiles(absDir);
			if (patterns.length > 0) stack = stack.withLayer(relDir, patterns);
		}

		let entries: Dirent[];
		try {
			entries = await readdir(absDir, { withFileTypes: true });
		} catch {
			activeAncestors.delete(realKey);
			return;
		}

		try {
			for (const entry of entries) {
				if (signal?.aborted) break;

				const relPath = relDir === "" ? entry.name : `${relDir}/${entry.name}`;
				const absPath = join(absDir, entry.name);

				let isDir = entry.isDirectory();
				let isFile = entry.isFile();

				if (entry.isSymbolicLink()) {
					if (!options.followSymlinks) continue;
					try {
						const resolvedTarget = await realpath(absPath);
						const targetKey = ignoreCase ? resolvedTarget.toLowerCase() : resolvedTarget;
						if (activeAncestors.has(targetKey)) {
							// Circular symlink loop
							circularPaths.push(relPath);
							continue;
						}
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

				reportProgress(relPath);

				const record = await readFile(absPath, relPath);
				if (record) {
					files.push(record);
					scannedFilesCount++;
					scannedBytesCount += record.size;
					if (record.risk.length > 0) {
						risksCount += record.risk.length;
					}
				}
			}
		} finally {
			activeAncestors.delete(realKey);
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

			const risks = classifyRisk({
				path: relPath,
				size,
				binary,
				text,
				largeBinaryBytes,
				checkEntropy,
				entropyThreshold,
			});

			// Extract structured secret findings
			if (!binary && text) {
				const findings = extractSecretFindings(relPath, text);
				if (findings.length > 0) {
					secretFindings.push(...findings);
				}
			}

			const entropyFindings =
				checkEntropy && !binary && text
					? detectHighEntropyStrings(text, { minEntropy: entropyThreshold })
					: undefined;

			return {
				path: relPath,
				hash,
				size,
				language,
				binary,
				risk: risks,
				entropyFindings: entropyFindings && entropyFindings.length > 0 ? entropyFindings : undefined,
			};
		}

		// Too large to hold in memory whole: read detection window using buffer pool
		let windowBuf: Buffer;
		let windowLength = 0;
		const slab = defaultBufferPool.acquire();
		try {
			const handle = await open(absPath, "r");
			try {
				const { bytesRead } = await handle.read(slab, 0, Math.min(slab.length, DETECTION_WINDOW), 0);
				windowLength = bytesRead;
				windowBuf = Buffer.from(slab.subarray(0, bytesRead));
			} finally {
				await handle.close();
			}
		} catch {
			defaultBufferPool.release(slab);
			return null;
		} finally {
			defaultBufferPool.release(slab);
		}

		const binary = isBinary(windowBuf);
		const language = detectLanguage(relPath, binary ? null : windowBuf);
		const text = binary ? "" : windowBuf.toString("utf8");
		const risks = new Set<Risk>(
			classifyRisk({
				path: relPath,
				size,
				binary,
				text,
				largeBinaryBytes,
				checkEntropy,
				entropyThreshold,
			}),
		);

		let hash: string;
		try {
			const stream = createReadStream(absPath);
			const analyzer = new SlidingWindowAnalyzer({
				maxScanBytes: binary ? 0 : maxSecretScanBytes,
				overlapBytes: 4096,
			});

			const streamResult = await new Promise<{
				hash: string;
				hasCredentials: boolean;
				hasPrivateKey: boolean;
			}>((resolvePromise, rejectPromise) => {
				stream.on("data", (chunk: Buffer | string) => {
					try {
						analyzer.feed(chunk);
					} catch (e) {
						rejectPromise(e);
					}
				});
				stream.on("error", rejectPromise);
				stream.on("end", () => {
					const res = analyzer.finish();
					resolvePromise({
						hash: res.hash,
						hasCredentials: res.hasCredentials,
						hasPrivateKey: res.hasPrivateKey,
					});
				});
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

/** Normalise a native path to the repo-relative POSIX form used in artifacts. */
export function toPosix(path: string): string {
	return sep === "/" ? path : path.split(sep).join("/");
}
