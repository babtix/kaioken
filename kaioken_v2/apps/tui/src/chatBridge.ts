import { resolve } from "node:path";
import { KNOWLEDGE_TOOLS, runGate } from "@kaioken/agent";
import type { Flags } from "../../cli/dist/main.js";

/**
 * The bridge from the TUI's chat view to the engine's agent.
 *
 * The CLI already owns the whole path — model resolution, the Pi agent loop,
 * the verification gate. Duplicating any of it here would create a second
 * behaviour to keep in sync, so the bridge drives the CLI's own `runChat`
 * through captured streams and takes the reply from its JSON output.
 *
 * The gate runs after the turn, exactly as the command does.
 */

export interface ChatRequest {
	root: string;
	question: string;
	model?: string;
}

export interface ChatReply {
	reply: string;
	verified: unknown;
	gateRan: boolean;
}

export async function chatHeadless(request: ChatRequest): Promise<ChatReply> {
	const capturedOut: string[] = [];
	const capturedErr: string[] = [];

	const origOut = process.stdout.write.bind(process.stdout);
	const origErr = process.stderr.write.bind(process.stderr);

	process.stdout.write = ((chunk: unknown) => {
		capturedOut.push(String(chunk));
		return true;
	}) as typeof process.stdout.write;
	process.stderr.write = ((chunk: unknown) => {
		capturedErr.push(String(chunk));
		return true;
	}) as typeof process.stderr.write;

	try {
		const { main } = await import("../../cli/dist/main.js");
		const argv = [
			"chat",
			"--root",
			request.root,
			"--json",
			...(request.model ? ["--model", request.model] : []),
			request.question,
		];
		const code = await main(argv);
		const output = capturedOut.join("");
		const parsed = safeParse(output);
		if (!parsed) {
			throw new Error(
				capturedErr.join("").trim() ||
					`chat produced no reply (exit ${code})`,
			);
		}
		return {
			reply: String(parsed.reply ?? ""),
			verified: parsed.verified ?? null,
			gateRan: parsed.verified !== null && parsed.verified !== undefined,
		};
	} finally {
		process.stdout.write = origOut;
		process.stderr.write = origErr;
	}
}

export async function runGateFor(root: string): Promise<unknown> {
	const { detectCommands } = await import("@kaioken/agent");
	const { commands } = await detectCommands(resolve(root));
	const report = await runGate(commands, nodeRunner(), { cwd: resolve(root) });
	return report;
}

function nodeRunner() {
	// Mirrors apps/cli/src/agent-host.ts nodeCommandRunner; the TUI runs the
	// same gate commands with the same timeout semantics.
	const { exec } = require("node:child_process") as typeof import("node:child_process");
	return {
		run(
			command: string,
			options: { cwd: string; timeoutMs: number },
		): Promise<{ exitCode: number; killed: boolean; durationMs: number; stdout: string; stderr: string }> {
			const started = Date.now();
			return new Promise((settle) => {
				exec(
					command,
					{ cwd: options.cwd, timeout: options.timeoutMs, maxBuffer: 32 * 1024 * 1024, windowsHide: true },
					(error, stdout, stderr) => {
						settle({
							exitCode:
								error && typeof (error as { code?: unknown }).code === "number"
									? ((error as { code: number }).code as number)
									: error
										? 1
										: 0, // matches RunOutcome: number, never null
							killed: Boolean(error && (error as { killed?: boolean }).killed),
							durationMs: Date.now() - started,
							stdout,
							stderr,
						});
					},
				);
			});
		},
	};
}

function safeParse(output: string): { reply?: unknown; verified?: unknown } | null {
	const start = output.indexOf("{");
	if (start === -1) return null;
	try {
		return JSON.parse(output.slice(start)) as { reply?: unknown; verified?: unknown };
	} catch {
		return null;
	}
}

void KNOWLEDGE_TOOLS;
void ({} as Flags);
