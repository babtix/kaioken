import { relative, resolve } from "node:path";
import {
	gatherSources,
	generateResearch,
	parseMultiplier,
	depthFor,
	writeResearchDocument,
} from "@kaioken/research";
import type { Flags } from "../main.js";
import { resolveModelClient } from "../model.js";
import { httpFetchPort, resolveSearchPort } from "../web.js";

/**
 * Research the web, grounded the same way the repository is grounded.
 *
 * The evidence set is built before the model sees anything: pages are
 * searched, fetched, sanitised and numbered deterministically. The model's
 * answer is then a claim about that evidence, and the citation verifier holds
 * it to the claim — a [N] resolves only if page N was fetched, and an
 * attributed quote survives only if the page actually contains it.
 */
export async function runResearch(flags: Flags): Promise<number> {
	const root = resolve(flags.root);

	// An xN positional anywhere is the depth dial, mirroring `cards` and
	// `wiki`; the remaining positionals are the question, which is free text.
	// A malformed xN (x0, x99) is an error, never part of a question: the dial
	// is how the user states intent, and silently absorbing it would run the
	// research at a depth they did not ask for.
	const tokens = [...flags.positional];
	let multiplierRaw: string | undefined = flags.multiplier;
	const questionParts: string[] = [];
	for (const token of tokens) {
		if (/^x\d+$/i.test(token)) {
			if (multiplierRaw && multiplierRaw !== token) {
				process.stderr.write("kaioken research: multiplier given twice\n");
				return 1;
			}
			multiplierRaw = token;
		} else {
			questionParts.push(token);
		}
	}
	const question = questionParts.join(" ").trim();
	if (!question) {
		process.stderr.write("kaioken research: expected a question\n");
		return 1;
	}

	const multiplier = parseMultiplier(multiplierRaw);
	if (multiplier === null) {
		process.stderr.write("kaioken research: multiplier must be x1..x10\n");
		return 1;
	}
	const depth = depthFor(multiplier);

	const { search, describe: searchDescribe } = resolveSearchPort();
	const fetch = httpFetchPort();

	if (!flags.json) {
		process.stderr.write(`kaioken research: searching via ${searchDescribe}\n`);
	}

	const gathered = await gatherSources({
		question,
		depth,
		search,
		fetch,
		...(flags.verbose ? {} : {}),
	});

	if (!flags.json) {
		const fetched = gathered.sources.filter((s) => s.fetched).length;
		process.stderr.write(
			`  ${fetched} of ${gathered.sources.length} candidate pages fetched` +
				(gathered.skipped.length > 0 ? `, ${gathered.skipped.length} skipped` : "") +
				"\n",
		);
		for (const hit of gathered.injectionHits) {
			process.stderr.write(`  ! injection-style text in ${hit.url} — treated as data\n`);
		}
	}

	const client = await resolveModelClient(flags);
	if (!client.ok) {
		process.stderr.write(`kaioken research: ${client.reason}\n`);
		return 1;
	}
	if (client.warning) process.stderr.write(`kaioken research: ${client.warning}\n`);

	let document;
	try {
		const result = await generateResearch({ question, gathered, depth, client: client.client });
		document = result.document;
	} catch (error) {
		process.stderr.write(
			`kaioken research: ${error instanceof Error ? error.message : String(error)}\n`,
		);
		return 1;
	}

	const path = await writeResearchDocument(root, document);

	// Research is deliberately *not* written into the shared provenance index,
	// and this is the note explaining why rather than an omission.
	//
	// `asProvenance` shapes a research document like any other, but its sources
	// are URLs, and `computeStaleness` resolves a source by looking its path up
	// in the scan. A URL is never in that map, so every source reads as deleted
	// and every research document reads as `orphaned` — "every source it was
	// written from is gone" — which is false, and would fail `status --check`
	// on a repository whose documentation is perfectly current.
	//
	// Ageing a research document means re-fetching its pages and comparing the
	// content hashes it already records. That is a mechanism this layer does not
	// have yet, and inventing a wrong answer in the meantime is worse than
	// admitting the tenant is not yet tracked.

	if (flags.json) {
		process.stdout.write(`${JSON.stringify({ document, path }, null, 2)}\n`);
	} else {
		const v = document.verification;
		process.stdout.write(
			`wrote ${relative(root, path)}\n` +
				`  ${document.sources.filter((s) => s.fetched).length} sources, ` +
				`${v.grounded} citations verified, ${v.defects.length} defects ` +
				// A document that cited nothing is not 100% resolved; it is a
				// document with nothing this pipeline can check.
				`(${v.groundedRatio === null ? "no citations to resolve" : `${Math.round(v.groundedRatio * 100)}% resolved`})\n`,
		);
		for (const defect of v.defects.slice(0, 5)) {
			process.stdout.write(`  ! ${defect.kind}: ${defect.detail}\n`);
		}
		if (document.sources.some((s) => !s.fetched)) {
			process.stdout.write("  (failed fetches are listed in the artifact and cannot be cited)\n");
		}
	}

	// Defects are reported, and they also fail the run: a research answer with
	// unresolvable citations is not done, and exit 0 would say it is.
	return document.verification.defects.length > 0 ? 1 : 0;
}
