# M12-03 · Documentation consolidation and audit

> Unify the five fragmented documentation surfaces into a single authoritative source of truth, purge obsolete Go v1 references from the website and READMEs, and audit the roadmap tree itself.

| Field | Value |
|---|---|
| **Status** | `ready` |
| **Size** | M |
| **Depends on** | None. Auditing and consolidating documentation surfaces requires no decision. |
| **Blocks** | `05-v2-release-checklist.md` |
| **Touches** | `README.md`, `kaioken_v2/README.md`, `website/src/data/`, `registry-web/content/`, `roadmap/` |
| **Risk** | Medium. Inconsistent documentation across surfaces confuses new adopters and leaves stale Go v1 commands masquerading as live features. |
| **Gate-critical** | No |

## Why this exists

A newcomer exploring Kaioken today encounters five separate documentation surfaces, each written at a different stage in the project's evolution, frequently contradicting one another:
1. **Root `README.md`:** The project thesis and high-level marketing overview, but retaining historical artifacts from the Go implementation.
2. **Engine `kaioken_v2/README.md`:** The canonical specification of the TypeScript engine, describing the 19 packages, shipped commands, and gaps G-1 through G-6.
3. **Marketing Website (`website/`):** The public face at `website/src/data/roadmap.ts` and `website/src/pages/Docs.tsx`. It is heavily stale: its feature board references Go internals (`Tools()`, `serve.go`, `go.mod`).
4. **Registry Web (`registry-web/content/`):** Extension developer guides, packaging instructions, and submission workflows written specifically for extension authors.
5. **The `roadmap/` Tree Itself:** The master roadmap (`roadmap/README.md`), conventions, and milestone folders M1 through M12.

**The `roadmap/` tree adds a fifth surface and must be included in the audit rather than exempted from it.**

General Availability requires establishing a single, unambiguous source of truth. Conflicting information about how to install, run, or extend Kaioken destroys project credibility. Every surface must be brought into alignment with the canonical TypeScript engine.

## Current state

Verified against the working tree.

| Fact | Evidence |
|---|---|
| Master roadmap identifies stale documentation surfaces | `roadmap/README.md:10-15` (reconciling authority across surfaces) |
| Website feature data references archived Go internals | `website/src/data/roadmap.ts` cites Go constructs (`Tools()`, `go.mod`) |
| Website docs navigation structure exists | `website/src/data/docs-nav.ts` |
| Registry content contains separate guides | `registry-web/content/` (`developer-guide.md`, `user-guide.md`) |
| Canonical engine documentation is current | `kaioken_v2/README.md` correctly lists the 19 packages and 8 phases |
| Studio documentation lives under docs | `kaioken_v2/docs/studio-v0.1-scope.md` |

`UNVERIFIED:` External links in `website/` pointing to third-party blog posts or community sites.

## What done looks like

- [ ] A comprehensive audit matrix mapping all 5 documentation surfaces is produced.
- [ ] Every reference to Go, `go.mod`, `golangci-lint`, Tauri, and archived v1 paths is purged from `README.md` and `website/`.
- [ ] `website/src/data/roadmap.ts` is updated to reflect the canonical TypeScript commands and the M1–M12 milestone structure.
- [ ] The relationship between the surfaces is formalized:
  - `website/` is the single public user-facing documentation portal.
  - `kaioken_v2/README.md` is the developer guide for the engine codebase.
  - `registry-web/content/` provides focused extension documentation, linked directly from the main website.
  - `roadmap/` documents internal architectural evolution and vibe-coding sessions.
- [ ] All installation commands across all surfaces specify `node >= 22` and npm workspaces.
- [ ] No dead links or 404 routes exist across the website docs pages.

## Steps

1. **Perform Five-Surface Audit.** Run ripgrep across `README.md`, `website/`, `registry-web/`, and `docs/` for stale keywords: `go.mod`, `internal/`, `Tauri`, `golang`, `cargo`.
2. **Clean Root `README.md`.**
   - Retain the architectural thesis from `KAIOKEN-THESIS.md`.
   - Update quick-start to target Node 22 and `kaioken_v2/apps/cli`.
   - Direct developers to `website/` for full documentation.
3. **Reconcile `website/src/data/roadmap.ts`.**
   - Update the 10 feature board categories to match the v2 status in `roadmap/README.md §5`.
   - Remove references to `Tools()` and replace with `@kaioken/ext`.
4. **Synchronize Extension Docs.**
   - Ensure `registry-web/content/packaging-publishing.md` matches the frozen `extension.v1.json` schema from M12-02.
5. **Audit the `roadmap/` Tree.**
   - Ensure all milestone links, leaf cross-references, and conventions remain valid.
   - Confirm all gap identifiers (G-1 through G-6) remain consistent.

## In scope

- Content updates in `README.md`.
- Content and data updates in `website/src/data/`.
- Documentation guide updates in `registry-web/content/`.
- Cross-reference reconciliation in `roadmap/`.

## Out of scope

- Redesigning the website UI or changing styling tokens in `website/src/index.css`.
- Modifying engine code in `kaioken_v2/`.
- Writing new product features.

## Gates

Run documentation build and link checks:

```bash
# Verify website builds without errors
cd website && npm run build
```

```bash
# Verify registry-web builds without errors
cd registry-web && npm run build
```

Run grep search to confirm zero stale Go v1 mentions in public docs:

```bash
# Expect zero matches for Go references in website data
grep -rn "go.mod" website/src/data/ || echo "Clean"
```

## Traps

| Trap | Guard |
|---|---|
| Exempting the roadmap from the audit | Audit all five surfaces. A roadmap that contradicts the engine or website creates internal confusion. |
| Leaving "ghost commands" in the docs | Verify every CLI command cited in docs against `kaioken_v2/apps/cli/src/main.ts`. If a command does not exist in `main.ts`, delete it from docs. |
| Breaking website build during data cleanup | `website/src/data/roadmap.ts` is strongly typed. When retargeting items to TS, adhere to existing TypeScript interfaces. |
| Forgetting License Zero notices | All documentation surfaces must accurately state the license terms under which the software is distributed. |

## Open questions

None. This leaf is fully specified.

## Session brief

```xml
<task>
Consolidate and audit Kaioken's five fragmented documentation surfaces before v2.0 GA.

Currently, five surfaces overlap and frequently contradict one another:
1. Root README.md
2. Engine kaioken_v2/README.md
3. Website docs (website/src/data/roadmap.ts, website/src/data/docs-nav.ts, website/src/pages/)
4. Registry documentation (registry-web/content/)
5. The roadmap/ tree itself

Execute a comprehensive documentation cleanup:
1. Root README.md: Remove obsolete references to Go v1, Tauri, and archived directories. Align quick-start instructions with Node >=22 and kaioken_v2.
2. website/src/data/roadmap.ts: Update feature board items to eliminate Go internals (such as "Tools() dynamic registry", "serve.go", "go.mod"). Align items with the v2 translation layer from roadmap/README.md §3 and §5.
3. registry-web/content/: Ensure developer guides accurately describe the frozen extension.yaml schema from packages/ext/src/manifest.ts.
4. roadmap/: Audit internal links across M01-M12 milestone folders, ensuring no broken relative markdown links exist.
5. Purge ghost commands: Ensure all documented CLI flags match the options in kaioken_v2/apps/cli/src/main.ts.
</task>

<verification_loop>
Run builds from website/ and registry-web/:
  cd website && npm run build
  cd registry-web && npm run build
Verify that neither build fails.
Confirm with grep that "go.mod" and "cargo" do not appear in website/src/data/.
</verification_loop>

<missing_context_gating>
Read kaioken_v2/apps/cli/src/main.ts to verify the real list of shipped commands. Never document an un-shipped command as live.
</missing_context_gating>

<action_safety>
Scope strictly to markdown documentation and website/registry content data files.
Do NOT modify core engine logic in kaioken_v2/packages/.
Do NOT run git add or git commit — leave all changes uncommitted in the working tree.
</action_safety>

<structured_output_contract>
End with: (1) audit findings across the five surfaces, (2) files touched, (3) website and registry build status, (4) list of purged stale Go references.
</structured_output_contract>
```
