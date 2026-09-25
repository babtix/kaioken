import type { BasenameIndex } from "./basename.ts";
import type { Claim, Defect, DomainCategory } from "./types.ts";

export interface LinkValidationOptions {
	currentFilePath?: string;
	checkAnchors?: boolean;
}

export function crossValidateCitationLinks(
	claims: readonly Claim[],
	index: BasenameIndex,
	options?: LinkValidationOptions,
): Defect[] {
	const defects: Defect[] = [];

	for (const claim of claims) {
		if (claim.kind === "link" && claim.target) {
			const defect = validateSingleLink(claim, index, options?.currentFilePath);
			if (defect) defects.push(defect);
		} else if (claim.kind === "file") {
			// Cross-validate that raw file mentions exist
			const res = index.resolve(claim.text);
			if (!res.resolved) {
				const closest = index.findClosestFiles(claim.text, 3);
				defects.push({
					kind: "broken_link",
					claim: claim.text,
					line: claim.line,
					domain: claim.domain ?? "file_path",
					detail: res.fabricatedParent
						? `referenced file parent path does not exist in repository`
						: `referenced file does not exist in repository`,
					severity: "critical",
					suggestions: closest,
					suggestedReplacement: closest[0],
				});
			}
		}
	}

	return defects;
}

function validateSingleLink(
	claim: Claim,
	index: BasenameIndex,
	currentFilePath?: string,
): Defect | null {
	const rawTarget = claim.target as string;
	if (!rawTarget || rawTarget.startsWith("#")) {
		// Pure internal heading anchor `#overview` - skip file resolution
		return null;
	}

	// Strip hash anchor if present e.g. `docs/intro.md#quickstart` -> `docs/intro.md`
	const hashIndex = rawTarget.indexOf("#");
	const filePathPart = hashIndex !== -1 ? rawTarget.slice(0, hashIndex) : rawTarget;
	if (!filePathPart) return null;

	// Resolve relative path against current document directory if known
	let normalizedTarget = filePathPart.replace(/\\/g, "/");
	if (normalizedTarget.startsWith("./")) {
		normalizedTarget = normalizedTarget.slice(2);
	}

	if (currentFilePath && (normalizedTarget.startsWith("../") || !normalizedTarget.startsWith("/"))) {
		const docSlash = currentFilePath.lastIndexOf("/");
		const docDir = docSlash !== -1 ? currentFilePath.slice(0, docSlash) : "";
		if (docDir) {
			normalizedTarget = resolveRelativePath(docDir, normalizedTarget);
		}
	}

	const resolution = index.resolve(normalizedTarget);
	if (resolution.resolved) {
		return null;
	}

	const closest = index.findClosestFiles(normalizedTarget, 3);
	return {
		kind: "broken_link",
		claim: rawTarget,
		line: claim.line,
		domain: claim.domain ?? "file_path",
		detail: resolution.fabricatedParent
			? `referenced link target has fabricated parent directory: "${normalizedTarget}"`
			: `referenced file target does not exist in repository: "${normalizedTarget}"`,
		severity: "critical",
		suggestions: closest,
		suggestedReplacement: closest[0],
	};
}

function resolveRelativePath(baseDir: string, relativePath: string): string {
	const parts = baseDir.split("/").filter(Boolean);
	const relParts = relativePath.split("/").filter(Boolean);

	for (const p of relParts) {
		if (p === ".") continue;
		if (p === "..") {
			parts.pop();
		} else {
			parts.push(p);
		}
	}

	return parts.join("/");
}
