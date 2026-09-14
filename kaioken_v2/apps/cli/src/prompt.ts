import {
	buildSystemPrompt,
	type KnowledgeContext,
	type PromptOptions,
} from "@kaioken/agent";
import {
	discoverContextFiles,
	formatContextFilesPrompt,
	type ContextFile,
} from "@kaioken/agentsmd";

export interface CliPromptOptions extends PromptOptions {
	workspaceRoot?: string;
	contextFiles?: ContextFile[];
}

/**
 * Build the system prompt for Kaioken CLI, automatically discovering
 * and injecting repository context files (AGENTS.md and .kaioken/rules/*.md)
 * into the prompt via formatContextFilesPrompt.
 */
export async function buildCliPrompt(
	ctx: KnowledgeContext,
	options: CliPromptOptions,
): Promise<string> {
	let contextFilesPrompt = options.contextFilesPrompt;

	if (!contextFilesPrompt) {
		const files =
			options.contextFiles ??
			(await discoverContextFiles({
				cwd: options.env?.cwd ?? ctx.root,
				workspaceRoot: options.workspaceRoot ?? ctx.root,
			}));

		if (files.length > 0) {
			contextFilesPrompt = formatContextFilesPrompt(files);
		}
	}

	return buildSystemPrompt(ctx, {
		...options,
		contextFilesPrompt: contextFilesPrompt || undefined,
	});
}

export { buildSystemPrompt };
