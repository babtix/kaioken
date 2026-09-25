/**
 * mermaid_export.ts — Exportable impact graph diagram in Mermaid format (UX-0981–UX-0990).
 * Generates Mermaid flowchart syntax depicting the architectural blast radius from seed
 * components out to dependent subsystems and wiki documentation chapters.
 *
 * Invariant: Zero network, deterministic string generation.
 */

import {
	type ImpactTargetType,
	type TargetMermaidOptions,
	TARGET_METADATA_REGISTRY,
} from "./types.ts";

function sanitizeId(str: string): string {
	return str.replace(/[^a-zA-Z0-9_]/g, "_");
}

function escapeLabel(str: string): string {
	return str.replace(/"/g, "'");
}

/**
 * Export an architectural component's impact graph diagram as Mermaid syntax.
 */
export function exportTargetImpactMermaid(
	target: ImpactTargetType,
	options?: TargetMermaidOptions,
): string {
	const meta = TARGET_METADATA_REGISTRY[target];
	const dir = options?.direction ?? "LR";
	const includeSubsystems = options?.includeSubsystems !== false;
	const includeDocs = options?.includeWikiChapters !== false;

	const lines: string[] = [];
	lines.push(`flowchart ${dir}`);
	lines.push(`  %% Architectural Impact Graph: ${meta.name} [${meta.uxRange.mermaidGraph}]`);
	lines.push(`  %% Criticality: ${meta.criticality.toUpperCase()}`);
	lines.push("");

	// Subgraph: Seed Node
	const seedId = `Seed_${sanitizeId(target)}`;
	lines.push(`  subgraph Origin["🌱 Seed: ${escapeLabel(meta.name)}"]`);
	lines.push(`    ${seedId}["<b>${escapeLabel(meta.name)}</b><br/><small>${meta.defaultPath}</small><br/><i>${meta.defaultSymbols.slice(0, 3).join(", ")}</i>"]:::seed`);
	lines.push("  end");
	lines.push("");

	// Subgraph: Downstream Subsystems
	if (includeSubsystems && meta.affectedSubsystems.length > 0) {
		lines.push("  subgraph Subsystems[\"💥 Affected Subsystem Services\"]");
		for (let i = 0; i < meta.affectedSubsystems.length; i++) {
			const sub = meta.affectedSubsystems[i];
			if (!sub) continue;
			const subId = `Sub_${sanitizeId(sub.name)}_${i}`;
			const styleClass = sub.criticality === "high" ? "critical" : sub.criticality === "medium" ? "high" : "medium";
			lines.push(`    ${subId}["<b>${escapeLabel(sub.name)}</b><br/><small>${escapeLabel(sub.relationship)}</small>"]:::${styleClass}`);
		}
		lines.push("  end");
		lines.push("");
	}

	// Subgraph: Documentation & Knowledge Artifacts
	if (includeDocs && (meta.affectedWikiChapters.length > 0 || meta.knowledgeCards.length > 0)) {
		lines.push("  subgraph Docs[\"📚 Documentation & Fact Base Stale Radius\"]");
		for (let i = 0; i < meta.affectedWikiChapters.length; i++) {
			const ch = meta.affectedWikiChapters[i];
			if (!ch) continue;
			const docId = `Doc_${sanitizeId(ch.id)}_${i}`;
			lines.push(`    ${docId}["📄 ${escapeLabel(ch.title)}<br/><small>${ch.file}</small>"]:::doc`);
		}
		for (let i = 0; i < meta.knowledgeCards.length; i++) {
			const card = meta.knowledgeCards[i];
			if (!card) continue;
			const cardId = `Card_${sanitizeId(card.id)}_${i}`;
			lines.push(`    ${cardId}["🗂️ ${escapeLabel(card.title)}<br/><small>(${card.category})</small>"]:::card`);
		}
		lines.push("  end");
		lines.push("");
	}

	// Edges: Seed to Subsystems
	if (includeSubsystems) {
		for (let i = 0; i < meta.affectedSubsystems.length; i++) {
			const sub = meta.affectedSubsystems[i];
			if (!sub) continue;
			const subId = `Sub_${sanitizeId(sub.name)}_${i}`;
			lines.push(`  ${seedId} -->|"${meta.primaryEdgeLabel}"| ${subId}`);
		}
	}

	// Edges: Seed to Docs
	if (includeDocs) {
		for (let i = 0; i < meta.affectedWikiChapters.length; i++) {
			const ch = meta.affectedWikiChapters[i];
			if (!ch) continue;
			const docId = `Doc_${sanitizeId(ch.id)}_${i}`;
			lines.push(`  ${seedId} -.->|"invalidates docs"| ${docId}`);
		}
		for (let i = 0; i < meta.knowledgeCards.length; i++) {
			const card = meta.knowledgeCards[i];
			if (!card) continue;
			const cardId = `Card_${sanitizeId(card.id)}_${i}`;
			lines.push(`  ${seedId} -.->|"stales fact"| ${cardId}`);
		}
	}

	// Visual Style Definitions
	lines.push("");
	lines.push("  classDef seed fill:#dbeafe,stroke:#1d4ed8,stroke-width:2px,color:#1e3a8a;");
	lines.push("  classDef critical fill:#fee2e2,stroke:#b91c1c,stroke-width:2px,color:#7f1d1d;");
	lines.push("  classDef high fill:#ffedd5,stroke:#c2410c,stroke-width:1px,color:#7c2d12;");
	lines.push("  classDef medium fill:#fef9c3,stroke:#a16207,stroke-width:1px,color:#713f12;");
	lines.push("  classDef low fill:#f0fdf4,stroke:#15803d,stroke-width:1px,color:#14532d;");
	lines.push("  classDef doc fill:#f3e8ff,stroke:#7e22ce,stroke-width:1px,color:#581c87;");
	lines.push("  classDef card fill:#e0e7ff,stroke:#4338ca,stroke-width:1px,color:#312e81;");

	return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Dedicated helpers for UX-0981 to UX-0990
// ---------------------------------------------------------------------------

/** [UX-0981] Export Mermaid impact graph diagram for shared database model interface */
export function exportDatabaseModelMermaid(options?: TargetMermaidOptions): string {
	return exportTargetImpactMermaid("database_model", options);
}

/** [UX-0982] Export Mermaid impact graph diagram for central authentication middleware handler */
export function exportAuthMiddlewareMermaid(options?: TargetMermaidOptions): string {
	return exportTargetImpactMermaid("auth_middleware", options);
}

/** [UX-0983] Export Mermaid impact graph diagram for core HTTP client error handling signature */
export function exportHttpClientMermaid(options?: TargetMermaidOptions): string {
	return exportTargetImpactMermaid("http_client", options);
}

/** [UX-0984] Export Mermaid impact graph diagram for utility string formatting library */
export function exportStringUtilsMermaid(options?: TargetMermaidOptions): string {
	return exportTargetImpactMermaid("string_utils", options);
}

/** [UX-0985] Export Mermaid impact graph diagram for global telemetry logger and tracer */
export function exportTelemetryLoggerMermaid(options?: TargetMermaidOptions): string {
	return exportTargetImpactMermaid("telemetry_logger", options);
}

/** [UX-0986] Export Mermaid impact graph diagram for session state management store */
export function exportSessionStoreMermaid(options?: TargetMermaidOptions): string {
	return exportTargetImpactMermaid("session_store", options);
}

/** [UX-0987] Export Mermaid impact graph diagram for event bus message dispatcher and topics */
export function exportEventBusMermaid(options?: TargetMermaidOptions): string {
	return exportTargetImpactMermaid("event_bus", options);
}

/** [UX-0988] Export Mermaid impact graph diagram for configuration parser and validation schema */
export function exportConfigParserMermaid(options?: TargetMermaidOptions): string {
	return exportTargetImpactMermaid("config_parser", options);
}

/** [UX-0989] Export Mermaid impact graph diagram for cryptographic key exchange protocol */
export function exportCryptoExchangeMermaid(options?: TargetMermaidOptions): string {
	return exportTargetImpactMermaid("crypto_exchange", options);
}

/** [UX-0990] Export Mermaid impact graph diagram for third-party external API integration adapter */
export function exportExternalAdapterMermaid(options?: TargetMermaidOptions): string {
	return exportTargetImpactMermaid("external_adapter", options);
}
