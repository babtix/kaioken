import { resolve } from "node:path";
import { detectCommands, type GateReport, runGate, VERIFY_CONFIG } from "@kaioken/agent";
import { nodeCommandRunner } from "../agent-host.js";
import type { Flags } from "../main.js";

/**
 * The gate, on its own.
 *
 * It exists as a command and not only as the tail of a chat session because the
 * question it answers — "does this repository currently build and pass its own
 * tests?" — is worth asking without an agent in the room, and because a gate
 * nobody can run by hand is a gate nobody trusts. No model, no credentials.
 */
export async function runVerify(flags: Flags): Promise<number> {
	const root = resolve(flags.root);
	const { commands, source } = await detectCommands(root);

	if (flags.dryRun) {
		if (flags.json) {
			process.stdout.write(`${JSON.stringify({ commands, source }, null, 2)}\n`);
			return commands.length > 0 ? 0 : 2;
		}
		if (commands.length === 0) {
			process.stdout.write(noCommands());
			return 2;
		}
		process.stdout.write(`${commands.length} command(s), from ${source}:\n`);
		for (const command of commands) process.stdout.write(`  ${command.command}\n`);
		process.stdout.write("nothing was run.\n");
		return 0;
	}

	const report = await runGate(commands, nodeCommandRunner(), { cwd: root });

	if (flags.json) {
		process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
	} else {
		process.stdout.write(formatGate(report, { verbose: flags.verbose }));
	}

	// Three verdicts, three exit codes. Collapsing "could not be verified" into
	// either pass or fail would make the honest answer unrepresentable, and this
	// command exists to be read by a script.
	if (report.verdict === "passed") return 0;
	if (report.verdict === "failed") return 1;
	return 2;
}

export function formatGate(report: GateReport, options: { verbose?: boolean } = {}): string {
	if (report.verdict === "unverifiable") return noCommands();

	const lines: string[] = [];
	for (const result of report.results) {
		const status = result.timedOut ? "timeout" : result.ok ? "ok" : `exit ${result.exitCode}`;
		lines.push(`${result.ok ? "  " : "! "}${result.label.padEnd(10)} ${status.padEnd(8)} ${result.command}`);
	}

	lines.push("");
	if (report.verdict === "passed") {
		lines.push(`verified: ${report.results.length} command(s) passed.`);
	} else {
		lines.push(
			`not verified: ${report.failed.length} of ${report.results.length} command(s) failed.`,
		);
	}

	// The tail of a failure is the only part worth printing unasked; the rest is
	// noise until someone goes looking for it.
	for (const failure of report.failed) {
		if (!failure.output) continue;
		lines.push("", `--- ${failure.command} ---`, failure.output);
	}

	if (options.verbose) {
		for (const result of report.results) {
			if (!result.ok || !result.output) continue;
			lines.push("", `--- ${result.command} ---`, result.output);
		}
	}

	return `${lines.join("\n")}\n`;
}

function noCommands(): string {
	return (
		"no build or test command could be discovered.\n" +
		`  declare them in ${VERIFY_CONFIG}:\n` +
		'  { "commands": [{ "label": "test", "command": "npm test" }] }\n'
	);
}
