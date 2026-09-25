import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { KAIOKEN_DIR } from "@kaioken/scan";
import { validateVerifyConfig, VERIFY_CONFIG_NAME, VERIFY_CONFIG_PATH } from "./config.ts";
import type {
	CustomVerifyCommand,
	EnhancedVerifyConfig,
	SuiteConfigDefinition,
	VerifyConfigFile,
	VerifySuiteType,
} from "./types.ts";

export const STARTER_SUITE_TEMPLATES: Record<VerifySuiteType, SuiteConfigDefinition> = {
	nodejs: {
		suite: "nodejs",
		commands: [
			{
				id: "node-test",
				label: "Node Test Suite",
				command: "npm test",
				runtime: "node",
				timeoutMs: 60_000,
			},
		],
	},
	python: {
		suite: "python",
		commands: [
			{
				id: "pytest",
				label: "Pytest Suite",
				command: "pytest -v",
				runtime: "python",
				timeoutMs: 60_000,
			},
		],
	},
	go: {
		suite: "go",
		commands: [
			{
				id: "go-test",
				label: "Go Test All",
				command: "go test ./...",
				runtime: "go",
				timeoutMs: 60_000,
			},
		],
	},
	rust: {
		suite: "rust",
		commands: [
			{
				id: "cargo-test",
				label: "Cargo Test",
				command: "cargo test",
				runtime: "rust",
				timeoutMs: 120_000,
			},
		],
	},
	deno: {
		suite: "deno",
		commands: [
			{
				id: "deno-test",
				label: "Deno Test",
				command: "deno test -A",
				runtime: "deno",
				timeoutMs: 60_000,
			},
		],
	},
	make: {
		suite: "make",
		commands: [
			{
				id: "make-test",
				label: "Make Test Target",
				command: "make test",
				runtime: "make",
				timeoutMs: 60_000,
			},
		],
	},
	snapshots: {
		suite: "snapshots",
		commands: [
			{
				id: "snapshot-test",
				label: "Snapshot Assertions",
				command: "npx vitest run --update=false",
				runtime: "node",
				timeoutMs: 60_000,
			},
		],
		suiteOptions: {
			updateFlag: "-u",
		},
	},
	typescript: {
		suite: "typescript",
		commands: [
			{
				id: "typecheck",
				label: "TypeScript Gate",
				command: "tsc --noEmit",
				runtime: "node",
				timeoutMs: 45_000,
			},
		],
		suiteOptions: {
			tsconfig: "tsconfig.json",
			strict: true,
		},
	},
	lint: {
		suite: "lint",
		commands: [
			{
				id: "lint-check",
				label: "Lint Style Gate",
				command: "npm run lint",
				runtime: "node",
				timeoutMs: 30_000,
			},
		],
		suiteOptions: {
			autoFixFlag: "--fix",
		},
	},
	e2e: {
		suite: "e2e",
		commands: [
			{
				id: "e2e-smoke",
				label: "End-to-End Smoke Tests",
				command: "npx playwright test",
				runtime: "node",
				timeoutMs: 180_000,
			},
		],
		suiteOptions: {
			headless: true,
			artifactDir: "test-results",
		},
	},
};

// ---------------------------------------------------------------------------
// VerifyConfigEditor
// ---------------------------------------------------------------------------

export class VerifyConfigEditor {
	private readonly root: string;
	private config: EnhancedVerifyConfig;

	constructor(root: string, initialConfig?: EnhancedVerifyConfig) {
		this.root = root;
		this.config = initialConfig || {
			version: 1,
			commands: [],
			suiteConfigs: {},
		};
	}

	getConfig(): EnhancedVerifyConfig {
		return { ...this.config };
	}

	async load(): Promise<EnhancedVerifyConfig> {
		const configPath = join(this.root, VERIFY_CONFIG_PATH);
		if (!existsSync(configPath)) {
			this.config = {
				version: 1,
				commands: [],
				suiteConfigs: {},
			};
			return this.config;
		}

		try {
			const text = await readFile(configPath, "utf8");
			const parsed = JSON.parse(text) as EnhancedVerifyConfig;
			const validation = validateVerifyConfig(parsed);
			if (validation.valid && validation.config) {
				this.config = {
					...validation.config,
					suiteConfigs: parsed.suiteConfigs || {},
				};
			}
		} catch {
			// keep current
		}

		return this.config;
	}

	async save(): Promise<string> {
		const configPath = join(this.root, VERIFY_CONFIG_PATH);
		await mkdir(dirname(configPath), { recursive: true });

		// Synchronize flat commands with suiteConfigs if suiteConfigs exist
		const syncedCommands = [...this.config.commands];
		if (this.config.suiteConfigs) {
			for (const sc of Object.values(this.config.suiteConfigs)) {
				if (sc && sc.commands) {
					for (const cmd of sc.commands) {
						if (!syncedCommands.some((c) => c.command === cmd.command)) {
							syncedCommands.push(cmd);
						}
					}
				}
			}
		}
		this.config.commands = syncedCommands;

		const serialized = JSON.stringify(this.config, null, 2);
		await writeFile(configPath, serialized, "utf8");
		return configPath;
	}

	getSuiteConfig(suite: VerifySuiteType): SuiteConfigDefinition | undefined {
		return this.config.suiteConfigs?.[suite];
	}

	setSuiteConfig(
		suite: VerifySuiteType,
		definition: Partial<SuiteConfigDefinition>,
	): void {
		if (!this.config.suiteConfigs) {
			this.config.suiteConfigs = {};
		}

		const existing = this.config.suiteConfigs[suite] || this.generateStarterConfig(suite);
		this.config.suiteConfigs[suite] = {
			...existing,
			...definition,
			suite,
			commands: definition.commands || existing.commands,
		};
	}

	removeSuiteConfig(suite: VerifySuiteType): boolean {
		if (this.config.suiteConfigs && this.config.suiteConfigs[suite]) {
			delete this.config.suiteConfigs[suite];
			return true;
		}
		return false;
	}

	listConfiguredSuites(): VerifySuiteType[] {
		if (!this.config.suiteConfigs) return [];
		return Object.keys(this.config.suiteConfigs) as VerifySuiteType[];
	}

	addCommandToSuite(suite: VerifySuiteType, cmd: CustomVerifyCommand): void {
		if (!this.config.suiteConfigs) {
			this.config.suiteConfigs = {};
		}
		const existing = this.config.suiteConfigs[suite] || this.generateStarterConfig(suite);
		existing.commands.push(cmd);
		this.config.suiteConfigs[suite] = existing;
	}

	generateStarterConfig(suite: VerifySuiteType): SuiteConfigDefinition {
		return JSON.parse(JSON.stringify(STARTER_SUITE_TEMPLATES[suite])) as SuiteConfigDefinition;
	}

	validateSuiteConfig(
		suite: VerifySuiteType,
		config: SuiteConfigDefinition,
	): { valid: boolean; errors: string[] } {
		const errors: string[] = [];
		if (config.suite !== suite) {
			errors.push(`Suite mismatch: expected '${suite}', got '${config.suite}'`);
		}
		if (!Array.isArray(config.commands) || config.commands.length === 0) {
			errors.push(`Suite '${suite}' must configure at least one verification command`);
		} else {
			for (let i = 0; i < config.commands.length; i++) {
				const cmd = config.commands[i]!;
				if (!cmd.command || !cmd.command.trim()) {
					errors.push(`Command at index ${i} has empty 'command' string`);
				}
				if (!cmd.label || !cmd.label.trim()) {
					errors.push(`Command at index ${i} has empty 'label' string`);
				}
			}
		}

		return {
			valid: errors.length === 0,
			errors,
		};
	}

	// -----------------------------------------------------------------------
	// Specialized Suite Config Methods (UX-1091 to UX-1100)
	// -----------------------------------------------------------------------

	configureNodeJsSuite(options: {
		command?: string;
		label?: string;
		timeoutMs?: number;
		env?: Record<string, string>;
	}): void {
		const cmdStr = options.command || "npm test";
		this.setSuiteConfig("nodejs", {
			suite: "nodejs",
			commands: [
				{
					id: "node-test",
					label: options.label || "Node Test Suite",
					command: cmdStr,
					runtime: "node",
					timeoutMs: options.timeoutMs ?? 60_000,
					env: options.env,
				},
			],
		});
	}

	configurePythonSuite(options: {
		command?: string;
		label?: string;
		timeoutMs?: number;
		env?: Record<string, string>;
	}): void {
		const cmdStr = options.command || "pytest -v";
		this.setSuiteConfig("python", {
			suite: "python",
			commands: [
				{
					id: "pytest",
					label: options.label || "Python Pytest Gate",
					command: cmdStr,
					runtime: "python",
					timeoutMs: options.timeoutMs ?? 60_000,
					env: options.env,
				},
			],
		});
	}

	configureGoSuite(options: {
		command?: string;
		label?: string;
		timeoutMs?: number;
		env?: Record<string, string>;
	}): void {
		const cmdStr = options.command || "go test ./...";
		this.setSuiteConfig("go", {
			suite: "go",
			commands: [
				{
					id: "go-test",
					label: options.label || "Go Package Tests",
					command: cmdStr,
					runtime: "go",
					timeoutMs: options.timeoutMs ?? 60_000,
					env: options.env,
				},
			],
		});
	}

	configureRustSuite(options: {
		command?: string;
		label?: string;
		timeoutMs?: number;
		env?: Record<string, string>;
	}): void {
		const cmdStr = options.command || "cargo test";
		this.setSuiteConfig("rust", {
			suite: "rust",
			commands: [
				{
					id: "cargo-test",
					label: options.label || "Rust Cargo Harness",
					command: cmdStr,
					runtime: "rust",
					timeoutMs: options.timeoutMs ?? 120_000,
					env: options.env,
				},
			],
		});
	}

	configureDenoSuite(options: {
		command?: string;
		label?: string;
		timeoutMs?: number;
		allowPermissions?: string[];
		env?: Record<string, string>;
	}): void {
		const flags = options.allowPermissions?.map((p) => `--allow-${p}`).join(" ") || "-A";
		const cmdStr = options.command || `deno test ${flags}`;
		this.setSuiteConfig("deno", {
			suite: "deno",
			commands: [
				{
					id: "deno-test",
					label: options.label || "Deno Test Runner",
					command: cmdStr,
					runtime: "deno",
					timeoutMs: options.timeoutMs ?? 60_000,
					env: options.env,
				},
			],
		});
	}

	configureMakeSuite(options: {
		target?: string;
		command?: string;
		label?: string;
		timeoutMs?: number;
		env?: Record<string, string>;
	}): void {
		const cmdStr = options.command || `make ${options.target || "test"}`;
		this.setSuiteConfig("make", {
			suite: "make",
			commands: [
				{
					id: "make-target",
					label: options.label || "Makefile Target",
					command: cmdStr,
					runtime: "make",
					timeoutMs: options.timeoutMs ?? 60_000,
					env: options.env,
				},
			],
		});
	}

	configureSnapshotSuite(options: {
		command?: string;
		updateFlag?: string;
		label?: string;
		timeoutMs?: number;
	}): void {
		const cmdStr = options.command || "npx vitest run";
		this.setSuiteConfig("snapshots", {
			suite: "snapshots",
			commands: [
				{
					id: "snapshot-test",
					label: options.label || "Snapshot Assertions",
					command: cmdStr,
					runtime: "node",
					timeoutMs: options.timeoutMs ?? 60_000,
				},
			],
			suiteOptions: {
				updateFlag: options.updateFlag || "-u",
			},
		});
	}

	configureTypeScriptSuite(options: {
		command?: string;
		tsconfig?: string;
		label?: string;
		timeoutMs?: number;
	}): void {
		const tsconfig = options.tsconfig || "tsconfig.json";
		const cmdStr = options.command || `tsc -p ${tsconfig} --noEmit`;
		this.setSuiteConfig("typescript", {
			suite: "typescript",
			commands: [
				{
					id: "typecheck",
					label: options.label || "TypeScript Type Check",
					command: cmdStr,
					runtime: "node",
					timeoutMs: options.timeoutMs ?? 45_000,
				},
			],
			suiteOptions: {
				tsconfig,
			},
		});
	}

	configureLintSuite(options: {
		command?: string;
		fixFlag?: string;
		label?: string;
		timeoutMs?: number;
	}): void {
		const cmdStr = options.command || "npm run lint";
		this.setSuiteConfig("lint", {
			suite: "lint",
			commands: [
				{
					id: "lint-gate",
					label: options.label || "Lint & Formatting Gate",
					command: cmdStr,
					runtime: "node",
					timeoutMs: options.timeoutMs ?? 30_000,
				},
			],
			suiteOptions: {
				autoFixFlag: options.fixFlag || "--fix",
			},
		});
	}

	configureE2ESuite(options: {
		command?: string;
		headless?: boolean;
		label?: string;
		timeoutMs?: number;
	}): void {
		const cmdStr = options.command || "npx playwright test";
		this.setSuiteConfig("e2e", {
			suite: "e2e",
			commands: [
				{
					id: "e2e-suite",
					label: options.label || "End-to-End Test Suite",
					command: cmdStr,
					runtime: "node",
					timeoutMs: options.timeoutMs ?? 180_000,
				},
			],
			suiteOptions: {
				headless: options.headless ?? true,
			},
		});
	}
}
