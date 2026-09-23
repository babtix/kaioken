// Query files are data, not code: tsc will not carry them into dist, so the
// build copies them. Adding a language means adding a .scm here and nothing else.
import { cp, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const from = join(here, "..", "src", "queries");
const to = join(here, "..", "dist", "queries");

await mkdir(to, { recursive: true });
await cp(from, to, { recursive: true });
console.log(`copied queries -> ${to}`);
