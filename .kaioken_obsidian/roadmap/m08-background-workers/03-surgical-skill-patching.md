# M8-03 · Surgical skill patching

> Update existing repository skills surgically rather than clobbering them, preserving human-curated procedures and marking newly learned skills with `origin: learned`.

| Field | Value |
|---|---|
| **Status** | `ready` |
| **Size** | M |
| **Depends on** | **`M7` (Permissions & Sandboxing) — HARD GATE**, `01-daemon-hosted-long-running-tasks` |
| **Blocks** | `M10` (Studio skill management) |
| **Touches** | `packages/skillgen/src/write.ts`, `packages/skillgen/src/patch.ts`, `packages/skillgen/src/index.ts`, `packages/agent/src/skills.ts`, `packages/skillgen/test/patch.test.ts` |
| **Risk** | Low. Text and AST-level markdown section updates; fallback preserves original content |
| **Gate-critical** | No — procedural knowledge enhancement |

> [!IMPORTANT]
> **GATE PREREQUISITE:** This leaf is strictly gated behind Milestone M7. Skill patching generated from unattended or background sessions must only run within the sandboxed worktree environment (`M7-02`) and comply with resource ceilings (`M7-05`).

## Why this exists

Operating rule 5 demands aggressive dogfooding: Kaioken runs `/skills` and `/wiki` on itself monthly. When an autonomous background worker completes a tricky refactoring task or resolves a compiler failure, it extracts procedural lessons via `packages/skillgen`.

However, writing a learned skill today is a blunt, whole-file operation: `writeSkill` writes or overwrites an entire file in `.kaioken/skills/`. If a developer has meticulously curated a `release.md` or `migration.md` procedure by hand, an automated background run that overwrites the file clobbers those human nuances. Skills must be updated surgically: appending a new edge case to `## Common mistakes`, updating an outdated command under `## Verification`, and explicitly tagging automated additions with `origin: learned` frontmatter.

## Current state

Verified in `kaioken_v2/packages/skillgen/` and `kaioken_v2/packages/agent/`.

| Fact | Evidence | Notes |
|---|---|---|
| Skill parser reads YAML frontmatter | `kaioken_v2/packages/agent/src/skills.ts:94-115` | `parseSkill` parses frontmatter block; only extracts `name` and `description` |
| Skill writer writes monolithic files | `kaioken_v2/packages/skillgen/src/write.ts:165-195` | `writeSkill` generates a whole markdown body and calls `writeFile(target, content)` |
| Existence check is binary | `kaioken_v2/packages/skillgen/src/write.ts:160-164` | `skillExists(root, name)` checks file presence; no diff or merge logic exists |
| Standard skill sections defined | `kaioken_v2/packages/skillgen/src/write.ts:31-50` | Headers: `## Prerequisites`, `## Steps`, `## Conventions to follow`, `## Verification`, `## Common mistakes` |
| Zero origin provenance tracking | `kaioken_v2/packages/agent/src/skills.ts:22-29` | `Skill` interface lacks `origin` metadata distinguishing human vs learned procedures |

`UNVERIFIED:` whether existing user skills in external repositories follow strict Markdown heading levels (`## `) or use varied styling (`### `, bold text).

## What done looks like

- [ ] `Skill` interface in `packages/agent/src/skills.ts` updated to include:
  - `origin?: "manual" | "learned" | "hybrid"`
  - `lastUpdated?: string`
- [ ] New module `packages/skillgen/src/patch.ts` exporting:
  - `patchSkill(existingContent: string, patch: SkillSectionPatch): string`
  - `mergeLearnedSkill(existingSkill: Skill, newProposal: SkillProposal, client: ModelClient): Promise<string>`
- [ ] When an existing skill is updated:
  - Preserves human-authored `## Conventions to follow` and `## Steps`.
  - Surgically inserts new pitfalls into `## Common mistakes` or updates `## Verification`.
  - Sets frontmatter `origin: hybrid` and timestamps the modification.
- [ ] When a brand new skill is generated:
  - Frontmatter explicitly includes `origin: learned` and `learned_from: <run-id>`.
- [ ] Unit tests in `packages/skillgen/test/patch.test.ts` proving that human notes are retained verbatim during surgical updates.

## Steps

1. **Extend Skill Schema (`packages/agent/src/skills.ts`):**
   - Update `Skill` interface to include `origin?: "manual" | "learned" | "hybrid"`.
   - Update `parseSkill` to extract `origin` from YAML frontmatter (defaulting to `"manual"` if unspecified).
2. **Implement Surgical Markdown Section Patching (`packages/skillgen/src/patch.ts`):**
   - Parse markdown by `## ` section headings into structured blocks.
   - Implement section diffing and merging:
     - If the patch adds items to `## Common mistakes`, append without reordering existing entries.
     - If the patch updates `## Verification`, preserve commented notes.
     - Never delete sections not targeted by the patch.
3. **Update `writeSkill` in `packages/skillgen/src/write.ts`:**
   - If `skillExists(root, proposal.name)`:
     - Read current skill content.
     - Call `mergeLearnedSkill` to generate surgical section patches rather than a full overwrite.
     - Write the patched content and return `WrittenSkill` with `patched: true`.
   - If new skill:
     - Generate with frontmatter:
       ```yaml
       ---
       name: <name>
       description: <description>
       origin: learned
       ---
       ```
4. **Re-export and Test:**
   - Export `patchSkill` and `mergeLearnedSkill` from `packages/skillgen/src/index.ts`.
   - Add tests in `packages/skillgen/test/patch.test.ts`:
     - Test adding a common mistake to an existing human skill.
     - Test preserving custom frontmatter and unmentioned sections.
     - Test new skill creation tags `origin: learned`.

## In scope

- `kaioken_v2/packages/skillgen/src/patch.ts`
- `kaioken_v2/packages/skillgen/src/write.ts`
- `kaioken_v2/packages/skillgen/src/index.ts`
- `kaioken_v2/packages/agent/src/skills.ts`
- `kaioken_v2/packages/skillgen/test/patch.test.ts`

## Out of scope

- Interactive skill editing UI in Studio (Studio v0.1 scope).
- Automated git commit of learned skills (human reviews worktree diff).
- Modifying skill retrieval in `wiki_search`.

## Gates

Run from `kaioken_v2/`:

```bash
npm run typecheck
npm test
```

Specific test run:

```bash
npx vitest run packages/skillgen/test/patch.test.ts
```

Smoke check from repo root:

```bash
node kaioken_v2/apps/cli/dist/bin.js scan --root .
```

## Traps

| Trap | Guard |
|---|---|
| Overwriting human-authored conventions during automated learning | If a skill has `origin: manual`, only append to `## Common mistakes` or `## Verification`; never replace `## Steps` without explicit user flag |
| Malforming YAML frontmatter during string replacement | Use `yaml.stringify` to update frontmatter headers cleanly |
| Losing markdown comments or formatting outside headings | Parse and serialize preserving non-heading text blocks verbatim |
| Creating duplicate skill files with slight slug variations | Check existing skills case-insensitively and slug-normalize before writing |

## Open questions

None. This leaf is fully specified.

## Session brief

```xml
<task>
In kaioken_v2/packages/skillgen/, implement surgical skill patching so that background learning updates existing skill files section-by-section instead of clobbering them, and tags learned skills with `origin: learned`.

PRECONDITION: Milestone M7 must be complete. Automated skill generation in background workers runs only inside sandboxed worktrees.

Current state:
- packages/agent/src/skills.ts lines 22-29 defines Skill without origin metadata.
- packages/skillgen/src/write.ts lines 165-195 overwrites whole files when writeSkill() is called.

1. In kaioken_v2/packages/agent/src/skills.ts:
   - Update interface Skill to include `origin?: "manual" | "learned" | "hybrid"`.
   - Update parseSkill to extract origin from frontmatter (defaulting to "manual").
2. Implement kaioken_v2/packages/skillgen/src/patch.ts:
   - Implement parseSkillSections(content: string): Map<string, string> dividing markdown by `## ` headings.
   - Implement patchSkill(existingMarkdown: string, updates: { section: string; content: string }[], metadata?: Record<string, unknown>): string:
     - Updates frontmatter to set `origin: "hybrid"`.
     - For existing sections, merges or appends text rather than clobbering.
     - Preserves all unmentioned sections and comments intact.
3. In kaioken_v2/packages/skillgen/src/write.ts:
   - If a skill already exists, use patchSkill to merge updates into ## Common mistakes or ## Verification.
   - If a skill is new, prepend YAML frontmatter with `origin: learned`.
4. Re-export patch utilities from packages/skillgen/src/index.ts.
5. Add characterization tests in packages/skillgen/test/patch.test.ts:
   - Verify updating an existing skill preserves human comments in ## Steps.
   - Verify origin: learned is present on newly written skills.
   - Verify frontmatter preserves custom fields.
</task>

<verification_loop>
Run these from kaioken_v2/ before finishing:
  npm run typecheck
  npm test
  npx vitest run packages/skillgen/test/patch.test.ts
Smoke check from repo root:
  node kaioken_v2/apps/cli/dist/bin.js scan --root .
Confirm working tree touches only packages/skillgen/src/patch.ts, packages/skillgen/src/write.ts, packages/skillgen/src/index.ts, packages/agent/src/skills.ts, and packages/skillgen/test/patch.test.ts.
</verification_loop>

<missing_context_gating>
Do not use regex replacement for the whole file. Tokenize sections by heading markers (## ) to guarantee that content between headings is preserved exactly.
</missing_context_gating>

<action_safety>
Scope strictly to packages/skillgen/ and packages/agent/src/skills.ts. Do not touch packages/model or packages/gitops. Do NOT run git add or git commit — the orchestrator commits after reviewing. Leave the work uncommitted in the working tree.
</action_safety>

<structured_output_contract>
End with:
1. Summary of surgical section patching logic and origin metadata.
2. Exact files touched.
3. Vitest test results and counts.
4. Confirmation that human-authored skill content is preserved.
</structured_output_contract>
```
