#!/usr/bin/env node
// The executable entrypoint. main() stays free of process wiring so the phase-1
// suite can drive the whole command surface in-process, offline.
import { main } from "./main.js";

main(process.argv.slice(2))
	.then((code) => {
		process.exitCode = code;
	})
	.catch((error: unknown) => {
		process.stderr.write(`kaioken: ${error instanceof Error ? error.message : String(error)}\n`);
		process.exitCode = 1;
	});
