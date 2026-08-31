import { resolve } from "node:path";
import { hookStatus, installPostCommit, isRepo, removePostCommit } from "@kaioken/gitops";
import type { Flags } from "../main.js";

/**
 * `kaioken hook [install|remove|status]` — keep the wiki current by itself.
 *
 * Documentation drifts because updating it is a separate act of will from
 * making the change. A post-commit hook removes the act of will: every commit
 * refreshes what that commit invalidated, in the background, and the person who
 * committed never waits for it.
 *
 * Bare `kaioken hook` reports rather than installs. Writing into another
 * project's git hooks is not something to do because an argument was forgotten.
 */
export async function runHook(flags: Flags): Promise<number> {
	const root = resolve(flags.root);
	const action = (flags.positional[0] ?? "status").toLowerCase();

	if (!(await isRepo(root))) {
		process.stderr.write(`kaioken hook: ${root} is not a git repository\n`);
		return 1;
	}

	switch (action) {
		case "install":
			return install(root, flags);
		case "remove":
		case "uninstall":
			return remove(root, flags);
		case "status":
			return report(root, flags);
		default:
			process.stderr.write(`kaioken hook: unknown action "${action}" — install, remove or status\n`);
			return 1;
	}
}

async function install(root: string, flags: Flags): Promise<number> {
	const before = await hookStatus(root);
	const path = await installPostCommit(root, executablePath());

	if (flags.json) {
		process.stdout.write(`${JSON.stringify({ action: "install", path, refreshed: before.installed }, null, 2)}\n`);
		return 0;
	}

	process.stdout.write(
		before.installed
			? `refreshed the kaioken block in ${path}\n`
			: `installed the post-commit hook: ${path}\n`,
	);
	if (before.foreign) {
		// Worth saying out loud: someone who already has a hook wants to know
		// their script survived rather than having to go and check.
		process.stdout.write("an existing hook script was there and was kept — our block was appended\n");
	}
	process.stdout.write("every commit now refreshes stale documents in the background\n");
	return 0;
}

async function remove(root: string, flags: Flags): Promise<number> {
	const removed = await removePostCommit(root);
	const after = await hookStatus(root);

	if (flags.json) {
		process.stdout.write(`${JSON.stringify({ action: "remove", removed, path: after.path }, null, 2)}\n`);
		return 0;
	}

	process.stdout.write(removed ? "removed the kaioken post-commit block\n" : "no kaioken hook was installed\n");
	return 0;
}

async function report(root: string, flags: Flags): Promise<number> {
	const status = await hookStatus(root);

	if (flags.json) {
		process.stdout.write(`${JSON.stringify(status, null, 2)}\n`);
		return 0;
	}

	if (status.installed) {
		process.stdout.write(`installed — ${status.path}\n`);
		return 0;
	}
	process.stdout.write(
		status.foreign
			? `not installed — a hook script exists at ${status.path}; \`kaioken hook install\` appends to it\n`
			: "not installed — `kaioken hook install` refreshes the wiki after every commit\n",
	);
	return 0;
}

/**
 * The command the hook should run.
 *
 * `process.execPath` is the node binary and `argv[1]` the entry script, which
 * together survive being invoked through a shim, a symlink, or `npx` — where
 * `argv[0]` alone would name something that is not on PATH at commit time.
 */
function executablePath(): string[] {
	const entry = process.argv[1];
	return entry ? [process.execPath, entry] : [process.execPath];
}
