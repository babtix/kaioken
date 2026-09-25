/**
 * breaking_card.ts — Breaking change impact card generator (UX-0951–UX-0960).
 * Summarizes the cascading consequences of altering core architectural components.
 *
 * Invariant: 100% offline-testable with defensive error boundaries.
 */

import {
	type BreakingCardOptions,
	type BreakingImpactCard,
	type ImpactSeverity,
	type ImpactTargetType,
	TARGET_METADATA_REGISTRY,
} from "./types.ts";

/** Default consequence mappings for all 10 architectural targets */
const TARGET_CONSEQUENCES: Record<ImpactTargetType, { consequences: string[]; guidance: string[]; precautions: string[] }> = {
	database_model: {
		consequences: [
			"Breaks active persistence mapping across repositories and cache layers.",
			"Requires table/collection migration and dual-write schema synchronization.",
			"Deserialization crashes on legacy persisted state if fields are omitted.",
			"Invalidates downstream GraphQL/REST query projection contracts.",
		],
		guidance: [
			"Introduce optional nullable fields before making non-null transitions.",
			"Deploy non-destructive dual-write schema migration scripts before deleting columns.",
			"Update model serializers with backward-compatible fallback defaults.",
		],
		precautions: [
			"Run full database smoke test suite against simulated staging data.",
			"Verify ORM entity reflection does not throw on unmapped legacy columns.",
		],
	},
	auth_middleware: {
		consequences: [
			"Invalidates existing session JWT tokens and client authentication state.",
			"Risks bypassing access control or inadvertently locking out valid users.",
			"May drop required security claims (e.g. scopes, tenant IDs, subject headers).",
			"Disrupts RPC authentication handshake between client, server, and background workers.",
		],
		guidance: [
			"Support dual-token validation windows during authentication protocol transitions.",
			"Enforce automated smoke tests for unauthorized (401) and forbidden (403) edge cases.",
			"Preserve legacy claims mapping with deprecation warnings in authorization headers.",
		],
		precautions: [
			"Verify that session refresh tokens remain verifiable across server restarts.",
			"Conduct defensive gate check ensuring no route defaults to unauthenticated access.",
		],
	},
	http_client: {
		consequences: [
			"Downstream callers expecting status code responses may fail to catch transformed errors.",
			"Unhandled network timeouts can trigger cascading thread pool starvation.",
			"Broken retry backoff signatures may cause immediate request flooding or premature failure.",
			"Response envelope discrepancies lead to silent null dereferences.",
		],
		guidance: [
			"Expose normalized `HttpClientError` wrappers with original causes attached.",
			"Preserve `.status`, `.statusCode`, and `.responseBody` getters across iterations.",
			"Provide default exponential backoff policies with jitter.",
		],
		precautions: [
			"Verify retry loop terminates predictably on 4xx client errors.",
			"Ensure error envelopes serialize cleanly into structured log drains.",
		],
	},
	string_utils: {
		consequences: [
			"Formatting shifts alter terminal TUI line wrapping and boundary calculations.",
			"Markdown slug alterations break internal wiki hyperlinks and card permalinks.",
			"Improper unicode / emoji sanitization corrupts ANSI styling escape codes.",
			"Truncation algorithm changes truncate crucial diagnostic stack lines.",
		],
		guidance: [
			"Maintain idempotent behavior on already-formatted strings.",
			"Add regression test cases for multibyte characters, ANSI escape codes, and zero-width spaces.",
			"Provide configurable ellipsis markers (`...` vs `…`).",
		],
		precautions: [
			"Verify TUI render width calculations remain integer-exact across terminal sizes.",
			"Check that slug generators retain URL-safe alphanumeric characters.",
		],
	},
	telemetry_logger: {
		consequences: [
			"Loss of distributed span context across asynchronous microtask boundaries.",
			"Dropping structured log attributes impairs production observability and alert triggers.",
			"Excessive trace volume caused by logger signature changes leads to memory leaks.",
			"Uncaught exceptions within logging paths crash critical user workflows.",
		],
		guidance: [
			"Wrap trace emit calls in fail-soft error boundaries that never throw to caller.",
			"Preserve semantic convention field names (`traceId`, `spanId`, `timestamp`, `level`).",
			"Provide batching and sampling rate toggles for high-throughput instrumentation.",
		],
		precautions: [
			"Ensure synchronous logging overhead remains under 5 microseconds per call.",
			"Validate that sensitive credentials and PII are redacted prior to serialization.",
		],
	},
	session_store: {
		consequences: [
			"In-flight agent step checkpoints become unreadable, triggering state reset.",
			"Undo/redo history trees become orphaned or desynchronized from the editor UI.",
			"SQLite state schema mismatches cause locking errors or failed startup migrations.",
			"Client-server session state reconciliation drops unsaved user message deltas.",
		],
		guidance: [
			"Implement versioned snapshot format migration wrappers (`v1` → `v2`).",
			"Store write-ahead log deltas alongside snapshots for point-in-time recovery.",
			"Safely fallback to read-only in-memory storage if persistent store fails to mount.",
		],
		precautions: [
			"Run durability crash simulation verifying checkpoint integrity upon SIGKILL.",
			"Ensure transaction rollback leaves database state clean and non-corrupted.",
		],
	},
	event_bus: {
		consequences: [
			"Subscribers missing topic payload updates silently fail to react to system events.",
			"Mismatched event envelope types cause JSON parsing errors in listeners.",
			"Out-of-order dispatch disrupts sequential state machines in agent task loops.",
			"Memory leaks occur if event listeners fail to unsubscribe on component teardown.",
		],
		guidance: [
			"Define strictly-typed event schemas with discriminated union payloads.",
			"Support wildcard topic subscriptions with backward-compatible topic aliases.",
			"Provide automatic subscriber cleanup upon AbortSignal trigger or channel close.",
		],
		precautions: [
			"Measure dispatch latency to ensure zero event queue backpressure under load.",
			"Isolate listener errors so one failing handler does not abort sibling handlers.",
		],
	},
	config_parser: {
		consequences: [
			"Strict validation rejections prevent CLI launch with existing configuration files.",
			"Renamed configuration keys silently default to unexpected baseline settings.",
			"Environment variable override precedence changes cause deployment discrepancies.",
			"Lack of helpful validation error messages leaves users unable to fix syntax errors.",
		],
		guidance: [
			"Support deprecated key aliasing with clear terminal warning notices.",
			"Emit human-friendly validation diffs highlighting exact file lines and valid options.",
			"Provide schema migration commands to automatically upgrade `.kaioken` configs.",
		],
		precautions: [
			"Validate that absent optional keys always populate deterministic default fallbacks.",
			"Ensure config parser runs synchronously in <10ms during application bootstrap.",
		],
	},
	crypto_exchange: {
		consequences: [
			"Protocol mismatch causes complete loss of client-server encrypted communication.",
			"Changed signature verification schemes reject all in-transit authenticated packets.",
			"Insecure fallback defaults compromise cryptographic integrity.",
			"Nonce reuse or IV generation bugs expose encrypted payloads to replay attacks.",
		],
		guidance: [
			"Implement versioned protocol negotiation during handshake establishment.",
			"Retain support for preceding cryptographic cipher suite during rotation window.",
			"Follow NIST-compliant key derivation functions (e.g. HKDF-SHA256, ECDH P-256).",
		],
		precautions: [
			"Run timing-attack resistance tests on signature verification routines.",
			"Zeroize sensitive private keys and shared secrets immediately after key agreement.",
		],
	},
	external_adapter: {
		consequences: [
			"Third-party provider API contract alterations result in failed completions.",
			"Rate limit header changes cause unhandled 429 throttling errors.",
			"Streaming chunk normalization bugs cause truncated terminal responses.",
			"Model pricing parameter mismatches lead to inaccurate token cost accounting.",
		],
		guidance: [
			"Isolate each provider adapter behind a unified `ExternalApiAdapter` interface.",
			"Implement automatic retry with exponential backoff on retryable 429/503 errors.",
			"Provide offline mock responses when provider credentials are absent.",
		],
		precautions: [
			"Validate that provider credential secrets never leak into error logs.",
			"Ensure streaming chunks stream with zero-buffering perceptual latency.",
		],
	},
};

/**
 * Generate a comprehensive breaking change impact card for any target component.
 */
export function generateBreakingImpactCard(
	target: ImpactTargetType,
	options?: BreakingCardOptions,
): BreakingImpactCard {
	const meta = TARGET_METADATA_REGISTRY[target];
	const defaults = TARGET_CONSEQUENCES[target];

	const severity: ImpactSeverity = options?.severityOverride ?? meta.criticality;
	const blastRadiusScore = severity === "critical" ? 85 : severity === "high" ? 65 : severity === "medium" ? 40 : 15;

	const directDependents = options?.customDependents ?? meta.affectedSubsystems.map((s) => s.path);
	const indirectDependents = meta.affectedWikiChapters.map((c) => c.file);

	return {
		target,
		uxId: meta.uxRange.breakingCard,
		title: `Breaking Change Impact: ${meta.name}`,
		category: meta.category,
		tier: meta.tier,
		severity,
		blastRadiusScore,
		componentPath: meta.defaultPath,
		primarySymbols: meta.defaultSymbols,
		breakingConsequences: options?.customConsequences ?? defaults.consequences,
		directDependents,
		indirectDependents,
		migrationGuidance: options?.customMigrationGuidance ?? defaults.guidance,
		defensivePrecautions: defaults.precautions,
	};
}

// ---------------------------------------------------------------------------
// Dedicated helpers for UX-0951 to UX-0960
// ---------------------------------------------------------------------------

/** [UX-0951] Breaking change impact card for shared database model interface */
export function generateDatabaseModelImpactCard(options?: BreakingCardOptions): BreakingImpactCard {
	return generateBreakingImpactCard("database_model", options);
}

/** [UX-0952] Breaking change impact card for central authentication middleware handler */
export function generateAuthMiddlewareImpactCard(options?: BreakingCardOptions): BreakingImpactCard {
	return generateBreakingImpactCard("auth_middleware", options);
}

/** [UX-0953] Breaking change impact card for core HTTP client error handling signature */
export function generateHttpClientImpactCard(options?: BreakingCardOptions): BreakingImpactCard {
	return generateBreakingImpactCard("http_client", options);
}

/** [UX-0954] Breaking change impact card for utility string formatting library */
export function generateStringUtilsImpactCard(options?: BreakingCardOptions): BreakingImpactCard {
	return generateBreakingImpactCard("string_utils", options);
}

/** [UX-0955] Breaking change impact card for global telemetry logger and tracer */
export function generateTelemetryLoggerImpactCard(options?: BreakingCardOptions): BreakingImpactCard {
	return generateBreakingImpactCard("telemetry_logger", options);
}

/** [UX-0956] Breaking change impact card for session state management store */
export function generateSessionStoreImpactCard(options?: BreakingCardOptions): BreakingImpactCard {
	return generateBreakingImpactCard("session_store", options);
}

/** [UX-0957] Breaking change impact card for event bus message dispatcher and topics */
export function generateEventBusImpactCard(options?: BreakingCardOptions): BreakingImpactCard {
	return generateBreakingImpactCard("event_bus", options);
}

/** [UX-0958] Breaking change impact card for configuration parser and validation schema */
export function generateConfigParserImpactCard(options?: BreakingCardOptions): BreakingImpactCard {
	return generateBreakingImpactCard("config_parser", options);
}

/** [UX-0959] Breaking change impact card for cryptographic key exchange protocol */
export function generateCryptoExchangeImpactCard(options?: BreakingCardOptions): BreakingImpactCard {
	return generateBreakingImpactCard("crypto_exchange", options);
}

/** [UX-0960] Breaking change impact card for third-party external API integration adapter */
export function generateExternalAdapterImpactCard(options?: BreakingCardOptions): BreakingImpactCard {
	return generateBreakingImpactCard("external_adapter", options);
}

/**
 * Render breaking change impact card for terminal display with ANSI/box styling.
 */
export function renderBreakingCardTerminal(card: BreakingImpactCard): string[] {
	const lines: string[] = [];
	const border = "─".repeat(70);

	const severityBadge =
		card.severity === "critical"
			? "🔴 [CRITICAL SEVERITY]"
			: card.severity === "high"
				? "🟠 [HIGH SEVERITY]"
				: card.severity === "medium"
					? "🟡 [MEDIUM SEVERITY]"
					: "🟢 [LOW SEVERITY]";

	lines.push(`┌${border}┐`);
	lines.push(`│ ${card.title.padEnd(68)} │`);
	lines.push(`│ Feature Ref: [${card.uxId}] | Tier: ${card.tier.padEnd(41)} │`);
	lines.push(`│ ${severityBadge} Blast Radius: ${card.blastRadiusScore}/100${"".padEnd(32)} │`);
	lines.push(`├${border}┤`);
	lines.push(`│ Component Path: ${card.componentPath.padEnd(50)} │`);
	lines.push(`│ Symbols: ${card.primarySymbols.slice(0, 3).join(", ").padEnd(57)} │`);
	lines.push(`├${border}┤`);
	lines.push(`│ ⚠️  Cascading Consequences:${"".padEnd(41)} │`);
	for (const item of card.breakingConsequences) {
		lines.push(`│   • ${item.padEnd(64)} │`);
	}
	lines.push(`├${border}┤`);
	lines.push(`│ 🛠️  Migration & Defensive Guidance:${"".padEnd(33)} │`);
	for (const guide of card.migrationGuidance) {
		lines.push(`│   → ${guide.padEnd(64)} │`);
	}
	lines.push(`├${border}┤`);
	lines.push(`│ Direct Dependents (${card.directDependents.length}): ${card.directDependents.slice(0, 2).join(", ").padEnd(44)} │`);
	lines.push(`└${border}┘`);

	return lines;
}

/**
 * Render breaking change impact card as structured markdown.
 */
export function renderBreakingCardMarkdown(card: BreakingImpactCard): string {
	const sections: string[] = [
		`### [${card.uxId}] ${card.title}`,
		`- **Category**: ${card.category} | **Tier**: ${card.tier}`,
		`- **Severity**: \`${card.severity.toUpperCase()}\` | **Blast Radius**: \`${card.blastRadiusScore}/100\``,
		`- **Target File**: \`${card.componentPath}\``,
		`- **Key Symbols**: ${card.primarySymbols.map((s) => `\`${s}\``).join(", ")}`,
		"",
		"#### Cascading Consequences",
		...card.breakingConsequences.map((c) => `- ⚠️ ${c}`),
		"",
		"#### Migration Guidance",
		...card.migrationGuidance.map((g) => `- 🛠️ ${g}`),
		"",
		"#### Defensive Precautions",
		...card.defensivePrecautions.map((p) => `- 🛡️ ${p}`),
		"",
		"#### Downstream Dependents",
		...card.directDependents.map((d) => `- 📦 \`${d}\``),
	];

	return sections.join("\n");
}
