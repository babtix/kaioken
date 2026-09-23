import type { ToolResult, ToolRunOptions } from "@kaioken/agent";

export interface ExtensionManifest {
	name: string;
	version: string;
	description?: string;
	author?: string;
	entrypoint?: string;
	trusted?: boolean;
	capabilities?: {
		tools?: boolean;
		commands?: boolean;
		events?: boolean;
	};
}

export interface ExtensionContext {
	cwd: string;
	extensionDir: string;
	storageDir: string;
	logger: {
		info(msg: string): void;
		warn(msg: string): void;
		error(msg: string): void;
	};
}

export interface ExtensionToolDefinition {
	name: string;
	description: string;
	inputSchema: Record<string, unknown>;
	execute(args: Record<string, unknown>, options?: ToolRunOptions): Promise<ToolResult>;
}

export interface ExtensionAPI {
	registerTool(tool: ExtensionToolDefinition): void;
	on(event: string, handler: (payload: unknown) => void | Promise<void>): void;
	cwd: string;
	logger: {
		info(msg: string): void;
		warn(msg: string): void;
		error(msg: string): void;
	};
}

export interface ExtensionInstance {
	id: string;
	manifest: ExtensionManifest;
	tools: ExtensionToolDefinition[];
	trusted: boolean;
	emit?(event: string, payload: unknown): Promise<void>;
	dispose?(): Promise<void>;
}
