/**
 * chapter_mapper.ts — Affected module and documentation chapter mapper (UX-0971–UX-0980).
 * Maps architectural component modifications to affected wiki documentation chapters,
 * knowledge cards, agent skills, and subsystem dependencies.
 *
 * Invariant: 100% offline-testable with defensive boundaries.
 */

import {
	type AffectedArtifactsMapping,
	type ChapterMappingOptions,
	type ImpactTargetType,
	TARGET_METADATA_REGISTRY,
} from "./types.ts";

/** Dynamic recommendation generators per target */
const TARGET_RECOMMENDATIONS: Record<ImpactTargetType, string[]> = {
	database_model: [
		"Review wiki chapters 'Database Architecture & Schemas' for updated SQL/ORM schemas.",
		"Run `kaioken verify` to check schema test cases before publishing card updates.",
		"Synchronize atomic fact base cards referencing UserRecord and DatabaseModel.",
	],
	auth_middleware: [
		"Update 'Authentication & Security Model' wiki chapter with new token lifetimes and claims.",
		"Audit route guard code snippets in onboarding and security tutorials.",
		"Verify agent skills relying on auth credentials reflect updated security headers.",
	],
	http_client: [
		"Update 'HTTP Client & Resilience Protocols' wiki chapter with error envelope structure.",
		"Revise external integration guides showing try/catch blocks for HttpClientError.",
		"Audit HTTP diagnostic skill recipes for updated status code parameters.",
	],
	string_utils: [
		"Update 'Shared Utilities & Helpers' chapter with slugification character sets.",
		"Verify terminal UI markdown rendering docs reflect latest formatting rules.",
		"Check that knowledge cards citing string utility helpers retain exact signatures.",
	],
	telemetry_logger: [
		"Update 'Telemetry & Distributed Tracing' wiki chapter with span attributes.",
		"Ensure audit logging runbooks document newly added or deprecated log levels.",
		"Revise latency diagnostic agent skills to query updated tracer span names.",
	],
	session_store: [
		"Update 'Session Architecture & Replay' wiki chapter with checkpoint schema changes.",
		"Document SQLite recovery procedures in durable checkpoint runbooks.",
		"Check agent session recovery skills for updated checkpoint restoration flags.",
	],
	event_bus: [
		"Update 'Event Bus & Message Topology' wiki chapter with all active topic names.",
		"Document reactive stream lifecycle and backpressure handling in streaming docs.",
		"Audit event subscriber agent skills for deprecated event topic listeners.",
	],
	config_parser: [
		"Update 'Configuration Schema & Presets' wiki chapter with new configuration keys.",
		"Revise root CLI README and man pages for altered command-line flags.",
		"Update config validation skill recipes to verify new mandatory options.",
	],
	crypto_exchange: [
		"Update 'Cryptographic Architecture & Key Exchange' wiki chapter with cipher suite spec.",
		"Audit wire security docs to verify envelope verification formulas.",
		"Review key rotation automated skills for compatibility with new handshake keys.",
	],
	external_adapter: [
		"Update 'Third-Party Provider Adapters' wiki chapter with supported model mappings.",
		"Document fallback chains and circuit breaker states in provider resilience docs.",
		"Update custom provider scaffolding skills with new adapter interface methods.",
	],
};

/**
 * Map affected modules, wiki chapters, knowledge cards, and agent skills for a target.
 */
export function mapAffectedModulesAndChapters(
	target: ImpactTargetType,
	options?: ChapterMappingOptions,
): AffectedArtifactsMapping {
	const meta = TARGET_METADATA_REGISTRY[target];

	const wikiChapters = [
		...meta.affectedWikiChapters.map((c) => ({
			...c,
			needsRevision: true,
		})),
		...(options?.extraWikiChapters?.map((c) => ({ ...c, needsRevision: true })) ?? []),
	];

	const knowledgeCards = meta.knowledgeCards.map((k) => ({
		...k,
		action: "update_signature" as const,
	}));

	// Calculate staleness risk: base 30 + 15 per chapter + 10 per subsystem
	const stalenessRiskScore = Math.min(
		100,
		30 + wikiChapters.length * 15 + meta.affectedSubsystems.length * 10,
	);

	return {
		target,
		uxId: meta.uxRange.chapterMapper,
		targetName: meta.name,
		category: meta.category,
		stalenessRiskScore,
		affectedSubsystems: meta.affectedSubsystems,
		wikiChapters,
		knowledgeCards,
		agentSkills: meta.agentSkills,
		recommendations: TARGET_RECOMMENDATIONS[target] ?? [],
	};
}

// ---------------------------------------------------------------------------
// Dedicated helpers for UX-0971 to UX-0980
// ---------------------------------------------------------------------------

/** [UX-0971] Affected module and documentation mapper for shared database model interface */
export function mapDatabaseModelArtifacts(options?: ChapterMappingOptions): AffectedArtifactsMapping {
	return mapAffectedModulesAndChapters("database_model", options);
}

/** [UX-0972] Affected module and documentation mapper for central authentication middleware handler */
export function mapAuthMiddlewareArtifacts(options?: ChapterMappingOptions): AffectedArtifactsMapping {
	return mapAffectedModulesAndChapters("auth_middleware", options);
}

/** [UX-0973] Affected module and documentation mapper for core HTTP client error handling signature */
export function mapHttpClientArtifacts(options?: ChapterMappingOptions): AffectedArtifactsMapping {
	return mapAffectedModulesAndChapters("http_client", options);
}

/** [UX-0974] Affected module and documentation mapper for utility string formatting library */
export function mapStringUtilsArtifacts(options?: ChapterMappingOptions): AffectedArtifactsMapping {
	return mapAffectedModulesAndChapters("string_utils", options);
}

/** [UX-0975] Affected module and documentation mapper for global telemetry logger and tracer */
export function mapTelemetryLoggerArtifacts(options?: ChapterMappingOptions): AffectedArtifactsMapping {
	return mapAffectedModulesAndChapters("telemetry_logger", options);
}

/** [UX-0976] Affected module and documentation mapper for session state management store */
export function mapSessionStoreArtifacts(options?: ChapterMappingOptions): AffectedArtifactsMapping {
	return mapAffectedModulesAndChapters("session_store", options);
}

/** [UX-0977] Affected module and documentation mapper for event bus message dispatcher and topics */
export function mapEventBusArtifacts(options?: ChapterMappingOptions): AffectedArtifactsMapping {
	return mapAffectedModulesAndChapters("event_bus", options);
}

/** [UX-0978] Affected module and documentation mapper for configuration parser and validation schema */
export function mapConfigParserArtifacts(options?: ChapterMappingOptions): AffectedArtifactsMapping {
	return mapAffectedModulesAndChapters("config_parser", options);
}

/** [UX-0979] Affected module and documentation mapper for cryptographic key exchange protocol */
export function mapCryptoExchangeArtifacts(options?: ChapterMappingOptions): AffectedArtifactsMapping {
	return mapAffectedModulesAndChapters("crypto_exchange", options);
}

/** [UX-0980] Affected module and documentation mapper for third-party external API integration adapter */
export function mapExternalAdapterArtifacts(options?: ChapterMappingOptions): AffectedArtifactsMapping {
	return mapAffectedModulesAndChapters("external_adapter", options);
}

/**
 * Render affected artifacts mapping for terminal display.
 */
export function renderChapterMappingTerminal(mapping: AffectedArtifactsMapping): string[] {
	const lines: string[] = [];
	lines.push(`📚 Artifact & Chapter Mapper [${mapping.uxId}]: ${mapping.targetName}`);
	lines.push(`Category: ${mapping.category} | Documentation Staleness Risk: ${mapping.stalenessRiskScore}/100`);
	lines.push("");

	lines.push(`📖 Affected Wiki Chapters (${mapping.wikiChapters.length}):`);
	for (const ch of mapping.wikiChapters) {
		lines.push(`  • [${ch.id}] "${ch.title}" (${ch.file})`);
		lines.push(`    ↳ Section to update: "${ch.sectionToUpdate}"`);
	}

	lines.push("");
	lines.push(`🧩 Subsystem Dependencies (${mapping.affectedSubsystems.length}):`);
	for (const sub of mapping.affectedSubsystems) {
		lines.push(`  • ${sub.name} [Criticality: ${sub.criticality.toUpperCase()}] - ${sub.relationship}`);
	}

	lines.push("");
	lines.push(`🗂️ Knowledge Cards (${mapping.knowledgeCards.length}):`);
	for (const card of mapping.knowledgeCards) {
		lines.push(`  • [${card.id}] ${card.title} (Action: ${card.action})`);
	}

	lines.push("");
	lines.push(`🤖 Agent Skills (${mapping.agentSkills.length}):`);
	for (const skill of mapping.agentSkills) {
		lines.push(`  • ${skill.name} (${skill.path}): ${skill.impactDescription}`);
	}

	lines.push("");
	lines.push("💡 Recommendations:");
	for (const rec of mapping.recommendations) {
		lines.push(`  → ${rec}`);
	}

	return lines;
}

/**
 * Render affected artifacts mapping as markdown.
 */
export function renderChapterMappingMarkdown(mapping: AffectedArtifactsMapping): string {
	const sections: string[] = [
		`### [${mapping.uxId}] Affected Module & Documentation Chapter Mapper: ${mapping.targetName}`,
		`- **Category**: ${mapping.category}`,
		`- **Staleness Risk Score**: \`${mapping.stalenessRiskScore}/100\``,
		"",
		"#### Wiki Documentation Chapters Requiring Revision",
		...mapping.wikiChapters.map(
			(ch) => `- 📄 **${ch.title}** (\`${ch.file}\`)\n  - Section: _${ch.sectionToUpdate}_`,
		),
		"",
		"#### Impacted Subsystems",
		...mapping.affectedSubsystems.map(
			(sub) => `- 📦 **${sub.name}** (\`${sub.path}\`): ${sub.relationship} (Priority: \`${sub.criticality}\`)`,
		),
		"",
		"#### Knowledge Cards",
		...mapping.knowledgeCards.map((k) => `- 🗃️ **${k.title}** (\`${k.id}\`) — Action: \`${k.action}\``),
		"",
		"#### Agent Skills",
		...mapping.agentSkills.map((s) => `- ⚡ **${s.name}** (\`${s.path}\`): ${s.impactDescription}`),
		"",
		"#### Actionable Recommendations",
		...mapping.recommendations.map((r) => `- 💡 ${r}`),
	];

	return sections.join("\n");
}
