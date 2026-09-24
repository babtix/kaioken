import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { stringify as stringifyYaml } from "yaml";
import { safeFileName } from "./artifact.ts";
import { formatCardBadge, formatCitationDensityGauge } from "./cards.ts";
import type { Card, ObsidianExportOptions } from "./types.ts";

/**
 * Generate YAML frontmatter object for an Obsidian knowledge card.
 */
export function cardToFrontmatter(
	card: Card,
	options: ObsidianExportOptions = {},
): Record<string, unknown> {
	const score = card.verification?.score ?? (card.verification?.grounded ? 100 : 0);
	const status = card.verification?.status ?? "grounded";
	const defaultTags = ["kaioken", "knowledge-card", "architecture", `module-${card.moduleId}`];
	const tags = [...new Set([...defaultTags, ...(options.extraTags ?? [])])];

	return {
		id: card.moduleId,
		title: card.name,
		type: "knowledge-card",
		status,
		grounded_score: `${score}%`,
		citations_verified: card.verification?.grounded ?? 0,
		citations_defects: card.verification?.ungrounded.length ?? 0,
		entry_points_count: card.entryPoints.length,
		sources_count: card.sources.length,
		generated_at: card.generatedAt,
		tags,
		sources: card.sources.map((s) => s.path),
	};
}

/**
 * Export a knowledge card to clean Obsidian-compatible Markdown with YAML frontmatter,
 * Obsidian wikilinks, callouts, and structured verification tables (UX-1341 to UX-1350).
 */
export function cardToMarkdown(card: Card, options: ObsidianExportOptions = {}): string {
	const useWikilinks = options.wikilinks ?? true;
	const useCallouts = options.callouts ?? true;
	const frontmatterObj = cardToFrontmatter(card, options);
	const frontmatterYaml = stringifyYaml(frontmatterObj).trim();

	const badge = formatCardBadge(card.verification, { unicode: true });
	const density = formatCitationDensityGauge(card, { unicode: true, width: 12 });

	const lines: string[] = [
		"---",
		frontmatterYaml,
		"---",
		"",
		`# 📇 ${card.name} (\`${card.moduleId}\`)`,
		"",
		`**Verification Status**: \`${badge}\` &nbsp;|&nbsp; **Citation Density**: \`${density}\``,
		"",
	];

	// Overview Section with Obsidian Callout
	if (useCallouts) {
		lines.push("> [!abstract] Architectural Overview");
		for (const sl of (card.summary || "No summary provided.").split("\n")) {
			lines.push(`> ${sl}`);
		}
		lines.push("");
	} else {
		lines.push("## Architectural Overview", "", card.summary || "No summary provided.", "");
	}

	// Key Points Section with Callout
	if (card.keyPoints.length > 0) {
		if (useCallouts) {
			lines.push("> [!tip] Key Takeaways & Invariants");
			for (const kp of card.keyPoints) {
				lines.push(`> - ${kp}`);
			}
			lines.push("");
		} else {
			lines.push("## Key Takeaways", "");
			for (const kp of card.keyPoints) {
				lines.push(`- ${kp}`);
			}
			lines.push("");
		}
	}

	// Verified Entry Points Table
	lines.push("## Verified Entry Points", "");
	if (card.entryPoints.length === 0) {
		lines.push("_No entry points indexed for this module._", "");
	} else {
		lines.push("| Symbol | Declaring File | Line | Kind | Verification | Note |");
		lines.push("| :--- | :--- | :---: | :---: | :---: | :--- |");
		for (const ep of card.entryPoints) {
			const symDisplay = useWikilinks ? `\`[[${ep.name}]]\`` : `\`${ep.name}\``;
			const fileDisplay = useWikilinks ? `\`[[${ep.file}]]\`` : `\`${ep.file}\``;
			const lineDisplay = ep.line ? String(ep.line) : "-";
			const kindDisplay = ep.kind ? `\`${ep.kind}\`` : "-";
			const statusDisplay = ep.line ? "✔ Grounded" : "✖ Ungrounded";
			const noteDisplay = ep.note.replace(/\|/g, "\\|") || "-";
			lines.push(`| ${symDisplay} | ${fileDisplay} | ${lineDisplay} | ${kindDisplay} | ${statusDisplay} | ${noteDisplay} |`);
		}
		lines.push("");
	}

	// Provenance Sources
	lines.push("## Provenance Sources", "");
	if (card.sources.length === 0) {
		lines.push("_No source files mapped to this module._", "");
	} else {
		for (const src of card.sources) {
			const fileLink = useWikilinks ? `[[${src.path}]]` : `\`${src.path}\``;
			const hashPart = src.hash ? ` \`(sha: ${src.hash.slice(0, 10)})\`` : "";
			lines.push(`- ${fileLink}${hashPart}`);
		}
		lines.push("");
	}

	// Verification Diagnostics if any defects exist
	if (
		(card.verification?.ungrounded && card.verification.ungrounded.length > 0) ||
		(card.verification?.unknownFiles && card.verification.unknownFiles.length > 0)
	) {
		lines.push("> [!warning] Verification Defect Report");
		if (card.verification.ungrounded.length > 0) {
			lines.push(`> - **Ungrounded Symbols**: ${card.verification.ungrounded.map((s) => `\`${s}\``).join(", ")}`);
		}
		if (card.verification.unknownFiles.length > 0) {
			lines.push(`> - **Unknown Files**: ${card.verification.unknownFiles.map((f) => `\`${f}\``).join(", ")}`);
		}
		lines.push("");
	}

	return lines.join("\n");
}

/**
 * Generate an Obsidian Map of Content (MOC.md) index linking all knowledge cards.
 */
export function generateVaultMapOfContent(
	cards: readonly Card[],
	options: ObsidianExportOptions = {},
): string {
	const useWikilinks = options.wikilinks ?? true;
	const frontmatter = stringifyYaml({
		title: "Knowledge Cards — Map of Content",
		type: "moc",
		total_cards: cards.length,
		generated_at: new Date().toISOString(),
		tags: ["kaioken", "moc", "index"],
	}).trim();

	const lines: string[] = [
		"---",
		frontmatter,
		"---",
		"",
		"# 🗺️ Repository Knowledge Base — Map of Content",
		"",
		`_Generated by Kaioken & Pi. Total modules: **${cards.length}**._`,
		"",
		"| Module ID | Module Name | Status | Citations | Sources | Summary |",
		"| :--- | :--- | :---: | :---: | :---: | :--- |",
	];

	for (const card of cards) {
		const targetFile = safeFileName(card.moduleId);
		const link = useWikilinks
			? `[[${targetFile}\\|${card.name}]]`
			: `[${card.name}](${targetFile}.md)`;
		const badge = formatCardBadge(card.verification, { unicode: true });
		const grounded = card.verification?.grounded ?? 0;
		const totalEp = card.entryPoints.length;
		const summarySnippet = card.summary.replace(/\|/g, "\\|").slice(0, 80) + (card.summary.length > 80 ? "..." : "");

		lines.push(
			`| \`${card.moduleId}\` | ${link} | \`${badge}\` | ${grounded}/${totalEp} | ${card.sources.length} | ${summarySnippet} |`,
		);
	}

	lines.push("");
	return lines.join("\n");
}

/**
 * Batch export all knowledge cards as Obsidian markdown files with frontmatter and an MOC.md index.
 */
export async function exportCardsToObsidianVault(
	cards: readonly Card[],
	targetDir: string,
	options: ObsidianExportOptions = {},
): Promise<{ filesWritten: string[]; indexFile: string }> {
	await mkdir(targetDir, { recursive: true });

	const filesWritten: string[] = [];

	for (const card of cards) {
		const filename = `${safeFileName(card.moduleId)}.md`;
		const filePath = join(targetDir, filename);
		const content = cardToMarkdown(card, options);
		await writeFile(filePath, content, "utf8");
		filesWritten.push(filePath);
	}

	const mocPath = join(targetDir, "MOC.md");
	const mocContent = generateVaultMapOfContent(cards, options);
	await writeFile(mocPath, mocContent, "utf8");
	filesWritten.push(mocPath);

	return { filesWritten, indexFile: mocPath };
}
