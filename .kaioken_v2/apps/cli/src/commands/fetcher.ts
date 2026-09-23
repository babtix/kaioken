import { resolve } from "node:path";
import {
	FETCHER_MODES,
	isMode,
	readFetcherMode,
	resolveFetchPort,
	writeFetcherMode,
} from "../fetcher.js";
import type { Flags } from "../main.js";

/**
 * `kaioken fetcher [auto|api|http]` — choose what reads the pages research
 * finds.
 *
 * Bare, it reports: the recorded mode, what that mode resolves to right now,
 * and whether it can actually run. Reporting resolves the real reader rather
 * than describing it separately, so this command and an actual research run
 * can never disagree.
 */
export async function runFetcher(flags: Flags): Promise<number> {
	const root = resolve(flags.root);
	const wanted = (flags.positional[0] ?? "").toLowerCase();

	if (wanted && !isMode(wanted)) {
		// Named for what it is: "local" and "headless" were real modes in the
		// interface this engine grew from, and a user who types one deserves to
		// be told the capability is absent rather than that the word is wrong.
		if (wanted === "local" || wanted === "headless" || wanted === "browser") {
			process.stderr.write(
				"kaioken fetcher: this engine has no local browser reader, so a page that renders\n" +
					"  its content client-side comes back thin. `api` reads those through Firecrawl.\n",
			);
			return 1;
		}
		process.stderr.write(`kaioken fetcher: unknown mode "${wanted}" — ${FETCHER_MODES.join(", ")}\n`);
		return 1;
	}

	// `wanted` is narrowed by the guard above; naming it as a mode here keeps
	// the write and the resolve from re-checking what is already known.
	const chosen = isMode(wanted) ? wanted : null;
	if (chosen) await writeFetcherMode(root, chosen);
	const mode = chosen ?? (await readFetcherMode(root));
	const resolved = resolveFetchPort(mode);

	if (flags.json) {
		process.stdout.write(
			`${JSON.stringify({ mode, describe: resolved.describe, ok: resolved.ok }, null, 2)}\n`,
		);
		return resolved.ok ? 0 : 1;
	}

	process.stdout.write(`${wanted ? "fetcher → " : "fetcher: "}${mode}\n`);
	process.stdout.write(`  ${resolved.describe}\n`);
	if (!chosen) process.stdout.write(`  change it: kaioken fetcher <${FETCHER_MODES.join("|")}>\n`);
	return resolved.ok ? 0 : 1;
}
