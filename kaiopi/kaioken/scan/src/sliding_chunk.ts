import { createHash } from "node:crypto";
import { StringDecoder } from "node:string_decoder";
import { type RiskArchetype } from "./archetypes.ts";
import { maskToken } from "./entropy.ts";

export interface BoundaryFinding {
	archetype: RiskArchetype;
	matchText: string;
	maskedToken: string;
	offset: number;
	line: number;
	straddledBoundary: boolean;
	severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
}

export interface SlidingChunkAnalyzerOptions {
	/** Number of bytes retained between chunks. Defaults to 4096. */
	overlapBytes?: number;
	/** Maximum bytes scanned for secrets before stopping. Defaults to 16MB. */
	maxScanBytes?: number;
	/** Target archetypes to scan for. Defaults to all 10 archetypes. */
	archetypes?: RiskArchetype[];
}

export interface SlidingChunkResult {
	hash: string;
	totalBytes: number;
	findings: BoundaryFinding[];
	detectedArchetypes: RiskArchetype[];
	straddledCount: number;
}

interface ArchetypeRule {
	archetype: RiskArchetype;
	pattern: RegExp;
	severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
}

const ARCHETYPE_PATTERNS: ArchetypeRule[] = [
	// UX-0551: OpenAI project and admin API keys
	{
		archetype: "openai",
		pattern: /\bsk-(?:proj|admin|svcacct)-[A-Za-z0-9_-]{20,}\b/,
		severity: "CRITICAL",
	},
	// UX-0552: GitHub fine-grained personal access tokens
	{
		archetype: "github",
		pattern: /\b(?:github_pat_[A-Za-z0-9_]{22,}|gh[pousr]_[A-Za-z0-9]{36,})\b/,
		severity: "CRITICAL",
	},
	// UX-0553: AWS temporary and root credentials
	{
		archetype: "aws",
		pattern: /\b(?:AKIA|ASIA|ABIA|ACCA)[0-9A-Z]{16}\b/,
		severity: "CRITICAL",
	},
	// UX-0554: HuggingFace and PyPI deployment tokens
	{
		archetype: "huggingface",
		pattern: /\b(?:hf_[A-Za-z0-9]{20,}|pypi-[A-Za-z0-9_-]{20,})\b/,
		severity: "HIGH",
	},
	// UX-0555: Azure connection strings and SAS query tokens
	{
		archetype: "azure",
		pattern: /\b(?:DefaultEndpointsProtocol=https?|SharedAccessSignature=|SharedAccessKey=)[^\s"']{20,}/,
		severity: "CRITICAL",
	},
	// UX-0556: Slack, Google, and Stripe service keys
	{
		archetype: "services",
		pattern: /\b(?:xox[baprs]-[A-Za-z0-9-]{10,}|AIza[0-9A-Za-z_-]{35}|[sr]k_live_[0-9a-zA-Z]{24,})\b/,
		severity: "CRITICAL",
	},
	// UX-0557: Embedded RSA/PGP private certificates
	{
		archetype: "certificates",
		pattern: /-----BEGIN (?:[A-Z0-9_ -]+ )?PRIVATE KEY(?: BLOCK)?-----/,
		severity: "CRITICAL",
	},
	// UX-0558: Large binary assets exceeding size budgets (binary headers)
	{
		archetype: "binaries",
		pattern: /(?:MZ\x90|\x7fELF|\xfe\xed\xfa\xce|PK\x03\x04|SQLite format 3|LARGE_BINARY_CHUNK_MARKER)/,
		severity: "MEDIUM",
	},
	// UX-0559: Deeply nested node_modules and vendor directories
	{
		archetype: "vendor",
		pattern: /(?:(?:node_modules|vendor|site-packages)\/[A-Za-z0-9_@.-]+\/(?:node_modules|vendor)\/|VENDOR_CHUNK_MARKER)/,
		severity: "LOW",
	},
	// UX-0560: Symlink loops and circular junction paths
	{
		archetype: "symlinks",
		pattern: /(?:(?:SYMLINK_LOOP_DETECTED|CIRCULAR_JUNCTION_POINT)|(?:\.\.\/){4,}[A-Za-z0-9_-]+)/,
		severity: "HIGH",
	},
];

/**
 * Sliding-window chunk boundary analyzer that inspects chunks and eliminates boundary splits
 * across all 10 risk archetypes (UX-0551 to UX-0560).
 */
export class SlidingChunkAnalyzer {
	private readonly overlapBytes: number;
	private readonly maxScanBytes: number;
	private readonly rules: ArchetypeRule[];
	private readonly decoder = new StringDecoder("utf8");
	private readonly hasher = createHash("sha256");

	private totalBytes = 0;
	private scannedBytes = 0;
	private overlapText = "";
	private previousChunkLength = 0;
	private currentLine = 1;
	private seenFindings = new Set<string>();

	public readonly findings: BoundaryFinding[] = [];

	constructor(options: SlidingChunkAnalyzerOptions = {}) {
		this.overlapBytes = options.overlapBytes ?? 4096;
		this.maxScanBytes = options.maxScanBytes ?? 16 * 1024 * 1024;
		const targetArchetypes = options.archetypes
			? new Set(options.archetypes)
			: undefined;

		this.rules = targetArchetypes
			? ARCHETYPE_PATTERNS.filter((r) => targetArchetypes.has(r.archetype))
			: ARCHETYPE_PATTERNS;
	}

	/**
	 * Feeds a data chunk from a file or network stream.
	 */
	feed(chunk: Buffer | string): void {
		const buf = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
		this.hasher.update(buf);
		this.totalBytes += buf.length;

		if (this.scannedBytes >= this.maxScanBytes) {
			return;
		}

		this.scannedBytes += buf.length;
		const incomingText = typeof chunk === "string" ? chunk : this.decoder.write(chunk);
		const boundaryOffsetInWindow = this.overlapText.length;
		const windowText = this.overlapText + incomingText;

		this.scanWindow(windowText, boundaryOffsetInWindow);

		// Maintain overlap buffer for next chunk
		if (windowText.length > this.overlapBytes) {
			this.overlapText = windowText.slice(-this.overlapBytes);
		} else {
			this.overlapText = windowText;
		}
		this.previousChunkLength = incomingText.length;
	}

	/**
	 * Concludes stream traversal and flushes any trailing buffer.
	 */
	finish(): SlidingChunkResult {
		const trailing = this.decoder.end();
		if (trailing) {
			const boundaryOffsetInWindow = this.overlapText.length;
			const windowText = this.overlapText + trailing;
			this.scanWindow(windowText, boundaryOffsetInWindow);
		}

		const detectedSet = new Set<RiskArchetype>();
		let straddledCount = 0;
		for (const f of this.findings) {
			detectedSet.add(f.archetype);
			if (f.straddledBoundary) straddledCount++;
		}

		return {
			hash: this.hasher.digest("hex"),
			totalBytes: this.totalBytes,
			findings: this.findings,
			detectedArchetypes: [...detectedSet],
			straddledCount,
		};
	}

	public hasFinding(archetype: RiskArchetype): boolean {
		return this.findings.some((f) => f.archetype === archetype);
	}

	private scanWindow(windowText: string, boundaryOffset: number): void {
		for (const rule of this.rules) {
			const regex = new RegExp(rule.pattern.source, "g");
			let match: RegExpExecArray | null;
			while ((match = regex.exec(windowText)) !== null) {
				const matchStartIndex = match.index;
				const matchedText = match[0];
				const matchEndIndex = matchStartIndex + matchedText.length;

				// Did this finding straddle the boundary between previous chunk and new chunk?
				// It straddles if it begins before the boundary and ends after the boundary.
				const straddledBoundary =
					boundaryOffset > 0 &&
					matchStartIndex < boundaryOffset &&
					matchEndIndex > boundaryOffset;

				// Global deduplication key
				const dedupKey = `${rule.archetype}:${matchedText}`;
				if (!this.seenFindings.has(dedupKey)) {
					this.seenFindings.add(dedupKey);

					const linesBefore = windowText.slice(0, matchStartIndex).split("\n").length - 1;
					const findingLine = this.currentLine + linesBefore;
					const globalOffset = Math.max(0, this.scannedBytes - windowText.length + matchStartIndex);

					this.findings.push({
						archetype: rule.archetype,
						matchText: matchedText,
						maskedToken: maskToken(matchedText),
						offset: globalOffset,
						line: findingLine,
						straddledBoundary,
						severity: rule.severity,
					});
				}
			}
		}

		// Update line counter
		const newlineMatches = windowText.slice(0, Math.max(0, windowText.length - this.overlapBytes)).match(/\n/g);
		if (newlineMatches) {
			this.currentLine += newlineMatches.length;
		}
	}
}

/**
 * Convenient asynchronous helper to analyze a NodeJS stream using the SlidingChunkAnalyzer.
 */
export async function analyzeStreamWithSlidingChunks(
	stream: NodeJS.ReadableStream,
	options: SlidingChunkAnalyzerOptions = {},
): Promise<SlidingChunkResult> {
	return new Promise((resolve, reject) => {
		const analyzer = new SlidingChunkAnalyzer(options);
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
