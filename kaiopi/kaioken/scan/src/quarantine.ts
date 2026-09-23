import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { maskToken } from "./entropy.ts";

export interface SecretFinding {
	path: string;
	category: string;
	line?: number;
	maskedToken: string;
	severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
	recommendedAction: string;
}

export interface QuarantineManifestEntry {
	originalPath: string;
	quarantinePath: string;
	hash: string;
	quarantinedAt: string;
	reason: string;
}

export interface QuarantineManifest {
	version: number;
	updatedAt: string;
	entries: QuarantineManifestEntry[];
}

export interface QuarantineOptions {
	/** Leave a sanitized .example template in place of original file. */
	createTemplate?: boolean;
	/** Copy instead of move. Defaults to false (move to quarantine). */
	copyOnly?: boolean;
}

export interface QuarantineResult {
	quarantined: boolean;
	originalPath: string;
	quarantinePath: string;
	templatePath?: string;
}

/**
 * Format a structured risk classification table for terminal output.
 */
export function formatClassificationTable(findings: SecretFinding[]): string {
	if (findings.length === 0) {
		return "✓ Risk Shield: Zero critical secrets or quarantine candidates detected.";
	}

	const headers = ["Severity", "Category", "File Path", "Line", "Preview", "Action"];
	const rows = findings.map((f) => [
		f.severity,
		f.category,
		f.path,
		f.line ? String(f.line) : "-",
		f.maskedToken,
		f.recommendedAction,
	]);

	const colWidths = headers.map((h, i) =>
		Math.max(h.length, ...rows.map((row) => (row[i] ? row[i]!.length : 0))),
	);

	const pad = (text: string, len: number) => text.padEnd(len);

	const headerLine = `| ${headers.map((h, i) => pad(h, colWidths[i]!)).join(" | ")} |`;
	const separatorLine = `|${colWidths.map((w) => "-".repeat(w + 2)).join("|")}|`;
	const rowLines = rows.map(
		(row) => `| ${row.map((cell, i) => pad(cell, colWidths[i]!)).join(" | ")} |`,
	);

	return [
		"╔" + "═".repeat(separatorLine.length - 2) + "╗",
		`║ ${pad("KAIOKEN RISK SHIELD: CLASSIFICATION BREAKDOWN TABLE", separatorLine.length - 4)} ║`,
		"╠" + "═".repeat(separatorLine.length - 2) + "╣",
		headerLine,
		separatorLine,
		...rowLines,
		"╚" + "═".repeat(separatorLine.length - 2) + "╝",
	].join("\n");
}

/**
 * Generate automated .gitignore and .kaiokenignore rule suggestions based on
 * detected sensitive files and directories.
 */
export function suggestIgnoreRules(
	findings: SecretFinding[],
	existingPatterns: string[] = [],
): string[] {
	const suggestions = new Set<string>();
	const existing = new Set(existingPatterns.map((p) => p.trim()));

	for (const f of findings) {
		const base = basename(f.path);
		const lowerBase = base.toLowerCase();

		if (lowerBase === ".env" || lowerBase.startsWith(".env.")) {
			suggestions.add(".env");
			suggestions.add(".env.*");
			suggestions.add("!.env.example");
			suggestions.add("!.env.sample");
		} else if (f.category.includes("Private Key") || f.path.endsWith(".pem") || f.path.endsWith(".key")) {
			suggestions.add("*.pem");
			suggestions.add("*.key");
			suggestions.add("*.p12");
			suggestions.add("*.pfx");
			suggestions.add("id_rsa");
			suggestions.add("id_ed25519");
		} else if (f.category.includes("Credential") || lowerBase.includes("secret") || lowerBase.includes("credential")) {
			if (base.endsWith(".json")) suggestions.add("*secret*.json");
			if (base.endsWith(".yaml") || base.endsWith(".yml")) suggestions.add("*secret*.yaml");
			suggestions.add(base);
		} else if (f.category.includes("Large Binary") || f.path.endsWith(".bin") || f.path.endsWith(".iso")) {
			const ext = base.slice(base.lastIndexOf("."));
			if (ext) suggestions.add(`*${ext}`);
		} else if (f.path.includes("node_modules/")) {
			suggestions.add("node_modules/");
		} else if (f.path.includes("vendor/")) {
			suggestions.add("vendor/");
		} else {
			// Suggest exact relative path or extension
			suggestions.add(f.path);
		}
	}

	// Filter out patterns already present in existing ignores
	const newRules = [...suggestions].filter((rule) => !existing.has(rule));
	return newRules.sort();
}

/**
 * Quarantines a dangerous secret file into `.kaioken/quarantine/` and logs entry to manifest.
 */
export async function quarantineSecretFile(
	root: string,
	relPath: string,
	options: QuarantineOptions = {},
): Promise<QuarantineResult> {
	const absOriginal = join(root, relPath);
	const quarantineDir = join(root, ".kaioken", "quarantine");
	await mkdir(quarantineDir, { recursive: true });

	const content = await readFile(absOriginal);
	const hash = createHash("sha256").update(content).digest("hex");

	const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
	const safeBase = basename(relPath);
	const quarantineFileName = `${timestamp}_${safeBase}`;
	const absQuarantine = join(quarantineDir, quarantineFileName);

	if (options.copyOnly) {
		await copyFile(absOriginal, absQuarantine);
	} else {
		await rename(absOriginal, absQuarantine);
	}

	let templatePath: string | undefined;
	if (options.createTemplate && !options.copyOnly) {
		templatePath = `${absOriginal}.example`;
		const sampleContent = generateExampleTemplate(content.toString("utf8"));
		await writeFile(templatePath, sampleContent, "utf8");
	}

	// Update quarantine manifest
	const manifestPath = join(quarantineDir, "manifest.json");
	let manifest: QuarantineManifest = { version: 1, updatedAt: new Date().toISOString(), entries: [] };
	try {
		const raw = await readFile(manifestPath, "utf8");
		manifest = JSON.parse(raw) as QuarantineManifest;
	} catch {
		// New manifest
	}

	manifest.entries.push({
		originalPath: relPath,
		quarantinePath: `.kaioken/quarantine/${quarantineFileName}`,
		hash,
		quarantinedAt: new Date().toISOString(),
		reason: "Quarantined by Kaioken Risk Shield secret scanner",
	});
	manifest.updatedAt = new Date().toISOString();

	await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");

	return {
		quarantined: true,
		originalPath: relPath,
		quarantinePath: `.kaioken/quarantine/${quarantineFileName}`,
		templatePath,
	};
}

function generateExampleTemplate(originalText: string): string {
	const lines = originalText.split(/\r?\n/);
	const sanitized = lines.map((line) => {
		if (line.includes("=") && !line.trim().startsWith("#")) {
			const idx = line.indexOf("=");
			const key = line.slice(0, idx);
			return `${key}=your_${key.trim().toLowerCase()}_here`;
		}
		return line;
	});
	return sanitized.join("\n") + "\n";
}
