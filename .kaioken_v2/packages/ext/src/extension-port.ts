import type { CodingTool, ExtensionPort } from "@kaioken/agent";
import type { ExtensionRunner } from "./runner.js";
import { wrapExtensionTool } from "./wrapper.js";

export interface ExtensionPortOptions {
	existingToolNames?: Set<string>;
	onlyTrusted?: boolean;
}

/**
 * Creates a concrete ExtensionPort implementing @kaioken/agent's ExtensionPort contract.
 *
 * CRITICAL SECURITY GUARANTEE:
 * Only extensions with manifest.trusted === true contribute tools.
 * Untrusted extension tools are never returned to the agent loop.
 */
export function createExtensionPort(
	runner: ExtensionRunner,
	options: ExtensionPortOptions = {},
): ExtensionPort {
	const existingToolNames = options.existingToolNames ?? new Set<string>();

	return {
		async discoverTools(): Promise<CodingTool[]> {
			await runner.start();
			const trustedTools = runner.getTrustedTools();
			const tools: CodingTool[] = [];

			for (const { extId, tool } of trustedTools) {
				const wrapped = wrapExtensionTool(extId, tool, existingToolNames);
				tools.push(wrapped);
			}

			return tools;
		},
	};
}
