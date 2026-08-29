import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { KAIOKEN_DIR } from "@kaioken/scan";

/**
 * The verification gate.
 *
 * An agent's claim that it is finished is a claim, and the whole reason this
 * phase exists is that a claim is not evidence. The gate is the trust layer
 * under it: after the agent says it is done, the repository's *own* build and
 * test commands run, and their exit codes decide.
 *
 * Two properties are deliberate. The commands are the repository's, discovered
 * from what it already declares — inventing a build command would verify
 * something nobody runs. And when nothing can be discovered the verdict is
 * `unverifiable`, never `passed`: silence is not a pass, and a gate that
 * green-lights a repository it could not test is worse than no gate, because it
 * is trusted.
 */

/** One command the gate will run. */
export interface GateCommand {
	id: string;
	/** What it is for, in one word: typecheck, build, test, lint. */
	label: string;
	command: string;
	/** Where the command came from, so the user can argue with it. */
	source: string;
}

export interface RunOutcome {
	exitCode: number;
	stdout: string;
	stderr: string;
	durationMs: number;
	timedOut?: boolean;
}

/**
 * Process execution, injected.
 *
 * The gate decides what to run and what the result means; it never spawns
 * anything itself. That is what lets the whole decision layer be tested without
 * a shell, and what stops this package from becoming the second place in the
 * codebase that knows about the outside world.
 */
export interface CommandRunner {
	run(command: string, options: { cwd: string; timeoutMs: number }): Promise<RunOutcome>;
}

export interface GateResult extends GateCommand {
	ok: boolean;
	exitCode: number;
	durationMs: number;
	timedOut: boolean;
	/** The tail of the combined output — enough to see the failure. */
	output: string;
}

export type GateVerdict = "passed" | "failed" | "unverifiable";

export interface GateReport {
	verdict: GateVerdict;
	results: GateResult[];
	failed: GateResult[];
	/** Why nothing ran, when nothing did. */
	reason?: string;
}

export const VERIFY_CONFIG = join(KAIOKEN_DIR, "verify.json");

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;
const OUTPUT_TAIL_LINES = 60;
const OUTPUT_TAIL_CHARS = 8000;

/**
 * Work out what this repository calls "building" and "testing".
 *
 * Order matters: an explicit config wins outright and stops the search, because
 * a repository that has said what to run should never also get a guess. Below
 * that, the manifests are consulted in the order a repository's own README would
 * list them.
 */
export async function detectCommands(root: string): Promise<{
	commands: GateCommand[];
	source: string;
}> {
	const configured = await readConfig(root);
	if (configured) return { commands: configured, source: VERIFY_CONFIG };

	const found: GateCommand[] = [];
	const sources: string[] = [];

	const pkg = await readJson(join(root, "package.json"));
	if (pkg && typeof pkg === "object") {
		const scripts = (pkg as { scripts?: unknown }).scripts;
		if (scripts && typeof scripts === "object") {
			const names = scripts as Record<string, unknown>;
			// `test` last: a failing typecheck explains a failing test suite, and
			// seeing the cheaper failure first saves reading the noisier one.
			for (const label of ["typecheck", "build", "test"]) {
				if (typeof names[label] === "string") {
					found.push({
						id: `npm:${label}`,
						label,
						command: `npm run ${label}`,
						source: "package.json scripts",
					});
				}
			}
			if (found.length > 0) sources.push("package.json");
		}
	}

	if (await exists(join(root, "go.mod"))) {
		found.push(
			{ id: "go:build", label: "build", command: "go build ./...", source: "go.mod" },
			{ id: "go:test", label: "test", command: "go test ./...", source: "go.mod" },
		);
		sources.push("go.mod");
	}

	if (await exists(join(root, "Cargo.toml"))) {
		found.push(
			{ id: "cargo:build", label: "build", command: "cargo build", source: "Cargo.toml" },
			{ id: "cargo:test", label: "test", command: "cargo test", source: "Cargo.toml" },
		);
		sources.push("Cargo.toml");
	}

	if (found.length === 0) {
		const make = await readText(join(root, "Makefile"));
		if (make) {
			for (const label of ["build", "test"]) {
				if (new RegExp(`^${label}:`, "m").test(make)) {
					found.push({
						id: `make:${label}`,
						label,
						command: `make ${label}`,
						source: "Makefile",
					});
				}
			}
			if (found.length > 0) sources.push("Makefile");
		}
	}

	// Only when nothing else was found: a Python project that also carries a
	// package.json is a web application, and running pytest there is noise.
	if (found.length === 0) {
		const pyproject = await readText(join(root, "pyproject.toml"));
		if (pyproject !== null) {
			found.push({ id: "py:test", label: "test", command: "pytest", source: "pyproject.toml" });
			sources.push("pyproject.toml");
		}
	}

	return { commands: found, source: sources.join(", ") };
}

/**
 * Run the gate.
 *
 * Every command runs even after one fails. Stopping at the first failure would
 * report a broken build and say nothing about the tests, and what the agent
 * should do next depends on knowing whether it broke one thing or everything.
 */
export async function runGate(
	commands: readonly GateCommand[],
	runner: CommandRunner,
	options: { cwd: string; timeoutMs?: number },
): Promise<GateReport> {
	if (commands.length === 0) {
		return {
			verdict: "unverifiable",
			results: [],
			failed: [],
			reason:
				"no build or test command could be discovered — " +
				`declare them in ${VERIFY_CONFIG} to make the gate meaningful`,
		};
	}

	const results: GateResult[] = [];
	for (const command of commands) {
		let outcome: RunOutcome;
		try {
			outcome = await runner.run(command.command, {
				cwd: options.cwd,
				timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
			});
		} catch (error) {
			// A runner that throws is a failed command, not a broken gate.
			outcome = {
				exitCode: -1,
				stdout: "",
				stderr: error instanceof Error ? error.message : String(error),
				durationMs: 0,
			};
		}

		results.push({
			...command,
			ok: outcome.exitCode === 0 && outcome.timedOut !== true,
			exitCode: outcome.exitCode,
			durationMs: outcome.durationMs,
			timedOut: outcome.timedOut === true,
			output: tail(`${outcome.stdout}${outcome.stderr}`),
		});
	}

	const failed = results.filter((result) => !result.ok);
	return { verdict: failed.length === 0 ? "passed" : "failed", results, failed };
}

/** The end of the output, which is where a build or a test run says why. */
export function tail(text: string): string {
	const trimmed = text.replace(/\r\n/g, "\n").trimEnd();
	if (!trimmed) return "";

	const lines = trimmed.split("\n");
	let out = lines.slice(-OUTPUT_TAIL_LINES).join("\n");
	if (out.length > OUTPUT_TAIL_CHARS) out = out.slice(-OUTPUT_TAIL_CHARS);
	return out;
}

async function readConfig(root: string): Promise<GateCommand[] | null> {
	const parsed = await readJson(join(root, VERIFY_CONFIG));
	if (!parsed || typeof parsed !== "object") return null;

	const raw = (parsed as { commands?: unknown }).commands;
	if (!Array.isArray(raw)) return null;

	const commands: GateCommand[] = [];
	for (const [i, entry] of raw.entries()) {
		if (!entry || typeof entry !== "object") continue;
		const record = entry as Record<string, unknown>;
		const command = typeof record["command"] === "string" ? record["command"].trim() : "";
		if (!command) continue;
		const label = typeof record["label"] === "string" ? record["label"].trim() : "check";
		commands.push({ id: `config:${label}:${i}`, label, command, source: VERIFY_CONFIG });
	}
	return commands.length > 0 ? commands : null;
}

async function readText(path: string): Promise<string | null> {
	try {
		return await readFile(path, "utf8");
	} catch {
		return null;
	}
}

async function readJson(path: string): Promise<unknown> {
	const text = await readText(path);
	if (text === null) return null;
	try {
		return JSON.parse(text) as unknown;
	} catch {
		return null;
	}
}

async function exists(path: string): Promise<boolean> {
	return (await readText(path)) !== null;
}
