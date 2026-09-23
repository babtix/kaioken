import { readFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { parse as parseYaml } from "yaml";
import { parseSemver } from "./semver.js";

/**
 * What an extension says it is.
 *
 * The manifest is a security boundary before it is a description: the id
 * becomes a directory name, the version drives updates, and the type decides
 * whether anything the package ships is ever executed. So validation is strict
 * and stated in one place — a manifest that passes here is one the installer is
 * allowed to trust about those three things, and nothing else.
 */

export const MANIFEST_NAME = "extension.yaml";

/** Documents only. Nothing an extension of this type ships is ever run. */
export const TYPE_DECLARATIVE = "declarative";
/** A server process the host launches and whose tools the agent may call. */
export const TYPE_MCP = "mcp";
/** A WebAssembly module the host runs in the engine's own sandbox. */
export const TYPE_WASM = "wasm";

export type ExtensionType = "declarative" | "mcp" | "wasm";

export interface McpConfig {
	/** Resolved on PATH when it is a bare name. Runs in the install directory. */
	command: string;
	args?: string[];
	env?: Record<string, string>;
}

export interface WasmConfig {
	/** Module path relative to the package root, e.g. "dist/plugin.wasm". */
	entry: string;
}

export interface CommandDecl {
	name: string;
	description?: string;
}

export interface Manifest {
	/** "owner.name": two lowercase kebab-case segments. */
	id: string;
	name: string;
	version: string;
	description?: string;
	author?: string;
	/** Informational "owner/repo" origin; the lockfile records the real source. */
	repo?: string;
	type: ExtensionType;
	mcp?: McpConfig;
	wasm?: WasmConfig;
	/** Capabilities a wasm module asks for, granted as a set at trust time. */
	permissions?: string[];
	minKaiokenVersion?: string;
	/** User-invokable entry points, run through `/x`. Wasm and mcp only. */
	commands?: CommandDecl[];
}

/**
 * Capabilities the host knows how to grant.
 *
 * An unknown permission fails installation outright rather than being dropped:
 * a capability that silently disappears leaves a plugin failing at runtime for
 * a reason nobody can see from either side.
 */
const KNOWN_PERMISSIONS = new Set(["read_repo", "network"]);

const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*\.[a-z0-9]+(?:-[a-z0-9]+)*$/;

export async function loadManifest(dir: string): Promise<Manifest> {
	let raw: string;
	try {
		raw = await readFile(join(dir, MANIFEST_NAME), "utf8");
	} catch {
		throw new Error(`no ${MANIFEST_NAME} found — this is not a Kaioken extension`);
	}

	let parsed: unknown;
	try {
		parsed = parseYaml(raw);
	} catch (error) {
		throw new Error(`parsing ${MANIFEST_NAME}: ${(error as Error).message.split("\n")[0]}`);
	}
	return validateManifest(parsed);
}

export function validateManifest(value: unknown): Manifest {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		throw new Error(`${MANIFEST_NAME} is not a mapping`);
	}
	const record = value as Record<string, unknown>;

	const id = text(record.id);
	// The id becomes a path segment on disk, so it may not be one.
	if (!ID_PATTERN.test(id)) {
		throw new Error(`extension id "${id}" must be "owner.name" in lowercase kebab-case`);
	}
	const name = text(record.name);
	if (!name) throw new Error(`extension ${id} has no name`);

	const version = text(record.version);
	if (!parseSemver(version)) {
		throw new Error(`extension ${id}: "${version}" is not a MAJOR.MINOR.PATCH version`);
	}

	const declared = text(record.type) || TYPE_DECLARATIVE;
	if (declared !== TYPE_DECLARATIVE && declared !== TYPE_MCP && declared !== TYPE_WASM) {
		throw new Error(`extension type "${declared}" is not supported — declarative, mcp or wasm`);
	}
	const type = declared as ExtensionType;

	const mcp = record.mcp ? readMcp(id, record.mcp) : undefined;
	const wasm = record.wasm ? readWasm(id, record.wasm) : undefined;

	// The cross-checks are what stop a declarative extension — the tier a user
	// installs without thinking about it — from smuggling in a payload.
	if (type === TYPE_DECLARATIVE) {
		if (mcp) throw new Error(`extension ${id}: declarative extensions must not declare an mcp server`);
		if (wasm) throw new Error(`extension ${id}: declarative extensions must not declare a wasm module`);
	}
	if (type === TYPE_MCP) {
		if (!mcp) throw new Error(`extension ${id}: mcp extensions must declare mcp.command`);
		if (wasm) throw new Error(`extension ${id}: mcp extensions must not declare a wasm module`);
	}
	if (type === TYPE_WASM) {
		if (!wasm) throw new Error(`extension ${id}: wasm extensions must declare wasm.entry`);
		if (mcp) throw new Error(`extension ${id}: wasm extensions must not declare an mcp server`);
	}

	const permissions = strings(record.permissions);
	if (permissions.length > 0 && type !== TYPE_WASM) {
		throw new Error(`extension ${id}: permissions apply to wasm extensions only`);
	}
	for (const permission of permissions) {
		if (!KNOWN_PERMISSIONS.has(permission)) {
			throw new Error(`extension ${id}: permission "${permission}" is not supported`);
		}
	}

	const minimum = text(record.minKaiokenVersion);
	if (minimum && !parseSemver(minimum)) {
		throw new Error(`extension ${id}: invalid minKaiokenVersion "${minimum}"`);
	}

	const commands = readCommands(record.commands);
	if (commands.length > 0 && type === TYPE_DECLARATIVE) {
		throw new Error(`extension ${id}: declarative extensions contribute documents, not commands`);
	}

	return {
		id,
		name,
		version,
		type,
		...(text(record.description) ? { description: text(record.description) } : {}),
		...(text(record.author) ? { author: text(record.author) } : {}),
		...(text(record.repo) ? { repo: text(record.repo) } : {}),
		...(mcp ? { mcp } : {}),
		...(wasm ? { wasm } : {}),
		...(permissions.length > 0 ? { permissions } : {}),
		...(minimum ? { minKaiokenVersion: minimum } : {}),
		...(commands.length > 0 ? { commands } : {}),
	};
}

/** Does this type run code, and therefore need per-version trust? */
export function isExecutable(type: ExtensionType): boolean {
	return type === TYPE_MCP || type === TYPE_WASM;
}

function readMcp(id: string, value: unknown): McpConfig {
	if (!value || typeof value !== "object") throw new Error(`extension ${id}: mcp must be a mapping`);
	const record = value as Record<string, unknown>;
	const command = text(record.command);
	if (!command) throw new Error(`extension ${id}: mcp extensions must declare mcp.command`);
	const env: Record<string, string> = {};
	if (record.env && typeof record.env === "object") {
		for (const [key, entry] of Object.entries(record.env as Record<string, unknown>)) {
			if (typeof entry === "string") env[key] = entry;
		}
	}
	return {
		command,
		...(strings(record.args).length > 0 ? { args: strings(record.args) } : {}),
		...(Object.keys(env).length > 0 ? { env } : {}),
	};
}

function readWasm(id: string, value: unknown): WasmConfig {
	if (!value || typeof value !== "object") throw new Error(`extension ${id}: wasm must be a mapping`);
	const entry = text((value as Record<string, unknown>).entry);
	// The entry is joined onto the install directory, so a path that escapes it
	// would let a package name any file on the machine as its module.
	if (!entry.endsWith(".wasm") || isAbsolute(entry) || entry.split(/[\\/]/).includes("..")) {
		throw new Error(`extension ${id}: wasm.entry must be a relative .wasm path inside the package`);
	}
	return { entry };
}

function readCommands(value: unknown): CommandDecl[] {
	if (!Array.isArray(value)) return [];
	const out: CommandDecl[] = [];
	for (const entry of value) {
		if (!entry || typeof entry !== "object") continue;
		const record = entry as Record<string, unknown>;
		const name = text(record.name);
		if (!name) continue;
		out.push({ name, ...(text(record.description) ? { description: text(record.description) } : {}) });
	}
	return out;
}

function text(value: unknown): string {
	return typeof value === "string" ? value.trim() : "";
}

function strings(value: unknown): string[] {
	return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}
