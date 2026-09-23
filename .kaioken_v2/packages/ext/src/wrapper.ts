import type { CodingTool, ToolResult, ToolRunOptions } from "@kaioken/agent";
import type { ExtensionToolDefinition } from "./types.js";

/**
 * Wrap an extension tool definition into a CodingTool.
 *
 * Enforces collision resolution: if the tool name collides with an existing
 * tool name, prefixes as `mcp_<extId>_<toolName>`.
 */
export function wrapExtensionTool(
	extId: string,
	tool: ExtensionToolDefinition,
	existingToolNames: Set<string>,
): CodingTool {
	let finalName = tool.name;

	if (existingToolNames.has(finalName)) {
		const cleanExtId = extId.replace(/[^A-Za-z0-9]/g, "_");
		finalName = `mcp_${cleanExtId}_${tool.name}`.replace(/[^A-Za-z0-9_]/g, "_");

		while (existingToolNames.has(finalName)) {
			finalName = `${finalName}_`;
		}
	}

	existingToolNames.add(finalName);

	return {
		name: finalName,
		label: `${extId}: ${tool.name}`,
		description: tool.description,
		inputSchema: tool.inputSchema,
		async run(args: Record<string, unknown>, options?: ToolRunOptions): Promise<ToolResult> {
			return tool.execute(args, options);
		},
	};
}
