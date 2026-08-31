import type { ImpactReport } from "./predict.js";

/**
 * The report as something to read.
 *
 * Ordered the way the question is actually asked: what did you mean, what
 * declares it, what mentions it, and what documentation goes stale if it moves.
 */
export function renderImpact(report: ImpactReport): string[] {
	const out: string[] = [];

	if (report.symbols.length === 0) {
		out.push(`nothing in this repository matches "${report.description}"`);
		if (report.unknown.length > 0) {
			out.push(`  not declared here: ${report.unknown.slice(0, 12).join(", ")}`);
		}
		out.push("  name a symbol or a file, or run `kaioken scan` if the index is stale");
		return out;
	}

	out.push(`${report.symbols.length} declaration(s) match:`);
	for (const symbol of report.symbols.slice(0, 20)) {
		out.push(`  ${symbol.exported ? "+" : "-"} ${symbol.name} (${symbol.kind}) — ${symbol.path}`);
	}

	out.push("", `${report.dependents.length} file(s) mention them:`);
	if (report.dependents.length === 0) {
		// Worth saying plainly: a symbol nothing else names is safe to change,
		// and that is the answer the question was asked to get.
		out.push("  none — nothing outside the declaring files refers to these names");
	}
	for (const dependent of report.dependents.slice(0, 25)) {
		out.push(`  ${dependent.path} (${dependent.mentions.join(", ")})`);
	}

	if (report.modules.length > 0) {
		out.push("", `${report.modules.length} module card(s) would go stale:`);
		for (const module of report.modules) out.push(`  ${module.id} — ${module.name}`);
	}
	if (report.documents.length > 0) {
		out.push("", `${report.documents.length} wiki document(s) would go stale:`);
		for (const document of report.documents.slice(0, 20)) out.push(`  ${document.id}`);
	}
	if (report.skills.length > 0) {
		out.push("", `${report.skills.length} skill(s) name an affected file:`);
		for (const skill of report.skills) out.push(`  ${skill.name} — ${skill.path}`);
	}
	if (report.unknown.length > 0) {
		out.push("", `not declared in this repository: ${report.unknown.slice(0, 12).join(", ")}`);
	}
	if (report.partial) {
		out.push("", "the file sweep stopped at its budget — the dependent list may be incomplete");
	}
	return out;
}
