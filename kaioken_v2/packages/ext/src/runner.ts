import type { ExtensionLoader } from "./loader.js";
import type { ExtensionInstance, ExtensionToolDefinition } from "./types.js";

export class ExtensionRunner {
	private readonly loader: ExtensionLoader;
	private activeExtensions: ExtensionInstance[] = [];
	private running = false;

	constructor(loader: ExtensionLoader) {
		this.loader = loader;
	}

	async start(): Promise<void> {
		if (this.running) return;
		this.running = true;

		const discovered = await this.loader.discoverExtensions();
		const loaded: ExtensionInstance[] = [];

		for (const ext of discovered) {
			const instance = await this.loader.loadExtension(ext.id, ext.dir, ext.manifest);
			loaded.push(instance);
		}

		this.activeExtensions = loaded;
	}

	async stop(): Promise<void> {
		if (!this.running) return;
		this.running = false;

		for (const ext of this.activeExtensions) {
			if (typeof ext.dispose === "function") {
				try {
					await ext.dispose();
				} catch {
					// Ignore dispose error
				}
			}
		}

		this.activeExtensions = [];
	}

	async emit(event: string, payload: unknown): Promise<void> {
		for (const ext of this.activeExtensions) {
			if (typeof ext.emit === "function") {
				try {
					await ext.emit(event, payload);
				} catch {
					// Ignore handler errors
				}
			}
		}
	}

	getActiveExtensions(): ExtensionInstance[] {
		return [...this.activeExtensions];
	}

	/**
	 * Returns tools only from trusted extensions.
	 * Security enforcement: untrusted extension tools are never returned.
	 */
	getTrustedTools(): Array<{ extId: string; tool: ExtensionToolDefinition }> {
		const tools: Array<{ extId: string; tool: ExtensionToolDefinition }> = [];

		for (const ext of this.activeExtensions) {
			if (!ext.trusted) continue;
			for (const tool of ext.tools) {
				tools.push({ extId: ext.id, tool });
			}
		}

		return tools;
	}
}
