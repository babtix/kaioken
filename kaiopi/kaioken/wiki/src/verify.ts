import {
	coverageOf,
	groundingDefects as coreGroundingDefects,
	verifyDocument as coreVerifyDocument,
	type VerifyInput as CoreVerifyInput,
} from "@kaioken/verifycore";
import type { Defect, VerificationReport } from "./types.ts";

export { coverageOf };

export function summariseDefects(defects: readonly Defect[]): Record<string, number> {
	const out: Record<string, number> = {};
	for (const defect of defects) out[defect.kind] = (out[defect.kind] ?? 0) + 1;
	return out;
}

export interface VerifyInput extends CoreVerifyInput {
	/** Wiki-relative path of the document currently being verified, e.g. "storage/engine.md". */
	currentDocument?: string;
	/** Known wiki document paths that relative links can resolve to, e.g. ["architecture/index.md"]. */
	knownDocuments?: ReadonlySet<string>;
}

export async function verifyDocument(input: VerifyInput): Promise<VerificationReport> {
	const coreReport = await coreVerifyDocument(input);
	const linkDefects = checkRelativeLinks(input.body, input.currentDocument, input.knownDocuments);
	const defects: Defect[] = [...coreReport.defects, ...linkDefects];
	return {
		grounded: coreReport.grounded,
		defects,
		uncovered: coreReport.uncovered,
		coverage: coreReport.coverage,
	};
}

export function groundingDefects(defects: readonly Defect[]): Defect[] {
	return defects.filter(
		(d) =>
			d.kind === "unknown_file" ||
			d.kind === "unknown_symbol" ||
			d.kind === "bad_anchor" ||
			d.kind === "excerpt_not_found" ||
			d.kind === "excerpt_ambiguous" ||
			d.kind === "broken_link",
	);
}

/**
 * Check relative Markdown links between chapters against known existing or planned wiki documents.
 */
export function checkRelativeLinks(
	body: string,
	currentDocument?: string,
	knownDocuments?: ReadonlySet<string>,
): Defect[] {
	if (!knownDocuments) return [];

	const defects: Defect[] = [];
	const linkRegex = /(?<!!)(?:\[([^\]]*)\])\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g;

	let match: RegExpExecArray | null;
	while ((match = linkRegex.exec(body)) !== null) {
		const rawTarget = match[2]?.trim() ?? "";
		if (!rawTarget) continue;

		// Skip external links, mailto, and in-page anchor links
		if (
			rawTarget.startsWith("http://") ||
			rawTarget.startsWith("https://") ||
			rawTarget.startsWith("mailto:") ||
			rawTarget.startsWith("#")
		) {
			continue;
		}

		// Strip section anchor #...
		const target = rawTarget.split("#")[0] ?? "";
		if (!target) continue;

		// Resolve relative path against current document directory
		const baseDir = currentDocument && currentDocument.includes("/")
			? currentDocument.slice(0, currentDocument.lastIndexOf("/"))
			: "";
		const resolved = resolveRelativePath(baseDir, target);

		const exists =
			knownDocuments.has(resolved) ||
			(resolved.endsWith("/index.md") && knownDocuments.has(resolved.replace(/\/index\.md$/, ""))) ||
			knownDocuments.has(`${resolved}.md`) ||
			knownDocuments.has(`${resolved}/index.md`);

		if (!exists) {
			const line = body.slice(0, match.index).split("\n").length;
			defects.push({
				kind: "broken_link",
				claim: rawTarget,
				line,
				detail: `relative link "${rawTarget}" resolves to "${resolved}", which does not match any planned or existing wiki document`,
			});
		}
	}

	return defects;
}

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
