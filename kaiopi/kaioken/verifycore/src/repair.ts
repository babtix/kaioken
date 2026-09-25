import type { SymbolOracle } from "@kaioken/index";
import type { BasenameIndex } from "./basename.ts";
import type { Defect, DomainCategory, VerificationReport } from "./types.ts";

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

		if (d.kind === "unknown_file" || d.kind === "fabricated_parent" || d.kind === "broken_link") {
			out.severity = "critical";
			out.domain = "file_path";
			const suggestions = index.findClosestFiles(d.claim, 3);
			if (suggestions.length > 0) {
				out.suggestions = suggestions;
				out.suggestedReplacement = suggestions[0];
			}
		} else if (d.kind === "unknown_symbol" || d.kind === "fuzzy_out_of_scope") {
			out.severity = "critical";
			out.domain = "symbol_signature";
			const suggestions = findSymbolSuggestions(oracle, d.claim, 3);
			if (suggestions.length > 0) {
				out.suggestions = suggestions;
				out.suggestedReplacement = suggestions[0];
			}
		} else if (d.kind === "ungrounded_perf_metric") {
			out.severity = "warning";
			out.domain = "perf_metric";
			const suggestions = index.findClosestMetric(d.claim, 3);
			if (suggestions.length > 0) {
				out.suggestions = suggestions;
				out.suggestedReplacement = suggestions[0];
			}
		} else if (d.kind === "ungrounded_config_key") {
			out.severity = "warning";
			out.domain = "config_key";
			const suggestions = index.findClosestConfigKey(d.claim, 3);
			if (suggestions.length > 0) {
				out.suggestions = suggestions;
				out.suggestedReplacement = suggestions[0];
			}
		} else if (d.kind === "ungrounded_dependency") {
			out.severity = "critical";
			out.domain = "dependency_claim";
			const suggestions = index.findClosestDependency(d.claim, 3);
			if (suggestions.length > 0) {
				out.suggestions = suggestions;
				out.suggestedReplacement = suggestions[0];
			}
		} else if (d.kind === "ungrounded_commit") {
			out.severity = "warning";
			out.domain = "commit_quote";
			const suggestions = index.findClosestCommit(d.claim, 3);
			if (suggestions.length > 0) {
				out.suggestions = suggestions;
				out.suggestedReplacement = suggestions[0];
			}
		} else if (d.kind === "ungrounded_db_citation") {
			out.severity = "warning";
			out.domain = "db_citation";
			const suggestions = index.findClosestDbEntity(d.claim, 3);
			if (suggestions.length > 0) {
				out.suggestions = suggestions;
				out.suggestedReplacement = suggestions[0];
			}
		} else if (d.kind === "unknown_parameter") {
			out.severity = "warning";
			out.domain = "api_param";
		} else if (d.kind === "bad_anchor" || d.kind === "excerpt_not_found") {
			out.severity = "warning";
			out.domain = "symbol_signature";
		} else {
			out.severity = "info";
		}

		return out;
	});
}

// UX-1191 through UX-1200: Mechanistic repair guidance prompt suggesting real replacements across all 10 domain targets
export function buildMechanisticRepairPrompt(report: VerificationReport): string {
	if (report.defects.length === 0) return "";

	const lines: string[] = [
		"MECHANISTIC REPAIR DIRECTIVES:",
		"Fix the following verification defects in the generated artifact:",
	];

	for (const defect of report.defects) {
		const lineLoc = defect.line !== undefined ? `Line ${defect.line}` : "Artifact";

		// 1. File path references (UX-1191)
		if (defect.kind === "unknown_file" || defect.kind === "fabricated_parent" || defect.kind === "broken_link") {
			if (defect.suggestedReplacement) {
				lines.push(
					`- ${lineLoc}: replace ungrounded file citation \`${defect.claim}\` with verified repository file \`${defect.suggestedReplacement}\`.`,
				);
			} else {
				lines.push(
					`- ${lineLoc}: remove ungrounded file citation \`${defect.claim}\` (${defect.detail}).`,
				);
			}
		}
		// 2. Symbol signature quotes (UX-1192)
		else if (defect.kind === "unknown_symbol" || defect.kind === "fuzzy_out_of_scope") {
			if (defect.suggestedReplacement) {
				lines.push(
					`- ${lineLoc}: replace ungrounded symbol \`${defect.claim}\` with verified symbol \`${defect.suggestedReplacement}\`.`,
				);
			} else {
				lines.push(
					`- ${lineLoc}: remove or correct hallucinated symbol \`${defect.claim}\` (${defect.detail}).`,
				);
			}
		}
		// 3. API parameter documentation claims (UX-1193)
		else if (defect.kind === "unknown_parameter") {
			if (defect.suggestedReplacement) {
				lines.push(
					`- ${lineLoc}: replace ungrounded API parameter \`${defect.claim}\` with verified parameter \`${defect.suggestedReplacement}\`.`,
				);
			} else {
				lines.push(
					`- ${lineLoc}: remove or correct invalid API parameter citation \`${defect.claim}\` (${defect.detail}).`,
				);
			}
		}
		// 4. Architectural boundary descriptions (UX-1194)
		else if (defect.domain === "arch_boundary" && defect.kind !== "padding") {
			lines.push(
				`- ${lineLoc}: correct architectural boundary description \`${defect.claim}\` (${defect.detail}).`,
			);
		}
		// 5. Procedural command examples in skills (UX-1195)
		else if (defect.domain === "command_example") {
			if (defect.suggestedReplacement) {
				lines.push(
					`- ${lineLoc}: replace invalid command example \`${defect.claim}\` with verified command \`${defect.suggestedReplacement}\`.`,
				);
			} else {
				lines.push(
					`- ${lineLoc}: correct procedural command example \`${defect.claim}\` (${defect.detail}).`,
				);
			}
		}
		// 6. Performance metric assertions (UX-1196)
		else if (defect.kind === "ungrounded_perf_metric") {
			if (defect.suggestedReplacement) {
				lines.push(
					`- ${lineLoc}: replace ungrounded performance assertion \`${defect.claim}\` with measured benchmark contract \`${defect.suggestedReplacement}\`.`,
				);
			} else {
				lines.push(
					`- ${lineLoc}: remove ungrounded performance claim \`${defect.claim}\` (${defect.detail}).`,
				);
			}
		}
		// 7. Configuration key citations (UX-1197)
		else if (defect.kind === "ungrounded_config_key") {
			if (defect.suggestedReplacement) {
				lines.push(
					`- ${lineLoc}: replace ungrounded configuration key \`${defect.claim}\` with verified schema key \`${defect.suggestedReplacement}\`.`,
				);
			} else {
				lines.push(
					`- ${lineLoc}: remove ungrounded configuration key \`${defect.claim}\` (${defect.detail}).`,
				);
			}
		}
		// 8. Third-party dependency claims (UX-1198)
		else if (defect.kind === "ungrounded_dependency") {
			if (defect.suggestedReplacement) {
				lines.push(
					`- ${lineLoc}: replace ungrounded dependency \`${defect.claim}\` with declared package \`${defect.suggestedReplacement}\`.`,
				);
			} else {
				lines.push(
					`- ${lineLoc}: remove ungrounded third-party dependency claim \`${defect.claim}\` (${defect.detail}).`,
				);
			}
		}
		// 9. Historical commit attribution quotes (UX-1199)
		else if (defect.kind === "ungrounded_commit") {
			if (defect.suggestedReplacement) {
				lines.push(
					`- ${lineLoc}: replace ungrounded commit citation \`${defect.claim}\` with verified commit SHA \`${defect.suggestedReplacement}\`.`,
				);
			} else {
				lines.push(
					`- ${lineLoc}: remove ungrounded commit quote \`${defect.claim}\` (${defect.detail}).`,
				);
			}
		}
		// 10. Database column and index citations (UX-1200)
		else if (defect.kind === "ungrounded_db_citation") {
			if (defect.suggestedReplacement) {
				lines.push(
					`- ${lineLoc}: replace ungrounded database citation \`${defect.claim}\` with verified table or column \`${defect.suggestedReplacement}\`.`,
				);
			} else {
				lines.push(
					`- ${lineLoc}: remove ungrounded database citation \`${defect.claim}\` (${defect.detail}).`,
				);
			}
		}
		// Padding & Boilerplate
		else if (defect.kind === "padding") {
			const rep = defect.suggestedReplacement ? ` (${defect.suggestedReplacement})` : "";
			lines.push(
				`- ${lineLoc}: remove generic boilerplate phrase "${defect.claim}" and replace with concrete codebase behavior${rep}.`,
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
