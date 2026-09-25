import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	generateBreakingImpactCard,
	generateDatabaseModelImpactCard,
	generateAuthMiddlewareImpactCard,
	generateHttpClientImpactCard,
	generateStringUtilsImpactCard,
	generateTelemetryLoggerImpactCard,
	generateSessionStoreImpactCard,
	generateEventBusImpactCard,
	generateConfigParserImpactCard,
	generateCryptoExchangeImpactCard,
	generateExternalAdapterImpactCard,
	renderBreakingCardTerminal,
	renderBreakingCardMarkdown,
	simulateTargetRename,
	simulateDatabaseModelRename,
	simulateAuthMiddlewareRename,
	simulateHttpClientRename,
	simulateStringUtilsRename,
	simulateTelemetryLoggerRename,
	simulateSessionStoreRename,
	simulateEventBusRename,
	simulateConfigParserRename,
	simulateCryptoExchangeRename,
	simulateExternalAdapterRename,
	renderTargetRenameReportTerminal,
	renderTargetRenameReportMarkdown,
	mapAffectedModulesAndChapters,
	mapDatabaseModelArtifacts,
	mapAuthMiddlewareArtifacts,
	mapHttpClientArtifacts,
	mapStringUtilsArtifacts,
	mapTelemetryLoggerArtifacts,
	mapSessionStoreArtifacts,
	mapEventBusArtifacts,
	mapConfigParserArtifacts,
	mapCryptoExchangeArtifacts,
	mapExternalAdapterArtifacts,
	renderChapterMappingTerminal,
	renderChapterMappingMarkdown,
	exportTargetImpactMermaid,
	exportDatabaseModelMermaid,
	exportAuthMiddlewareMermaid,
	exportHttpClientMermaid,
	exportStringUtilsMermaid,
	exportTelemetryLoggerMermaid,
	exportSessionStoreMermaid,
	exportEventBusMermaid,
	exportConfigParserMermaid,
	exportCryptoExchangeMermaid,
	exportExternalAdapterMermaid,
	checkTargetApiPreCommitGate,
	checkDatabaseModelPreCommit,
	checkAuthMiddlewarePreCommit,
	checkHttpClientPreCommit,
	checkStringUtilsPreCommit,
	checkTelemetryLoggerPreCommit,
	checkSessionStorePreCommit,
	checkEventBusPreCommit,
	checkConfigParserPreCommit,
	checkCryptoExchangePreCommit,
	checkExternalAdapterPreCommit,
	renderApiGateEvaluationTerminal,
	renderApiGateEvaluationMarkdown,
} from "../src/index.ts";

const tempRoots: string[] = [];

afterEach(async () => {
	await Promise.all(tempRoots.splice(0).map((r) => rm(r, { recursive: true, force: true })));
});

async function createTempRepo(files: Record<string, string>): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), "kaioken-step24-"));
	tempRoots.push(root);
	for (const [relPath, content] of Object.entries(files)) {
		const full = join(root, relPath);
		await mkdir(dirname(full), { recursive: true });
		await writeFile(full, content, "utf8");
	}
	return root;
}

describe("Step 24: Category 10 — Impact Analysis & Blast Radius Prediction", () => {
	// =========================================================================
	// Group 1: Breaking Change Impact Cards (UX-0951 to UX-0960)
	// =========================================================================
	describe("Group 1: Breaking Change Impact Cards (UX-0951 to UX-0960)", () => {
		it("[UX-0951] generates breaking change impact card for shared database model interface", () => {
			const card = generateDatabaseModelImpactCard();
			expect(card.uxId).toBe("UX-0951");
			expect(card.target).toBe("database_model");
			expect(card.severity).toBe("critical");
			expect(card.blastRadiusScore).toBeGreaterThanOrEqual(80);
			expect(card.breakingConsequences.join(" ")).toContain("persistence mapping");
			expect(card.primarySymbols).toContain("DatabaseModel");

			const terminalLines = renderBreakingCardTerminal(card);
			expect(terminalLines.join("\n")).toContain("UX-0951");
			expect(terminalLines.join("\n")).toContain("CRITICAL SEVERITY");

			const markdown = renderBreakingCardMarkdown(card);
			expect(markdown).toContain("### [UX-0951]");
			expect(markdown).toContain("`CRITICAL`");
		});

		it("[UX-0952] generates breaking change impact card for central authentication middleware handler", () => {
			const card = generateAuthMiddlewareImpactCard();
			expect(card.uxId).toBe("UX-0952");
			expect(card.target).toBe("auth_middleware");
			expect(card.severity).toBe("critical");
			expect(card.breakingConsequences.join(" ")).toContain("JWT tokens");
			expect(card.migrationGuidance.join(" ")).toContain("dual-token");
		});

		it("[UX-0953] generates breaking change impact card for core HTTP client error handling signature", () => {
			const card = generateHttpClientImpactCard();
			expect(card.uxId).toBe("UX-0953");
			expect(card.target).toBe("http_client");
			expect(card.severity).toBe("high");
			expect(card.breakingConsequences.join(" ")).toContain("status code");
		});

		it("[UX-0954] generates breaking change impact card for utility string formatting library", () => {
			const card = generateStringUtilsImpactCard();
			expect(card.uxId).toBe("UX-0954");
			expect(card.target).toBe("string_utils");
			expect(card.severity).toBe("medium");
			expect(card.breakingConsequences.join(" ")).toContain("terminal TUI line wrapping");
		});

		it("[UX-0955] generates breaking change impact card for global telemetry logger and tracer", () => {
			const card = generateTelemetryLoggerImpactCard();
			expect(card.uxId).toBe("UX-0955");
			expect(card.target).toBe("telemetry_logger");
			expect(card.breakingConsequences.join(" ")).toContain("distributed span context");
		});

		it("[UX-0956] generates breaking change impact card for session state management store", () => {
			const card = generateSessionStoreImpactCard();
			expect(card.uxId).toBe("UX-0956");
			expect(card.target).toBe("session_store");
			expect(card.severity).toBe("critical");
			expect(card.breakingConsequences.join(" ")).toContain("checkpoint");
		});

		it("[UX-0957] generates breaking change impact card for event bus message dispatcher and topics", () => {
			const card = generateEventBusImpactCard();
			expect(card.uxId).toBe("UX-0957");
			expect(card.target).toBe("event_bus");
			expect(card.breakingConsequences.join(" ")).toContain("topic payload updates");
		});

		it("[UX-0958] generates breaking change impact card for configuration parser and validation schema", () => {
			const card = generateConfigParserImpactCard();
			expect(card.uxId).toBe("UX-0958");
			expect(card.target).toBe("config_parser");
			expect(card.breakingConsequences.join(" ")).toContain("configuration files");
		});

		it("[UX-0959] generates breaking change impact card for cryptographic key exchange protocol", () => {
			const card = generateCryptoExchangeImpactCard();
			expect(card.uxId).toBe("UX-0959");
			expect(card.target).toBe("crypto_exchange");
			expect(card.severity).toBe("critical");
			expect(card.breakingConsequences.join(" ")).toContain("encrypted communication");
		});

		it("[UX-0960] generates breaking change impact card for third-party external API integration adapter", () => {
			const card = generateExternalAdapterImpactCard();
			expect(card.uxId).toBe("UX-0960");
			expect(card.target).toBe("external_adapter");
			expect(card.breakingConsequences.join(" ")).toContain("provider API contract");
		});
	});

	// =========================================================================
	// Group 2: Safe-Rename Simulation Reports (UX-0961 to UX-0970)
	// =========================================================================
	describe("Group 2: Safe-Rename Simulation Reports (UX-0961 to UX-0970)", () => {
		it("[UX-0961] simulates safe rename for shared database model interface", async () => {
			const root = await createTempRepo({
				"kaioken/plan/src/cards.ts": "export interface DatabaseModel {\n  id: string;\n  name: string;\n}\n",
				"kaioken/plan/src/index.ts": "import type { DatabaseModel } from './cards.ts';\nexport function useModel(m: DatabaseModel) {}\n",
			});
			const report = await simulateDatabaseModelRename(root, "DatabaseModel", "EntityDataModel");
			expect(report.uxId).toBe("UX-0961");
			expect(report.target).toBe("database_model");
			expect(report.totalFiles).toBe(2);
			expect(report.totalOccurrences).toBe(3);
			expect(report.safetyChecklist.join(" ")).toContain("database schema migration");

			const terminal = renderTargetRenameReportTerminal(report);
			expect(terminal.join("\n")).toContain("UX-0961");
			expect(terminal.join("\n")).toContain("DatabaseModel");

			const md = renderTargetRenameReportMarkdown(report);
			expect(md).toContain("### [UX-0961]");
			expect(md).toContain("diff");
		});

		it("[UX-0962] simulates safe rename for central authentication middleware handler", async () => {
			const root = await createTempRepo({
				".pi/extensions/kaioken/auth.ts": "export function authMiddleware(req: any) {}\n",
			});
			const report = await simulateAuthMiddlewareRename(root, "authMiddleware", "authenticateRequestMiddleware");
			expect(report.uxId).toBe("UX-0962");
			expect(report.totalFiles).toBe(1);
			expect(report.safetyChecklist.join(" ")).toContain("protected route definitions");
		});

		it("[UX-0963] simulates safe rename for core HTTP client error handling signature", async () => {
			const root = await createTempRepo({
				"kaioken/research/src/client.ts": "export class HttpClientError extends Error {}\n",
			});
			const report = await simulateHttpClientRename(root, "HttpClientError", "NetworkTransportError");
			expect(report.uxId).toBe("UX-0963");
			expect(report.totalFiles).toBe(1);
			expect(report.safetyChecklist.join(" ")).toContain("retry policy");
		});

		it("[UX-0964] simulates safe rename for utility string formatting library", async () => {
			const root = await createTempRepo({
				"packages/chord/src/string.ts": "export function formatTemplate(t: string): string { return t; }\n",
			});
			const report = await simulateStringUtilsRename(root, "formatTemplate", "interpolateStringTemplate");
			expect(report.uxId).toBe("UX-0964");
			expect(report.totalFiles).toBe(1);
		});

		it("[UX-0965] simulates safe rename for global telemetry logger and tracer", async () => {
			const root = await createTempRepo({
				"packages/telemetry/src/logger.ts": "export const telemetryLogger = { log: () => {} };\n",
			});
			const report = await simulateTelemetryLoggerRename(root, "telemetryLogger", "globalTelemetryTracer");
			expect(report.uxId).toBe("UX-0965");
			expect(report.totalFiles).toBe(1);
			expect(report.safetyChecklist.join(" ")).toContain("span context propagation");
		});

		it("[UX-0966] simulates safe rename for session state management store", async () => {
			const root = await createTempRepo({
				"packages/session-backends/sqlite-node/src/store.ts": "export class SessionStore {}\n",
			});
			const report = await simulateSessionStoreRename(root, "SessionStore", "SqliteSessionStore");
			expect(report.uxId).toBe("UX-0966");
			expect(report.totalFiles).toBe(1);
		});

		it("[UX-0967] simulates safe rename for event bus message dispatcher and topics", async () => {
			const root = await createTempRepo({
				"packages/chord/src/bus.ts": "export class EventBusDispatcher {}\n",
			});
			const report = await simulateEventBusRename(root, "EventBusDispatcher", "ReactiveEventDispatcher");
			expect(report.uxId).toBe("UX-0967");
			expect(report.totalFiles).toBe(1);
		});

		it("[UX-0968] simulates safe rename for configuration parser and validation schema", async () => {
			const root = await createTempRepo({
				"kaioken/scan/src/config.ts": "export function validateProjectConfig() {}\n",
			});
			const report = await simulateConfigParserRename(root, "validateProjectConfig", "enforceConfigurationSchema");
			expect(report.uxId).toBe("UX-0968");
			expect(report.totalFiles).toBe(1);
		});

		it("[UX-0969] simulates safe rename for cryptographic key exchange protocol", async () => {
			const root = await createTempRepo({
				"packages/protocol/src/crypto.ts": "export function deriveSessionKey() {}\n",
			});
			const report = await simulateCryptoExchangeRename(root, "deriveSessionKey", "negotiateSharedSessionSecret");
			expect(report.uxId).toBe("UX-0969");
			expect(report.totalFiles).toBe(1);
		});

		it("[UX-0970] simulates safe rename for third-party external API integration adapter", async () => {
			const root = await createTempRepo({
				"packages/ai/src/providers/adapter.ts": "export interface ExternalApiAdapter {}\n",
			});
			const report = await simulateExternalAdapterRename(root, "ExternalApiAdapter", "ModelProviderBridgeAdapter");
			expect(report.uxId).toBe("UX-0970");
			expect(report.totalFiles).toBe(1);
		});
	});

	// =========================================================================
	// Group 3: Affected Module and Documentation Chapter Mapper (UX-0971 to UX-0980)
	// =========================================================================
	describe("Group 3: Affected Module and Documentation Chapter Mapper (UX-0971 to UX-0980)", () => {
		it("[UX-0971] maps affected modules and documentation chapters for shared database model interface", () => {
			const mapping = mapDatabaseModelArtifacts();
			expect(mapping.uxId).toBe("UX-0971");
			expect(mapping.target).toBe("database_model");
			expect(mapping.wikiChapters.length).toBeGreaterThan(0);
			expect(mapping.affectedSubsystems.some((s) => s.name === "kaioken/plan")).toBe(true);
			expect(mapping.stalenessRiskScore).toBeGreaterThanOrEqual(50);

			const terminal = renderChapterMappingTerminal(mapping);
			expect(terminal.join("\n")).toContain("UX-0971");
			expect(terminal.join("\n")).toContain("Database Architecture");

			const md = renderChapterMappingMarkdown(mapping);
			expect(md).toContain("### [UX-0971]");
			expect(md).toContain("Wiki Documentation Chapters Requiring Revision");
		});

		it("[UX-0972] maps affected modules and documentation chapters for central authentication middleware handler", () => {
			const mapping = mapAuthMiddlewareArtifacts();
			expect(mapping.uxId).toBe("UX-0972");
			expect(mapping.wikiChapters.some((c) => c.id === "security-handbook")).toBe(true);
		});

		it("[UX-0973] maps affected modules and documentation chapters for core HTTP client error handling signature", () => {
			const mapping = mapHttpClientArtifacts();
			expect(mapping.uxId).toBe("UX-0973");
			expect(mapping.wikiChapters.some((c) => c.id === "networking-architecture")).toBe(true);
		});

		it("[UX-0974] maps affected modules and documentation chapters for utility string formatting library", () => {
			const mapping = mapStringUtilsArtifacts();
			expect(mapping.uxId).toBe("UX-0974");
			expect(mapping.affectedSubsystems.some((s) => s.name === "packages/tui")).toBe(true);
		});

		it("[UX-0975] maps affected modules and documentation chapters for global telemetry logger and tracer", () => {
			const mapping = mapTelemetryLoggerArtifacts();
			expect(mapping.uxId).toBe("UX-0975");
			expect(mapping.wikiChapters.some((c) => c.id === "observability-guide")).toBe(true);
		});

		it("[UX-0976] maps affected modules and documentation chapters for session state management store", () => {
			const mapping = mapSessionStoreArtifacts();
			expect(mapping.uxId).toBe("UX-0976");
			expect(mapping.wikiChapters.some((c) => c.id === "session-state-engine")).toBe(true);
		});

		it("[UX-0977] maps affected modules and documentation chapters for event bus message dispatcher and topics", () => {
			const mapping = mapEventBusArtifacts();
			expect(mapping.uxId).toBe("UX-0977");
			expect(mapping.wikiChapters.some((c) => c.id === "event-driven-architecture")).toBe(true);
		});

		it("[UX-0978] maps affected modules and documentation chapters for configuration parser and validation schema", () => {
			const mapping = mapConfigParserArtifacts();
			expect(mapping.uxId).toBe("UX-0978");
			expect(mapping.wikiChapters.some((c) => c.id === "configuration-spec")).toBe(true);
		});

		it("[UX-0979] maps affected modules and documentation chapters for cryptographic key exchange protocol", () => {
			const mapping = mapCryptoExchangeArtifacts();
			expect(mapping.uxId).toBe("UX-0979");
			expect(mapping.wikiChapters.some((c) => c.id === "cryptography-protocol")).toBe(true);
		});

		it("[UX-0980] maps affected modules and documentation chapters for third-party external API integration adapter", () => {
			const mapping = mapExternalAdapterArtifacts();
			expect(mapping.uxId).toBe("UX-0980");
			expect(mapping.wikiChapters.some((c) => c.id === "provider-adapters")).toBe(true);
		});
	});

	// =========================================================================
	// Group 4: Exportable Impact Graph Diagrams in Mermaid Format (UX-0981 to UX-0990)
	// =========================================================================
	describe("Group 4: Exportable Impact Graph Diagrams in Mermaid Format (UX-0981 to UX-0990)", () => {
		it("[UX-0981] exports Mermaid diagram for shared database model interface", () => {
			const mermaid = exportDatabaseModelMermaid();
			expect(mermaid).toContain("flowchart LR");
			expect(mermaid).toContain("UX-0981");
			expect(mermaid).toContain('subgraph Origin["🌱 Seed: Shared Database Model Interface"]');
			expect(mermaid).toContain('subgraph Subsystems["💥 Affected Subsystem Services"]');
			expect(mermaid).toContain('subgraph Docs["📚 Documentation & Fact Base Stale Radius"]');
			expect(mermaid).toContain("query/persist");
			expect(mermaid).toContain("classDef seed");
		});

		it("[UX-0982] exports Mermaid diagram for central authentication middleware handler", () => {
			const mermaid = exportAuthMiddlewareMermaid({ direction: "TD" });
			expect(mermaid).toContain("flowchart TD");
			expect(mermaid).toContain("UX-0982");
			expect(mermaid).toContain("authorize/guard");
		});

		it("[UX-0983] exports Mermaid diagram for core HTTP client error handling signature", () => {
			const mermaid = exportHttpClientMermaid();
			expect(mermaid).toContain("UX-0983");
			expect(mermaid).toContain("retry/handle");
		});

		it("[UX-0984] exports Mermaid diagram for utility string formatting library", () => {
			const mermaid = exportStringUtilsMermaid();
			expect(mermaid).toContain("UX-0984");
			expect(mermaid).toContain("format/render");
		});

		it("[UX-0985] exports Mermaid diagram for global telemetry logger and tracer", () => {
			const mermaid = exportTelemetryLoggerMermaid();
			expect(mermaid).toContain("UX-0985");
			expect(mermaid).toContain("emit/span");
		});

		it("[UX-0986] exports Mermaid diagram for session state management store", () => {
			const mermaid = exportSessionStoreMermaid();
			expect(mermaid).toContain("UX-0986");
			expect(mermaid).toContain("commit/snapshot");
		});

		it("[UX-0987] exports Mermaid diagram for event bus message dispatcher and topics", () => {
			const mermaid = exportEventBusMermaid();
			expect(mermaid).toContain("UX-0987");
			expect(mermaid).toContain("publish/dispatch");
		});

		it("[UX-0988] exports Mermaid diagram for configuration parser and validation schema", () => {
			const mermaid = exportConfigParserMermaid();
			expect(mermaid).toContain("UX-0988");
			expect(mermaid).toContain("validate/parse");
		});

		it("[UX-0989] exports Mermaid diagram for cryptographic key exchange protocol", () => {
			const mermaid = exportCryptoExchangeMermaid();
			expect(mermaid).toContain("UX-0989");
			expect(mermaid).toContain("encrypt/verify");
		});

		it("[UX-0990] exports Mermaid diagram for third-party external API integration adapter", () => {
			const mermaid = exportExternalAdapterMermaid();
			expect(mermaid).toContain("UX-0990");
			expect(mermaid).toContain("proxy/adapt");
		});
	});

	// =========================================================================
	// Group 5: Pre-Commit Impact Checks & API Policy Gate (UX-0991 to UX-1000)
	// =========================================================================
	describe("Group 5: Pre-Commit Impact Checks & API Policy Gate (UX-0991 to UX-1000)", () => {
		it("[UX-0991] blocks unannounced public API changes to shared database model interface", () => {
			const evaluation = checkDatabaseModelPreCommit({
				target: "database_model",
				symbol: "DatabaseModel",
				changeType: "field_renamed",
				description: "Renamed primary key field",
				hasDeprecationNotice: false,
				hasMigrationGuide: false,
				isCoordinated: false,
			});
			expect(evaluation.uxId).toBe("UX-0991");
			expect(evaluation.passed).toBe(false);
			expect(evaluation.verdict).toBe("BLOCKED");
			expect(evaluation.blockers.length).toBeGreaterThanOrEqual(2);

			const terminal = renderApiGateEvaluationTerminal(evaluation);
			expect(terminal.join("\n")).toContain("UX-0991");
			expect(terminal.join("\n")).toContain("BLOCKED");

			const md = renderApiGateEvaluationMarkdown(evaluation);
			expect(md).toContain("### [UX-0991]");
			expect(md).toContain("Policy Blockers");
		});

		it("[UX-0992] blocks unannounced public API changes to central authentication middleware handler", () => {
			const evaluation = checkAuthMiddlewarePreCommit({
				target: "auth_middleware",
				symbol: "authMiddleware",
				changeType: "signature_changed",
				description: "Altered required token claims parameter",
				hasDeprecationNotice: false,
				hasMigrationGuide: false,
				isCoordinated: false,
			});
			expect(evaluation.uxId).toBe("UX-0992");
			expect(evaluation.passed).toBe(false);
			expect(evaluation.blockers.some((b) => b.violation.includes("@deprecated"))).toBe(true);
		});

		it("[UX-0993] blocks unannounced public API changes to core HTTP client error handling signature", () => {
			const evaluation = checkHttpClientPreCommit({
				target: "http_client",
				symbol: "HttpClientError",
				changeType: "return_type_altered",
				description: "Altered error envelope shape",
				hasDeprecationNotice: false,
				hasMigrationGuide: false,
				isCoordinated: true,
			});
			expect(evaluation.uxId).toBe("UX-0993");
			expect(evaluation.passed).toBe(false);
		});

		it("[UX-0994] blocks unannounced public API changes to utility string formatting library", () => {
			const evaluation = checkStringUtilsPreCommit({
				target: "string_utils",
				symbol: "formatTemplate",
				changeType: "parameter_removed",
				description: "Removed legacy delimiter parameter",
				hasDeprecationNotice: false,
				hasMigrationGuide: false,
				isCoordinated: true,
			});
			expect(evaluation.uxId).toBe("UX-0994");
			expect(evaluation.passed).toBe(false);
		});

		it("[UX-0995] blocks unannounced public API changes to global telemetry logger and tracer", () => {
			const evaluation = checkTelemetryLoggerPreCommit({
				target: "telemetry_logger",
				symbol: "telemetryLogger",
				changeType: "method_deleted",
				description: "Deleted legacy traceSync method",
				hasDeprecationNotice: false,
				hasMigrationGuide: false,
				isCoordinated: true,
			});
			expect(evaluation.uxId).toBe("UX-0995");
			expect(evaluation.passed).toBe(false);
		});

		it("[UX-0996] blocks unannounced public API changes to session state management store", () => {
			const evaluation = checkSessionStorePreCommit({
				target: "session_store",
				symbol: "SessionStore",
				changeType: "contract_breakage",
				description: "Replaced SQLite schema structure",
				hasDeprecationNotice: false,
				hasMigrationGuide: false,
				isCoordinated: false,
			});
			expect(evaluation.uxId).toBe("UX-0996");
			expect(evaluation.passed).toBe(false);
		});

		it("[UX-0997] blocks unannounced public API changes to event bus message dispatcher and topics", () => {
			const evaluation = checkEventBusPreCommit({
				target: "event_bus",
				symbol: "EventBusDispatcher",
				changeType: "signature_changed",
				description: "Changed topic payload schema",
				hasDeprecationNotice: false,
				hasMigrationGuide: false,
				isCoordinated: true,
			});
			expect(evaluation.uxId).toBe("UX-0997");
			expect(evaluation.passed).toBe(false);
		});

		it("[UX-0998] blocks unannounced public API changes to configuration parser and validation schema", () => {
			const evaluation = checkConfigParserPreCommit({
				target: "config_parser",
				symbol: "ConfigParserSchema",
				changeType: "field_renamed",
				description: "Renamed root configuration field without fallback",
				hasDeprecationNotice: false,
				hasMigrationGuide: false,
				isCoordinated: true,
			});
			expect(evaluation.uxId).toBe("UX-0998");
			expect(evaluation.passed).toBe(false);
		});

		it("[UX-0999] blocks unannounced public API changes to cryptographic key exchange protocol", () => {
			const evaluation = checkCryptoExchangePreCommit({
				target: "crypto_exchange",
				symbol: "deriveSessionKey",
				changeType: "signature_changed",
				description: "Changed key agreement handshake cipher",
				hasDeprecationNotice: false,
				hasMigrationGuide: false,
				isCoordinated: false,
			});
			expect(evaluation.uxId).toBe("UX-0999");
			expect(evaluation.passed).toBe(false);
		});

		it("[UX-1000] blocks unannounced public API changes to third-party external API integration adapter", () => {
			const evaluation = checkExternalAdapterPreCommit({
				target: "external_adapter",
				symbol: "ExternalApiAdapter",
				changeType: "method_deleted",
				description: "Deleted executeStreamingCompletion method",
				hasDeprecationNotice: false,
				hasMigrationGuide: false,
				isCoordinated: true,
			});
			expect(evaluation.uxId).toBe("UX-1000");
			expect(evaluation.passed).toBe(false);
		});

		it("allows properly announced and documented public API changes to pass", () => {
			const evaluation = checkDatabaseModelPreCommit({
				target: "database_model",
				symbol: "DatabaseModel",
				changeType: "field_renamed",
				description: "Renamed primary key field with dual-write migration",
				hasDeprecationNotice: true,
				hasMigrationGuide: true,
				isCoordinated: true,
				gracePeriodDays: 30,
			});
			expect(evaluation.passed).toBe(true);
			expect(evaluation.verdict).toBe("APPROVED");
			expect(evaluation.blockers).toHaveLength(0);
		});

		it("permits emergency bypass with --force flag", () => {
			const evaluation = checkAuthMiddlewarePreCommit({
				target: "auth_middleware",
				symbol: "authMiddleware",
				changeType: "signature_changed",
				description: "Emergency vulnerability patch",
				hasDeprecationNotice: false,
				hasMigrationGuide: false,
				isCoordinated: false,
				forceBypass: true,
			});
			expect(evaluation.passed).toBe(true);
			expect(evaluation.verdict).toBe("BYPASSED_WITH_WARNING");
			expect(evaluation.warnings.join(" ")).toContain("--force");
		});
	});
});
