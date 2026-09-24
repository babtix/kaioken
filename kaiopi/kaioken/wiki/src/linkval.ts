import type { WikiDocument } from "./types.ts";

export interface DeadLinkFinding {
	sourceDocument: string;
	target: string;
	resolvedPath: string;
	anchor?: string;
	line: number;
	reason: "document_not_found" | "anchor_not_found";
	suggestion?: string;
}

export interface WikiLinkValidationReport {
	ok: boolean;
	documentsChecked: number;
	validLinks: number;
	deadLinks: DeadLinkFinding[];
}

export interface WikiLinkValidationInput {
	documents: readonly WikiDocument[];
	/** Extra known documents not present in the current batch. */
	extraKnownDocuments?: readonly string[];
}

/**
 * Convert a Markdown heading text into a GitHub-compatible anchor slug.
 * e.g. "## 1. System High-Level Architecture!" -> "1-system-high-level-architecture"
 */
export function slugifyHeading(heading: string): string {
	return heading
		.toLowerCase()
		.trim()
		.replace(/^[#\s]+/, "") // strip leading # and spaces
		.replace(/[^\w\s-]/g, "") // remove punctuation
		.replace(/\s+/g, "-"); // spaces to hyphens
}

/**
 * Compute Levenshtein distance between two strings for fuzzy suggestions.
 */
function levenshteinDistance(a: string, b: string): number {
	const matrix: number[][] = [];
	for (let i = 0; i <= b.length; i++) {
		matrix[i] = [i];
	}
	for (let j = 0; j <= a.length; j++) {
		matrix[0]![j] = j;
	}
	for (let i = 1; i <= b.length; i++) {
		for (let j = 1; j <= a.length; j++) {
			if (b.charAt(i - 1) === a.charAt(j - 1)) {
				matrix[i]![j] = matrix[i - 1]![j - 1]!;
			} else {
				matrix[i]![j] = Math.min(
					matrix[i - 1]![j - 1]! + 1, // substitution
					matrix[i]![j - 1]! + 1, // insertion
					matrix[i - 1]![j]! + 1, // deletion
				);
			}
		}
	}
	return matrix[b.length]![a.length]!;
}

/**
 * Find closest matching string from a list of candidates.
 */
function findClosestMatch(query: string, candidates: readonly string[], maxDistance = 5): string | undefined {
	let bestCandidate: string | undefined;
	let minDistance = maxDistance + 1;

	for (const candidate of candidates) {
		const dist = levenshteinDistance(query.toLowerCase(), candidate.toLowerCase());
		if (dist < minDistance) {
			minDistance = dist;
			bestCandidate = candidate;
		}
	}
	return bestCandidate;
}

/**
 * Resolve relative markdown path against base document directory.
 */
function resolveRelativePath(baseDir: string, relativePath: string): string {
	const parts = baseDir ? baseDir.split("/").filter(Boolean) : [];
	for (const segment of relativePath.split("/")) {
		if (segment === "" || segment === ".") continue;
		if (segment === "..") {
			parts.pop();
		} else {
			parts.push(segment);
		}
	}
	return parts.join("/");
}

/**
 * Extract all markdown heading slugs from document body.
 */
function extractHeadingSlugs(body: string): Set<string> {
	const slugs = new Set<string>();
	const headingRegex = /^#{1,6}\s+(.+)$/gm;
	let match: RegExpExecArray | null;
	while ((match = headingRegex.exec(body)) !== null) {
		const headingText = match[1]?.trim() ?? "";
		if (headingText) {
			slugs.add(slugifyHeading(headingText));
		}
	}
	return slugs;
}

/**
 * Cross-chapter relative markdown link validator catching 404 dead links (UX-1421 to UX-1430).
 * Validates document paths, heading anchors, and provides fuzzy match repair suggestions.
 */
export function validateWikiLinks(input: WikiLinkValidationInput): WikiLinkValidationReport {
	const docMap = new Map<string, WikiDocument>();
	const docHeadings = new Map<string, Set<string>>();
	const knownDocPaths = new Set<string>();

	for (const doc of input.documents) {
		docMap.set(doc.path, doc);
		knownDocPaths.add(doc.path);
		docHeadings.set(doc.path, extractHeadingSlugs(doc.body));
	}

	for (const extra of input.extraKnownDocuments ?? []) {
		knownDocPaths.add(extra);
	}

	const deadLinks: DeadLinkFinding[] = [];
	let validLinks = 0;

	const linkRegex = /(?<!!)(?:\[([^\]]*)\])\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g;

	for (const doc of input.documents) {
		const baseDir = doc.path.includes("/") ? doc.path.slice(0, doc.path.lastIndexOf("/")) : "";

		let match: RegExpExecArray | null;
		linkRegex.lastIndex = 0;

		while ((match = linkRegex.exec(doc.body)) !== null) {
			const rawTarget = match[2]?.trim() ?? "";
			if (!rawTarget) continue;

			// Skip external links, mailto, and in-page anchor links
			if (
				rawTarget.startsWith("http://") ||
				rawTarget.startsWith("https://") ||
				rawTarget.startsWith("mailto:")
			) {
				continue;
			}

			const line = doc.body.slice(0, match.index).split("\n").length;

			// In-page anchor: [Text](#anchor)
			if (rawTarget.startsWith("#")) {
				const anchor = rawTarget.slice(1);
				const currentSlugs = docHeadings.get(doc.path) ?? new Set();
				if (!currentSlugs.has(anchor)) {
					const suggestion = findClosestMatch(anchor, [...currentSlugs]);
					deadLinks.push({
						sourceDocument: doc.path,
						target: rawTarget,
						resolvedPath: doc.path,
						anchor,
						line,
						reason: "anchor_not_found",
						...(suggestion ? { suggestion: `#${suggestion}` } : {}),
					});
				} else {
					validLinks++;
				}
				continue;
			}

			// Relative link: [Text](path/to/doc.md#anchor)
			const [pathPart, anchorPart] = rawTarget.split("#") as [string, string | undefined];
			const resolved = resolveRelativePath(baseDir, pathPart);

			let matchedDocPath: string | null = null;
			if (knownDocPaths.has(resolved)) {
				matchedDocPath = resolved;
			} else if (knownDocPaths.has(`${resolved}.md`)) {
				matchedDocPath = `${resolved}.md`;
			} else if (knownDocPaths.has(`${resolved}/index.md`)) {
				matchedDocPath = `${resolved}/index.md`;
			}

			if (!matchedDocPath) {
				// Target document not found!
				const candidateDocs = [...knownDocPaths];
				const suggestion = findClosestMatch(resolved, candidateDocs);
				deadLinks.push({
					sourceDocument: doc.path,
					target: rawTarget,
					resolvedPath: resolved,
					anchor: anchorPart,
					line,
					reason: "document_not_found",
					...(suggestion ? { suggestion: `${suggestion}${anchorPart ? `#${anchorPart}` : ""}` } : {}),
				});
			} else {
				// Document exists. If anchor is specified, verify anchor matches a heading in target doc
				if (anchorPart) {
					const headings = docHeadings.get(matchedDocPath);
					if (headings && !headings.has(anchorPart)) {
						const suggestion = findClosestMatch(anchorPart, [...headings]);
						deadLinks.push({
							sourceDocument: doc.path,
							target: rawTarget,
							resolvedPath: matchedDocPath,
							anchor: anchorPart,
							line,
							reason: "anchor_not_found",
							...(suggestion ? { suggestion: `${pathPart}#${suggestion}` } : {}),
						});
					} else {
						validLinks++;
					}
				} else {
					validLinks++;
				}
			}
		}
	}

	return {
		ok: deadLinks.length === 0,
		documentsChecked: input.documents.length,
		validLinks,
		deadLinks,
	};
}

/**
 * Format a human-readable link validation report for terminal display.
 */
export function formatLinkValidationReport(report: WikiLinkValidationReport): string {
	const lines: string[] = [
		`Wiki Link Integrity Check: ${report.documentsChecked} documents checked, ${report.validLinks} valid links.`,
	];

	if (report.ok) {
		lines.push("  ✔ All cross-chapter relative links and heading anchors resolve cleanly.");
	} else {
		lines.push(`  ✖ Found ${report.deadLinks.length} dead link(s):`);
		for (const d of report.deadLinks) {
			const reasonText = d.reason === "document_not_found" ? "Document 404" : "Anchor 404";
			lines.push(`    • [${reasonText}] ${d.sourceDocument}:${d.line} -> "${d.target}"`);
			if (d.suggestion) {
				lines.push(`      Suggested repair: "${d.suggestion}"`);
			}
		}
	}

	return lines.join("\n");
}
