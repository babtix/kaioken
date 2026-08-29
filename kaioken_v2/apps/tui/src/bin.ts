#!/usr/bin/env node
import { runTui } from "./app.js";

const argv = process.argv.slice(2);

let root = process.cwd();
let model: string | undefined;

for (let i = 0; i < argv.length; i++) {
	const arg = argv[i] as string;
	if (arg === "--root" || arg === "-C") {
		const next = argv[++i];
		if (!next) {
			process.stderr.write("kaioken-tui: --root needs a directory\n");
			process.exit(1);
		}
		root = next;
	} else if (arg === "--model" || arg === "-m") {
		const next = argv[++i];
		if (!next) {
			process.stderr.write("kaioken-tui: --model needs a value\n");
			process.exit(1);
		}
		model = next;
	} else if (arg === "-h" || arg === "--help") {
		process.stdout.write(
			"kaioken-tui — the knowledge engine, full-screen\n\n" +
				"Usage: kaioken-tui [--root <dir>] [--model <provider/model>]\n\n" +
				"Views: [1] dashboard  [2] search  [3] chat  [4] documents\n" +
				"Tab cycles views; ? shows the keyboard from any view;\n" +
				"arrows/pgup/pgdn scroll; q quits from the dashboard, ctrl-c from anywhere.\n" +
				"--model overrides the model used for chat (default: the CLI's config).\n",
		);
		process.exit(0);
	}
}

runTui({ root, ...(model ? { model } : {}) }).catch((error) => {
	process.stderr.write(`kaioken-tui: ${error instanceof Error ? error.message : String(error)}\n`);
	process.exit(1);
});
