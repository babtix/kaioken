# M5-03 · Implement framework detection

> Detect major application frameworks (Next.js, Django, Ruby on Rails, and Spring Boot) from repository file layouts, dependency manifests, and AST entry-point markers.

| Field | Value |
|---|---|
| **Status** | `ready` |
| **Size** | M |
| **Depends on** | `01-verify-what-shipped` |
| **Blocks** | Downstream module decomposition in `packages/plan` and architectural wiki generation |
| **Touches** | `packages/index/src/frameworks.ts`, `packages/index/src/index.ts`, `packages/index/test/frameworks.test.ts` |
| **Risk** | Low: purely additive classification function on top of scan and index data |
| **Gate-critical** | No |

## Why this exists

A generic AST codemap identifies functions and classes, but it is blind to architectural conventions. An agent analyzing a Next.js application treats `app/api/users/route.ts` as an arbitrary TypeScript file unless it understands the Next.js App Router convention; an agent inspecting a Django repo fails to recognize `models.py` or `views.py` as framework components unless it detects Django.

Category 10 of the public feature board ([README §5.10](../README.md#10-extended-language-support)) explicitly promised framework detection for Next.js, Django, Rails, and Spring. This capability was not implemented during the initial TypeScript rewrite and remains **genuinely open**. Adding a deterministic framework detector provides essential architectural priors to `packages/plan` (for proposing sensible module boundaries) and `packages/wiki` (for explaining application structure).

## Current state

Verified against the working tree:

| Fact | Evidence |
|---|---|
| Manifest files are collected by scan | `packages/scan/src/scan.ts:35` scans all files including `package.json`, `requirements.txt`, `Gemfile`, `pom.xml` |
| Indexer parses symbols for JS/TS, Python, Go, Rust | `packages/index/src/grammars.ts:21` has AST grammars for core languages |
| No framework detection exists | No file in `packages/index/src/` or `packages/scan/src/` analyzes framework identities or route conventions |
| Module plan currently clusters by directory | `packages/plan/src/propose.ts:40` groups files by directory path without framework-aware domain clustering |

## What done looks like

- [ ] `packages/index/src/frameworks.ts` exports `detectFrameworks(scan: ScanResult, index?: IndexResult): FrameworkInfo[]`.
- [ ] Supports detection of four target ecosystems:
  - **Next.js**: Detects `next.config.{js,ts,mjs}`, `"next"` dependency in `package.json`, identifies App Router (`app/`) vs Pages Router (`pages/`).
  - **Django**: Detects `manage.py`, `"django"` in dependencies/requirements, settings files (`settings.py`), and standard app layouts.
  - **Ruby on Rails**: Detects `Gemfile` containing `rails`, `config/routes.rb`, and `app/{controllers,models,views}` conventions.
  - **Spring / Spring Boot**: Detects `pom.xml` or `build.gradle` containing Spring Boot dependencies and packages containing `@SpringBootApplication`.
- [ ] Returns structured metadata:
  ```ts
  export interface FrameworkInfo {
    id: "nextjs" | "django" | "rails" | "spring";
    name: string;
    version?: string;
    flavor?: string; // e.g. "app-router" | "pages-router"
    entryPoints: string[];
    configFiles: string[];
  }
  ```
- [ ] Unit tests in `packages/index/test/frameworks.test.ts` verify positive and negative detection across synthetic fixture trees.

## Steps

1. **Define Framework Detection Types in `packages/index/src/frameworks.ts`**:
   Export `FrameworkInfo` and `FrameworkDetector` interfaces.

2. **Implement Ecosystem Detectors**:
   - **Next.js detector**:
     - Check for `next.config.{js,ts,mjs,cjs}`.
     - Check `package.json` dependencies for `"next"`.
     - Inspect directory structure: detect `app/` (App Router) vs `pages/` (Pages Router).
     - Locate key entry points (`app/layout.{tsx,jsx}`, `pages/_app.{tsx,jsx}`, `middleware.{ts,js}`).
   - **Django detector**:
     - Check for `manage.py`.
     - Check for `wsgi.py`, `asgi.py`, `settings.py`.
     - Scan requirements or `pyproject.toml` for `django`.
   - **Rails detector**:
     - Check for `Gemfile` with `rails` gem.
     - Check for `config/routes.rb` and `config/application.rb`.
   - **Spring detector**:
     - Check for `pom.xml` or `build.gradle` with `org.springframework.boot`.
     - Locate `Application.{java,kt}`.

3. **Wire into `packages/index/src/index.ts`**:
   Export `detectFrameworks` and `FrameworkInfo` from the package entry point.

4. **Add Unit Tests**:
   In `packages/index/test/frameworks.test.ts`, create synthetic in-memory scan results for each framework and assert accurate identification, flavor detection, and entrypoint resolution.

## In scope

- `packages/index/src/frameworks.ts`
- `packages/index/src/index.ts` (exporting detection API)
- `packages/index/test/frameworks.test.ts`

## Out of scope

- Embedding framework rules directly inside tree-sitter `.scm` query files.
- Modifying `packages/plan/src/propose.ts` in this session (consuming framework info in plan generation is a subsequent task).
- Adding complex runtime framework evaluation or dynamic code execution.

## Gates

From `kaioken_v2/`:

```bash
npm run typecheck
npm test
```

Vitest must pass all framework detection tests. Working tree must show only new files in `packages/index`.

## Traps

| Trap | Guard |
|---|---|
| Reading disk files during detection | `detectFrameworks` must operate strictly on the already-collected in-memory `ScanResult.files` list to avoid redundant filesystem I/O |
| False positives from monorepo dependencies | Ensure configuration files or directory structures match, rather than relying solely on a stray dependency string |
| Missing Java/Ruby tree-sitter grammars | Framework detection relies on file patterns and manifests, not on full AST parsing for languages without tree-sitter bindings |

## Open questions

None. This leaf is fully specified.

## Session brief

```xml
<task>
Implement framework detection for Next.js, Django, Ruby on Rails, and Spring Boot in packages/index.

Current state:
- packages/scan/src/scan.ts collects repository files.
- packages/index extracts AST symbols for 5 languages.
- Framework detection is genuinely open and does not exist in the codebase.

Required changes:
1. Create packages/index/src/frameworks.ts:
   - Define FrameworkInfo interface (id, name, version, flavor, entryPoints, configFiles).
   - Implement `detectFrameworks(scan: ScanResult, index?: IndexResult): FrameworkInfo[]`.
   - Implement detectors for:
     * Next.js (next.config.*, package.json dependencies, app/ vs pages/ router flavors)
     * Django (manage.py, settings.py, requirements/pyproject dependencies)
     * Rails (Gemfile with rails, config/routes.rb, config/application.rb)
     * Spring Boot (pom.xml/build.gradle with spring-boot, entry point identification)
   - Export detectFrameworks from packages/index/src/index.ts.
2. Add unit tests in packages/index/test/frameworks.test.ts covering:
   - Positive detection for each of the 4 frameworks.
   - Next.js App Router vs Pages Router flavor distinction.
   - Negative detection for generic repos without frameworks.
   - Monorepo multi-framework detection.

Ensure detection runs in <5ms purely over the in-memory ScanResult without disk re-reads.
</task>

<verification_loop>
Run these from kaioken_v2/ and fix what they surface:
  npm run build
  npm run typecheck
  npm test
Confirm working tree shows only modified/new files in packages/index.
</verification_loop>

<action_safety>
Scope strictly to packages/index/src/frameworks.ts and its test file.
Do NOT modify packages/scan or existing tree-sitter queries.
Do NOT run git add or git commit — the orchestrator commits after reviewing.
Leave the work uncommitted in the working tree.
</action_safety>

<structured_output_contract>
End with: (1) design of the framework detection engine, (2) files added, (3) unit test outcomes,
(4) examples of detected metadata for Next.js and Django fixtures.
</structured_output_contract>
```
