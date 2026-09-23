import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { KAIOKEN_DIR } from "@kaioken/scan";
import type {
	CustomVerifyCommand,
	SupportedRuntime,
	VerifyConfigFile,
	VerifyConfigValidationResult,
} from "./types.ts";

export const VERIFY_CONFIG_NAME = "verify.json";
export const VERIFY_CONFIG_PATH = join(KAIOKEN_DIR, VERIFY_CONFIG_NAME);

export function validateVerifyConfig(data: unknown): VerifyConfigValidationResult {
	const errors: string[] = [];

	if (!data || typeof data !== "object" || Array.isArray(data)) {
		return {
			valid: false,
			errors: ["Config root must be a valid JSON object"],
		};
	}

	const record = data as Record<string, unknown>;

	if (record.version !== undefined && typeof record.version !== "number") {
		errors.push("Field 'version' must be a number if specified");
	}

	if (!("commands" in record)) {
		errors.push("Missing required field 'commands' (must be an array)");
	} else if (!Array.isArray(record.commands)) {
		errors.push("Field 'commands' must be an array");
	} else {
		for (let i = 0; i < record.commands.length; i++) {
			const cmd = record.commands[i];
			if (!cmd || typeof cmd !== "object" || Array.isArray(cmd)) {
				errors.push(`commands[${i}] must be an object`);
				continue;
			}
			const cmdRecord = cmd as Record<string, unknown>;
			if (typeof cmdRecord.command !== "string" || !cmdRecord.command.trim()) {
				errors.push(`commands[${i}].command is required and must be a non-empty string`);
			}
			if (typeof cmdRecord.label !== "string" || !cmdRecord.label.trim()) {
				errors.push(`commands[${i}].label is required and must be a non-empty string`);
			}
			if (cmdRecord.timeoutMs !== undefined && typeof cmdRecord.timeoutMs !== "number") {
				errors.push(`commands[${i}].timeoutMs must be a number if specified`);
			}
			if (
				cmdRecord.runtime !== undefined &&
				!["node", "python", "go", "rust", "deno", "make"].includes(String(cmdRecord.runtime))
			) {
				errors.push(
					`commands[${i}].runtime must be one of: node, python, go, rust, deno, make`,
				);
			}
			if (
				cmdRecord.env !== undefined &&
				(typeof cmdRecord.env !== "object" || cmdRecord.env === null || Array.isArray(cmdRecord.env))
			) {
				errors.push(`commands[${i}].env must be a key-value object if specified`);
			}
		}
	}

	if (record.ignoreFlaky !== undefined) {
		if (
			!Array.isArray(record.ignoreFlaky) ||
			record.ignoreFlaky.some((item) => typeof item !== "string")
		) {
			errors.push("Field 'ignoreFlaky' must be an array of strings");
		}
	}

	if (record.maxFlakyReruns !== undefined && typeof record.maxFlakyReruns !== "number") {
		errors.push("Field 'maxFlakyReruns' must be a number if specified");
	}

	if (record.timeoutMs !== undefined && typeof record.timeoutMs !== "number") {
		errors.push("Field 'timeoutMs' must be a number if specified");
	}

	if (
		record.env !== undefined &&
		(typeof record.env !== "object" || record.env === null || Array.isArray(record.env))
	) {
		errors.push("Field 'env' must be a key-value map if specified");
	}

	if (errors.length > 0) {
		return { valid: false, errors };
	}

	return {
		valid: true,
		errors: [],
		config: data as VerifyConfigFile,
	};
}

export async function loadVerifyConfig(root: string): Promise<VerifyConfigFile | null> {
	const configPath = join(root, VERIFY_CONFIG_PATH);
	if (!existsSync(configPath)) {
		return null;
	}

	try {
		const text = await readFile(configPath, "utf8");
		const parsed = JSON.parse(text) as unknown;
		const validation = validateVerifyConfig(parsed);
		if (validation.valid && validation.config) {
			return validation.config;
		}
		return null;
	} catch {
		return null;
	}
}

export async function writeVerifyConfig(
	root: string,
	config: VerifyConfigFile,
): Promise<string> {
	const configPath = join(root, VERIFY_CONFIG_PATH);
	await mkdir(dirname(configPath), { recursive: true });
	const serialized = JSON.stringify(config, null, 2);
	await writeFile(configPath, serialized, "utf8");
	return configPath;
}
