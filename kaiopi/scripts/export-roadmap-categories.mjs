import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const masterPath = "docs/roadmap/features-2000-ux-quality-roadmap.md";
const outDir = "docs/roadmap/categories";
mkdirSync(outDir, { recursive: true });

const content = readFileSync(masterPath, "utf-8");
const lines = content.split("\n");

// Find all category header line indices
const categoryIndices = [];
for (let i = 0; i < lines.length; i++) {
	if (lines[i].startsWith("## Category ")) {
		categoryIndices.push(i);
	}
}

console.log(`Found ${categoryIndices.length} categories.`);

function slugify(text) {
	return text
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

const exportedFiles = [];

for (let c = 0; c < categoryIndices.length; c++) {
	const start = categoryIndices[c];
	const end = c + 1 < categoryIndices.length ? categoryIndices[c + 1] : lines.length;
	const catLines = lines.slice(start, end);

	// Extract title line, e.g. "## Category 1: Terminal UI (TUI) & Visual Aesthetics"
	const headerLine = catLines[0];
	const match = headerLine.match(/^## Category (\d+):\s*(.+)$/);
	if (!match) {
		console.error(`Could not parse header line: ${headerLine}`);
		continue;
	}

	const catNum = parseInt(match[1], 10);
	const catTitle = match[2].trim();
	const padNum = String(catNum).padStart(2, "0");
	const slug = slugify(catTitle);
	const filename = `${padNum}-${slug}.md`;
	const filePath = join(outDir, filename);

	const body = catLines.join("\n").trim();
	writeFileSync(filePath, body + "\n", "utf-8");
	exportedFiles.push({ catNum, catTitle, filename, filePath });
	console.log(`Exported Category ${catNum} -> ${filename}`);
}

console.log(`Successfully exported all ${exportedFiles.length} categories to ${outDir}.`);
