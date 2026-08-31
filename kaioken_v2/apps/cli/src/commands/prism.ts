import { resolve } from "node:path";
import {
	ask,
	createModule,
	deleteModule,
	ingest,
	listModules,
	readActiveModule,
	readModule,
	readyDocuments,
	retrieve,
	slugify,
	writeActiveModule,
	type ModuleData,
} from "@kaioken/prism";
import type { Flags } from "../main.js";
import { resolveEmbeddings } from "../embeddings.js";
import { resolveModelClient } from "../model.js";

/**
 * `kaioken prism <subcommand>` — retrieval over documents you import.
 *
 * A separate corpus from the wiki, and deliberately so: the wiki is what
 * Kaioken derived about a repository and can regenerate at will, while this is
 * a stack of documents somebody brought in — a spec, a contract, a set of
 * papers — scoped to a module so a question about clause 4 cannot be answered
 * with a paragraph about the parser.
 *
 * Every answer reports how it was retrieved: whether a graded source backs it,
 * whether the relevance gate ran at all, and whether the pipeline was reduced.
 * Those are three different facts and they are never collapsed into one.
 */
export async function runPrism(flags: Flags): Promise<number> {
	const root = resolve(flags.root);
	const [subcommand = "status", ...rest] = flags.positional;

	switch (subcommand.toLowerCase()) {
		case "status":
			return status(root, flags);
		case "new":
			return newModule(root, rest.join(" "), flags);
		case "use":
			return useModule(root, rest[0] ?? "", flags);
		case "drop":
			return dropModule(root, rest[0] ?? "", flags);
		case "import":
			return importDocuments(root, rest[0] ?? "", flags);
		case "docs":
			return listDocuments(root, flags);
		case "ask":
			return askModule(root, rest.join(" "), flags);
		default:
			// Anything unrecognised is the question. `prism what does clause 4
			// say` is how this is actually used, and making people type `ask`
			// first would be a toll booth on the common path.
			return askModule(root, [subcommand, ...rest].join(" "), flags);
	}
}

async function status(root: string, flags: Flags): Promise<number> {
	const modules = await listModules(root);
	const active = await readActiveModule(root);

	if (flags.json) {
		process.stdout.write(`${JSON.stringify({ active, modules }, null, 2)}\n`);
		return 0;
	}

	if (modules.length === 0) {
		process.stdout.write('no modules yet — `kaioken prism new "Contract Law"` creates one\n');
		return 0;
	}

	for (const module of modules) {
		const data = await readModule(root, module.slug);
		const documents = data ? readyDocuments(data).length : 0;
		const chunks = data ? data.chunks.filter((chunk) => chunk.type === "child").length : 0;
		const vectors = data ? data.vectors.length : 0;
		const marker = module.slug === active ? "*" : " ";
		process.stdout.write(
			`${marker} ${module.slug} — ${module.name} (${count(documents, "document")}, ${count(chunks, "passage")}, ` +
				`${vectors > 0 ? count(vectors, "vector") : "lexical only"})\n`,
		);
	}
	if (!active) process.stdout.write("\nno active module — `kaioken prism use <slug>`\n");
	return 0;
}

async function newModule(root: string, name: string, flags: Flags): Promise<number> {
	if (!name.trim()) {
		process.stderr.write('kaioken prism new: needs a name — kaioken prism new "Contract Law"\n');
		return 1;
	}
	try {
		const data = await createModule(root, name.trim());
		// Created and selected in one step: a module nobody switched to is a
		// module the next import silently misses.
		await writeActiveModule(root, data.module.slug);
		if (flags.json) {
			process.stdout.write(`${JSON.stringify(data.module, null, 2)}\n`);
			return 0;
		}
		process.stdout.write(`created module "${data.module.slug}" and made it active\n`);
		process.stdout.write(`  import documents: kaioken prism import <path>\n`);
		return 0;
	} catch (error) {
		process.stderr.write(`kaioken prism new: ${error instanceof Error ? error.message : String(error)}\n`);
		return 1;
	}
}

async function useModule(root: string, slug: string, flags: Flags): Promise<number> {
	const wanted = slugify(slug);
	if (!wanted) {
		process.stderr.write("kaioken prism use: needs a module slug — `kaioken prism` lists them\n");
		return 1;
	}
	if (!(await readModule(root, wanted))) {
		process.stderr.write(`kaioken prism use: no module "${wanted}"\n`);
		return 1;
	}
	await writeActiveModule(root, wanted);
	if (!flags.json) process.stdout.write(`active module → ${wanted}\n`);
	return 0;
}

async function dropModule(root: string, slug: string, flags: Flags): Promise<number> {
	const wanted = slugify(slug);
	if (!wanted) {
		process.stderr.write("kaioken prism drop: needs a module slug\n");
		return 1;
	}
	// Deleting an imported corpus destroys work nothing can regenerate, so it
	// takes an explicit --yes rather than a confirmation nobody reads.
	if (!flags.yes) {
		process.stderr.write(
			`kaioken prism drop: this deletes the "${wanted}" corpus and everything imported into it.\n` +
				"  re-run with --yes if that is what you want\n",
		);
		return 1;
	}
	const removed = await deleteModule(root, wanted);
	if (!removed) {
		process.stderr.write(`kaioken prism drop: no module "${wanted}"\n`);
		return 1;
	}
	if ((await readActiveModule(root)) === wanted) await writeActiveModule(root, "");
	if (!flags.json) process.stdout.write(`dropped module "${wanted}"\n`);
	return 0;
}

async function importDocuments(root: string, path: string, flags: Flags): Promise<number> {
	if (!path) {
		process.stderr.write("kaioken prism import: needs a file or directory\n");
		return 1;
	}
	const active = await activeModule(root);
	if (!active) return 1;

	// The semantic leg is optional by configuration, not by import: without a
	// key the corpus stores lexical, which every downstream path treats as a
	// first-class outcome.
	const embeddings = resolveEmbeddings();
	const result = await ingest({
		root,
		data: active,
		path: resolve(root, path),
		...(embeddings ? { embeddings: embeddings.provider } : {}),
		onProgress: (filename, done, total) => {
			if (!flags.json && filename) process.stderr.write(`  [${done + 1}/${total}] ${filename}\n`);
		},
	});

	if (flags.json) {
		process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
		return result.imported.length > 0 ? 0 : 1;
	}

	const failed = result.imported.filter((document) => document.status === "failed");
	const stored = result.imported.length - failed.length;

	if (stored === 0) {
		// Nothing was stored, so nothing downstream applies. Leading with the
		// reason beats a "0 documents" line followed by notes about a corpus
		// that did not change.
		process.stderr.write(`kaioken prism import: nothing was imported from ${path}\n`);
		for (const document of failed) process.stderr.write(`  failed: ${document.filename} — ${document.error}\n`);
		for (const skip of result.skipped.slice(0, 5)) process.stderr.write(`  skipped ${skip.path}: ${skip.reason}\n`);
		return 1;
	}

	process.stdout.write(`imported ${stored} document${stored === 1 ? "" : "s"}\n`);
	if (!result.lexicalOnly && embeddings) {
		process.stdout.write(`  stored with vectors — ${embeddings.describe}\n`);
	}
	for (const document of failed) {
		process.stderr.write(`  failed: ${document.filename} — ${document.error}\n`);
	}
	if (result.skipped.length > 0) {
		process.stdout.write(`  skipped ${result.skipped.length}: ${result.skipped.slice(0, 5).map((s) => s.reason).join(", ")}\n`);
	}
	if (result.lexicalOnly) {
		// Said at import time rather than at query time: this is the moment the
		// choice was made, and re-importing later is what changes it.
		process.stdout.write("  stored without vectors — retrieval will be lexical (BM25) only\n");
	}
	return 0;
}

async function listDocuments(root: string, flags: Flags): Promise<number> {
	const active = await activeModule(root);
	if (!active) return 1;

	if (flags.json) {
		process.stdout.write(`${JSON.stringify(active.documents, null, 2)}\n`);
		return 0;
	}
	if (active.documents.length === 0) {
		process.stdout.write("no documents in this module — `kaioken prism import <path>`\n");
		return 0;
	}
	for (const document of active.documents) {
		const detail =
			document.status === "ready"
				? `${count(document.childCount, "passage")}, ${count(document.parentCount, "section")}`
				: (document.error ?? "failed");
		process.stdout.write(`${document.status === "ready" ? "ok  " : "FAIL"} ${document.filename} — ${detail}\n`);
	}
	return 0;
}

async function askModule(root: string, question: string, flags: Flags): Promise<number> {
	if (!question.trim()) {
		process.stderr.write("kaioken prism: ask a question, or use a subcommand (new, use, import, docs)\n");
		return 1;
	}
	const active = await activeModule(root);
	if (!active) return 1;

	const resolved = await resolveModelClient(flags);
	// The corpus may carry vectors; embedding the query is what joins them.
	// Without a provider the retrieval degrades to lexical and says so.
	const embeddings = resolveEmbeddings()?.provider;
	if (!resolved.ok) {
		// Retrieval alone is still worth having: the passages are the evidence,
		// and a person can read them without a model writing prose over them.
		const result = await retrieve({ data: active, query: question, ...(embeddings ? { embeddings } : {}) });
		process.stderr.write(`kaioken prism: ${resolved.reason}\n\n`);
		process.stdout.write(`${result.describe}\n\n`);
		for (let i = 0; i < result.passages.length; i++) {
			const passage = result.passages[i];
			process.stdout.write(`[${i + 1}] ${passage?.section ?? ""}\n${passage?.text}\n\n`);
		}
		return result.passages.length > 0 ? 0 : 1;
	}

	const answer = await ask({
		data: active,
		question,
		client: resolved.client,
		...(embeddings ? { embeddings } : {}),
		// The relevance gate is the same model here. A cheaper one is the right
		// choice when there is one to point at, but a gate that runs beats a
		// gate that is configured perfectly and never used.
		grader: resolved.client,
	});

	if (flags.json) {
		process.stdout.write(`${JSON.stringify(answer, null, 2)}\n`);
		return 0;
	}

	process.stdout.write(`${answer.answer}\n\n`);
	process.stdout.write(`— ${answer.retrieval.describe}\n`);
	if (!answer.retrieval.sourceFound) {
		process.stdout.write("— no graded source backs this answer\n");
	}
	for (let i = 0; i < answer.retrieval.passages.length; i++) {
		const passage = answer.retrieval.passages[i];
		process.stdout.write(`  [${i + 1}] ${passage?.document}${passage?.section ? ` — ${passage.section}` : ""}\n`);
	}
	return 0;
}

/** "1 passage", "3 passages" — a count nobody has to mentally correct. */
function count(n: number, noun: string): string {
	return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

/** The active module, or a message about why there is not one. */
async function activeModule(root: string): Promise<ModuleData | null> {
	const slug = await readActiveModule(root);
	if (!slug) {
		process.stderr.write('kaioken prism: no active module — `kaioken prism new "Name"` or `kaioken prism use <slug>`\n');
		return null;
	}
	const data = await readModule(root, slug);
	if (!data) {
		process.stderr.write(`kaioken prism: the active module "${slug}" is missing from disk\n`);
		return null;
	}
	return data;
}
