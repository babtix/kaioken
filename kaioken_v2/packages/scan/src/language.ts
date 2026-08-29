/**
 * Language identification: extension first, shebang as fallback. Deliberately a
 * lookup rather than a heuristic — every downstream consumer keys off this id,
 * so it has to be boring and stable.
 */

const BY_EXTENSION = new Map<string, string>(
	Object.entries({
		".ts": "typescript",
		".mts": "typescript",
		".cts": "typescript",
		".tsx": "tsx",
		".js": "javascript",
		".mjs": "javascript",
		".cjs": "javascript",
		".jsx": "jsx",
		".py": "python",
		".pyi": "python",
		".go": "go",
		".rs": "rust",
		".rb": "ruby",
		".java": "java",
		".kt": "kotlin",
		".kts": "kotlin",
		".cs": "csharp",
		".c": "c",
		".h": "c",
		".cc": "cpp",
		".cpp": "cpp",
		".cxx": "cpp",
		".hpp": "cpp",
		".swift": "swift",
		".php": "php",
		".sh": "shell",
		".bash": "shell",
		".zsh": "shell",
		".ps1": "powershell",
		".sql": "sql",
		".md": "markdown",
		".mdx": "markdown",
		".json": "json",
		".jsonc": "json",
		".yaml": "yaml",
		".yml": "yaml",
		".toml": "toml",
		".xml": "xml",
		".html": "html",
		".htm": "html",
		".css": "css",
		".scss": "scss",
		".lua": "lua",
		".vim": "vim",
		".dart": "dart",
		".scala": "scala",
		".ex": "elixir",
		".exs": "elixir",
		".erl": "erlang",
		".hs": "haskell",
		".ml": "ocaml",
		".zig": "zig",
		".proto": "protobuf",
		".graphql": "graphql",
		".gql": "graphql",
	}),
);

const BY_FILENAME = new Map<string, string>(
	Object.entries({
		dockerfile: "dockerfile",
		makefile: "make",
		"go.mod": "gomod",
		"go.sum": "gosum",
		".gitignore": "gitignore",
		".env": "dotenv",
	}),
);

/** Interpreter name (basename of the shebang target) to language id. */
const BY_INTERPRETER = new Map<string, string>(
	Object.entries({
		node: "javascript",
		bun: "typescript",
		deno: "typescript",
		"ts-node": "typescript",
		python: "python",
		python2: "python",
		python3: "python",
		ruby: "ruby",
		sh: "shell",
		bash: "shell",
		zsh: "shell",
		perl: "perl",
		php: "php",
	}),
);

export function extensionOf(path: string): string {
	const base = path.slice(path.lastIndexOf("/") + 1);
	const dot = base.lastIndexOf(".");
	// A leading dot is a dotfile, not an extension: ".env" has no extension.
	if (dot <= 0) return "";
	return base.slice(dot).toLowerCase();
}

/**
 * Resolve a language id. `head` is the first bytes of the file, used only when
 * the extension says nothing — which is the common case for scripts.
 */
export function detectLanguage(path: string, head: Buffer | null): string {
	const base = path.slice(path.lastIndexOf("/") + 1).toLowerCase();

	const byName = BY_FILENAME.get(base);
	if (byName) return byName;

	const byExt = BY_EXTENSION.get(extensionOf(path));
	if (byExt) return byExt;

	// `.env.local`, `.env.production` — dotfiles with a suffix rather than an extension.
	if (base.startsWith(".env")) return "dotenv";

	const viaShebang = head ? languageFromShebang(head) : null;
	if (viaShebang) return viaShebang;

	return "unknown";
}

export function languageFromShebang(head: Buffer): string | null {
	if (head.length < 3 || head[0] !== 0x23 || head[1] !== 0x21) return null; // "#!"
	const newline = head.indexOf(0x0a);
	const line = head.subarray(2, newline === -1 ? Math.min(head.length, 256) : newline).toString("utf8").trim();
	if (!line) return null;

	const parts = line.split(/\s+/).filter((p) => p.length > 0);
	if (parts.length === 0) return null;

	// `/usr/bin/env python3` — the interpreter is the argument, not `env`.
	let target = parts[0] as string;
	if (target.endsWith("/env") || target === "env") {
		// Skip `env` flags such as `-S`.
		const arg = parts.slice(1).find((p) => !p.startsWith("-"));
		if (!arg) return null;
		target = arg;
	}

	const name = target.slice(target.lastIndexOf("/") + 1);
	// Strip a trailing version suffix only when the exact name is unknown.
	return BY_INTERPRETER.get(name) ?? BY_INTERPRETER.get(name.replace(/[\d.]+$/, "")) ?? null;
}
