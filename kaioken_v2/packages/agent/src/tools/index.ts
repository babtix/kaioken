import type { CodingTool, CodingToolPorts, KnowledgeContext, KnowledgeTool } from "../types.js";
import { KNOWLEDGE_TOOLS, toolByName } from "../tools.js";
import { createBashTool } from "./coding/bash.js";
import { createEditTool } from "./coding/edit.js";
import { createWriteTool } from "./coding/write.js";
import { createGrepTool } from "./coding/grep.js";
import { createFindTool } from "./coding/find.js";
import { createLsTool } from "./coding/ls.js";

// Re-export for single import point.
export { KNOWLEDGE_TOOLS, toolByName };

/**
 * Create all coding tools bound to a workspace root and ports.
 *
 * The tools themselves are Pi-free and transport-agnostic: `FileSystemPort`
 * and `ShellPort` are injected by the host (apps/cli).
 */
export function createCodingTools(cwd: string, ports: CodingToolPorts): CodingTool[] {
	return [
		createBashTool(cwd, ports.shell),
		createEditTool(cwd, ports.fs),
		createWriteTool(cwd, ports.fs),
		createGrepTool(cwd, ports.shell),
		createFindTool(cwd, ports.fs),
		createLsTool(cwd, ports.fs),
	];
}

/**
 * Knowledge tools + coding tools combined.
 *
 * The host uses this array to offer everything to the agent loop. Knowledge
 * tools take `KnowledgeContext` per call; coding tools bind to ports at
 * creation time. The host adapter in `agent-host.ts` bridges both shapes
 * into the runtime's tool envelope.
 */
export function createAllTools(
	cwd: string,
	ports: CodingToolPorts,
): { knowledge: readonly KnowledgeTool[]; coding: CodingTool[] } {
	return {
		knowledge: KNOWLEDGE_TOOLS,
		coding: createCodingTools(cwd, ports),
	};
}
