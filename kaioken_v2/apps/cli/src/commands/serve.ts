import { resolve } from "node:path";
import { serve } from "@kaioken/serve";
import type { Flags } from "../main.js";

/**
 * Browse the generated knowledge locally.
 *
 * This exists because generated knowledge only an agent can consume is a
 * liability: if a human cannot read it, they cannot audit it, and unaudited
 * documentation is worse than none. Everything is rendered on this machine and
 * nothing leaves it.
 */
export async function runServe(flags: Flags): Promise<number> {
	const root = resolve(flags.root);
	const server = await serve({ root, ...(flags.port !== undefined ? { port: flags.port } : {}) });

	process.stdout.write(`kaioken serving ${root}\n`);
	process.stdout.write(`  ${server.url}\n`);
	process.stdout.write("  ctrl-c to stop\n");

	await new Promise<void>((done) => {
		const stop = () => {
			server.close().then(done, done);
		};
		process.once("SIGINT", stop);
		process.once("SIGTERM", stop);
	});

	return 0;
}
