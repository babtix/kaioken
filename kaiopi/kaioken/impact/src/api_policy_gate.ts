/**
 * api_policy_gate.ts — Pre-commit impact check gate blocking unannounced public API changes (UX-0991–UX-1000).
 * Prevents inadvertent, unversioned, or uncoordinated breaking changes from being committed.
 *
 * Invariant: 100% offline-testable with defensive error boundaries and zero network calls.
 */

import {
	type ApiChangeSpecification,
	type ApiGateBlocker,
	type ApiGateEvaluation,
	type ImpactTargetType,
	TARGET_METADATA_REGISTRY,
} from "./types.ts";

/** Target-specific policy remediation guidelines */
const REMEDIATION_GUIDANCE: Record<ImpactTargetType, string> = {
	database_model: "Add @deprecated tag to old schema interface, create dual-write migration script, and document in docs/wiki/database.md.",
	auth_middleware: "Provide dual-token verification fallback window, write release notes in docs/wiki/security.md, and ensure 401/403 tests pass.",
	http_client: "Maintain backwards-compatible HttpClientError properties and document new error signature in docs/wiki/networking.md.",
	string_utils: "Retain old formatting helper as deprecated alias with warning console output for 30 days.",
	telemetry_logger: "Preserve standard OpenTelemetry span attributes and wrap logging transitions in fail-soft boundaries.",
	session_store: "Add versioned snapshot format migration wrapper before modifying SQLite persistence layout.",
	event_bus: "Support topic aliases for deprecated event channel names and update docs/wiki/event-bus.md.",
	config_parser: "Add deprecated alias mapping in config schema parser to allow legacy key names to parse cleanly.",
	crypto_exchange: "Negotiate cipher version in handshake protocol and allow legacy keys during 14-day transition window.",
	external_adapter: "Isolate new provider methods behind optional interfaces or versioned adapter factories.",
};

/**
 * Check whether a proposed change to a target component satisfies public API safety policies.
 */
export function checkTargetApiPreCommitGate(
	target: ImpactTargetType,
	changeSpec: ApiChangeSpecification,
): ApiGateEvaluation {
	const meta = TARGET_METADATA_REGISTRY[target];
	const blockers: ApiGateBlocker[] = [];
	const warnings: string[] = [];
	const recommendations: string[] = [];

	const uxId = meta.uxRange.preCommitGate;

	// Check 1: Force bypass flag
	if (changeSpec.forceBypass) {
		warnings.push(`Safety gate bypassed using --force for ${meta.name} [${uxId}]. Proceed with extreme caution.`);
		return {
			target,
			uxId,
			targetName: meta.name,
			passed: true,
			verdict: "BYPASSED_WITH_WARNING",
			blockers: [],
			warnings,
			recommendations: ["Ensure all dependent services are immediately updated and monitored for regressions."],
			evaluationTimestamp: Date.now(),
		};
	}

	// Check 2: Deprecation notice on breaking changes
	if (!changeSpec.hasDeprecationNotice) {
		blockers.push({
			uxId,
			target,
			symbol: changeSpec.symbol,
			violation: `Unannounced breaking change: symbol "${changeSpec.symbol}" was modified (${changeSpec.changeType}) without a preceding @deprecated notice.`,
			remediation: REMEDIATION_GUIDANCE[target] ?? "Mark the symbol with @deprecated and provide a deprecation timeline.",
		});
	}

	// Check 3: Migration documentation
	if (!changeSpec.hasMigrationGuide) {
		blockers.push({
			uxId,
			target,
			symbol: changeSpec.symbol,
			violation: `Missing migration documentation: breaking alteration to "${changeSpec.symbol}" has no associated migration guide or release notes.`,
			remediation: `Document migration steps in ${meta.affectedWikiChapters[0]?.file ?? "docs/wiki"}.`,
		});
	}

	// Check 4: Coordination on critical components
	if (meta.criticality === "critical" && !changeSpec.isCoordinated) {
		blockers.push({
			uxId,
			target,
			symbol: changeSpec.symbol,
			violation: `Uncoordinated breaking change on CRITICAL component: modifications to "${meta.name}" require architectural approval.`,
			remediation: "Coordinate change with team or run with explicit migration flags.",
		});
	}

	// Check 5: Grace period verification
	if (changeSpec.gracePeriodDays !== undefined && changeSpec.gracePeriodDays < 14) {
		warnings.push(
			`Deprecation grace period of ${changeSpec.gracePeriodDays} days is below the recommended 14-day threshold for ${meta.name}.`,
		);
	}

	// Add recommendations
	recommendations.push(
		`Check affected subsystems: ${meta.affectedSubsystems.map((s) => s.name).join(", ")}.`,
		`Review wiki chapters: ${meta.affectedWikiChapters.map((c) => c.title).join(", ")}.`,
	);

	const passed = blockers.length === 0;

	return {
		target,
		uxId,
		targetName: meta.name,
		passed,
		verdict: passed ? "APPROVED" : "BLOCKED",
		blockers,
		warnings,
		recommendations,
		evaluationTimestamp: Date.now(),
	};
}

// ---------------------------------------------------------------------------
// Dedicated helpers for UX-0991 to UX-1000
// ---------------------------------------------------------------------------

/** [UX-0991] Pre-commit impact check for shared database model interface */
export function checkDatabaseModelPreCommit(changeSpec: ApiChangeSpecification): ApiGateEvaluation {
	return checkTargetApiPreCommitGate("database_model", changeSpec);
}

/** [UX-0992] Pre-commit impact check for central authentication middleware handler */
export function checkAuthMiddlewarePreCommit(changeSpec: ApiChangeSpecification): ApiGateEvaluation {
	return checkTargetApiPreCommitGate("auth_middleware", changeSpec);
}

/** [UX-0993] Pre-commit impact check for core HTTP client error handling signature */
export function checkHttpClientPreCommit(changeSpec: ApiChangeSpecification): ApiGateEvaluation {
	return checkTargetApiPreCommitGate("http_client", changeSpec);
}

/** [UX-0994] Pre-commit impact check for utility string formatting library */
export function checkStringUtilsPreCommit(changeSpec: ApiChangeSpecification): ApiGateEvaluation {
	return checkTargetApiPreCommitGate("string_utils", changeSpec);
}

/** [UX-0995] Pre-commit impact check for global telemetry logger and tracer */
export function checkTelemetryLoggerPreCommit(changeSpec: ApiChangeSpecification): ApiGateEvaluation {
	return checkTargetApiPreCommitGate("telemetry_logger", changeSpec);
}

/** [UX-0996] Pre-commit impact check for session state management store */
export function checkSessionStorePreCommit(changeSpec: ApiChangeSpecification): ApiGateEvaluation {
	return checkTargetApiPreCommitGate("session_store", changeSpec);
}

/** [UX-0997] Pre-commit impact check for event bus message dispatcher and topics */
export function checkEventBusPreCommit(changeSpec: ApiChangeSpecification): ApiGateEvaluation {
	return checkTargetApiPreCommitGate("event_bus", changeSpec);
}

/** [UX-0998] Pre-commit impact check for configuration parser and validation schema */
export function checkConfigParserPreCommit(changeSpec: ApiChangeSpecification): ApiGateEvaluation {
	return checkTargetApiPreCommitGate("config_parser", changeSpec);
}

/** [UX-0999] Pre-commit impact check for cryptographic key exchange protocol */
export function checkCryptoExchangePreCommit(changeSpec: ApiChangeSpecification): ApiGateEvaluation {
	return checkTargetApiPreCommitGate("crypto_exchange", changeSpec);
}

/** [UX-1000] Pre-commit impact check for third-party external API integration adapter */
export function checkExternalAdapterPreCommit(changeSpec: ApiChangeSpecification): ApiGateEvaluation {
	return checkTargetApiPreCommitGate("external_adapter", changeSpec);
}

/**
 * Render pre-commit gate evaluation for terminal output.
 */
export function renderApiGateEvaluationTerminal(evalResult: ApiGateEvaluation): string[] {
	const lines: string[] = [];

	if (evalResult.passed) {
		if (evalResult.verdict === "BYPASSED_WITH_WARNING") {
			lines.push(`⚠️  Impact Policy Gate [${evalResult.uxId}]: BYPASSED WITH WARNING`);
		} else {
			lines.push(`✓ Impact Policy Gate [${evalResult.uxId}]: PASSED (Safe to commit)`);
		}
		lines.push(`  Target: ${evalResult.targetName}`);
		for (const warn of evalResult.warnings) {
			lines.push(`  ⚠️ Warning: ${warn}`);
		}
	} else {
		lines.push(`✗ Impact Policy Gate [${evalResult.uxId}]: BLOCKED (Unannounced Public API Change)`);
		lines.push(`  Target: ${evalResult.targetName}`);
		lines.push("");
		lines.push("  ⛔ Policy Violations:");
		for (const blocker of evalResult.blockers) {
			lines.push(`    • [${blocker.symbol}] ${blocker.violation}`);
			lines.push(`      ↳ Remediation: ${blocker.remediation}`);
		}
		for (const warn of evalResult.warnings) {
			lines.push(`  ⚠️ Warning: ${warn}`);
		}
		lines.push("");
		lines.push("  Pass `--force` to bypass if this is an intentional unannounced emergency patch.");
	}

	return lines;
}

/**
 * Render pre-commit gate evaluation as markdown.
 */
export function renderApiGateEvaluationMarkdown(evalResult: ApiGateEvaluation): string {
	const sections: string[] = [
		`### [${evalResult.uxId}] Public API Policy Gate: ${evalResult.targetName}`,
		`- **Verdict**: \`${evalResult.verdict}\``,
		`- **Status**: ${evalResult.passed ? "✅ Passed" : "❌ Blocked"}`,
	];

	if (evalResult.blockers.length > 0) {
		sections.push("", "#### ⛔ Policy Blockers");
		for (const b of evalResult.blockers) {
			sections.push(`- **\`${b.symbol}\`**: ${b.violation}\n  - **Fix**: ${b.remediation}`);
		}
	}

	if (evalResult.warnings.length > 0) {
		sections.push("", "#### ⚠️ Warnings");
		for (const w of evalResult.warnings) {
			sections.push(`- ${w}`);
		}
	}

	if (evalResult.recommendations.length > 0) {
		sections.push("", "#### 💡 Recommendations");
		for (const r of evalResult.recommendations) {
			sections.push(`- ${r}`);
		}
	}

	return sections.join("\n");
}
