import { createHash } from "node:crypto";
import { StringDecoder } from "node:string_decoder";
import { hasCredentialContent, hasPrivateKeyContent } from "./risk.ts";

export interface BoundaryFinding {
	kind: "credentials" | "private_key" | "high_entropy";
	line: number;
	offset: number;
	matchText: string;
}

export interface SlidingWindowOptions {
	/** Overlap size in bytes between adjacent chunks. Defaults to 4096. */
	overlapBytes?: number;
	/** Maximum secret scan bytes to inspect before stopping content scan. Defaults to 16MB. */
	maxScanBytes?: number;
	/** Custom patterns to search within sliding windows. */
	customPatterns?: Array<{ kind: "credentials" | "private_key" | "high_entropy"; pattern: RegExp }>;
}

export interface SlidingWindowResult {
	hash: string;
	totalBytes: number;
	hasCredentials: boolean;
	hasPrivateKey: boolean;
	findings: BoundaryFinding[];
}

/**
 * Sliding window stream analyzer that eliminates false negatives caused by
 * secrets or certificates straddling chunk boundaries.
 */
export class SlidingWindowAnalyzer {
	private readonly overlapBytes: number;
	private readonly maxScanBytes: number;
	private readonly decoder = new StringDecoder("utf8");
	private readonly hasher = createHash("sha256");
	private readonly customPatterns: Array<{
		kind: "credentials" | "private_key" | "high_entropy";
		pattern: RegExp;
	}>;

	private scannedBytes = 0;
	private totalBytes = 0;
	private currentLine = 1;
	private overlapText = "";
	private seenOffsets = new Set<string>();

	public hasCredentials = false;
	public hasPrivateKey = false;
	public readonly findings: BoundaryFinding[] = [];

	constructor(options: SlidingWindowOptions = {}) {
		this.overlapBytes = options.overlapBytes ?? 4096;
		this.maxScanBytes = options.maxScanBytes ?? 16 * 1024 * 1024;
		this.customPatterns = options.customPatterns ?? [];
	}

	/**
	 * Feed a data chunk from the file stream.
	 */
	feed(chunk: Buffer | string): void {
		const buf = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
		this.hasher.update(buf);
		this.totalBytes += buf.length;

		if (this.scannedBytes >= this.maxScanBytes) {
			return;
		}

		this.scannedBytes += buf.length;
		const text = typeof chunk === "string" ? chunk : this.decoder.write(chunk);
		const fullWindow = this.overlapText + text;

		this.scanWindow(fullWindow);

		// Retain overlap tail for next chunk
		if (fullWindow.length > this.overlapBytes) {
			this.overlapText = fullWindow.slice(-this.overlapBytes);
		} else {
			this.overlapText = fullWindow;
		}
	}

	/**
	 * Complete analysis at stream EOF and flush any remaining tail buffer.
	 */
	finish(): SlidingWindowResult {
		const remaining = this.decoder.end();
		if (remaining) {
			const finalWindow = this.overlapText + remaining;
			this.scanWindow(finalWindow);
		}

		return {
			hash: this.hasher.digest("hex"),
			totalBytes: this.totalBytes,
			hasCredentials: this.hasCredentials,
			hasPrivateKey: this.hasPrivateKey,
			findings: this.findings,
		};
	}

	private scanWindow(windowText: string): void {
		if (!this.hasPrivateKey && hasPrivateKeyContent(windowText)) {
			this.hasPrivateKey = true;
			this.recordFinding("private_key", windowText);
		}

		if (!this.hasCredentials && hasCredentialContent(windowText)) {
			this.hasCredentials = true;
			this.recordFinding("credentials", windowText);
		}

		for (const { kind, pattern } of this.customPatterns) {
			pattern.lastIndex = 0;
			let m: RegExpExecArray | null;
			while ((m = pattern.exec(windowText)) !== null) {
				const key = `${m.index}:${m[0]}`;
				if (!this.seenOffsets.has(key)) {
					this.seenOffsets.add(key);
					const linesBefore = windowText.slice(0, m.index).split("\n").length - 1;
					this.findings.push({
						kind,
						line: this.currentLine + linesBefore,
						offset: m.index,
						matchText: m[0],
					});
				}
			}
		}
	}

	private recordFinding(kind: "credentials" | "private_key", windowText: string): void {
		const key = `${kind}:${this.currentLine}`;
		if (!this.seenOffsets.has(key)) {
			this.seenOffsets.add(key);
			this.findings.push({
				kind,
				line: this.currentLine,
				offset: this.scannedBytes,
				matchText: `[${kind.toUpperCase()}_FOUND]`,
			});
		}
	}
}

/**
 * Convenient asynchronous wrapper for streaming analysis with sliding window.
 */
export async function analyzeStreamWithWindow(
	stream: NodeJS.ReadableStream,
	options: SlidingWindowOptions = {},
): Promise<SlidingWindowResult> {
	return new Promise((resolve, reject) => {
		const analyzer = new SlidingWindowAnalyzer(options);

		stream.on("data", (chunk: Buffer | string) => {
			try {
				analyzer.feed(chunk);
			} catch (err) {
				reject(err);
			}
		});

		stream.on("error", reject);
		stream.on("end", () => {
			try {
				resolve(analyzer.finish());
			} catch (err) {
				reject(err);
			}
		});
	});
}
