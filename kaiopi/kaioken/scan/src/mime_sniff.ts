import { type RiskArchetype } from "./archetypes.ts";

export interface SniffedMimeResult {
	mimeType: string;
	isBinary: boolean;
	targetArchetypes: RiskArchetype[];
	description: string;
	confidence: "EXACT_MAGIC" | "CONTENT_HEURISTIC" | "FALLBACK";
}

/**
 * Sniffs the MIME type and maps to risk archetypes when file extension is absent
 * across all 10 threat surfaces (UX-0581 to UX-0590).
 */
export function sniffMimeAndArchetypes(
	head: Buffer,
	filePath = "",
): SniffedMimeResult {
	if (!head || head.length === 0) {
		return {
			mimeType: "application/octet-stream",
			isBinary: false,
			targetArchetypes: [],
			description: "Empty file payload",
			confidence: "FALLBACK",
		};
	}

	// 1. Check Magic Bytes for Executable / Binary Files (UX-0588)
	// Windows PE Executable (MZ)
	if (head.length >= 2 && head[0] === 0x4d && head[1] === 0x5a) {
		return {
			mimeType: "application/x-dosexec",
			isBinary: true,
			targetArchetypes: ["binaries"],
			description: "Windows PE Executable / DLL binary asset",
			confidence: "EXACT_MAGIC",
		};
	}

	// Linux ELF Executable (\x7fELF)
	if (head.length >= 4 && head[0] === 0x7f && head[1] === 0x45 && head[2] === 0x4c && head[3] === 0x46) {
		return {
			mimeType: "application/x-executable",
			isBinary: true,
			targetArchetypes: ["binaries"],
			description: "Linux ELF compiled executable or shared object",
			confidence: "EXACT_MAGIC",
		};
	}

	// Mach-O binary
	if (
		head.length >= 4 &&
		((head[0] === 0xfe && head[1] === 0xed && head[2] === 0xfa && (head[3] === 0xce || head[3] === 0xcf)) ||
			(head[0] === 0xca && head[1] === 0xfe && head[2] === 0xba && head[3] === 0xbe))
	) {
		return {
			mimeType: "application/x-mach-binary",
			isBinary: true,
			targetArchetypes: ["binaries"],
			description: "macOS Mach-O compiled binary",
			confidence: "EXACT_MAGIC",
		};
	}

	// Zip archive (PK\x03\x04)
	if (head.length >= 4 && head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04) {
		return {
			mimeType: "application/zip",
			isBinary: true,
			targetArchetypes: ["binaries"],
			description: "PKzip archive / compressed package asset",
			confidence: "EXACT_MAGIC",
		};
	}

	// Gzip archive (\x1f\x8b)
	if (head.length >= 2 && head[0] === 0x1f && head[1] === 0x8b) {
		return {
			mimeType: "application/gzip",
			isBinary: true,
			targetArchetypes: ["binaries"],
			description: "Gzip compressed archive asset",
			confidence: "EXACT_MAGIC",
		};
	}

	// Tar archive check ("ustar" at offset 257)
	if (head.length >= 262 && head.toString("ascii", 257, 262) === "ustar") {
		return {
			mimeType: "application/x-tar",
			isBinary: true,
			targetArchetypes: ["binaries"],
			description: "POSIX tar archive binary asset",
			confidence: "EXACT_MAGIC",
		};
	}

	// SQLite database
	if (head.length >= 16 && head.toString("ascii", 0, 15) === "SQLite format 3") {
		return {
			mimeType: "application/x-sqlite3",
			isBinary: true,
			targetArchetypes: ["binaries"],
			description: "SQLite database file asset",
			confidence: "EXACT_MAGIC",
		};
	}

	// Check for embedded NUL bytes to differentiate binary from text
	const hasNul = head.includes(0);
	if (hasNul) {
		return {
			mimeType: "application/octet-stream",
			isBinary: true,
			targetArchetypes: ["binaries"],
			description: "Generic binary payload asset",
			confidence: "CONTENT_HEURISTIC",
		};
	}

	// 2. Text Inspection & Token Sniffing
	const text = head.toString("utf8");
	const trimmed = text.trim();

	// UX-0587: Embedded RSA/PGP private certificates
	if (
		text.includes("-----BEGIN RSA PRIVATE KEY") ||
		text.includes("-----BEGIN OPENSSH PRIVATE KEY") ||
		text.includes("-----BEGIN PRIVATE KEY") ||
		text.includes("PuTTY-User-Key-File")
	) {
		return {
			mimeType: "application/x-pem-file",
			isBinary: false,
			targetArchetypes: ["certificates"],
			description: "Cryptographic private key certificate payload",
			confidence: "EXACT_MAGIC",
		};
	}

	// UX-0590: Symlink / junction pointer marker
	if (text.startsWith("symlink:") || text.startsWith("junction:") || text.startsWith("../../../../")) {
		return {
			mimeType: "inode/symlink",
			isBinary: false,
			targetArchetypes: ["symlinks"],
			description: "Filesystem symlink loop or junction pointer text",
			confidence: "CONTENT_HEURISTIC",
		};
	}

	// Check for YAML / INI configuration payload (UX-0583, UX-0584)
	const isIniSection = /^\s*\[[A-Za-z0-9_.-]+\]\s*(?:\r?\n|$)/m.test(text);
	if (trimmed.startsWith("---") || isIniSection) {
		const targetArchetypes: RiskArchetype[] = [];
		if (text.includes("aws_access_key_id") || text.includes("aws_secret_access_key") || text.includes("AKIA") || filePath.includes("aws")) {
			targetArchetypes.push("aws");
		}
		if (text.includes("pypi") || text.includes("huggingface") || text.includes("hf_")) {
			targetArchetypes.push("huggingface");
		}
		if (targetArchetypes.length === 0) {
			targetArchetypes.push("aws");
		}

		return {
			mimeType: "application/yaml",
			isBinary: false,
			targetArchetypes,
			description: "Structured YAML or INI configuration payload",
			confidence: "CONTENT_HEURISTIC",
		};
	}

	// Check for JSON payload (UX-0581, UX-0585, UX-0586, UX-0589)
	if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
		const targetArchetypes: RiskArchetype[] = [];

		if (text.includes("sk-proj-") || text.includes("sk-admin-")) {
			targetArchetypes.push("openai");
		}
		if (text.includes("service_account") || text.includes("private_key_id") || text.includes("client_email")) {
			targetArchetypes.push("services");
		}
		if (text.includes("DefaultEndpointsProtocol") || text.includes("SharedAccessSignature")) {
			targetArchetypes.push("azure");
		}
		if (filePath.includes("node_modules/") || filePath.includes("vendor/")) {
			targetArchetypes.push("vendor");
		}
		if (targetArchetypes.length === 0) {
			targetArchetypes.push("services");
		}

		return {
			mimeType: "application/json",
			isBinary: false,
			targetArchetypes,
			description: "JSON credential or configuration payload",
			confidence: "CONTENT_HEURISTIC",
		};
	}

	// Plain text inspection across archetypes:
	const matchedArchetypes: RiskArchetype[] = [];

	// UX-0581: OpenAI project and admin API keys
	if (/\bsk-(?:proj|admin|svcacct)-[A-Za-z0-9_-]{20,}\b/.test(text)) {
		matchedArchetypes.push("openai");
	}
	// UX-0582: GitHub fine-grained personal access tokens
	if (/\b(?:github_pat_[A-Za-z0-9_]{22,}|gh[pousr]_[A-Za-z0-9]{36,})\b/.test(text)) {
		matchedArchetypes.push("github");
	}
	// UX-0583: AWS temporary and root credentials
	if (/\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/.test(text)) {
		matchedArchetypes.push("aws");
	}
	// UX-0584: HuggingFace and PyPI deployment tokens
	if (/\b(?:hf_[A-Za-z0-9]{20,}|pypi-[A-Za-z0-9_-]{20,})\b/.test(text)) {
		matchedArchetypes.push("huggingface");
	}
	// UX-0585: Azure connection strings and SAS query tokens
	if (/\b(?:DefaultEndpointsProtocol=https?|SharedAccessSignature=)/.test(text)) {
		matchedArchetypes.push("azure");
	}
	// UX-0586: Slack, Google, and Stripe service keys
	if (/\b(?:xox[baprs]-[A-Za-z0-9-]{10,}|AIza[0-9A-Za-z_-]{35}|[sr]k_live_[0-9a-zA-Z]{24,})\b/.test(text)) {
		matchedArchetypes.push("services");
	}
	// UX-0589: Vendor directory paths
	if (filePath.includes("node_modules/") || filePath.includes("vendor/")) {
		matchedArchetypes.push("vendor");
	}

	return {
		mimeType: "text/plain",
		isBinary: false,
		targetArchetypes: matchedArchetypes.length > 0 ? matchedArchetypes : ["services"],
		description: "Plain UTF-8 text with credential sniffing fallback",
		confidence: "CONTENT_HEURISTIC",
	};
}
