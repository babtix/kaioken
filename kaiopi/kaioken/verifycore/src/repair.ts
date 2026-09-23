import type { SymbolOracle } from "@kaioken/index";
import type { BasenameIndex } from "./basename.ts";
import type { Defect, VerificationReport } from "./types.ts";

export function findSymbolSuggestions(
	oracle: SymbolOracle,
	hallucinated: string,
	maxResults = 3,
): string[] {
	const candidates: string[] = [];
	const clean = hallucinated.replace(/\(\s*\)$/, "");
	const lower = clean.toLowerCase();

	const allSymbols = new Set<string>();
	for (const loc of oracle.exported()) {
		allSymbols.add(loc.symbol.name);
	}
	const internalByName = (oracle as unknown as { byName?: Map<string, unknown> }).byName;
	if (internalByName && typeof internalByName.keys === "function") {
		for (const name of internalByName.keys()) {
			allSymbols.add(name);
		}
	}
	const internalByPath = (oracle as unknown as { byPath?: Map<string, { symbols: Array<{ name: string }> }> }).byPath;
	if (internalByPath && typeof internalByPath.values === "function") {
		for (const file of internalByPath.values()) {
			for (const s of file.symbols) {
				allSymbols.add(s.name);
			}
		}
	}

	for (const sym of allSymbols) {
		if (sym.toLowerCase() === lower && sym !== clean) {
			candidates.push(sym);
		}
	}

	const scored: Array<{ name: string; distance: number }> = [];
	for (const sym of allSymbols) {
		if (!candidates.includes(sym)) {
			scored.push({ name: sym, distance: levenshtein(clean, sym) });
		}
	}
	scored.sort((a, b) => a.distance - b.distance);

	for (const item of scored) {
		if (candidates.length >= maxResults) break;
		if (item.distance <= Math.max(3, Math.floor(clean.length / 2))) {
			candidates.push(item.name);
		}
	}

	return candidates.slice(0, maxResults);
}

export function enrichDefectsWithSuggestions(
	defects: readonly Defect[],
	index: BasenameIndex,
	oracle: SymbolOracle,
): Defect[] {
	return defects.map((d) => {
		const out: Defect = { ...d };

		if (d.kind === "unknown_file" || d.kind === "fabricated_parent") {
			out.severity = "critical";
			const suggestions = index.findClosestFiles(d.claim, 3);
			if (suggestions.length > 0) {
				out.suggestions = suggestions;
				out.suggestedReplacement = suggestions[0];
			}
		} else if (d.kind === "unknown_symbol") {
			out.severity = "critical";
			const suggestions = findSymbolSuggestions(oracle, d.claim, 3);
			if (suggestions.length > 0) {
				out.suggestions = suggestions;
				out.suggestedReplacement = suggestions[0];
			}
		} else if (
			d.kind === "bad_anchor" ||
			d.kind === "excerpt_not_found" ||
			d.kind === "broken_link" ||
			d.kind === "fuzzy_out_of_scope"
		) {
			out.severity = "warning";
		} else {
			out.severity = "info";
		}

		return out;
	});
}

export function buildMechanisticRepairPrompt(report: VerificationReport): string {
	if (report.defects.length === 0) return "";

	const lines: string[] = [
		"MECHANISTIC REPAIR DIRECTIVES:",
		"Fix the following verification defects in the generated artifact:",
	];

	for (const defect of report.defects) {
		const lineLoc = defect.line !== undefined ? `Line ${defect.line}` : "Artifact";

		if (defect.kind === "unknown_file" || defect.kind === "fabricated_parent") {
			if (defect.suggestedReplacement) {
				lines.push(
					`- ${lineLoc}: replace ungrounded file citation \`${defect.claim}\` with verified repository file \`${defect.suggestedReplacement}\`.`,
				);
			} else {
				lines.push(
					`- ${lineLoc}: remove ungrounded file citation \`${defect.claim}\` (${defect.detail}).`,
				);
			}
		} else if (defect.kind === "unknown_symbol") {
			if (defect.suggestedReplacement) {
				lines.push(
					`- ${lineLoc}: replace ungrounded symbol \`${defect.claim}\` with verified symbol \`${defect.suggestedReplacement}\`.`,
				);
			} else {
				lines.push(
					`- ${lineLoc}: remove or correct hallucinated symbol \`${defect.claim}\` (${defect.detail}).`,
				);
			}
		} else if (defect.kind === "padding") {
			lines.push(
				`- ${lineLoc}: remove generic boilerplate phrase "${defect.claim}" and replace with concrete codebase behavior.`,
			);
		} else if (defect.kind === "bad_anchor" || defect.kind === "excerpt_not_found") {
			lines.push(
				`- ${lineLoc}: fix code excerpt or anchor \`${defect.claim}\` (${defect.detail}).`,
			);
		} else {
			lines.push(`- ${lineLoc}: fix ${defect.kind} defect on \`${defect.claim}\` (${defect.detail}).`);
		}
	}

	return lines.join("\n");
}

function levenshtein(a: string, b: string): number {
	if (a === b) return 0;
	if (a.length === 0) return b.length;
	if (b.length === 0) return a.length;

	const row: number[] = [];
	for (let j = 0; j <= b.length; j++) row[j] = j;

	for (let i = 1; i <= a.length; i++) {
		let prev = i - 1;
		row[0] = i;
		for (let j = 1; j <= b.length; j++) {
			const cur = row[j] as number;
			const cost = a[i - 1] === b[j - 1] ? 0 : 1;
			row[j] = Math.min((row[j] as number) + 1, (row[j - 1] as number) + 1, prev + cost);
			prev = cur;
		}
	}

	return row[b.length] as number;
}
