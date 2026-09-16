# M11-04 · Team steering notes in version control

> Establish version-controlled repository steering notes in .kaioken/notes/ so engineering teams share a single, authoritative set of agent instructions without distributed infrastructure.

| Field | Value |
|---|---|
| **Status** | `ready` |
| **Size** | S |
| **Depends on** | None. Version-controlled notes in the repository — the lowest-infrastructure item in the entire roadmap, with no license exposure and no external dependency. |
| **Blocks** | M11 completion |
| **Touches** | `kaioken_v2/packages/agent/`, `kaioken_v2/apps/cli/src/commands/` |
| **Risk** | Low. Pure filesystem conventions and markdown prompt injection. |
| **Gate-critical** | No |

## Why this exists

In the public feature board (Category 08 · Collaboration, [README §5](../README.md#08--collaboration--entire-category-is-a-7-non-goal-until-users-exist)), nearly every item was deliberately **refused as a non-goal**:
- **Refused:** Shared session servers (multi-user WebSockets).
- **Refused:** Pair programming mode.
- **Refused:** Role-based permissions (RBAC).
- **Refused:** Live activity feeds.

README §7 explicitly explains why: *"Real multi-user is a distributed-systems project, not a feature. Not until there are users."* Building servers, databases, and synchronization engines for hypothetical teams burns massive effort for zero early payoff.

**Team Steering Notes is the ONE item rescued from the entire collaboration category.**

The rescue is deliberate, not an inconsistent lapse in discipline. Steering notes require **zero distributed infrastructure**:
- They are plain markdown files stored directly in version control under `.kaioken/notes/` (e.g. `.kaioken/notes/database-migrations.md`, `.kaioken/notes/auth-tokens.md`).
- Because they live in Git, team members update and review them via standard pull requests.
- When an agent runs (`kaioken chat`, `kaioken draft`, or an automated review run), `packages/agent` automatically scans `.kaioken/notes/` and injects relevant steering notes into the model's system instructions.

A team shares instructions, architectural constraints, and operational gotchas across all developer machines simply through Git checkout, without running a single backend server.

## Current state

Verified against the working tree.

| Fact | Evidence |
|---|---|
| Feature board lists Team Steering notes under category 08 | `roadmap/README.md:276` ("Team steering notes: Shared, version-controlled /notes") |
| Other collaboration items are explicitly refused | `roadmap/README.md:336` ("Shared sessions / pair programming / role-based permissions... Real multi-user is a distributed-systems project, not a feature") |
| Agent package builds system prompts with skills | `kaioken_v2/packages/agent/src/skills.ts` |
| Agents.md interop already packages knowledge | `kaioken_v2/packages/agentsmd/src/index.ts` |
| Canonical engine directory convention | `kaioken_v2/packages/scan/src/index.ts` defines `KAIOKEN_DIR = ".kaioken"` |

`UNVERIFIED:` The maximum volume of steering notes a repository can carry before token budgeting requires semantic retrieval over notes rather than eager inclusion.

## What done looks like

- [ ] Directory `.kaioken/notes/` is recognized as the standard repository location for team instructions.
- [ ] A note reader is implemented in `packages/agent` that loads all `*.md` files in `.kaioken/notes/`.
- [ ] When initializing an agent session (`buildSystemPrompt` in `packages/agent/src/prompt.ts:27`), loaded notes are formatted into a dedicated `<team_steering_notes>` section in the system prompt.
- [ ] Each note includes its filename and content, allowing teams to partition rules (e.g. `api-style.md`, `testing-rules.md`).
- [ ] A CLI helper command `kaioken notes [list|new]` allows developers to list or scaffold new notes.
- [ ] Token guard: If total notes exceed a configurable token budget (e.g. 4,000 tokens), notes are truncated with a warning, advising the team to prune or use focused skills.
- [ ] Unit tests verify that steering notes are properly loaded, formatted, and injected into the agent prompt.

## Steps

1. **Implement Note Loader.**
   - In `kaioken_v2/packages/agent/src/notes.ts`, write `loadSteeringNotes(root: string): Promise<Array<{ title: string; content: string }>>`.
   - Read all `.md` files in `join(root, ".kaioken", "notes")`.
2. **Format Prompt Section.**
   - Format notes into clean XML/Markdown:
     ```markdown
     ## Team Steering Notes
     The team maintains the following shared guidelines in .kaioken/notes/:
     - [title]: content
     ```
3. **Integrate into Agent Loop.**
   - In `packages/agent/src/prompt.ts`, inside `buildSystemPrompt` (line 27), append team steering notes after module card summaries and before tool declarations.
4. **Add Scaffolding CLI Command.**
   - In `apps/cli/src/commands/notes.ts`, provide `kaioken notes list` and `kaioken notes add <title>`.
5. **Add Vitest Tests.**
   - Test loading with missing directory (clean fallback to empty notes).
   - Test loading multiple markdown files.
   - Test token ceiling truncation warning.

## In scope

- Note loading and prompt formatting in `kaioken_v2/packages/agent/`.
- CLI helper command in `kaioken_v2/apps/cli/`.
- Unit tests verifying note injection.

## Out of scope

- Multi-user chat servers or WebSocket synchronization (refused non-goal).
- Pair programming or live presence (refused non-goal).
- Role-based permissions or user authentication (refused non-goal).
- WYSIWYG note editing (refused non-goal).

## Gates

Run from `kaioken_v2/`:

```bash
npm run typecheck
npm test
```

Test offline smoke:

```bash
node apps/cli/dist/bin.js --help
```

## Traps

| Trap | Guard |
|---|---|
| Expanding scope into a multi-user server | Resist the temptation to add WebSocket sharing, user IDs, or permission levels. Steering notes are plain files in Git. |
| Ingesting notes without token budgeting | A team committing 50 pages of notes could exhaust the model context window. Implement an explicit token ceiling with warnings. |
| Confusing steering notes with generated wiki docs | The wiki is *generated* by Kaioken. Steering notes are *human-authored* by the team. They live in separate directories (`.kaioken/wiki/` vs `.kaioken/notes/`). |
| Commercial licensing collision | License Zero Noncommercial 2.0.1 prevents commercial teams from running Kaioken with shared team notes. |

## Open questions

None. This leaf is fully specified.

## Session brief

```xml
<task>
In kaioken_v2/, implement Team Steering Notes — the single feature rescued from the refused collaboration category.

Steering notes are plain, version-controlled markdown files located in .kaioken/notes/ that provide shared instructions and constraints across all agent runs in a repository, with zero distributed infrastructure:

1. In kaioken_v2/packages/agent/src/notes.ts, implement:
   - loadSteeringNotes(root: string): Promise<Array<{ filename: string; content: string }>>
   - Reads all "*.md" files in path.join(root, ".kaioken", "notes").
   - If the directory does not exist, return an empty array without throwing.
   - formatSteeringNotes(notes: Array<{ filename: string; content: string }>, maxTokens?: number): string
   - Formats the notes into an XML block:
     <team_steering_notes>
     ## Shared Team Guidelines
     ...
     </team_steering_notes>
   - Enforces a 4,000 token guard ceiling. If exceeded, truncate and include a warning comment.
2. In kaioken_v2/packages/agent/src/prompt.ts, inject formatted steering notes into the system prompt built by buildSystemPrompt (defined at line 27). There is NO agent.ts in that package - the files are gate.ts, index.ts, prompt.ts, skills.ts, tools.ts and types.ts.
3. In kaioken_v2/apps/cli/src/commands/, expose a simple command "kaioken notes" (list, add <name>).
4. Write vitest unit tests in packages/agent/test/notes.test.ts testing:
   - Nonexistent directory returns empty array.
   - Reading valid markdown notes.
   - Prompt injection formatting.
   - Token limit truncation.

Do NOT add any server, socket, or multi-user state.
</task>

<verification_loop>
Run from kaioken_v2/:
  npm run typecheck
  npm test
Confirm that all tests pass and that prompt assembly gracefully handles repositories with or without .kaioken/notes/.
</verification_loop>

<action_safety>
Scope strictly to packages/agent/ and apps/cli/. Do not modify packages/scan, packages/index, or packages/wiki.
Do NOT run git add or git commit — leave all changes uncommitted in the working tree.
</action_safety>

<structured_output_contract>
End with: (1) summary of steering notes implementation, (2) files touched, (3) test suite output, (4) how the feature provides team alignment through Git without multi-user infrastructure.
</structured_output_contract>
```
