import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve as resolvePath } from "node:path";
import { gitDir, isRepo } from "./run.js";

/**
 * The post-commit hook that keeps generated documentation from drifting.
 *
 * Repositories usually already have hooks — husky, lefthook, something
 * hand-written — so the installer never owns the file. It writes a delimited
 * block it can find again, refreshes that block in place, and on removal takes
 * out its own lines and leaves the rest of the script running.
 */

const START = "# >>> kaioken >>>";
const END = "# <<< kaioken <<<";
const SHEBANG = "#!/bin/sh";

export interface HookStatus {
	/** Where the hook file is, or would be. Null outside a git repository. */
	path: string | null;
	installed: boolean;
	/** Is there a hook script here that is not ours? */
	foreign: boolean;
}

/** The post-commit hook path for this repository. */
export async function hookPath(repo: string): Promise<string | null> {
	const dir = await gitDir(repo);
	return dir ? join(dir, "hooks", "post-commit") : null;
}

export async function hookStatus(repo: string): Promise<HookStatus> {
	const path = await hookPath(repo);
	if (!path) return { path: null, installed: false, foreign: false };
	const body = await readIfPresent(path);
	if (body === null) return { path, installed: false, foreign: false };
	const installed = body.includes(START);
	return { path, installed, foreign: !installed && body.trim() !== "" };
}

/**
 * Install or refresh the block.
 *
 * Refreshing matters as much as installing: the block records absolute paths to
 * the kaioken binary and to the repository, and a hook still pointing at a
 * moved checkout fails silently after every commit.
 */
export async function installPostCommit(repo: string, exe: readonly string[]): Promise<string> {
	if (!(await isRepo(repo))) throw new Error(`${repo} is not a git repository`);
	const path = await hookPath(repo);
	if (!path) throw new Error(`${repo} has no resolvable git directory`);

	await mkdir(dirname(path), { recursive: true });
	const block = hookBlock(exe, resolvePath(repo));
	const existing = (await readIfPresent(path)) ?? "";

	let out: string;
	if (existing === "") out = `${SHEBANG}\n\n${block}\n`;
	else if (existing.includes(START)) out = replaceBlock(existing, block);
	else out = `${existing.replace(/\n+$/, "")}\n\n${block}\n`;

	// 0o755 because git runs only hooks that are executable. On Windows the
	// mode is inert, and git for Windows runs the hook regardless.
	await writeFile(path, out, { mode: 0o755 });
	return path;
}

/**
 * Strip our block, keeping whatever else the file does.
 *
 * The file is deleted only when nothing but a shebang is left — that is the
 * case where the hook existed solely because we created it.
 */
export async function removePostCommit(repo: string): Promise<boolean> {
	const path = await hookPath(repo);
	if (!path) return false;
	const body = await readIfPresent(path);
	if (body === null || !body.includes(START)) return false;

	const stripped = replaceBlock(body, "").trim();
	if (stripped === "" || stripped === SHEBANG) {
		await rm(path, { force: true });
		return true;
	}
	await writeFile(path, `${stripped}\n`, { mode: 0o755 });
	return true;
}

/**
 * The script we own.
 *
 * Git runs hooks through `sh` even on Windows, so paths are written with
 * forward slashes and single-quoted: `sh` does no escape processing inside
 * single quotes, which sidesteps every question about how a backslash in
 * `C:\Users\…` would survive.
 *
 * The refresh runs detached and discards its output. A hook that made every
 * commit wait on a model call would be uninstalled within the day.
 */
function hookBlock(exe: readonly string[], repo: string): string {
	// `exe` is an argv prefix, not a command line: launching through node means
	// two words (the interpreter and the entry script), and quoting them as one
	// string would ask sh to run a file whose name contains a space.
	const command = exe.map(shellQuote).join(" ");
	return [
		START,
		"# Refresh the generated wiki against this commit. Runs detached so it",
		"# never delays a commit; remove with `kaioken hook remove`.",
		`${command} update --root ${shellQuote(repo)} >/dev/null 2>&1 &`,
		END,
	].join("\n");
}

function shellQuote(path: string): string {
	// The one character a single-quoted sh string cannot contain is a single
	// quote; the idiom closes the string, emits an escaped quote, and reopens.
	return `'${path.replace(/\\/g, "/").replace(/'/g, `'\\''`)}'`;
}

/** Swap the delimited block for `replacement` — empty to delete it. */
function replaceBlock(body: string, replacement: string): string {
	const start = body.indexOf(START);
	if (start === -1) return body;
	const end = body.indexOf(END, start);
	if (end === -1) {
		// A truncated block: drop everything from the marker on, rather than
		// leaving half a script behind for sh to choke on.
		return `${body.slice(0, start).replace(/\n+$/, "")}\n${replacement}`;
	}
	const head = body.slice(0, start);
	const tail = body.slice(end + END.length);
	if (replacement === "") return `${head.replace(/\n+$/, "")}\n${tail.replace(/^\n+/, "")}`;
	return head + replacement + tail;
}

async function readIfPresent(path: string): Promise<string | null> {
	try {
		return await readFile(path, "utf8");
	} catch {
		return null;
	}
}
