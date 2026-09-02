import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { IndexResult } from "@kaioken/index";
import { depthFor, type ModelClient } from "@kaioken/model";
import type { ScanResult } from "@kaioken/scan";
import { BRIEF_ARTIFACT, briefPath } from "./artifact.js";
import { buildGlobalPrompt } from "./plan.js";
import type { WikiPlan } from "./types.js";

export { BRIEF_ARTIFACT, briefPath };

const BRIEF_SYSTEM = `You are the principal engineer on this codebase, writing the ONE
authoritative brief that every chapter of its documentation will be written from. Other
writers will each see only their own files plus this brief, so it must carry the shared
truth they cannot derive alone.

Produce a compact markdown document, no more than about 80 lines, with exactly these
sections:

## What this system is
Two or three sentences: what it does and for whom. Concrete, not marketing.

## Architecture
The real top-level components and how they relate. Name actual packages, directories and
types from the input. State the dependency direction between them.

## Key flows
The two or three most important paths through the system (a request, a job, a build),
each as a short ordered list naming the real functions or files involved.

## Glossary
The canonical name for each domain concept, one per line as "**Term** — definition".
Include any term the codebase uses inconsistently, and state which name is canonical.
Every chapter will be required to use these exact terms.

## Conventions
Patterns a newcomer must follow: error handling, configuration, naming, layering.
Only ones actually visible in the code.

Rules:
- Ground everything in the provided structure and sources. Never invent a component.
- Name only files and declarations present in the evidence, because every chapter written
  from this brief is checked against the repository.
- Output ONLY the markdown brief.`;

const BRIEF_HEADER = `<!-- kaioken architecture brief — injected verbatim into every chapter prompt.
     EDIT FREELY: corrections here propagate to the whole wiki on the next run.
     Delete this file to have it regenerated. -->

`;

export interface BriefInput {
	scan: ScanResult;
	index: IndexResult | null;
	client: ModelClient;
	multiplier?: number;
	plan?: WikiPlan;
}

export async function readBrief(root: string): Promise<string | null> {
	try {
		const raw = await readFile(briefPath(root), "utf8");
		const stripped = stripBriefHeader(raw).trim();
		return stripped.length > 0 ? stripped : null;
	} catch {
		return null;
	}
}

export async function writeBrief(root: string, brief: string): Promise<string> {
	const path = briefPath(root);
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, `${BRIEF_HEADER}${brief.trimEnd()}\n`, "utf8");
	return path;
}

export async function buildBrief(input: BriefInput): Promise<string> {
	const depth = depthFor(input.multiplier ?? 1);
	let prompt = buildGlobalPrompt(input.scan, input.index, depth);

	if (input.plan && input.plan.chapters.length > 0) {
		prompt += "\n\nPlanned wiki chapters (the chapters that will use this brief):\n";
		for (const chapter of input.plan.chapters) {
			prompt += `\n- ${chapter.title}: ${chapter.goal}`;
		}
	}

	const maxTokens = Math.min(depth.maxOutputTokens, 2000);
	const reply = await input.client.complete({
		purpose: "wiki-brief",
		system: BRIEF_SYSTEM,
		prompt,
		maxOutputTokens: maxTokens,
	});

	const body = stripFences(reply);
	if (!body.trim()) {
		throw new Error("model returned an empty brief");
	}
	return body;
}

function stripBriefHeader(text: string): string {
	return text.replace(/^<!--[\s\S]*?-->\s*/, "");
}

function stripFences(reply: string): string {
	const trimmed = reply.trim();
	const fenced = /^```(?:markdown|md)?\s*\n([\s\S]*?)\n?```$/.exec(trimmed);
	return (fenced ? (fenced[1] as string) : trimmed).trim();
}
