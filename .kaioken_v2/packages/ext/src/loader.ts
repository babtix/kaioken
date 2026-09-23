import { promises as fs } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type {
	ExtensionAPI,
	ExtensionInstance,
	ExtensionManifest,
	ExtensionToolDefinition,
} from "./types.js";

export interface ExtensionLoaderOptions {
	workspaceRoot: string;
	extensionsDir?: string;
	logger?: {
		info(msg: string): void;
		warn(msg: string): void;
		error(msg: string): void;
	};
}

export class ExtensionLoader {
	readonly workspaceRoot: string;
	readonly extensionsDir: string;
	private readonly logger: {
		info(msg: string): void;
		warn(msg: string): void;
		error(msg: string): void;
	};

	constructor(options: ExtensionLoaderOptions) {
		this.workspaceRoot = resolve(options.workspaceRoot);
		this.extensionsDir = options.extensionsDir
			? resolve(options.extensionsDir)
			: join(this.workspaceRoot, ".kaioken", "extensions");
		this.logger = options.logger ?? {
			info: (msg) => console.log(`[ext info] ${msg}`),
			warn: (msg) => console.warn(`[ext warn] ${msg}`),
			error: (msg) => console.error(`[ext error] ${msg}`),
		};
	}

	async discoverExtensions(): Promise<Array<{ id: string; dir: string; manifest: ExtensionManifest }>> {
		const results: Array<{ id: string; dir: string; manifest: ExtensionManifest }> = [];

		try {
			await fs.access(this.extensionsDir);
		} catch {
			return results;
		}

		const entries = await fs.readdir(this.extensionsDir, { withFileTypes: true });
		for (const entry of entries) {
			if (!entry.isDirectory()) continue;
			const extDir = join(this.extensionsDir, entry.name);

			// Look for extension.json or package.json
			let manifest: ExtensionManifest | null = null;
			const extJsonPath = join(extDir, "extension.json");
			const pkgJsonPath = join(extDir, "package.json");

			try {
				const content = await fs.readFile(extJsonPath, "utf8");
				manifest = JSON.parse(content) as ExtensionManifest;
			} catch {
				try {
					const content = await fs.readFile(pkgJsonPath, "utf8");
					manifest = JSON.parse(content) as ExtensionManifest;
				} catch {
					continue;
				}
			}

			if (manifest && manifest.name) {
				results.push({
					id: entry.name,
					dir: extDir,
					manifest,
				});
			}
		}

		return results;
	}

	async loadExtension(
		id: string,
		dir: string,
		manifest: ExtensionManifest,
	): Promise<ExtensionInstance> {
		const isTrusted = manifest.trusted === true;
		const registeredTools: ExtensionToolDefinition[] = [];
		const eventHandlers = new Map<string, Array<(payload: unknown) => void | Promise<void>>>();

		const storageDir = join(dir, ".storage");

		const api: ExtensionAPI = {
			cwd: this.workspaceRoot,
			logger: {
				info: (msg) => this.logger.info(`[${id}] ${msg}`),
				warn: (msg) => this.logger.warn(`[${id}] ${msg}`),
				error: (msg) => this.logger.error(`[${id}] ${msg}`),
			},
			registerTool: (tool: ExtensionToolDefinition) => {
				if (!isTrusted) {
					this.logger.warn(
						`Extension "${id}" is untrusted; refused to register tool "${tool.name}".`,
					);
					return;
				}
				registeredTools.push(tool);
			},
			on: (event: string, handler: (payload: unknown) => void | Promise<void>) => {
				let handlers = eventHandlers.get(event);
				if (!handlers) {
					handlers = [];
					eventHandlers.set(event, handlers);
				}
				handlers.push(handler);
			},
		};

		// If untrusted, emit security warning
		if (!isTrusted) {
			this.logger.warn(
				`Extension "${id}" loaded in restricted mode (untrusted). Tools will not be registered.`,
			);
		}

		// Look for entrypoint
		const entryCandidates = manifest.entrypoint
			? [manifest.entrypoint]
			: ["index.js", "index.mjs", "index.ts", "main.js"];

		let entryFound: string | null = null;
		for (const candidate of entryCandidates) {
			const candidatePath = join(dir, candidate);
			try {
				await fs.access(candidatePath);
				entryFound = candidatePath;
				break;
			} catch {
				// Continue search
			}
		}

		let disposeFn: (() => Promise<void>) | undefined = undefined;

		if (entryFound) {
			try {
				const fileUrl = pathToFileURL(entryFound).href;
				const mod = await import(fileUrl);
				if (typeof mod.activate === "function") {
					const result = await mod.activate(api);
					if (result && typeof result.dispose === "function") {
						disposeFn = () => result.dispose();
					}
				} else if (typeof mod.default === "function") {
					const result = await mod.default(api);
					if (result && typeof result.dispose === "function") {
						disposeFn = () => result.dispose();
					}
				}
			} catch (error) {
				this.logger.error(`Failed to activate extension "${id}": ${error instanceof Error ? error.message : String(error)}`);
			}
		}

		const emitFn = async (event: string, payload: unknown): Promise<void> => {
			const handlers = eventHandlers.get(event);
			if (!handlers || handlers.length === 0) return;
			for (const handler of handlers) {
				try {
					await handler(payload);
				} catch (error) {
					this.logger.error(
						`Error in event handler for "${event}" in extension "${id}": ${error instanceof Error ? error.message : String(error)}`,
					);
				}
			}
		};

		return {
			id,
			manifest,
			tools: registeredTools,
			trusted: isTrusted,
			emit: emitFn,
			dispose: disposeFn,
		};
	}
}
