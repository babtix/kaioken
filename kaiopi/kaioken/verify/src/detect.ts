import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { KAIOKEN_DIR } from "@kaioken/scan";
import type {
	DetectedCommandsResult,
	GateCommand,
	PackageManager,
	SupportedRuntime,
	VerifyConfigFile,
} from "./types.ts";

export const VERIFY_CONFIG = join(KAIOKEN_DIR, "verify.json");

export async function detectPackageManager(root: string): Promise<PackageManager> {
	if (
		existsSync(join(root, "pnpm-lock.yaml")) ||
		existsSync(join(root, "pnpm-workspace.yaml"))
	) {
		return "pnpm";
	}
	if (existsSync(join(root, "yarn.lock"))) {
		return "yarn";
	}
	if (existsSync(join(root, "bun.lockb")) || existsSync(join(root, "bun.lock"))) {
		return "bun";
	}
	if (
		existsSync(join(root, "deno.json")) ||
		existsSync(join(root, "deno.jsonc")) ||
		existsSync(join(root, "deno.lock"))
	) {
		return "deno";
	}
	return "npm";
}

export async function detectCommands(root: string): Promise<DetectedCommandsResult> {
	// 1. Custom config override (.kaioken/verify.json)
	const custom = await readCustomConfig(root);
	if (custom && custom.commands.length > 0) {
		return {
			commands: custom.commands,
			source: VERIFY_CONFIG,
			runtime: custom.commands[0]?.runtime ?? "mixed",
		};
	}

	const found: GateCommand[] = [];
	const sources: string[] = [];
	const runtimes = new Set<SupportedRuntime>();

	// 2. Node / JS / TS ecosystem
	const pkgPath = join(root, "package.json");
	const pm = await detectPackageManager(root);

	if (existsSync(pkgPath)) {
		const pkg = await readJson(pkgPath);
		if (pkg && typeof pkg === "object") {
			runtimes.add("node");
			const pkgRecord = pkg as { scripts?: unknown; workspaces?: unknown };
			const scripts = pkgRecord.scripts;
			const hasWorkspaces = Boolean(pkgRecord.workspaces);
			const hasPnpmWorkspace = existsSync(join(root, "pnpm-workspace.yaml"));
			const names =
				scripts && typeof scripts === "object"
					? (scripts as Record<string, unknown>)
					: null;

			if (names) {
				// Prioritize cheapest checks first: typecheck, lint, build, test
				const orderedLabels = ["typecheck", "lint", "build", "test"];
				for (const label of orderedLabels) {
					if (typeof names[label] === "string") {
						const command =
							label === "test"
								? pm === "npm"
									? "npm run test"
									: `${pm} test`
								: `${pm} run ${label}`;
						found.push({
							id: `${pm}:${label}`,
							label,
							command,
							source: "package.json scripts",
							runtime: "node",
						});
					}
				}
				if (found.length > 0) sources.push("package.json");
			}

			// Monorepo handling: if root has workspaces but no test script
			const hasTestScript = names && typeof names["test"] === "string";
			if ((hasWorkspaces || hasPnpmWorkspace) && !hasTestScript) {
				let workspaceCommand: string;
				if (pm === "pnpm") {
					workspaceCommand = "pnpm -r --if-present test";
				} else if (pm === "yarn") {
					workspaceCommand = "yarn workspaces run test";
				} else if (pm === "bun") {
					workspaceCommand = "bun test";
				} else {
					workspaceCommand = "npm test --workspaces --if-present";
				}
				found.push({
					id: `${pm}:test:workspaces`,
					label: "test",
					command: workspaceCommand,
					source: hasPnpmWorkspace ? "pnpm-workspace.yaml" : "package.json workspaces",
					runtime: "node",
				});
				sources.push(hasPnpmWorkspace ? "pnpm-workspace.yaml" : "package.json workspaces");
			}

			// Fallback when package.json exists with no recognized scripts
			if (found.length === 0) {
				const fallbackCmd = pm === "npm" ? "npm test" : `${pm} test`;
				found.push({
					id: `${pm}:test`,
					label: "test",
					command: fallbackCmd,
					source: "package.json",
					runtime: "node",
				});
				sources.push("package.json");
			}
		}
	} else if (existsSync(join(root, "pnpm-workspace.yaml"))) {
		runtimes.add("node");
		found.push({
			id: "pnpm:test:workspaces",
			label: "test",
			command: "pnpm -r --if-present test",
			source: "pnpm-workspace.yaml",
			runtime: "node",
		});
		sources.push("pnpm-workspace.yaml");
	}

	// 3. Deno detection
	const denoFile = existsSync(join(root, "deno.json"))
		? "deno.json"
		: existsSync(join(root, "deno.jsonc"))
			? "deno.jsonc"
			: existsSync(join(root, "deno.lock"))
				? "deno.lock"
				: null;
	if (denoFile && (found.length === 0 || pm === "deno")) {
		runtimes.add("deno");
		found.push({
			id: "deno:test",
			label: "test",
			command: "deno test",
			source: denoFile,
			runtime: "deno",
		});
		sources.push(denoFile);
	}

	// 4. Go detection
	if (existsSync(join(root, "go.mod"))) {
		runtimes.add("go");
		found.push(
			{ id: "go:build", label: "build", command: "go build ./...", source: "go.mod", runtime: "go" },
			{ id: "go:test", label: "test", command: "go test ./...", source: "go.mod", runtime: "go" },
		);
		sources.push("go.mod");
	}

	// 5. Rust detection
	if (existsSync(join(root, "Cargo.toml"))) {
		runtimes.add("rust");
		found.push(
			{ id: "cargo:build", label: "build", command: "cargo build", source: "Cargo.toml", runtime: "rust" },
			{ id: "cargo:test", label: "test", command: "cargo test", source: "Cargo.toml", runtime: "rust" },
		);
		sources.push("Cargo.toml");
	}

	// 6. Makefile detection (fallback if no package.json/go/cargo found or if explicit test target)
	if (found.length === 0 && existsSync(join(root, "Makefile"))) {
		const makeContent = await readText(join(root, "Makefile"));
		if (makeContent) {
			runtimes.add("make");
			for (const label of ["typecheck", "lint", "build", "test"]) {
				if (new RegExp(`^${label}:`, "m").test(makeContent)) {
					found.push({
						id: `make:${label}`,
						label,
						command: `make ${label}`,
						source: "Makefile",
						runtime: "make",
					});
				}
			}
			if (found.length > 0) sources.push("Makefile");
		}
	}

	// 7. Python detection (fallback if no primary JS/Go/Rust declared tests)
	if (found.length === 0) {
		const hasPyproject = existsSync(join(root, "pyproject.toml"));
		const hasSetupPy = existsSync(join(root, "setup.py"));
		const hasSetupCfg = existsSync(join(root, "setup.cfg"));
		const hasTox = existsSync(join(root, "tox.ini"));
		const hasPipfile = existsSync(join(root, "Pipfile"));
		const hasReqs = existsSync(join(root, "requirements.txt"));

		if (hasPyproject || hasSetupPy || hasSetupCfg || hasTox || hasPipfile || hasReqs) {
			runtimes.add("python");
			const sourceFile = hasPyproject
				? "pyproject.toml"
				: hasSetupPy
					? "setup.py"
					: hasSetupCfg
						? "setup.cfg"
						: hasTox
							? "tox.ini"
							: hasPipfile
								? "Pipfile"
								: "requirements.txt";
			found.push({
				id: "py:test",
				label: "test",
				command: "pytest",
				source: sourceFile,
				runtime: "python",
			});
			sources.push(sourceFile);
		}
	}

	const resolvedRuntime: SupportedRuntime | "mixed" | "unknown" =
		runtimes.size === 1
			? Array.from(runtimes)[0]!
			: runtimes.size > 1
				? "mixed"
				: "unknown";

	return {
		commands: found,
		source: sources.join(", "),
		runtime: resolvedRuntime,
		packageManager: pm,
	};
}

async function readCustomConfig(root: string): Promise<{ commands: GateCommand[] } | null> {
	const parsed = await readJson(join(root, VERIFY_CONFIG));
	if (!parsed || typeof parsed !== "object") return null;

	const raw = (parsed as { commands?: unknown }).commands;
	if (!Array.isArray(raw)) return null;

	const commands: GateCommand[] = [];
	for (const [i, entry] of raw.entries()) {
		if (!entry || typeof entry !== "object") continue;
		const record = entry as Record<string, unknown>;
		const command =
			typeof record["command"] === "string" ? record["command"].trim() : "";
		if (!command) continue;
		const label =
			typeof record["label"] === "string" ? record["label"].trim() : "check";
		const timeoutMs =
			typeof record["timeoutMs"] === "number" ? record["timeoutMs"] : undefined;
		const env =
			typeof record["env"] === "object" && record["env"] !== null
				? (record["env"] as Record<string, string>)
				: undefined;
		const optional = Boolean(record["optional"]);

		commands.push({
			id: `config:${label}:${i}`,
			label,
			command,
			source: VERIFY_CONFIG,
			timeoutMs,
			env,
			optional,
		});
	}
	return commands.length > 0 ? { commands } : null;
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
