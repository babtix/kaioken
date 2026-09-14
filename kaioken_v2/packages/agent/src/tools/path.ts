import { isAbsolute, relative, resolve } from "node:path";

/**
 * Keep a path from escaping the workspace.
 *
 * Returning null rather than clamping is deliberate: a tool that quietly reads
 * something other than what it was asked for is worse than one that refuses.
 *
 * On Windows the drive letter is normalised to uppercase before comparison so
 * that `d:\root` and `D:\root` are the same prefix — otherwise a path like
 * `D:\root\..\secret` resolves outside a root given as `d:\root` because
 * `relative()` sees two different roots.
 */
export function resolveInside(root: string, path: string): string | null {
	const normRoot = normalizeDrive(resolve(root));
	const target = isAbsolute(path)
		? normalizeDrive(resolve(path))
		: normalizeDrive(resolve(normRoot, path));
	const rel = relative(normRoot, target);
	if (rel === "") return target;
	if (rel.startsWith("..") || isAbsolute(rel)) return null;
	return target;
}

/**
 * On Windows, ensure the drive letter is uppercase: `d:\foo` → `D:\foo`.
 * A no-op on POSIX, where paths never start with a drive letter.
 */
function normalizeDrive(p: string): string {
	if (/^[a-z]:\\/.test(p)) {
		return p[0]!.toUpperCase() + p.slice(1);
	}
	return p;
}

/** Backslash → forward slash, for model-facing output. */
export function posix(p: string): string {
	return p.split("\\").join("/");
}
