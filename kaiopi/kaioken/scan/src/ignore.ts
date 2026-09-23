import { readFileSync } from "node:fs";
import { join } from "node:path";
import ignoreDefault, { type Ignore, type Options } from "ignore";

/**
 * `ignore` ships a merged function/namespace default export. Node resolves it to
 * the callable at runtime (verified), but NodeNext's view of the declaration
 * file surfaces only the namespace, so the call signature is restored here
 * rather than loosening module resolution for the whole package.
 */
const makeIgnore = ignoreDefault as unknown as (options?: Options) => Ignore;

/**
 * Always excluded, regardless of what the repo's own ignore files say. These are
 * directories no repository wants indexed and every repository has.
 */
export const DEFAULT_IGNORES: readonly string[] = [
	".git/",
	".hg/",
	".svn/",
	"node_modules/",
	".kaioken/",
	"vendor/",
	"__pycache__/",
	".venv/",
	"venv/",
	".mypy_cache/",
	".pytest_cache/",
	".ruff_cache/",
	".gradle/",
	".idea/",
	".vscode/",
	".next/",
	".nuxt/",
	".turbo/",
	".parcel-cache/",
	".terraform/",
	"target/debug/",
	"target/release/",
];

/** Ignore files honoured, in ascending order of precedence. */
const IGNORE_FILENAMES = [".gitignore", ".kaiokenignore", ".kaikenignore"] as const;

interface Layer {
	/** Directory the layer's patterns are relative to, repo-relative POSIX, "" for root. */
	base: string;
	matcher: Ignore;
}

export interface IgnoreStackOptions {
	ignoreCase?: boolean;
}

/**
 * Gitignore semantics are per-directory: a pattern in `src/.gitignore` is
 * relative to `src/`. The stack mirrors that — a layer is pushed on entering a
 * directory that has an ignore file, and consulted only for paths beneath it.
 */
export class IgnoreStack {
	private readonly layers: readonly Layer[];
	private readonly ignoreCase: boolean;

	private constructor(layers: readonly Layer[], options?: IgnoreStackOptions) {
		this.layers = layers;
		this.ignoreCase = options?.ignoreCase ?? (process.platform === "win32");
	}

	static fromPatterns(rootPatterns: readonly string[], options?: IgnoreStackOptions): IgnoreStack {
		const ignoreCase = options?.ignoreCase ?? (process.platform === "win32");
		return new IgnoreStack(
			[{ base: "", matcher: makeIgnore({ ignorecase: ignoreCase }).add([...rootPatterns]) }],
			{ ignoreCase },
		);
	}

	/**
	 * A stack with one more layer. Returning a new instance rather than mutating
	 * is what lets sibling directories inherit the same parent rules without one
	 * of them leaking its own into the other.
	 */
	withLayer(base: string, patterns: string[]): IgnoreStack {
		return new IgnoreStack(
			[
				...this.layers,
				{ base, matcher: makeIgnore({ ignorecase: this.ignoreCase }).add(patterns) },
			],
			{ ignoreCase: this.ignoreCase },
		);
	}

	/**
	 * `relPath` is repo-relative POSIX. Directories must be passed with a trailing
	 * slash so directory-only patterns (`build/`) match.
	 *
	 * Later rules override earlier ones; a negated file is re-included unless a
	 * parent directory is excluded.
	 */
	ignores(relPath: string): boolean {
		let idx = relPath.indexOf("/");
		while (idx !== -1 && idx < relPath.length - 1) {
			const parentDir = relPath.slice(0, idx + 1);
			if (this.ignoresDirect(parentDir)) return true;
			idx = relPath.indexOf("/", idx + 1);
		}
		return this.ignoresDirect(relPath);
	}

	private ignoresDirect(path: string): boolean {
		for (let i = this.layers.length - 1; i >= 0; i--) {
			const layer = this.layers[i]!;
			if (layer.base === "") {
				const result = layer.matcher.test(path);
				if (result.unignored) return false;
				if (result.ignored) return true;
				continue;
			}
			const prefix = `${layer.base}/`;
			if (!path.startsWith(prefix)) continue;
			const scoped = path.slice(prefix.length);
			if (!scoped) continue;
			const result = layer.matcher.test(scoped);
			if (result.unignored) return false;
			if (result.ignored) return true;
		}
		return false;
	}
}

/**
 * Read whichever ignore files exist in `absDir`. Returns [] when there are none,
 * which is the overwhelmingly common case and must stay allocation-free.
 */
export function readIgnoreFiles(absDir: string): string[] {
	let patterns: string[] = [];
	for (const name of IGNORE_FILENAMES) {
		let text: string;
		try {
			text = readFileSync(join(absDir, name), "utf8");
		} catch {
			continue;
		}
		patterns = patterns.concat(parseIgnoreText(text));
	}
	return patterns;
}

export function parseIgnoreText(text: string): string[] {
	const out: string[] = [];
	for (const raw of text.split(/\r?\n/)) {
		const line = raw.trim();
		if (!line || line.startsWith("#")) continue;
		out.push(line);
	}
	return out;
}
