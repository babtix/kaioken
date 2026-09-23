#!/usr/bin/env node
import { runTui } from "./app.js";

const argv = process.argv.slice(2);

let root = process.cwd();
let model: string | undefined;
let theme: string | undefined;
let motion: boolean | undefined;

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
	} else if (arg === "--theme") {
		const next = argv[++i];
		if (!next) {
			process.stderr.write("kaioken-tui: --theme needs a name\n");
			process.exit(1);
		}
		theme = next;
	} else if (arg === "--no-motion") {
		motion = false;
	} else if (arg === "--motion") {
		motion = true;
	} else if (arg === "-h" || arg === "--help") {
		process.stdout.write(
			"kaioken-tui — the knowledge engine, full-screen\n\n" +
				"Usage: kaioken-tui [--root <dir>] [--model <provider/model>] [--theme <name>]\n" +
				"                   [--no-motion]\n\n" +
				"Type to chat with the model. Press / for the command palette, or type\n" +
				"/help for the whole list, /tutorial for the guided tour, /explain for\n" +
				"the full reference. alt+enter adds a newline; esc stops a running task;\n" +
				"ctrl+d quits.\n\n" +
				"--model overrides the model used for chat (default: the CLI's config).\n" +
				"--theme selects the palette: default, light or highcontrast.\n" +
				"--no-motion stops every animation. KAIOKEN_NO_MOTION, NO_COLOR and\n" +
				"           TERM=dumb do the same thing.\n",
		);
		process.exit(0);
	}
}

runTui({
	root,
	...(model ? { model } : {}),
	...(theme ? { theme } : {}),
	...(motion === undefined ? {} : { motion }),
}).catch((error) => {
	process.stderr.write(`kaioken-tui: ${error instanceof Error ? error.message : String(error)}\n`);
	process.exit(1);
});
