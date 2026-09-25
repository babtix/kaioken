import { describe, expect, it } from "vitest";
import {
	buildSymbolCardFromCode,
	renderMarkdownPreviewCard,
	renderPlainPreviewCard,
	renderSymbolPreviewCard,
} from "../src/preview.ts";
import {
	getGrammarRegistry,
	isSupportedLanguage,
	registerGrammar,
	supportedLanguages,
} from "../src/grammars.ts";
import { extractFallbackDeclarations } from "../src/fallback.ts";
import {
	filterLocationsByVisibility,
	filterSymbolsByVisibility,
	getVisibilityStats,
	isSymbolExported,
} from "../src/visibility.ts";
import {
	applyIndexDelta,
	computeIndexDelta,
	filterDeltaByLanguage,
	getLanguageIndexDelta,
} from "../src/delta.ts";
import {
	linkSymbolDependencyGraph,
	SymbolDependencyGraph,
} from "../src/graph_linker.ts";
import { SymbolOracle } from "../src/oracle.ts";
import type { IndexResult } from "../src/types.ts";

describe("Step 25: Category 07 — AST Symbol Indexing & Code Oracle (UX-0641 to UX-0700)", () => {
	// =========================================================================
	// 1. Theme 1: Interactive symbol definition cards (UX-0641 to UX-0650)
	// =========================================================================
	describe("Theme 1: Interactive Symbol Definition Cards (UX-0641 - UX-0650)", () => {
		it("[UX-0641] renders symbol definition card for TypeScript / TSX class and interface declarations", () => {
			const code = `export interface UserProfile {\n  id: string;\n  name: string;\n}\n\nexport class UserService implements UserProfile {\n  id = "1";\n  name = "Admin";\n}`;
			const card = buildSymbolCardFromCode({
				code,
				language: "typescript",
				path: "src/user.ts",
				symbolName: "UserService",
			});
			expect(card).not.toBeNull();
			expect(card?.symbol.name).toBe("UserService");
			expect(card?.symbol.kind).toBe("class");
			expect(card?.exported).toBe(true);

			const plain = renderPlainPreviewCard(card!);
			expect(plain).toContain("[TYPESCRIPT] class UserService");
			expect(plain).toContain("[EXPORTED]");
			expect(plain).toContain("class UserService implements UserProfile");

			const md = renderMarkdownPreviewCard(card!);
			expect(md).toContain("`TYPESCRIPT`");
			expect(md).toContain("UserService");
		});

		it("[UX-0642] renders symbol definition card for JavaScript / JSX function and constant exports", () => {
			const code = `export const API_BASE = "https://api.example.com";\nexport function calculateTax(amount) {\n  return amount * 0.2;\n}`;
			const card = buildSymbolCardFromCode({
				code,
				language: "javascript",
				path: "utils/calc.js",
				symbolName: "calculateTax",
			});
			expect(card).not.toBeNull();
			expect(card?.symbol.name).toBe("calculateTax");
			expect(card?.symbol.kind).toBe("function");

			const plain = renderPlainPreviewCard(card!);
			expect(plain).toContain("[JAVASCRIPT]");
			expect(plain).toContain("calculateTax");
		});

		it("[UX-0643] renders symbol definition card for Python classes, methods, and decorated functions", () => {
			const code = `@dataclass\nclass Account:\n    owner: str\n    balance: float = 0.0\n\n    @property\n    def is_active(self):\n        return self.balance > 0`;
			const card = buildSymbolCardFromCode({
				code,
				language: "python",
				path: "models/account.py",
				symbolName: "Account",
			});
			expect(card).not.toBeNull();
			expect(card?.symbol.name).toBe("Account");
			expect(card?.decorators).toEqual(["@dataclass"]);

			const plain = renderPlainPreviewCard(card!);
			expect(plain).toContain("[PYTHON] class Account");
			expect(plain).toContain("Decorators: @dataclass");
		});

		it("[UX-0644] renders symbol definition card for Go struct, interface, and package functions", () => {
			const code = `type Server struct {\n  Port int\n}\n\nfunc (s *Server) Start() error {\n  return nil\n}`;
			const card = buildSymbolCardFromCode({
				code,
				language: "go",
				path: "server.go",
				symbolName: "Start",
			});
			expect(card).not.toBeNull();
			expect(card?.symbol.name).toBe("Start");
			expect(card?.symbol.parent).toBe("Server");
			expect(card?.exported).toBe(true);

			const plain = renderPlainPreviewCard(card!);
			expect(plain).toContain("[GO] method Start");
			expect(plain).toContain("Scope: Server › Start");
		});

		it("[UX-0645] renders symbol definition card for Rust structs, traits, enums, and impl blocks", () => {
			const code = `pub trait Greeter {\n  fn greet(&self);\n}\n\npub struct Worker;\n\nimpl Greeter for Worker {\n  fn greet(&self) {}\n}`;
			const card = buildSymbolCardFromCode({
				code,
				language: "rust",
				path: "greeter.rs",
				symbolName: "Greeter for Worker",
			});
			expect(card).not.toBeNull();
			expect(card?.symbol.kind).toBe("impl");

			const plain = renderPlainPreviewCard(card!);
			expect(plain).toContain("[RUST] impl Greeter for Worker");
		});

		it("[UX-0646] renders symbol definition card for Java classes, records, and spring annotations", () => {
			const code = `@RestController\npublic class OrderController {\n    public void getOrders() {}\n}`;
			const card = buildSymbolCardFromCode({
				code,
				language: "java",
				path: "OrderController.java",
				symbolName: "OrderController",
			});
			expect(card).not.toBeNull();
			expect(card?.annotations).toEqual(["@RestController"]);

			const plain = renderPlainPreviewCard(card!);
			expect(plain).toContain("[JAVA] class OrderController");
			expect(plain).toContain("Annotations: @RestController");
		});

		it("[UX-0647] renders symbol definition card for C/C++ structs, namespaces, and template functions", () => {
			const code = `namespace engine {\n  template <class T>\n  class BufferPool {\n  };\n}`;
			const card = buildSymbolCardFromCode({
				code,
				language: "cpp",
				path: "buffer.hpp",
				symbolName: "BufferPool",
			});
			expect(card).not.toBeNull();
			expect(card?.symbol.kind).toBe("class");

			const plain = renderPlainPreviewCard(card!);
			expect(plain).toContain("[CPP] class BufferPool");
		});

		it("[UX-0648] renders symbol definition card for C# classes, interfaces, and record types", () => {
			const code = `[Serializable]\npublic record Person(string FirstName, string LastName);`;
			const card = buildSymbolCardFromCode({
				code,
				language: "csharp",
				path: "Person.cs",
				symbolName: "Person",
			});
			expect(card).not.toBeNull();
			expect(card?.annotations).toEqual(["[Serializable]"]);

			const plain = renderPlainPreviewCard(card!);
			expect(plain).toContain("[CSHARP]");
			expect(plain).toContain("Person");
		});

		it("[UX-0649] renders symbol definition card for Ruby module definitions and method symbols", () => {
			const code = `module Authenticatable\n  attr_accessor :token, :session_id\n  def authenticate!\n  end\nend`;
			const card = buildSymbolCardFromCode({
				code,
				language: "ruby",
				path: "auth.rb",
				symbolName: "Authenticatable",
			});
			expect(card).not.toBeNull();
			expect(card?.symbol.kind).toBe("module");

			const plain = renderPlainPreviewCard(card!);
			expect(plain).toContain("[RUBY] module Authenticatable");
		});

		it("[UX-0650] renders symbol definition card for SQL schema tables, procedures, and view definitions", () => {
			const code = `CREATE TABLE customers (\n  id SERIAL PRIMARY KEY,\n  email VARCHAR(255)\n);\n\nCREATE VIEW active_customers AS\nSELECT * FROM customers;`;
			const card = buildSymbolCardFromCode({
				code,
				language: "sql",
				path: "schema.sql",
				symbolName: "active_customers",
			});
			expect(card).not.toBeNull();
			expect(card?.symbol.name).toBe("active_customers");
			expect(card?.symbol.kind).toBe("type");

			const plain = renderPlainPreviewCard(card!);
			expect(plain).toContain("[SQL]");
			expect(plain).toContain("active_customers");
		});
	});

	// =========================================================================
	// 2. Theme 2: Extensible grammar registry (UX-0651 to UX-0660)
	// =========================================================================
	describe("Theme 2: Extensible Grammar Registry (UX-0651 - UX-0660)", () => {
		const registry = getGrammarRegistry();

		it("[UX-0651] enables AST grammar check for TypeScript / TSX class and interface declarations", () => {
			expect(registry.canParseAst("typescript")).toBe(true);
			expect(registry.canParseAst("tsx")).toBe(true);
			expect(registry.get("typescript")?.query).toBe("typescript.scm");
		});

		it("[UX-0652] enables AST grammar check for JavaScript / JSX function and constant exports", () => {
			expect(registry.canParseAst("javascript")).toBe(true);
			expect(registry.canParseAst("jsx")).toBe(true);
			expect(registry.get("javascript")?.query).toBe("javascript.scm");
		});

		it("[UX-0653] enables AST grammar check for Python classes, methods, and decorated functions", () => {
			expect(registry.canParseAst("python")).toBe(true);
			expect(registry.get("python")?.query).toBe("python.scm");
		});

		it("[UX-0654] enables AST grammar check for Go struct, interface, and package functions", () => {
			expect(registry.canParseAst("go")).toBe(true);
			expect(registry.get("go")?.query).toBe("go.scm");
		});

		it("[UX-0655] enables AST grammar check for Rust structs, traits, enums, and impl blocks", () => {
			expect(registry.canParseAst("rust")).toBe(true);
			expect(registry.get("rust")?.query).toBe("rust.scm");
		});

		it("[UX-0656] enables AST grammar check for Java classes, records, and spring annotations", () => {
			expect(registry.canParseAst("java")).toBe(true);
			expect(registry.get("java")?.query).toBe("java.scm");
		});

		it("[UX-0657] enables AST grammar registry query configuration for C/C++", () => {
			expect(registry.has("c")).toBe(true);
			expect(registry.has("cpp")).toBe(true);
			expect(registry.get("c")?.query).toBe("c.scm");
			expect(registry.get("cpp")?.query).toBe("cpp.scm");
		});

		it("[UX-0658] enables AST grammar registry query configuration for C#", () => {
			expect(registry.has("csharp")).toBe(true);
			expect(registry.has("c_sharp")).toBe(true);
			expect(registry.get("csharp")?.query).toBe("c_sharp.scm");
		});

		it("[UX-0659] enables AST grammar registry query configuration for Ruby", () => {
			expect(registry.has("ruby")).toBe(true);
			expect(registry.get("ruby")?.query).toBe("ruby.scm");
		});

		it("[UX-0660] enables grammar registration and fallback tier for SQL schema tables, procedures, and views", () => {
			expect(registry.getLanguageTier("sql")).toBe("fallback");
			registry.register("sql_custom", {
				wasm: "tree-sitter-sql/sql.wasm",
				query: "sql.scm",
			});
			expect(registry.has("sql_custom")).toBe(true);
			registry.unregister("sql_custom");
			expect(registry.has("sql_custom")).toBe(false);
		});
	});

	// =========================================================================
	// 3. Theme 3: Regex fallback declaration extractor (UX-0661 to UX-0670)
	// =========================================================================
	describe("Theme 3: Regex Fallback Declaration Extractor (UX-0661 - UX-0670)", () => {
		it("[UX-0661] extracts TypeScript / TSX class, interface, type, enum, and function declarations", () => {
			const source = `export abstract class BaseService {}\nexport interface StorageGateway {}\nexport type TokenId = string;\nexport enum Role { Admin, User }\n`;
			const res = extractFallbackDeclarations({ path: "app.ts", language: "typescript", hash: "h", source });
			const names = res.symbols.map((s) => s.name);
			expect(names).toContain("BaseService");
			expect(names).toContain("StorageGateway");
			expect(names).toContain("TokenId");
			expect(names).toContain("Role");
		});

		it("[UX-0662] extracts JavaScript / JSX function and constant exports", () => {
			const source = `export const MAX_RETRY = 5;\nexport const fetchPayload = async () => {};\nexport function retryLoop() {}\n`;
			const res = extractFallbackDeclarations({ path: "client.js", language: "javascript", hash: "h", source });
			const names = res.symbols.map((s) => s.name);
			expect(names).toContain("MAX_RETRY");
			expect(names).toContain("fetchPayload");
			expect(names).toContain("retryLoop");
		});

		it("[UX-0663] extracts Python classes, methods, and decorated functions", () => {
			const source = `@dataclass\nclass Device:\n    name: str\n\n    @property\n    def is_connected(self):\n        pass\n\n@app.route('/health')\ndef health_check():\n    return {'status': 'ok'}\n`;
			const res = extractFallbackDeclarations({ path: "device.py", language: "python", hash: "h", source });
			const names = res.symbols.map((s) => s.name);
			expect(names).toContain("Device");
			expect(names).toContain("is_connected");
			expect(names).toContain("health_check");

			const devSym = res.symbols.find((s) => s.name === "Device");
			expect(devSym?.decorators).toEqual(["@dataclass"]);
			const methodSym = res.symbols.find((s) => s.name === "is_connected");
			expect(methodSym?.parent).toBe("Device");
		});

		it("[UX-0664] extracts Go struct, interface, and package functions with receiver methods", () => {
			const source = `type Cache interface {}\ntype LRU struct {}\nfunc NewLRU() *LRU {}\nfunc (c *LRU) Get(k string) string {}\n`;
			const res = extractFallbackDeclarations({ path: "cache.go", language: "go", hash: "h", source });
			const names = res.symbols.map((s) => s.name);
			expect(names).toContain("Cache");
			expect(names).toContain("LRU");
			expect(names).toContain("NewLRU");
			expect(names).toContain("Get");

			const getMethod = res.symbols.find((s) => s.name === "Get");
			expect(getMethod?.parent).toBe("LRU");
			expect(getMethod?.exported).toBe(true);
		});

		it("[UX-0665] extracts Rust structs, traits, enums, and impl blocks", () => {
			const source = `pub struct Client;\npub trait Transport {}\npub enum Status { Ok, Err }\nimpl Transport for Client {}\n`;
			const res = extractFallbackDeclarations({ path: "lib.rs", language: "rust", hash: "h", source });
			const names = res.symbols.map((s) => s.name);
			expect(names).toContain("Client");
			expect(names).toContain("Transport");
			expect(names).toContain("Status");
			expect(names).toContain("Transport for Client");
		});

		it("[UX-0666] extracts Java classes, records, and spring annotations", () => {
			const source = `@Service\npublic class BillingService {}\npublic record InvoiceId(long id) {}\n`;
			const res = extractFallbackDeclarations({ path: "Billing.java", language: "java", hash: "h", source });
			const names = res.symbols.map((s) => s.name);
			expect(names).toContain("BillingService");
			expect(names).toContain("InvoiceId");

			const svc = res.symbols.find((s) => s.name === "BillingService");
			expect(svc?.annotations).toEqual(["@Service"]);
		});

		it("[UX-0667] extracts C/C++ structs, namespaces, and template functions", () => {
			const source = `namespace graphics {\n  template <class T>\n  class TextureMap {};\n  struct ColorVec {};\n}\n`;
			const res = extractFallbackDeclarations({ path: "gfx.hpp", language: "cpp", hash: "h", source });
			const names = res.symbols.map((s) => s.name);
			expect(names).toContain("graphics");
			expect(names).toContain("TextureMap");
			expect(names).toContain("ColorVec");
		});

		it("[UX-0668] extracts C# classes, interfaces, and record types", () => {
			const source = `public interface IRepository {}\npublic record OrderRecord(int Id);\npublic class SqlRepository : IRepository {}\n`;
			const res = extractFallbackDeclarations({ path: "Repo.cs", language: "csharp", hash: "h", source });
			const names = res.symbols.map((s) => s.name);
			expect(names).toContain("IRepository");
			expect(names).toContain("OrderRecord");
			expect(names).toContain("SqlRepository");
		});

		it("[UX-0669] extracts Ruby module definitions and method symbols", () => {
			const source = `module Helpers\n  attr_accessor :debug_mode\n  def self.log(msg)\n  end\nend\n`;
			const res = extractFallbackDeclarations({ path: "helpers.rb", language: "ruby", hash: "h", source });
			const names = res.symbols.map((s) => s.name);
			expect(names).toContain("Helpers");
			expect(names).toContain("debug_mode");
			expect(names).toContain("self.log");
		});

		it("[UX-0670] extracts SQL schema tables, procedures, and view definitions", () => {
			const source = `CREATE TABLE audit_log (id INT);\nCREATE PROCEDURE purge_stale_logs() BEGIN END;\nCREATE VIEW monthly_metrics AS SELECT * FROM audit_log;\n`;
			const res = extractFallbackDeclarations({ path: "init.sql", language: "sql", hash: "h", source });
			const names = res.symbols.map((s) => s.name);
			expect(names).toContain("audit_log");
			expect(names).toContain("purge_stale_logs");
			expect(names).toContain("monthly_metrics");
		});
	});

	// =========================================================================
	// 4. Theme 4: Exported vs internal visibility filter toggling (UX-0671 to UX-0680)
	// =========================================================================
	describe("Theme 4: Exported vs Internal Visibility Filter Toggling (UX-0671 - UX-0680)", () => {
		it("[UX-0671] toggles visibility filter for TypeScript declarations", () => {
			const symbols = [
				{ name: "PublicInterface", kind: "interface", signature: "export interface", startLine: 1, endLine: 2, exported: true, doc: "" },
				{ name: "internalHelper", kind: "function", signature: "function helper()", startLine: 3, endLine: 4, exported: false, doc: "" },
			] as const;

			const expOnly = filterSymbolsByVisibility([...symbols], { mode: "exported" }, "typescript");
			expect(expOnly.map((s) => s.name)).toEqual(["PublicInterface"]);

			const intOnly = filterSymbolsByVisibility([...symbols], { mode: "internal" }, "typescript");
			expect(intOnly.map((s) => s.name)).toEqual(["internalHelper"]);
		});

		it("[UX-0672] toggles visibility filter for JavaScript exports vs internal constants", () => {
			const symbols = [
				{ name: "EXPORTED_API", kind: "const", signature: "export const", startLine: 1, endLine: 1, exported: true, doc: "" },
				{ name: "INTERNAL_SECRET", kind: "const", signature: "const", startLine: 2, endLine: 2, exported: false, doc: "" },
			] as const;
			expect(filterSymbolsByVisibility([...symbols], { mode: "exported" }, "javascript").length).toBe(1);
			expect(filterSymbolsByVisibility([...symbols], { mode: "internal" }, "javascript").length).toBe(1);
		});

		it("[UX-0673] toggles visibility filter for Python classes and private functions", () => {
			const symbols = [
				{ name: "AppController", kind: "class", signature: "class AppController:", startLine: 1, endLine: 2, exported: true, doc: "" },
				{ name: "_verify_token", kind: "function", signature: "def _verify_token():", startLine: 3, endLine: 4, exported: false, doc: "" },
			] as const;
			expect(isSymbolExported(symbols[0]!, "python")).toBe(true);
			expect(isSymbolExported(symbols[1]!, "python")).toBe(false);

			const exp = filterSymbolsByVisibility([...symbols], { mode: "exported" }, "python");
			expect(exp.map((s) => s.name)).toEqual(["AppController"]);
			const internal = filterSymbolsByVisibility([...symbols], { mode: "internal" }, "python");
			expect(internal.map((s) => s.name)).toEqual(["_verify_token"]);
		});

		it("[UX-0674] toggles visibility filter for Go uppercase vs lowercase identifier conventions", () => {
			const symbols = [
				{ name: "PublicServer", kind: "struct", signature: "type PublicServer struct", startLine: 1, endLine: 2, exported: true, doc: "" },
				{ name: "internalMutex", kind: "var", signature: "var internalMutex sync.Mutex", startLine: 3, endLine: 3, exported: false, doc: "" },
			] as const;
			expect(isSymbolExported(symbols[0]!, "go")).toBe(true);
			expect(isSymbolExported(symbols[1]!, "go")).toBe(false);

			const exp = filterSymbolsByVisibility([...symbols], { mode: "exported" }, "go");
			expect(exp.map((s) => s.name)).toEqual(["PublicServer"]);
		});

		it("[UX-0675] toggles visibility filter for Rust pub vs private items", () => {
			const symbols = [
				{ name: "Engine", kind: "struct", signature: "pub struct Engine", startLine: 1, endLine: 2, exported: true, doc: "" },
				{ name: "internal_seed", kind: "function", signature: "fn internal_seed()", startLine: 3, endLine: 4, exported: false, doc: "" },
			] as const;
			expect(filterSymbolsByVisibility([...symbols], { mode: "exported" }, "rust").length).toBe(1);
			expect(filterSymbolsByVisibility([...symbols], { mode: "internal" }, "rust").length).toBe(1);
		});

		it("[UX-0676] toggles visibility filter for Java public classes vs private utilities", () => {
			const symbols = [
				{ name: "PaymentController", kind: "class", signature: "public class", startLine: 1, endLine: 2, exported: true, doc: "" },
				{ name: "CryptoUtil", kind: "class", signature: "class CryptoUtil", startLine: 3, endLine: 4, exported: false, doc: "" },
			] as const;
			expect(filterSymbolsByVisibility([...symbols], { mode: "exported" }, "java").length).toBe(1);
			expect(filterSymbolsByVisibility([...symbols], { mode: "internal" }, "java").length).toBe(1);
		});

		it("[UX-0677] toggles visibility filter for C/C++ declarations", () => {
			const symbols = [
				{ name: "PublicApi", kind: "class", signature: "class PublicApi", startLine: 1, endLine: 2, exported: true, doc: "" },
				{ name: "hiddenHelper", kind: "function", signature: "static void hiddenHelper()", startLine: 3, endLine: 4, exported: false, doc: "" },
			] as const;
			expect(filterSymbolsByVisibility([...symbols], { mode: "exported" }, "cpp").length).toBe(1);
		});

		it("[UX-0678] toggles visibility filter for C# public vs internal classes", () => {
			const symbols = [
				{ name: "PublicFacade", kind: "class", signature: "public class", startLine: 1, endLine: 2, exported: true, doc: "" },
				{ name: "InternalHandler", kind: "class", signature: "internal class", startLine: 3, endLine: 4, exported: false, doc: "" },
			] as const;
			expect(filterSymbolsByVisibility([...symbols], { mode: "exported" }, "csharp").length).toBe(1);
			expect(filterSymbolsByVisibility([...symbols], { mode: "internal" }, "csharp").length).toBe(1);
		});

		it("[UX-0679] toggles visibility filter for Ruby public vs private symbols", () => {
			const symbols = [
				{ name: "PublicCommand", kind: "function", signature: "def PublicCommand", startLine: 1, endLine: 2, exported: true, doc: "" },
				{ name: "_private_hook", kind: "function", signature: "def _private_hook", startLine: 3, endLine: 4, exported: false, doc: "" },
			] as const;
			expect(filterSymbolsByVisibility([...symbols], { mode: "exported" }, "ruby").length).toBe(1);
			expect(filterSymbolsByVisibility([...symbols], { mode: "internal" }, "ruby").length).toBe(1);
		});

		it("[UX-0680] toggles visibility filter for SQL public schema tables vs tmp_ tables", () => {
			const symbols = [
				{ name: "orders", kind: "struct", signature: "CREATE TABLE orders", startLine: 1, endLine: 2, exported: true, doc: "" },
				{ name: "tmp_staging_data", kind: "struct", signature: "CREATE TABLE tmp_staging_data", startLine: 3, endLine: 4, exported: false, doc: "" },
			] as const;
			expect(isSymbolExported(symbols[0]!, "sql")).toBe(true);
			expect(isSymbolExported(symbols[1]!, "sql")).toBe(false);

			const stats = getVisibilityStats([...symbols], () => "sql");
			expect(stats.total).toBe(2);
			expect(stats.exported).toBe(1);
			expect(stats.internal).toBe(1);
		});
	});

	// =========================================================================
	// 5. Theme 5: Incremental AST delta indexing (UX-0681 to UX-0690)
	// =========================================================================
	describe("Theme 5: Incremental AST Delta Indexing (UX-0681 - UX-0690)", () => {
		const baseIndex: IndexResult = {
			root: "repo",
			builtAt: "2026-09-25T00:00:00Z",
			fileCount: 2,
			symbolCount: 2,
			unparsedLanguages: {},
			files: [
				{
					path: "app.ts",
					language: "typescript",
					hash: "hash-ts-1",
					lineCount: 10,
					unparsed: false,
					symbols: [
						{ name: "MainApp", kind: "class", signature: "export class MainApp", startLine: 1, endLine: 5, exported: true, doc: "" },
					],
				},
				{
					path: "schema.sql",
					language: "sql",
					hash: "hash-sql-1",
					lineCount: 10,
					unparsed: false,
					symbols: [
						{ name: "users", kind: "struct", signature: "CREATE TABLE users", startLine: 1, endLine: 3, exported: true, doc: "" },
					],
				},
			],
		};

		it("[UX-0681] incrementally updates only changed TypeScript files", async () => {
			const { index, delta, stats } = await applyIndexDelta(baseIndex, [
				{
					path: "app.ts",
					language: "typescript",
					source: "export class MainApp {\n  version = 2;\n}\nexport interface Config {}\n",
					hash: "hash-ts-2",
				},
			]);
			expect(stats.parsed).toBe(1);
			expect(stats.reused).toBe(1);
			expect(delta.files.modified).toEqual(["app.ts"]);
			expect(delta.symbols["app.ts"]?.added.map((s) => s.name)).toContain("Config");
		});

		it("[UX-0682] computes delta breakdown for JavaScript exports", () => {
			const oldIndex: IndexResult = {
				root: "repo",
				builtAt: "2026-09-25T00:00:00Z",
				fileCount: 1,
				symbolCount: 1,
				unparsedLanguages: {},
				files: [{
					path: "utils.js",
					language: "javascript",
					hash: "h1",
					lineCount: 5,
					unparsed: false,
					symbols: [{ name: "fnA", kind: "function", signature: "export function fnA()", startLine: 1, endLine: 2, exported: true, doc: "" }],
				}],
			};
			const newIndex: IndexResult = {
				...oldIndex,
				files: [{
					path: "utils.js",
					language: "javascript",
					hash: "h2",
					lineCount: 10,
					unparsed: false,
					symbols: [
						{ name: "fnA", kind: "function", signature: "export function fnA(x)", startLine: 1, endLine: 2, exported: true, doc: "" },
						{ name: "fnB", kind: "function", signature: "export function fnB()", startLine: 3, endLine: 5, exported: true, doc: "" },
					],
				}],
			};
			const delta = computeIndexDelta(oldIndex, newIndex);
			const byLang = getLanguageIndexDelta(delta, newIndex);
			expect(byLang["javascript"]?.filesModified).toBe(1);
			expect(byLang["javascript"]?.symbolsAdded).toBe(1);
			expect(byLang["javascript"]?.symbolsModified).toBe(1);
		});

		it("[UX-0683] filters index delta specifically for Python modules", () => {
			const dummyIndex: IndexResult = {
				root: "repo",
				builtAt: "2026-09-25T00:00:00Z",
				fileCount: 2,
				symbolCount: 2,
				unparsedLanguages: {},
				files: [
					{ path: "app.py", language: "python", hash: "h2", lineCount: 5, unparsed: false, symbols: [] },
					{ path: "app.ts", language: "typescript", hash: "h2", lineCount: 5, unparsed: false, symbols: [] },
				],
			};
			const delta = {
				files: { added: ["app.py", "app.ts"], modified: [], deleted: [], unchanged: [] },
				symbols: { "app.py": { added: [], removed: [], modified: [] } },
				summary: { totalAdded: 0, totalRemoved: 0, totalModified: 0, totalUnchanged: 0 },
				hasChanges: true,
			};
			const pyDelta = filterDeltaByLanguage(delta, dummyIndex, "python");
			expect(pyDelta.files.added).toEqual(["app.py"]);
		});

		it("[UX-0684] handles incremental Go package updates preserving unchanged symbols", async () => {
			const goBase: IndexResult = {
				root: "repo",
				builtAt: "2026-09-25T00:00:00Z",
				fileCount: 1,
				symbolCount: 1,
				unparsedLanguages: {},
				files: [{
					path: "main.go",
					language: "go",
					hash: "h1",
					lineCount: 5,
					unparsed: false,
					symbols: [{ name: "Server", kind: "struct", signature: "type Server struct", startLine: 1, endLine: 2, exported: true, doc: "" }],
				}],
			};
			const { delta } = await applyIndexDelta(goBase, [
				{
					path: "main.go",
					language: "go",
					source: "type Server struct {}\nfunc Run() {}\n",
					hash: "h2",
				},
			]);
			expect(delta.symbols["main.go"]?.added.map((s) => s.name)).toContain("Run");
		});

		it("[UX-0685 to UX-0690] incrementally updates files across Rust, Java, C++, C#, Ruby, and SQL", async () => {
			const multiBase: IndexResult = {
				root: "repo",
				builtAt: "2026-09-25T00:00:00Z",
				fileCount: 6,
				symbolCount: 6,
				unparsedLanguages: {},
				files: [
					{ path: "lib.rs", language: "rust", hash: "h1", lineCount: 5, unparsed: false, symbols: [{ name: "S", kind: "struct", signature: "struct S", startLine: 1, endLine: 2, exported: true, doc: "" }] },
					{ path: "App.java", language: "java", hash: "h1", lineCount: 5, unparsed: false, symbols: [{ name: "App", kind: "class", signature: "class App", startLine: 1, endLine: 2, exported: true, doc: "" }] },
					{ path: "main.cpp", language: "cpp", hash: "h1", lineCount: 5, unparsed: false, symbols: [{ name: "Vec", kind: "struct", signature: "struct Vec", startLine: 1, endLine: 2, exported: true, doc: "" }] },
					{ path: "App.cs", language: "csharp", hash: "h1", lineCount: 5, unparsed: false, symbols: [{ name: "Program", kind: "class", signature: "class Program", startLine: 1, endLine: 2, exported: true, doc: "" }] },
					{ path: "app.rb", language: "ruby", hash: "h1", lineCount: 5, unparsed: false, symbols: [{ name: "Mod", kind: "module", signature: "module Mod", startLine: 1, endLine: 2, exported: true, doc: "" }] },
					{ path: "init.sql", language: "sql", hash: "h1", lineCount: 5, unparsed: false, symbols: [{ name: "t1", kind: "struct", signature: "create table t1", startLine: 1, endLine: 2, exported: true, doc: "" }] },
				],
			};

			const { index, delta, stats } = await applyIndexDelta(multiBase, [
				{
					path: "init.sql",
					language: "sql",
					source: "CREATE TABLE t1 (id INT);\nCREATE TABLE t2 (id INT);\n",
					hash: "h2",
				},
			]);
			expect(stats.parsed).toBe(1);
			expect(stats.reused).toBe(5);
			expect(delta.symbols["init.sql"]?.added.map((s) => s.name)).toContain("t2");
		});
	});

	// =========================================================================
	// 6. Theme 6: Structural symbol dependency graph linker (UX-0691 to UX-0700)
	// =========================================================================
	describe("Theme 6: Structural Symbol Dependency Graph Linker (UX-0691 - UX-0700)", () => {
		it("[UX-0691] links TypeScript class inheritance and interface implementation", () => {
			const index: IndexResult = {
				root: "repo",
				builtAt: "2026-09-25T00:00:00Z",
				fileCount: 1,
				symbolCount: 3,
				unparsedLanguages: {},
				files: [{
					path: "auth.ts",
					language: "typescript",
					hash: "h",
					lineCount: 20,
					unparsed: false,
					symbols: [
						{ name: "AuthService", kind: "interface", signature: "export interface AuthService", startLine: 1, endLine: 3, exported: true, doc: "" },
						{ name: "BaseService", kind: "class", signature: "export class BaseService", startLine: 4, endLine: 6, exported: true, doc: "" },
						{ name: "OAuthService", kind: "class", signature: "export class OAuthService extends BaseService implements AuthService", startLine: 7, endLine: 10, exported: true, doc: "" },
					],
				}],
			};

			const graph = linkSymbolDependencyGraph(index);
			const oauthNodes = graph.findNodes("OAuthService");
			expect(oauthNodes.length).toBe(1);

			const outgoing = graph.getOutgoing(oauthNodes[0]!.id);
			const extendsEdge = outgoing.find((e) => e.kind === "extends");
			expect(extendsEdge).toBeDefined();
			expect(graph.getNode(extendsEdge!.toId)?.name).toBe("BaseService");

			const implementsEdge = outgoing.find((e) => e.kind === "implements");
			expect(implementsEdge).toBeDefined();
			expect(graph.getNode(implementsEdge!.toId)?.name).toBe("AuthService");

			const hierarchy = graph.getTypeHierarchy("OAuthService");
			expect(hierarchy.parents.map((p) => p.name)).toContain("BaseService");
			expect(hierarchy.parents.map((p) => p.name)).toContain("AuthService");
		});

		it("[UX-0692] links JavaScript exports and re-export chains", () => {
			const index: IndexResult = {
				root: "repo",
				builtAt: "2026-09-25T00:00:00Z",
				fileCount: 2,
				symbolCount: 1,
				unparsedLanguages: {},
				files: [
					{
						path: "math.js",
						language: "javascript",
						hash: "h1",
						lineCount: 5,
						unparsed: false,
						symbols: [{ name: "add", kind: "function", signature: "export function add()", startLine: 1, endLine: 2, exported: true, doc: "" }],
					},
					{
						path: "index.js",
						language: "javascript",
						hash: "h2",
						lineCount: 2,
						unparsed: false,
						symbols: [],
						reexports: [{ name: "add", importedName: "add", from: "./math.js" }],
					},
				],
			};

			const graph = linkSymbolDependencyGraph(index);
			const reNode = graph.getNode("index.js::reexport:add");
			expect(reNode).toBeDefined();
			const outgoing = graph.getOutgoing(reNode!.id);
			expect(outgoing.some((e) => e.kind === "reexports")).toBe(true);
		});

		it("[UX-0693] links Python class inheritance, methods, and decorator annotations", () => {
			const index: IndexResult = {
				root: "repo",
				builtAt: "2026-09-25T00:00:00Z",
				fileCount: 1,
				symbolCount: 3,
				unparsedLanguages: {},
				files: [{
					path: "app.py",
					language: "python",
					hash: "h",
					lineCount: 15,
					unparsed: false,
					symbols: [
						{ name: "Model", kind: "class", signature: "class Model:", startLine: 1, endLine: 3, exported: true, doc: "" },
						{ name: "User", kind: "class", signature: "class User(Model):", startLine: 4, endLine: 10, exported: true, doc: "" },
						{ name: "save", kind: "method", signature: "def save(self):", startLine: 5, endLine: 7, exported: true, doc: "", parent: "User" },
					],
				}],
			};

			const graph = linkSymbolDependencyGraph(index);
			const userNodes = graph.findNodes("User");
			expect(userNodes.length).toBe(1);

			const outgoing = graph.getOutgoing(userNodes[0]!.id);
			expect(outgoing.some((e) => e.kind === "extends")).toBe(true);

			const saveNode = graph.findNodes("save")[0]!;
			const saveIncoming = graph.getIncoming(saveNode.id);
			expect(saveIncoming.some((e) => e.kind === "contains")).toBe(true);
		});

		it("[UX-0694] links Go receiver methods to enclosing struct types", () => {
			const index: IndexResult = {
				root: "repo",
				builtAt: "2026-09-25T00:00:00Z",
				fileCount: 1,
				symbolCount: 2,
				unparsedLanguages: {},
				files: [{
					path: "queue.go",
					language: "go",
					hash: "h",
					lineCount: 10,
					unparsed: false,
					symbols: [
						{ name: "Queue", kind: "struct", signature: "type Queue struct", startLine: 1, endLine: 3, exported: true, doc: "" },
						{ name: "Push", kind: "method", signature: "func (q *Queue) Push(item any)", startLine: 4, endLine: 6, exported: true, doc: "", parent: "Queue" },
					],
				}],
			};

			const graph = linkSymbolDependencyGraph(index);
			const pushNode = graph.findNodes("Push")[0]!;
			const incoming = graph.getIncoming(pushNode.id);
			expect(incoming.some((e) => e.kind === "contains")).toBe(true);
		});

		it("[UX-0695] links Rust traits, structs, and trait implementations", () => {
			const index: IndexResult = {
				root: "repo",
				builtAt: "2026-09-25T00:00:00Z",
				fileCount: 1,
				symbolCount: 3,
				unparsedLanguages: {},
				files: [{
					path: "lib.rs",
					language: "rust",
					hash: "h",
					lineCount: 15,
					unparsed: false,
					symbols: [
						{ name: "Encoder", kind: "trait", signature: "pub trait Encoder", startLine: 1, endLine: 3, exported: true, doc: "" },
						{ name: "JsonEncoder", kind: "struct", signature: "pub struct JsonEncoder", startLine: 4, endLine: 6, exported: true, doc: "" },
						{ name: "Encoder for JsonEncoder", kind: "impl", signature: "impl Encoder for JsonEncoder", startLine: 7, endLine: 10, exported: true, doc: "" },
					],
				}],
			};

			const graph = linkSymbolDependencyGraph(index);
			const implNodes = graph.findNodes("Encoder for JsonEncoder");
			expect(implNodes.length).toBe(1);

			const outgoing = graph.getOutgoing(implNodes[0]!.id);
			expect(outgoing.some((e) => e.kind === "implements")).toBe(true);
			expect(outgoing.some((e) => e.kind === "references")).toBe(true);
		});

		it("[UX-0696] links Java class inheritance and annotations", () => {
			const index: IndexResult = {
				root: "repo",
				builtAt: "2026-09-25T00:00:00Z",
				fileCount: 1,
				symbolCount: 3,
				unparsedLanguages: {},
				files: [{
					path: "App.java",
					language: "java",
					hash: "h",
					lineCount: 20,
					unparsed: false,
					symbols: [
						{ name: "BaseRepo", kind: "interface", signature: "public interface BaseRepo", startLine: 1, endLine: 3, exported: true, doc: "" },
						{ name: "UserRepo", kind: "class", signature: "public class UserRepo implements BaseRepo", startLine: 4, endLine: 8, exported: true, doc: "", annotations: ["@Repository"] },
						{ name: "Repository", kind: "interface", signature: "public @interface Repository", startLine: 9, endLine: 11, exported: true, doc: "" },
					],
				}],
			};

			const graph = linkSymbolDependencyGraph(index);
			const userRepo = graph.findNodes("UserRepo")[0]!;
			const outgoing = graph.getOutgoing(userRepo.id);
			expect(outgoing.some((e) => e.kind === "implements")).toBe(true);
			expect(outgoing.some((e) => e.kind === "annotated_by")).toBe(true);
		});

		it("[UX-0697] links C/C++ struct inheritance and namespaces", () => {
			const index: IndexResult = {
				root: "repo",
				builtAt: "2026-09-25T00:00:00Z",
				fileCount: 1,
				symbolCount: 3,
				unparsedLanguages: {},
				files: [{
					path: "engine.hpp",
					language: "cpp",
					hash: "h",
					lineCount: 15,
					unparsed: false,
					symbols: [
						{ name: "engine", kind: "module", signature: "namespace engine", startLine: 1, endLine: 12, exported: true, doc: "" },
						{ name: "BaseNode", kind: "class", signature: "class BaseNode", startLine: 2, endLine: 4, exported: true, doc: "", parent: "engine" },
						{ name: "MeshNode", kind: "class", signature: "class MeshNode : public BaseNode", startLine: 5, endLine: 8, exported: true, doc: "", parent: "engine" },
					],
				}],
			};

			const graph = linkSymbolDependencyGraph(index);
			const meshNode = graph.findNodes("MeshNode")[0]!;
			const outgoing = graph.getOutgoing(meshNode.id);
			expect(outgoing.some((e) => e.kind === "extends")).toBe(true);
		});

		it("[UX-0698] links C# class inheritance and interface implementation", () => {
			const index: IndexResult = {
				root: "repo",
				builtAt: "2026-09-25T00:00:00Z",
				fileCount: 1,
				symbolCount: 3,
				unparsedLanguages: {},
				files: [{
					path: "Service.cs",
					language: "csharp",
					hash: "h",
					lineCount: 15,
					unparsed: false,
					symbols: [
						{ name: "IService", kind: "interface", signature: "public interface IService", startLine: 1, endLine: 3, exported: true, doc: "" },
						{ name: "BaseService", kind: "class", signature: "public abstract class BaseService", startLine: 4, endLine: 6, exported: true, doc: "" },
						{ name: "OrderService", kind: "class", signature: "public class OrderService : BaseService, IService", startLine: 7, endLine: 10, exported: true, doc: "" },
					],
				}],
			};

			const graph = linkSymbolDependencyGraph(index);
			const orderNodes = graph.findNodes("OrderService");
			expect(orderNodes.length).toBe(1);
			const outgoing = graph.getOutgoing(orderNodes[0]!.id);
			expect(outgoing.some((e) => e.kind === "extends")).toBe(true);
			expect(outgoing.some((e) => e.kind === "implements")).toBe(true);
		});

		it("[UX-0699] links Ruby class inheritance and module containment", () => {
			const index: IndexResult = {
				root: "repo",
				builtAt: "2026-09-25T00:00:00Z",
				fileCount: 1,
				symbolCount: 2,
				unparsedLanguages: {},
				files: [{
					path: "models.rb",
					language: "ruby",
					hash: "h",
					lineCount: 10,
					unparsed: false,
					symbols: [
						{ name: "ApplicationRecord", kind: "class", signature: "class ApplicationRecord", startLine: 1, endLine: 3, exported: true, doc: "" },
						{ name: "User", kind: "class", signature: "class User < ApplicationRecord", startLine: 4, endLine: 7, exported: true, doc: "" },
					],
				}],
			};

			const graph = linkSymbolDependencyGraph(index);
			const userNode = graph.findNodes("User")[0]!;
			const outgoing = graph.getOutgoing(userNode.id);
			expect(outgoing.some((e) => e.kind === "extends")).toBe(true);
		});

		it("[UX-0700] links SQL table foreign keys and view references, exporting to Mermaid", () => {
			const index: IndexResult = {
				root: "repo",
				builtAt: "2026-09-25T00:00:00Z",
				fileCount: 1,
				symbolCount: 3,
				unparsedLanguages: {},
				files: [{
					path: "schema.sql",
					language: "sql",
					hash: "h",
					lineCount: 20,
					unparsed: false,
					symbols: [
						{ name: "users", kind: "struct", signature: "CREATE TABLE users (id INT PRIMARY KEY)", startLine: 1, endLine: 3, exported: true, doc: "" },
						{ name: "orders", kind: "struct", signature: "CREATE TABLE orders (id INT, user_id INT REFERENCES users(id))", startLine: 4, endLine: 7, exported: true, doc: "" },
						{ name: "active_orders", kind: "type", signature: "CREATE VIEW active_orders AS SELECT * FROM orders", startLine: 8, endLine: 12, exported: true, doc: "" },
					],
				}],
			};

			const graph = linkSymbolDependencyGraph(index);
			const ordersNode = graph.findNodes("orders")[0]!;
			const outgoing = graph.getOutgoing(ordersNode.id);
			expect(outgoing.some((e) => e.kind === "foreign_key")).toBe(true);

			const viewNode = graph.findNodes("active_orders")[0]!;
			const viewOut = graph.getOutgoing(viewNode.id);
			expect(viewOut.some((e) => e.kind === "references")).toBe(true);

			// Test Mermaid export
			const mermaid = graph.exportMermaid();
			expect(mermaid).toContain("graph TD");
			expect(mermaid).toContain("foreign_key");
			expect(mermaid).toContain("references");

			// Test Oracle integration
			const oracle = new SymbolOracle(index);
			const oracleGraph = oracle.getDependencyGraph();
			expect(oracleGraph.findNodes("orders").length).toBe(1);
			expect(oracle.getDependencies("orders").map((n) => n.name)).toContain("users");
			expect(oracle.getDependents("orders").map((n) => n.name)).toContain("active_orders");
		});
	});
});
