# M6-03 · Support custom card schemas

> Allow users to define custom card templates and schemas in `packages/templates` beyond the fixed module card schema, enabling specialized cards for API endpoints, data models, and workflows.

| Field | Value |
|---|---|
| **Status** | `ready` |
| **Size** | M |
| **Depends on** | `01-audit-what-shipped` |
| **Blocks** | Downstream card generation extensions in `packages/plan` |
| **Touches** | `packages/templates/src/cards.ts`, `packages/templates/src/index.ts`, `packages/plan/src/cards.ts` |
| **Risk** | Medium: schema validation must be robust so malformed custom schemas do not crash the pipeline |
| **Gate-critical** | No |

## Why this exists

Knowledge cards in Kaioken currently adhere to a single, hardcoded schema defined in `packages/plan/src/types.ts:32` (`moduleId`, `name`, `summary`, `keyPoints`, `entryPoints`, `sources`, `verification`). While this schema works well for broad module summaries, modern codebases contain domain-specific entities that need structured knowledge representations:
- **API Endpoints**: routes, HTTP methods, auth requirements, parameters, response contracts.
- **Data Models**: database tables, primary keys, relationships, indexes, validation rules.
- **Workflows / Jobs**: cron triggers, queues, processing steps, retry policies.

Category 05 of the public feature board ([README §5.05](../README.md#05-knowledge-management)) promised *"Custom card schemas: User templates (API endpoint, data model) beyond the fixed five."* Currently, `packages/templates` only implements simple prompt templates (`{{placeholder}}` replacement in `packages/templates/src/index.ts`). This leaf turns `packages/templates` into the home for declarative card schemas, allowing developers to define custom card types in `.kaioken/templates/cards/<name>.yaml` that the card generation pipeline can instantiate and validate.

## Current state

Verified against the working tree:

| Fact | Evidence |
|---|---|
| Card schema is hardcoded to module cards | `packages/plan/src/types.ts:32-51` defines a single `Card` interface with fixed fields |
| Card generator produces only module cards | `packages/plan/src/cards.ts:70-130` prompts specifically for module summary, key points, and entry points |
| Template package only handles chat prompts | `packages/templates/src/index.ts:18` defines `Template` with string variable substitution only |
| Cards are stored flatly in .kaioken/cards/ | `packages/plan/src/artifact.ts:16` writes cards as `<moduleId>.json` |

## What done looks like

- [ ] `packages/templates` exports `CardSchema` definitions and schema loader:
  ```ts
  export interface CardField {
    name: string;
    type: "string" | "string[]" | "record" | "boolean";
    description: string;
    required: boolean;
  }
  export interface CardSchema {
    id: string; // e.g. "api-endpoint", "data-model"
    name: string;
    description: string;
    fields: CardField[];
    systemPrompt: string;
  }
  ```
- [ ] Built-in schemas ship for `module` (default), `api-endpoint`, and `data-model`.
- [ ] Users can place custom schema files in `.kaioken/templates/cards/<schema-id>.yaml`.
- [ ] `loadCardSchema(root, id)` loads built-in or user-defined schemas.
- [ ] `validateCard(schema, cardData)` validates generated JSON against the defined fields.
- [ ] `kaioken cards --schema <id>` supports generating cards under the requested schema, saving to `.kaioken/cards/<schema>/<id>.json`.
- [ ] Unit tests in `packages/templates/test/cards.test.ts` verify schema loading, validation, and missing field errors.

## Steps

1. **Define Schema Specifications in `packages/templates/src/cards.ts`**:
   - Implement `CardSchema` and `CardField` types.
   - Author built-in schemas:
     - `module`: mirrors existing `Card` fields.
     - `api-endpoint`: `path`, `method`, `summary`, `auth`, `requestBody`, `responses`, `entryPoints`.
     - `data-model`: `entityName`, `storageType` (sql/nosql), `fields`, `relations`, `indexes`.
   - Implement `loadCardSchemas(root: string): Promise<CardSchema[]>`.
   - Implement `validateCard(schema: CardSchema, data: unknown): { valid: boolean; errors: string[] }`.

2. **Connect Custom Schemas to Card Generation Prompting**:
   - In `packages/templates/src/cards.ts`, add `buildCardGenerationPrompt(schema: CardSchema, context: unknown): string`.
   - Generates structured JSON schema prompt instructions instructing the model to produce fields conforming to the schema.

3. **Export from `packages/templates/src/index.ts`**:
   - Export `CardSchema`, `CardField`, `loadCardSchemas`, `validateCard`, and built-in schemas.

4. **Integrate into `packages/plan` and CLI**:
   - Update `packages/plan/src/cards.ts` to accept optional `schemaId?: string`.
   - Add `--schema <name>` flag to `apps/cli/src/commands/cards.ts`.

5. **Write Unit Tests**:
   - Create `packages/templates/test/cards.test.ts` testing schema parsing, YAML loading, and schema validation against valid and malformed payload objects.

## In scope

- `packages/templates/src/cards.ts`
- `packages/templates/src/index.ts`
- `packages/templates/test/cards.test.ts`
- `packages/plan/src/cards.ts` (accepting schema parameter)
- `apps/cli/src/commands/cards.ts` (adding `--schema` flag)

## Out of scope

- Arbitrary code execution inside schema templates (keep strictly to declarative YAML/JSON field schemas).
- Modifying wiki generation or chapter schemas.
- Changing `packages/provenance/src/staleness.ts` hashing logic.

## Gates

From `kaioken_v2/`:

```bash
npm run typecheck
npm test
node apps/cli/dist/bin.js cards --help
```

Vitest must pass all tests in `packages/templates/test/`. Working tree must show only modified files in `packages/templates`, `packages/plan`, and `apps/cli`.

## Traps

| Trap | Guard |
|---|---|
| Breaking backward compatibility with existing module cards | Default schema MUST remain `module`, matching the existing `Card` interface exactly |
| Allowing insecure path traversal in schema names | Sanitize `schemaId` using the regex from `packages/templates/src/index.ts:57` (`^[a-zA-Z0-9][a-zA-Z0-9._-]*$`) |
| Unenforced JSON structures from LLM outputs | Always validate model-generated JSON against `validateCard()` before writing to disk |

## Open questions

None. This leaf is fully specified.

## Session brief

```xml
<task>
Implement custom card schemas in packages/templates and integrate them into packages/plan.

Current state:
- packages/plan/src/types.ts:32 fixes Card to module cards only.
- packages/templates/src/index.ts only handles prompt placeholder expansion.
- Category 05 promised user-defined card templates (API endpoints, data models) beyond the fixed schema.

Required changes:
1. In packages/templates/src/cards.ts:
   - Define `CardSchema` and `CardField` interfaces.
   - Provide built-in schemas for "module" (default), "api-endpoint", and "data-model".
   - Implement `loadCardSchemas(root: string): Promise<CardSchema[]>`.
   - Implement `validateCard(schema: CardSchema, data: unknown): { valid: boolean; errors: string[] }`.
   - Implement `buildCardGenerationPrompt(schema: CardSchema, moduleData: unknown): string`.
   - Export these from packages/templates/src/index.ts.
2. In packages/plan/src/cards.ts:
   - Allow generateCards() to accept an optional `schema: CardSchema` option (defaulting to "module").
3. In apps/cli/src/commands/cards.ts:
   - Add `--schema <id>` option to generate cards using a specific custom schema.
4. Add unit tests in packages/templates/test/cards.test.ts verifying schema loading and validation.

Ensure all existing module card generation and tests continue to pass with zero regressions.
</task>

<verification_loop>
Run these from kaioken_v2/ and fix what they surface:
  npm run build
  npm run typecheck
  npm test
Confirm working tree shows only modified files in packages/templates, packages/plan, and apps/cli.
</verification_loop>

<action_safety>
Scope strictly to packages/templates, packages/plan/src/cards.ts, and apps/cli/src/commands/cards.ts.
Do NOT modify packages/provenance staleness logic.
Do NOT run git add or git commit — the orchestrator commits after reviewing.
Leave the work uncommitted in the working tree.
</action_safety>

<structured_output_contract>
End with: (1) design of the CardSchema interface, (2) built-in schemas provided, (3) files modified,
(4) test suite outcomes from vitest.
</structured_output_contract>
```
