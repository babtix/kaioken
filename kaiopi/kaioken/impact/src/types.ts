/**
 * types.ts — Step 24 Type definitions for Impact Analysis & Blast Radius Prediction.
 * Covers 10 architectural components across 5 critical analysis capabilities (UX-0951–UX-1000).
 *
 * Invariant: 100% offline-testable with defensive error boundaries and zero network calls.
 */

export type ImpactTargetType =
	| "database_model"
	| "auth_middleware"
	| "http_client"
	| "string_utils"
	| "telemetry_logger"
	| "session_store"
	| "event_bus"
	| "config_parser"
	| "crypto_exchange"
	| "external_adapter";

export type ImpactSeverity = "low" | "medium" | "high" | "critical";

export interface TargetMetadata {
	id: ImpactTargetType;
	uxRange: {
		breakingCard: string;
		safeRename: string;
		chapterMapper: string;
		mermaidGraph: string;
		preCommitGate: string;
	};
	name: string;
	category: string;
	defaultPath: string;
	defaultSymbols: string[];
	description: string;
	tier: string;
	primaryEdgeLabel: string;
	criticality: ImpactSeverity;
	affectedWikiChapters: Array<{ id: string; title: string; file: string; sectionToUpdate: string }>;
	affectedSubsystems: Array<{ name: string; path: string; criticality: "high" | "medium" | "low"; relationship: string }>;
	knowledgeCards: Array<{ id: string; title: string; category: string }>;
	agentSkills: Array<{ name: string; path: string; impactDescription: string }>;
}

export const TARGET_METADATA_REGISTRY: Record<ImpactTargetType, TargetMetadata> = {
	database_model: {
		id: "database_model",
		uxRange: {
			breakingCard: "UX-0951",
			safeRename: "UX-0961",
			chapterMapper: "UX-0971",
			mermaidGraph: "UX-0981",
			preCommitGate: "UX-0991",
		},
		name: "Shared Database Model Interface",
		category: "Storage & Persistence",
		defaultPath: "kaioken/plan/src/cards.ts",
		defaultSymbols: ["DatabaseModel", "UserRecord", "EntitySchema", "Repository"],
		description: "Shared schema and entity persistence interfaces governing database queries, migrations, and serialization.",
		tier: "Visual Polish & Aesthetics",
		primaryEdgeLabel: "query/persist",
		criticality: "critical",
		affectedWikiChapters: [
			{ id: "database-architecture", title: "Database Architecture & Schemas", file: "docs/wiki/database.md", sectionToUpdate: "Model Interfaces & Mappings" },
			{ id: "persistence-layer", title: "Persistence Layer & Migrations", file: "docs/wiki/persistence.md", sectionToUpdate: "Schema Migrations" },
		],
		affectedSubsystems: [
			{ name: "kaioken/plan", path: "kaioken/plan", criticality: "high", relationship: "Stores plan nodes and card definitions" },
			{ name: "kaioken/provenance", path: "kaioken/provenance", criticality: "medium", relationship: "Tracks schema freshness and truth drift" },
		],
		knowledgeCards: [
			{ id: "card-storage-schema", title: "Database Model Contract", category: "Persistence" },
		],
		agentSkills: [
			{ name: "migrate-database-schema", path: "skills/migrate-database.md", impactDescription: "Requires updated migration scripts when schema alters" },
		],
	},
	auth_middleware: {
		id: "auth_middleware",
		uxRange: {
			breakingCard: "UX-0952",
			safeRename: "UX-0962",
			chapterMapper: "UX-0972",
			mermaidGraph: "UX-0982",
			preCommitGate: "UX-0992",
		},
		name: "Central Authentication Middleware Handler",
		category: "Security & Access Control",
		defaultPath: ".pi/extensions/kaioken/auth.ts",
		defaultSymbols: ["authMiddleware", "verifyJwtToken", "AuthContext", "requirePermission"],
		description: "Central authentication and authorization pipeline validating identity tokens, session claims, and role permissions.",
		tier: "Real-Time Terminal Streaming",
		primaryEdgeLabel: "authorize/guard",
		criticality: "critical",
		affectedWikiChapters: [
			{ id: "security-handbook", title: "Authentication & Security Model", file: "docs/wiki/security.md", sectionToUpdate: "Middleware Pipeline" },
			{ id: "api-gateway", title: "Gateway Route Protection", file: "docs/wiki/gateway.md", sectionToUpdate: "Token Verification" },
		],
		affectedSubsystems: [
			{ name: "kaioken/serve", path: "kaioken/serve", criticality: "high", relationship: "Guards web UI and API endpoints" },
			{ name: "packages/server", path: "packages/server", criticality: "high", relationship: "Validates incoming RPC calls" },
		],
		knowledgeCards: [
			{ id: "card-auth-pipeline", title: "Auth Middleware Pipeline", category: "Security" },
		],
		agentSkills: [
			{ name: "configure-auth-provider", path: "skills/auth-config.md", impactDescription: "Updates authentication token configuration" },
		],
	},
	http_client: {
		id: "http_client",
		uxRange: {
			breakingCard: "UX-0953",
			safeRename: "UX-0963",
			chapterMapper: "UX-0973",
			mermaidGraph: "UX-0983",
			preCommitGate: "UX-0993",
		},
		name: "Core HTTP Client Error Handling Signature",
		category: "Networking & Resilience",
		defaultPath: "kaioken/research/src/client.ts",
		defaultSymbols: ["HttpClientError", "handleHttpError", "FetchInterceptor", "retryWithBackoff"],
		description: "Standardized HTTP communication layer handling network status codes, backoff retries, and error envelopes.",
		tier: "Performance & Low-Latency",
		primaryEdgeLabel: "retry/handle",
		criticality: "high",
		affectedWikiChapters: [
			{ id: "networking-architecture", title: "HTTP Client & Resilience Protocols", file: "docs/wiki/networking.md", sectionToUpdate: "Error Handlers" },
			{ id: "external-integrations", title: "Egress Communication", file: "docs/wiki/integrations.md", sectionToUpdate: "Retry Policies" },
		],
		affectedSubsystems: [
			{ name: "kaioken/research", path: "kaioken/research", criticality: "high", relationship: "Performs outbound research requests" },
			{ name: "kaioken/modelport", path: "kaioken/modelport", criticality: "high", relationship: "Executes LLM endpoint queries" },
		],
		knowledgeCards: [
			{ id: "card-http-resilience", title: "HTTP Client Error Envelope", category: "Network" },
		],
		agentSkills: [
			{ name: "http-diagnostic", path: "skills/http-diagnostics.md", impactDescription: "Diagnoses failing external API calls" },
		],
	},
	string_utils: {
		id: "string_utils",
		uxRange: {
			breakingCard: "UX-0954",
			safeRename: "UX-0964",
			chapterMapper: "UX-0974",
			mermaidGraph: "UX-0984",
			preCommitGate: "UX-0994",
		},
		name: "Utility String Formatting Library",
		category: "Foundations & Utilities",
		defaultPath: "packages/chord/src/string.ts",
		defaultSymbols: ["formatTemplate", "truncateWithEllipsis", "slugifyIdentifier", "sanitizeUserInput"],
		description: "Foundational string manipulation utilities handling template interpolation, truncation, sanitization, and slugification.",
		tier: "Resilience & Fail-Soft Recovery",
		primaryEdgeLabel: "format/render",
		criticality: "medium",
		affectedWikiChapters: [
			{ id: "utility-libraries", title: "Shared Utilities & Helpers", file: "docs/wiki/utilities.md", sectionToUpdate: "String Formatting" },
		],
		affectedSubsystems: [
			{ name: "packages/tui", path: "packages/tui", criticality: "medium", relationship: "Truncates and renders terminal labels" },
			{ name: "kaioken/wiki", path: "kaioken/wiki", criticality: "medium", relationship: "Generates chapter slugs and markdown formatting" },
		],
		knowledgeCards: [
			{ id: "card-string-utils", title: "String Formatter Utility API", category: "Utilities" },
		],
		agentSkills: [
			{ name: "format-code-snippet", path: "skills/code-formatter.md", impactDescription: "Formats generated code snippets and markdown" },
		],
	},
	telemetry_logger: {
		id: "telemetry_logger",
		uxRange: {
			breakingCard: "UX-0955",
			safeRename: "UX-0965",
			chapterMapper: "UX-0975",
			mermaidGraph: "UX-0985",
			preCommitGate: "UX-0995",
		},
		name: "Global Telemetry Logger and Tracer",
		category: "Observability & Diagnostics",
		defaultPath: "packages/telemetry/src/logger.ts",
		defaultSymbols: ["telemetryLogger", "traceSpan", "recordMetricEvent", "LogLevel"],
		description: "Distributed telemetry logging and span tracing system recording diagnostic events, latencies, and operational metrics.",
		tier: "Developer Ergonomics",
		primaryEdgeLabel: "emit/span",
		criticality: "high",
		affectedWikiChapters: [
			{ id: "observability-guide", title: "Telemetry & Distributed Tracing", file: "docs/wiki/telemetry.md", sectionToUpdate: "Span Emitters" },
			{ id: "audit-logging", title: "Audit Trail & Structured Logging", file: "docs/wiki/audit.md", sectionToUpdate: "Logger Signatures" },
		],
		affectedSubsystems: [
			{ name: "packages/telemetry", path: "packages/telemetry", criticality: "high", relationship: "Core provider of log pipelines" },
			{ name: "kaioken/verify", path: "kaioken/verify", criticality: "medium", relationship: "Records verification benchmarks and gate timings" },
		],
		knowledgeCards: [
			{ id: "card-telemetry-tracer", title: "Telemetry Logger & Spans", category: "Observability" },
		],
		agentSkills: [
			{ name: "trace-session-latency", path: "skills/trace-latency.md", impactDescription: "Extracts span traces for slow operations" },
		],
	},
	session_store: {
		id: "session_store",
		uxRange: {
			breakingCard: "UX-0956",
			safeRename: "UX-0966",
			chapterMapper: "UX-0976",
			mermaidGraph: "UX-0986",
			preCommitGate: "UX-0996",
		},
		name: "Session State Management Store",
		category: "Session & State Synchronization",
		defaultPath: "packages/session-backends/sqlite-node/src/store.ts",
		defaultSymbols: ["SessionStore", "getSessionState", "persistSessionDelta", "SessionSnapshot"],
		description: "Durable state storage engine maintaining active chat messages, agent step checkpoints, and undo/redo stacks.",
		tier: "Visual Polish & Aesthetics",
		primaryEdgeLabel: "commit/snapshot",
		criticality: "critical",
		affectedWikiChapters: [
			{ id: "session-state-engine", title: "Session Architecture & Replay", file: "docs/wiki/session.md", sectionToUpdate: "State Transitions" },
			{ id: "durable-checkpoints", title: "Durable Checkpointing Protocol", file: "docs/wiki/checkpoints.md", sectionToUpdate: "Snapshots" },
		],
		affectedSubsystems: [
			{ name: "packages/durable", path: "packages/durable", criticality: "high", relationship: "Coordinates crash recovery and snapshots" },
			{ name: "packages/agent", path: "packages/agent", criticality: "high", relationship: "Restores step history and working context" },
		],
		knowledgeCards: [
			{ id: "card-session-store", title: "Session Store State Engine", category: "State" },
		],
		agentSkills: [
			{ name: "recover-session", path: "skills/session-recovery.md", impactDescription: "Restores corrupted or orphaned session states" },
		],
	},
	event_bus: {
		id: "event_bus",
		uxRange: {
			breakingCard: "UX-0957",
			safeRename: "UX-0967",
			chapterMapper: "UX-0977",
			mermaidGraph: "UX-0987",
			preCommitGate: "UX-0997",
		},
		name: "Event Bus Message Dispatcher and Topics",
		category: "Message Dispatch & Reactive Streams",
		defaultPath: "packages/chord/src/bus.ts",
		defaultSymbols: ["EventBusDispatcher", "publishEvent", "subscribeTopic", "EventEnvelope"],
		description: "Decoupled asynchronous event broker publishing system notifications, file system watchers, and UI updates.",
		tier: "Real-Time Terminal Streaming",
		primaryEdgeLabel: "publish/dispatch",
		criticality: "high",
		affectedWikiChapters: [
			{ id: "event-driven-architecture", title: "Event Bus & Message Topology", file: "docs/wiki/event-bus.md", sectionToUpdate: "Topic Definitions" },
			{ id: "streaming-protocols", title: "Reactive Event Streaming", file: "docs/wiki/streaming.md", sectionToUpdate: "Dispatcher Protocols" },
		],
		affectedSubsystems: [
			{ name: "packages/chord", path: "packages/chord", criticality: "high", relationship: "Underlying publisher/subscriber core" },
			{ name: ".pi/extensions/kaioken", path: ".pi/extensions/kaioken", criticality: "medium", relationship: "Receives file system and verify events" },
		],
		knowledgeCards: [
			{ id: "card-event-bus", title: "Event Bus Topic Topologies", category: "Messaging" },
		],
		agentSkills: [
			{ name: "subscribe-audit-events", path: "skills/event-subscriber.md", impactDescription: "Listens for real-time audit messages" },
		],
	},
	config_parser: {
		id: "config_parser",
		uxRange: {
			breakingCard: "UX-0958",
			safeRename: "UX-0968",
			chapterMapper: "UX-0978",
			mermaidGraph: "UX-0988",
			preCommitGate: "UX-0998",
		},
		name: "Configuration Parser and Validation Schema",
		category: "Configuration & Schema Enforcement",
		defaultPath: "kaioken/scan/src/config.ts",
		defaultSymbols: ["ConfigParserSchema", "validateProjectConfig", "loadConfigWithDefaults", "ProjectConfig"],
		description: "Type-safe parser and validator enforcing configuration schemas across .kaioken and command-line flags.",
		tier: "Performance & Low-Latency",
		primaryEdgeLabel: "validate/parse",
		criticality: "high",
		affectedWikiChapters: [
			{ id: "configuration-spec", title: "Configuration Schema & Presets", file: "docs/wiki/config.md", sectionToUpdate: "Validation Rules" },
			{ id: "cli-options", title: "CLI Options & Defaults", file: "docs/wiki/cli.md", sectionToUpdate: "Parser Flags" },
		],
		affectedSubsystems: [
			{ name: "kaioken/scan", path: "kaioken/scan", criticality: "high", relationship: "Reads repo scan boundaries and ignore globs" },
			{ name: "kaioken/verify", path: "kaioken/verify", criticality: "high", relationship: "Parses .kaioken/verify.json suites" },
		],
		knowledgeCards: [
			{ id: "card-config-schema", title: "Config Validation Schema", category: "Config" },
		],
		agentSkills: [
			{ name: "validate-config-file", path: "skills/validate-config.md", impactDescription: "Checks local config for syntax and schema violations" },
		],
	},
	crypto_exchange: {
		id: "crypto_exchange",
		uxRange: {
			breakingCard: "UX-0959",
			safeRename: "UX-0969",
			chapterMapper: "UX-0979",
			mermaidGraph: "UX-0989",
			preCommitGate: "UX-0999",
		},
		name: "Cryptographic Key Exchange Protocol",
		category: "Cryptography & Handshakes",
		defaultPath: "packages/protocol/src/crypto.ts",
		defaultSymbols: ["CryptoKeyExchange", "deriveSessionKey", "signPayloadEnvelope", "verifySignature"],
		description: "Secure cryptographic key derivation, payload signing, and identity verification between client and server nodes.",
		tier: "Resilience & Fail-Soft Recovery",
		primaryEdgeLabel: "encrypt/verify",
		criticality: "critical",
		affectedWikiChapters: [
			{ id: "cryptography-protocol", title: "Cryptographic Architecture & Key Exchange", file: "docs/wiki/crypto.md", sectionToUpdate: "Key Exchange Handshake" },
			{ id: "transit-security", title: "Wire Encryption & Verification", file: "docs/wiki/wire-security.md", sectionToUpdate: "Payload Signatures" },
		],
		affectedSubsystems: [
			{ name: "packages/protocol", path: "packages/protocol", criticality: "high", relationship: "Defines wire message crypto envelopes" },
			{ name: "packages/client", path: "packages/client", criticality: "high", relationship: "Signs client messages and decrypts responses" },
		],
		knowledgeCards: [
			{ id: "card-crypto-protocol", title: "Cryptographic Key Exchange Handshake", category: "Security" },
		],
		agentSkills: [
			{ name: "rotate-crypto-keys", path: "skills/rotate-keys.md", impactDescription: "Executes automated key rotation procedures" },
		],
	},
	external_adapter: {
		id: "external_adapter",
		uxRange: {
			breakingCard: "UX-0960",
			safeRename: "UX-0970",
			chapterMapper: "UX-0980",
			mermaidGraph: "UX-0990",
			preCommitGate: "UX-1000",
		},
		name: "Third-Party External API Integration Adapter",
		category: "Extensibility & Third-Party Bridges",
		defaultPath: "packages/ai/src/providers/adapter.ts",
		defaultSymbols: ["ExternalApiAdapter", "callExternalProvider", "AdapterRequestEnvelope", "ProviderCredentials"],
		description: "Unified provider abstraction standardizing third-party AI, LLM, search, and cloud vendor integration protocols.",
		tier: "Developer Ergonomics",
		primaryEdgeLabel: "proxy/adapt",
		criticality: "high",
		affectedWikiChapters: [
			{ id: "provider-adapters", title: "Third-Party Provider Adapters", file: "docs/wiki/adapters.md", sectionToUpdate: "Adapter Interface Contracts" },
			{ id: "fallback-resilience", title: "Multi-Provider Fallbacks & Rate Limits", file: "docs/wiki/fallbacks.md", sectionToUpdate: "Error Transposition" },
		],
		affectedSubsystems: [
			{ name: "packages/ai", path: "packages/ai", criticality: "high", relationship: "Adapts Anthropic, OpenAI, Gemini, Ollama APIs" },
			{ name: "kaioken/modelport", path: "kaioken/modelport", criticality: "medium", relationship: "Calculates provider token consumption costs" },
		],
		knowledgeCards: [
			{ id: "card-external-adapter", title: "External API Adapter Bridge", category: "Integration" },
		],
		agentSkills: [
			{ name: "add-custom-provider", path: "skills/add-provider.md", impactDescription: "Scaffolds new third-party provider integration adapter" },
		],
	},
};

// ---------------------------------------------------------------------------
// Group 1: Breaking Change Impact Card Types (UX-0951–UX-0960)
// ---------------------------------------------------------------------------

export interface BreakingImpactCard {
	target: ImpactTargetType;
	uxId: string;
	title: string;
	category: string;
	tier: string;
	severity: ImpactSeverity;
	blastRadiusScore: number;
	componentPath: string;
	primarySymbols: string[];
	breakingConsequences: string[];
	directDependents: string[];
	indirectDependents: string[];
	migrationGuidance: string[];
	defensivePrecautions: string[];
}

export interface BreakingCardOptions {
	customConsequences?: string[];
	customMigrationGuidance?: string[];
	customDependents?: string[];
	severityOverride?: ImpactSeverity;
}

// ---------------------------------------------------------------------------
// Group 2: Safe-Rename Simulation Report Types (UX-0961–UX-0970)
// ---------------------------------------------------------------------------

export interface TargetCallsiteEntry {
	path: string;
	lines: number[];
	snippets: string[];
	proposedChanges: Array<{
		line: number;
		before: string;
		after: string;
	}>;
}

export interface TargetRenameReport {
	target: ImpactTargetType;
	uxId: string;
	targetName: string;
	oldIdentifier: string;
	newIdentifier: string;
	totalFiles: number;
	totalOccurrences: number;
	callsites: TargetCallsiteEntry[];
	safetyChecklist: string[];
	estimatedMigrationTimeMinutes: number;
}

export interface TargetRenameOptions {
	includeDryRunReplacements?: boolean;
	additionalFiles?: string[];
	customTargetName?: string;
}

// ---------------------------------------------------------------------------
// Group 3: Affected Module and Documentation Chapter Mapper Types (UX-0971–UX-0980)
// ---------------------------------------------------------------------------

export interface AffectedArtifactsMapping {
	target: ImpactTargetType;
	uxId: string;
	targetName: string;
	category: string;
	stalenessRiskScore: number;
	affectedSubsystems: Array<{
		name: string;
		path: string;
		criticality: "high" | "medium" | "low";
		relationship: string;
	}>;
	wikiChapters: Array<{
		id: string;
		title: string;
		file: string;
		sectionToUpdate: string;
		needsRevision: boolean;
	}>;
	knowledgeCards: Array<{
		id: string;
		title: string;
		category: string;
		action: "update_signature" | "verify_claims" | "deprecate";
	}>;
	agentSkills: Array<{
		name: string;
		path: string;
		impactDescription: string;
	}>;
	recommendations: string[];
}

export interface ChapterMappingOptions {
	scanMarkdownFiles?: boolean;
	extraWikiChapters?: Array<{ id: string; title: string; file: string; sectionToUpdate: string }>;
}

// ---------------------------------------------------------------------------
// Group 4: Exportable Mermaid Graph Types (UX-0981–UX-0990)
// ---------------------------------------------------------------------------

export interface TargetMermaidOptions {
	direction?: "LR" | "TD";
	includeSubsystems?: boolean;
	includeWikiChapters?: boolean;
	maxDependentNodes?: number;
	theme?: "default" | "dark" | "forest";
}

// ---------------------------------------------------------------------------
// Group 5: Pre-Commit Impact Check & Gate Types (UX-0991–UX-1000)
// ---------------------------------------------------------------------------

export interface ApiChangeSpecification {
	target: ImpactTargetType;
	symbol: string;
	changeType: "signature_changed" | "parameter_removed" | "return_type_altered" | "method_deleted" | "field_renamed" | "contract_breakage";
	description: string;
	hasDeprecationNotice: boolean;
	hasMigrationGuide: boolean;
	gracePeriodDays?: number;
	isCoordinated: boolean;
	forceBypass?: boolean;
}

export interface ApiGateBlocker {
	uxId: string;
	target: ImpactTargetType;
	symbol: string;
	violation: string;
	remediation: string;
}

export interface ApiGateEvaluation {
	target: ImpactTargetType;
	uxId: string;
	targetName: string;
	passed: boolean;
	verdict: "APPROVED" | "BLOCKED" | "BYPASSED_WITH_WARNING";
	blockers: ApiGateBlocker[];
	warnings: string[];
	recommendations: string[];
	evaluationTimestamp: number;
}
