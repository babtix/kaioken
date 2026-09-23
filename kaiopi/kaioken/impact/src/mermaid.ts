/**
 * mermaid.ts — Mermaid impact graph diagram exporter (UX-0941–UX-0950).
 *
 * Generates Mermaid flowchart syntax depicting the blast radius from
 * declaration seed nodes to dependent files, with visual styling keyed
 * to severity and relationship type.
 *
 * Invariant: Zero network, deterministic string generation.
 */

import type { ImpactReport } from "./predict.ts";
import type { BlastRadiusScore } from "./score.ts";

export interface MermaidOptions {
	direction?: "LR" | "TD";
	maxNodes?: number;
	includeScore?: boolean;
}

function sanitizeId(str: string): string {
	return str.replace(/[^a-zA-Z0-9_]/g, "_");
}

function escapeLabel(str: string): string {
	return str.replace(/"/g, "'");
}

/**
 * Exports an ImpactReport and optional BlastRadiusScore as a Mermaid flowchart diagram.
 */
export function exportMermaid(
	report: ImpactReport,
	score?: BlastRadiusScore,
	opts?: MermaidOptions,
): string {
	const dir = opts?.direction ?? "LR";
	const maxNodes = opts?.maxNodes ?? 50;
	const lines: string[] = [];

	lines.push(`flowchart ${dir}`);

	if (score && opts?.includeScore !== false) {
		lines.push(`  %% Risk Gauge: ${score.score}/100 [${score.label}]`);
	}

	const seedSet = new Set(report.seeds);
	const nodeIds = new Map<string, string>();
	let nodeCounter = 0;

	const getNodeId = (path: string): string => {
		let id = nodeIds.get(path);
		if (!id) {
			id = `N_${sanitizeId(path)}_${++nodeCounter}`;
			nodeIds.set(path, id);
		}
		return id;
	};

	// Group Seeds
	if (report.seeds.length > 0) {
		lines.push("  subgraph Seeds[\"🌱 Change Seeds\"]");
		for (const seed of report.seeds) {
			const id = getNodeId(seed);
			const label = escapeLabel(seed);
			const symNames = report.symbols
				.filter((s) => s.path === seed)
				.map((s) => s.name)
				.slice(0, 3)
				.join(", ");
			const nodeText = symNames ? `${label}<br/><i>(${symNames})</i>` : label;
			lines.push(`    ${id}["${nodeText}"]:::seed`);
		}
		lines.push("  end");
	}

	// Dependents up to maxNodes
	const cappedDependents = report.dependents.slice(0, maxNodes);
	if (cappedDependents.length > 0) {
		lines.push("  subgraph Dependents[\"💥 Blast Radius Dependents\"]");
		for (const dep of cappedDependents) {
			const id = getNodeId(dep.path);
			const label = escapeLabel(dep.path);
			const mentions = dep.mentions.slice(0, 2).join(", ");
			const nodeText = mentions ? `${label}<br/><small>[${mentions}]</small>` : label;
			const severityClass = score?.label ?? "medium";
			lines.push(`    ${id}["${nodeText}"]:::${severityClass}`);
		}
		lines.push("  end");
	}

	// Edges
	for (const dep of cappedDependents) {
		const depId = getNodeId(dep.path);
		for (const seed of report.seeds) {
			const seedId = getNodeId(seed);
			const edgeLabel = dep.mentions.slice(0, 2).join(", ");
			if (edgeLabel) {
				lines.push(`  ${seedId} -->|"${escapeLabel(edgeLabel)}"| ${depId}`);
			} else {
				lines.push(`  ${seedId} --> ${depId}`);
			}
		}
	}

	// If dependents truncated
	if (report.dependents.length > maxNodes) {
		const overflowCount = report.dependents.length - maxNodes;
		lines.push(`  %% ... +${overflowCount} additional dependent files omitted for brevity`);
	}

	// Style definitions
	lines.push("");
	lines.push("  classDef seed fill:#e0f2fe,stroke:#0284c7,stroke-width:2px,color:#0369a1;");
	lines.push("  classDef low fill:#f0fdf4,stroke:#16a34a,stroke-width:1px,color:#15803d;");
	lines.push("  classDef medium fill:#fefce8,stroke:#ca8a04,stroke-width:1px,color:#a16207;");
	lines.push("  classDef high fill:#fff7ed,stroke:#ea580c,stroke-width:2px,color:#c2410c;");
	lines.push("  classDef critical fill:#fef2f2,stroke:#dc2626,stroke-width:2px,color:#b91c1c;");

	return lines.join("\n");
}
