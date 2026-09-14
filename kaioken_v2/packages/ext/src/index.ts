// Legacy extension system exports
export {
	isExecutable,
	loadManifest,
	MANIFEST_NAME,
	TYPE_DECLARATIVE,
	TYPE_MCP,
	TYPE_WASM,
	validateManifest,
} from "./manifest.js";
export type { CommandDecl, ExtensionType, Manifest, McpConfig, WasmConfig } from "./manifest.js";
export { atLeast, compareSemver, isNewer, parseSemver } from "./semver.js";
export type { Semver } from "./semver.js";
export {
	extensionsRoot,
	findInstalled,
	installDir,
	isTrusted,
	loadLock,
	lockPath,
	removeFromLock,
	saveLock,
	upsert,
} from "./lock.js";
export type { Installed, Lock } from "./lock.js";
export { extractTo, readTar, readTarGz, safeJoin } from "./archive.js";
export type { ArchiveEntry } from "./archive.js";
export {
	activeExtensions,
	installExtension,
	listInstalled,
	removeExtension,
	setEnabled,
	trustExtension,
	updateExtensions,
} from "./install.js";
export type { InstallOptions, InstallResult, UpdateResult } from "./install.js";
export { contributedSkills } from "./contribute.js";
export type { ContributedSkill } from "./contribute.js";
export { runWasmCommand } from "./wasm.js";
export type { WasmResult, WasmRunOptions } from "./wasm.js";
export { callMcpTool, listMcpTools } from "./mcp.js";
export type { McpCallResult, McpTool } from "./mcp.js";
export { fetchRegistry, RegistryUnpublished, registryUrl, searchRegistry } from "./registry.js";
export type { RegistryEntry, RegistryOptions } from "./registry.js";

// Sprint 5: Unified Extension Architecture
export { ExtensionLoader } from "./loader.js";
export type { ExtensionLoaderOptions } from "./loader.js";
export { ExtensionRunner } from "./runner.js";
export { wrapExtensionTool } from "./wrapper.js";
export { createExtensionPort } from "./extension-port.js";
export type { ExtensionPortOptions } from "./extension-port.js";
export type {
	ExtensionManifest,
	ExtensionContext,
	ExtensionToolDefinition,
	ExtensionAPI,
	ExtensionInstance,
} from "./types.js";
