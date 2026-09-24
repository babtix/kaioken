/**
 * The evaluation fixture: a small, self-contained repository.
 *
 * Every eval runs against this rather than a live codebase so the numbers are
 * reproducible and the suite stays offline (Invariant 10). It is deliberately
 * small enough to reason about by hand — an eval whose expected result nobody
 * can state is not measuring anything.
 */
import { buildIndex, type IndexResult } from "@kaioken/index";
import { scan, type ScanResult } from "@kaioken/scan";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface Fixture {
	root: string;
	scan: ScanResult;
	index: IndexResult;
	sources: Record<string, string>;
	knownFiles: Set<string>;
	dispose(): Promise<void>;
}

const SOURCE_A = [
	"export interface AlphaOptions {",
	"\tmaxReadBytes: number;",
	"}",
	"",
	"/** Walk the index and return ranked hits. */",
	"export function alphaSearch(query: string): string[] {",
	"\treturn [query];",
	"}",
	"",
	"export class Engine {",
	"\trun(): void {}",
	"}",
	"",
	"export interface BaseService {",
	"\tstart(): void;",
	"\tstop(): void;",
	"}",
	"",
	"export class EngineService extends Engine implements BaseService {",
	"\tstart(): void {",
	"\t\tthis.run();",
	"\t}",
	"\tstop(): void {}",
	"}",
	"",
].join("\n");

const SOURCE_B = [
	'import { alphaSearch, EngineService } from "./a.ts";',
	"",
	'export const hits = alphaSearch("x");',
	"export const service = new EngineService();",
	"",
].join("\n");

const SOURCE_PY = [
	'"""Main entry point for Python pipeline."""',
	"",
	"class PipelineRunner:",
	"    def __init__(self, name: str) -> None:",
	"        self.name = name",
	"",
	"    def execute(self, payload: str) -> str:",
	'        return f"{self.name}: {payload}"',
	"",
	"def run_pipeline(payload: str) -> str:",
	'    runner = PipelineRunner("default")',
	"    return runner.execute(payload)",
	"",
].join("\n");

const SOURCE_GO = [
	"package service",
	"",
	"type Worker interface {",
	"\tProcess(job string) error",
	"}",
	"",
	"type DefaultWorker struct {",
	"\tID string",
	"}",
	"",
	"func (w *DefaultWorker) Process(job string) error {",
	"\treturn nil",
	"}",
	"",
	"func NewWorker(id string) *DefaultWorker {",
	"\treturn &DefaultWorker{ID: id}",
	"}",
	"",
].join("\n");

const SOURCE_RS = [
	"pub trait Storage {",
	"    fn get(&self, key: &str) -> Option<String>;",
	"}",
	"",
	"pub struct MemoryStorage;",
	"",
	"impl Storage for MemoryStorage {",
	"    fn get(&self, _key: &str) -> Option<String> {",
	"        None",
	"    }",
	"}",
	"",
	"pub fn create_storage() -> MemoryStorage {",
	"    MemoryStorage",
	"}",
	"",
].join("\n");

const SOURCE_JAVA = [
	"package service;",
	"",
	"public interface WorkerService {",
	"    String process(String job);",
	"}",
	"",
	"public class PipelineService implements WorkerService {",
	"    public String process(String job) {",
	"        return job;",
	"    }",
	"}",
	"",
].join("\n");

/**
 * Build the fixture on disk, then index it.
 *
 * `alphaSearch` is declared in `a.ts` and imported by `b.ts`, which is what
 * makes the blast-radius probe assertable: the dependent set is knowable by
 * hand, so a probe that misses it is a real failure.
 */
export async function createFixture(): Promise<Fixture> {
	const root = await mkdtemp(join(tmpdir(), "kaioken-eval-"));
	await mkdir(join(root, "src"), { recursive: true });
	await writeFile(join(root, "src", "a.ts"), SOURCE_A, "utf8");
	await writeFile(join(root, "src", "b.ts"), SOURCE_B, "utf8");
	await writeFile(join(root, "src", "main.py"), SOURCE_PY, "utf8");
	await writeFile(join(root, "src", "service.go"), SOURCE_GO, "utf8");
	await writeFile(join(root, "src", "lib.rs"), SOURCE_RS, "utf8");
	await writeFile(join(root, "src", "Main.java"), SOURCE_JAVA, "utf8");
	await writeFile(
		join(root, "package.json"),
		JSON.stringify({ name: "kaioken-eval-fixture", version: "1.0.0", type: "module" }, null, 2),
		"utf8",
	);

	const scanResult = await scan(root);
	const outcome = await buildIndex(scanResult);

	return {
		root,
		scan: scanResult,
		index: outcome.index,
		sources: {
			"src/a.ts": SOURCE_A,
			"src/b.ts": SOURCE_B,
			"src/main.py": SOURCE_PY,
			"src/service.go": SOURCE_GO,
			"src/lib.rs": SOURCE_RS,
			"src/Main.java": SOURCE_JAVA,
		},
		knownFiles: new Set(scanResult.files.filter((f) => !f.binary).map((f) => f.path)),
		dispose: () => rm(root, { recursive: true, force: true }),
	};
}

/** The fixture's sources as a lookup function, for verifier inputs. */
export function readerFor(fixture: Fixture): (path: string) => Promise<string | null> {
	return async (path: string) => {
		if (fixture.sources[path] !== undefined) return fixture.sources[path]!;
		try {
			return await readFile(join(fixture.root, path), "utf8");
		} catch {
			return null;
		}
	};
}
