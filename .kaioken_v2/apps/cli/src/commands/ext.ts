import {
	callMcpTool,
	contributedSkills,
	fetchRegistry,
	findInstalled,
	installExtension,
	isTrusted,
	listInstalled,
	listMcpTools,
	loadLock,
	removeExtension,
	RegistryUnpublished,
	runWasmCommand,
	searchRegistry,
	setEnabled,
	trustExtension,
	updateExtensions,
	type Installed,
} from "@kaioken/ext";
import { VERSION } from "../version.js";
import type { Flags } from "../main.js";

/**
 * `kaioken ext <subcommand>` — community extensions.
 *
 * Three tiers, and the difference between them is the only thing a user really
 * has to understand. A `declarative` extension ships documents: skills in the
 * same format the repository's own use, loaded into the same catalog, and
 * nothing it ships is ever executed. An `mcp` extension declares a server
 * process; a `wasm` extension ships a sandboxed module. Both of those are code
 * from somebody else, so both install inert and stay inert until the exact
 * installed version is trusted by name.
 *
 * That is why `install` and `trust` are separate commands rather than one with
 * a prompt: the gap between them is where a person gets to look at what they
 * just fetched.
 */
export async function runExt(flags: Flags): Promise<number> {
	const [subcommand = "list", ...rest] = flags.positional;

	switch (subcommand.toLowerCase()) {
		case "list":
			return list(flags);
		case "install":
		case "add":
			return install(rest[0] ?? "", rest[1], flags);
		case "remove":
		case "uninstall":
			return remove(rest[0] ?? "", flags);
		case "update":
			return update(rest, flags);
		case "enable":
			return toggle(rest[0] ?? "", true, flags);
		case "disable":
			return toggle(rest[0] ?? "", false, flags);
		case "trust":
			return trust(rest[0] ?? "", rest[1] !== "off", flags);
		case "search":
			return search(rest.join(" "), flags);
		case "tools":
			return tools(rest[0] ?? "", flags);
		case "skills":
			return skills(flags);
		case "run":
			return run(rest[0] ?? "", rest[1] ?? "", rest.slice(2).join(" "), flags);
		default:
			process.stderr.write(
				`kaioken ext: unknown subcommand "${subcommand}"\n` +
					"  list · install · remove · update · enable · disable · trust · search · tools · skills · run\n",
			);
			return 1;
	}
}

async function list(flags: Flags): Promise<number> {
	const installed = await listInstalled();
	if (flags.json) {
		process.stdout.write(`${JSON.stringify(installed, null, 2)}\n`);
		return 0;
	}
	if (installed.length === 0) {
		process.stdout.write("no extensions installed — `kaioken ext search <term>` finds some\n");
		return 0;
	}
	for (const entry of installed) {
		process.stdout.write(`${entry.id}@${entry.version} — ${entry.manifest.name} [${entry.manifest.type}]\n`);
		process.stdout.write(`  ${describeState(entry)}\n`);
	}
	return 0;
}

async function install(source: string, tag: string | undefined, flags: Flags): Promise<number> {
	if (!source) {
		process.stderr.write("kaioken ext install: needs a directory, owner/repo, or a tarball URL\n");
		return 1;
	}
	try {
		const result = await installExtension({
			source,
			hostVersion: VERSION,
			...(tag ? { tag } : {}),
		});
		if (flags.json) {
			process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
			return 0;
		}
		const { entry } = result;
		process.stdout.write(
			`${result.upgraded ? "updated" : "installed"} ${entry.id}@${entry.version} — ${entry.manifest.name}\n`,
		);
		process.stdout.write(`  ${entry.dir}\n`);
		if (entry.manifest.type === "declarative") {
			process.stdout.write("  contributes documents only — nothing it ships is executed\n");
		} else {
			// Said at install time, when the decision is fresh, rather than at
			// first use, when the user has forgotten what they installed.
			// "an mcp" but "a wasm": the article follows the sound, and only two
			// types ever reach this branch.
			const article = entry.manifest.type === "mcp" ? "an" : "a";
			process.stdout.write(
				`  this is ${article} ${entry.manifest.type} extension: it ships code and is INERT until you run\n` +
					`  \`kaioken ext trust ${entry.id}\`\n`,
			);
			if (entry.manifest.permissions?.length) {
				process.stdout.write(`  it asks for: ${entry.manifest.permissions.join(", ")}\n`);
			}
		}
		return 0;
	} catch (error) {
		process.stderr.write(`kaioken ext install: ${error instanceof Error ? error.message : String(error)}\n`);
		return 1;
	}
}

async function remove(id: string, flags: Flags): Promise<number> {
	if (!id) {
		process.stderr.write("kaioken ext remove: needs an extension id\n");
		return 1;
	}
	const removed = await removeExtension(id);
	if (!flags.json) {
		process.stdout.write(removed ? `removed ${id}\n` : `${id} is not installed\n`);
	}
	return removed ? 0 : 1;
}

async function update(ids: readonly string[], flags: Flags): Promise<number> {
	const results = await updateExtensions(ids, { hostVersion: VERSION });
	if (flags.json) {
		process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
		return 0;
	}
	if (results.length === 0) {
		process.stdout.write("nothing to update\n");
		return 0;
	}
	for (const result of results) {
		process.stdout.write(
			result.updated
				? `${result.id}: ${result.from} → ${result.to}\n`
				: `${result.id}: ${result.reason ?? "unchanged"}\n`,
		);
	}
	return 0;
}

async function toggle(id: string, enabled: boolean, flags: Flags): Promise<number> {
	if (!id) {
		process.stderr.write("kaioken ext: needs an extension id\n");
		return 1;
	}
	const found = await setEnabled(id, enabled);
	if (!flags.json) {
		process.stdout.write(found ? `${id} ${enabled ? "enabled" : "disabled"}\n` : `${id} is not installed\n`);
	}
	return found ? 0 : 1;
}

async function trust(id: string, trusted: boolean, flags: Flags): Promise<number> {
	if (!id) {
		process.stderr.write("kaioken ext trust: needs an extension id — `kaioken ext trust <id> [off]`\n");
		return 1;
	}
	const entry = await trustExtension(id, trusted);
	if (!entry) {
		process.stderr.write(`kaioken ext trust: ${id} is not installed\n`);
		return 1;
	}
	if (flags.json) {
		process.stdout.write(`${JSON.stringify(entry, null, 2)}\n`);
		return 0;
	}
	process.stdout.write(
		trusted
			? `trusted ${entry.id}@${entry.version} to run — the next version will need trusting again\n`
			: `withdrew trust from ${entry.id}\n`,
	);
	return 0;
}

async function search(term: string, flags: Flags): Promise<number> {
	let entries: Awaited<ReturnType<typeof fetchRegistry>>;
	try {
		entries = await fetchRegistry({ force: flags.force });
	} catch (error) {
		// No index published is the ordinary case today, not a fault: reporting
		// it as an error sends the reader hunting for a network problem they do
		// not have, and `ext install <owner/repo>` still works without one.
		if (error instanceof RegistryUnpublished) {
			process.stdout.write(`${error.message}\n`);
			return 0;
		}
		process.stderr.write(`kaioken ext search: ${error instanceof Error ? error.message : String(error)}\n`);
		return 1;
	}
	const hits = searchRegistry(entries, term);

	if (flags.json) {
		process.stdout.write(`${JSON.stringify(hits, null, 2)}\n`);
		return 0;
	}
	if (hits.length === 0) {
		process.stdout.write(term ? `nothing in the registry matches "${term}"\n` : "the registry is empty\n");
		return 0;
	}
	for (const hit of hits.slice(0, 25)) {
		process.stdout.write(`${hit.id} — ${hit.name}${hit.type ? ` [${hit.type}]` : ""}\n`);
		if (hit.description) process.stdout.write(`  ${hit.description}\n`);
		process.stdout.write(`  install: kaioken ext install ${hit.repo}\n`);
	}
	// A listing is not an endorsement, and the trust prompt is what actually
	// decides whether any of this runs.
	process.stdout.write("\nthe registry says an extension exists; it does not vouch for it\n");
	return 0;
}

/** What an executable extension would contribute, asked of the extension itself. */
async function tools(id: string, flags: Flags): Promise<number> {
	const entry = await resolveEntry(id);
	if (!entry) return 1;

	if (entry.manifest.type === "declarative") {
		process.stdout.write(`${entry.id} contributes documents, not tools — \`kaioken ext skills\` lists them\n`);
		return 0;
	}
	if (!isTrusted(entry)) {
		process.stderr.write(
			`kaioken ext tools: ${entry.id}@${entry.version} is not trusted, so nothing was started.\n` +
				`  \`kaioken ext trust ${entry.id}\` after reading what it does\n`,
		);
		return 1;
	}

	if (entry.manifest.type === "wasm") {
		const commands = entry.manifest.commands ?? [];
		if (flags.json) {
			process.stdout.write(`${JSON.stringify(commands, null, 2)}\n`);
			return 0;
		}
		if (commands.length === 0) {
			process.stdout.write(`${entry.id} declares no commands\n`);
			return 0;
		}
		for (const command of commands) {
			process.stdout.write(`${command.name}${command.description ? ` — ${command.description}` : ""}\n`);
		}
		return 0;
	}

	try {
		const list = await listMcpTools(entry);
		if (flags.json) {
			process.stdout.write(`${JSON.stringify(list, null, 2)}\n`);
			return 0;
		}
		for (const tool of list) {
			process.stdout.write(`${tool.name}${tool.description ? ` — ${tool.description}` : ""}\n`);
		}
		if (list.length === 0) process.stdout.write(`${entry.id} exposes no tools\n`);
		return 0;
	} catch (error) {
		process.stderr.write(`kaioken ext tools: ${error instanceof Error ? error.message : String(error)}\n`);
		return 1;
	}
}

async function skills(flags: Flags): Promise<number> {
	const { skills: contributed, problems } = await contributedSkills();
	if (flags.json) {
		process.stdout.write(`${JSON.stringify({ skills: contributed, problems }, null, 2)}\n`);
		return 0;
	}
	for (const skill of contributed) {
		process.stdout.write(`${skill.name} — ${skill.description}\n`);
	}
	if (contributed.length === 0) process.stdout.write("no extension contributes skills\n");
	for (const problem of problems) {
		process.stderr.write(`unusable: ${problem.path} (${problem.extension}) — ${problem.reason}\n`);
	}
	return 0;
}

/** `kaioken ext run <id> <command> [args]` — the `/x` path. */
async function run(id: string, command: string, args: string, flags: Flags): Promise<number> {
	const entry = await resolveEntry(id);
	if (!entry) return 1;
	if (!command) {
		process.stderr.write("kaioken ext run: needs a command — `kaioken ext tools <id>` lists them\n");
		return 1;
	}
	if (entry.manifest.type === "declarative") {
		process.stderr.write(`kaioken ext run: ${entry.id} ships documents, not commands\n`);
		return 1;
	}
	if (!isTrusted(entry)) {
		process.stderr.write(
			`kaioken ext run: ${entry.id}@${entry.version} is not trusted — \`kaioken ext trust ${entry.id}\`\n`,
		);
		return 1;
	}

	try {
		if (entry.manifest.type === "wasm") {
			const result = await runWasmCommand(entry, { command, input: args });
			if (flags.json) {
				process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
				return 0;
			}
			for (const line of result.logs) process.stderr.write(`  ${line}\n`);
			process.stdout.write(`${result.output}\n`);
			return 0;
		}

		// An MCP tool takes structured arguments; a command line gives one
		// string. `input` is the conventional single-field shape, and anything
		// richer is passed as JSON.
		const parsed = parseArguments(args);
		const result = await callMcpTool(entry, command, parsed);
		if (flags.json) {
			process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
			return result.isError ? 1 : 0;
		}
		process.stdout.write(`${result.text}\n`);
		return result.isError ? 1 : 0;
	} catch (error) {
		process.stderr.write(`kaioken ext run: ${error instanceof Error ? error.message : String(error)}\n`);
		return 1;
	}
}

function parseArguments(args: string): Record<string, unknown> {
	const text = args.trim();
	if (!text) return {};
	if (text.startsWith("{")) {
		try {
			const parsed = JSON.parse(text) as unknown;
			if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
				return parsed as Record<string, unknown>;
			}
		} catch {
			// Not JSON after all. Fall through and pass it as the input string,
			// which is more useful than refusing a brace in prose.
		}
	}
	return { input: text };
}

async function resolveEntry(id: string): Promise<Installed | null> {
	if (!id) {
		process.stderr.write("kaioken ext: needs an extension id — `kaioken ext list` shows them\n");
		return null;
	}
	const entry = findInstalled(await loadLock(), id);
	if (!entry) {
		process.stderr.write(`kaioken ext: ${id} is not installed\n`);
		return null;
	}
	return entry;
}

function describeState(entry: Installed): string {
	const parts: string[] = [entry.enabled ? "enabled" : "disabled"];
	if (entry.manifest.type === "declarative") parts.push("documents only");
	else parts.push(isTrusted(entry) ? "trusted to run" : "NOT trusted — inert");
	if (entry.manifest.permissions?.length) parts.push(`asks for ${entry.manifest.permissions.join(", ")}`);
	return parts.join(" · ");
}
