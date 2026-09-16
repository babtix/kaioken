# GAP-01 · Age research documents without corrupting file provenance

> Resolve the research aging limitation: research documents record web page hashes but are kept out
> of the provenance index because URLs cannot be resolved in a repository file scan.

| Field | Value |
|---|---|
| **Status** | `ready` |
| **Size** | M |
| **Depends on** | Milestone M1 (Green everywhere), Milestone M6 (Incrementality) |
| **Blocks** | Milestone M6 remainder, Research export, Knowledge Graph integration |
| **Touches** | `kaioken_v2/packages/provenance/`, `kaioken_v2/packages/research/`, `kaioken_v2/apps/cli/src/commands/research.ts` |
| **Risk** | Medium — touching provenance invalidation logic |
| **Gate-critical** | No |

## Why this exists

Quoted directly from [`kaioken_v2/README.md:383-389`](../../kaioken_v2/README.md#L383-L389):

> *Research is not aged. A research document records the page hashes it was written from, but it is
> deliberately kept out of the shared provenance index: its sources are URLs, and staleness resolves
> a source by looking its path up in the scan, so wiring it in would report every research document
> as `orphaned` and fail `status --check` on a repository that is perfectly current. Ageing one means
> re-fetching its pages, which this layer does not do yet. `status`, `update`, `graph` and `export`
> therefore do not see research.*

This is a structural gap between local repository knowledge and external web knowledge. Because
`provenance` assumes every source path exists inside `scan.json`, adding HTTP URLs directly into
the provenance index causes the staleness checker to report them missing from disk. Consequently,
research output lives in isolation, unseen by CI gates, graph visualisations, or automated doc
updates.

## Current state

Verified against [`kaioken_v2/packages/provenance/src/index.ts`](../../kaioken_v2/packages/provenance/src/index.ts)
and [`kaioken_v2/packages/research/src/index.ts`](../../kaioken_v2/packages/research/src/index.ts):

| Fact | Evidence |
|---|---|
| Provenance scans local paths | `packages/provenance` calculates staleness by looking up source relative paths in `FileScan.files` |
| Research records web hashes | `packages/research` records SHA-256 hashes of fetched and sanitised HTML/Markdown pages |
| Provenance isolation | Research artifacts written to `.kaioken/research/` do not create entries in `.kaioken/provenance.json` |
| Consequence | `kaioken status --check` passes on current code even if researched web documentation is years out of date |
| Command blindness | `kaioken update`, `kaioken graph`, and `kaioken export handoff` omit research documents completely |

## What done looks like

- [ ] A typed URL source descriptor (`UrlSourceRecord`) is introduced into `packages/provenance`
      distinguishing local filesystem sources (`file://`) from external web sources (`https://`).
- [ ] Staleness resolution treats web sources differently from local files:
      - Local sources are checked via local file content hash against `scan.json`.
      - Web sources are checked against a cached snapshot or marked with a TTL (e.g. 30 days)
        rather than looking them up in `scan.json`.
- [ ] `status --check` does not report research documents as `orphaned` merely because URLs are not on disk.
- [ ] A `--network` or `--re-fetch` flag on `kaioken update` allows optional re-fetching of research URLs
      to check if the remote content hash has drifted.
- [ ] `kaioken graph` and `kaioken export` include research documents in knowledge graph nodes.

## Steps

1. **Extend Provenance Schema:**
   - In `packages/provenance/src/types.ts`, update `SourceRecord` to include `kind: 'file' | 'url'`.
   - Add optional `fetchedAt: string` and `etag?: string` metadata.
2. **Update Staleness Resolution:**
   - In `packages/provenance/src/staleness.ts`, partition sources into file sources and URL sources.
   - For file sources, retain strict lookup in `scan.files`.
   - For URL sources, if offline, evaluate age against a declared `ttlDays` (e.g. warn if > 90 days);
     never mark as `orphaned` unless explicitly invalidated.
3. **Add Optional Network Re-verification:**
   - In `packages/research`, expose a `checkUrlStaleness(sources: UrlSourceRecord[])` helper using
     HTTP `HEAD` or conditional `GET` with `If-None-Match` (ETag).
4. **Integrate into Status and Update:**
   - Update `apps/cli/src/commands/status.ts` to show research document age in a distinct "Research"
     section without breaking CI `--check`.
   - Update `packages/graph` to include research nodes and citation edges.

## In scope

- `kaioken_v2/packages/provenance/`
- `kaioken_v2/packages/research/`
- `kaioken_v2/apps/cli/src/commands/status.ts`
- `kaioken_v2/apps/cli/src/commands/update.ts`

## Out of scope

- Continuous background web scraping or crawl scheduling.
- Headless browser automation (Puppeteer/Playwright) for JavaScript-heavy sites.

## Gates

From `kaioken_v2/`:

```bash
npm run typecheck
npm test
```

Verification procedure:
1. Run `node apps/cli/dist/bin.js research "test topic" --root .` (generating a research document).
2. Run `node apps/cli/dist/bin.js status --check --root .`.
3. The check must exit 0 and report the repository as current, without flagging the research document as `orphaned`.

## Traps

| Trap | Guard |
|---|---|
| Breaking CI offline determinism | Phase 1 gates MUST NOT make network calls. Checking research staleness in `status --check` must be offline (TTL/cached snapshot based) unless `--network` is explicitly passed. |
| Re-introducing SSRF during re-fetch | When re-fetching research URLs, enforce SSRF filtering in `apps/cli/src/web.ts` to block private IPv4 and bracketed IPv6 `[::1]` per `kaioken_v2/README.md:352`. |
| Conflating code drift with web drift | A git commit that changes `src/index.ts` does NOT invalidate an external RFC research document. Invalidation must remain decoupled. |

## Open questions

None. The mechanism and architectural boundaries are fully specified.

## Session brief

```xml
<task>
In kaioken_v2/, close Gap G-1 by enabling research documents to be tracked by provenance without
causing status --check to falsely report them as orphaned:

1. In packages/provenance/src/:
   - Extend the source record interface to support kind: "file" | "url".
   - In computeStaleness(), partition sources. Only resolve "file" sources against FileScan.files.
   - For "url" sources, evaluate freshness against the recorded timestamp or hash. If offline,
     treat them as valid (or optionally "aged" if older than TTL), but NEVER as "orphaned".
2. In packages/research/src/:
   - Write provenance metadata into .kaioken/provenance.json when a research document is written.
3. In apps/cli/src/commands/status.ts:
   - Ensure "status --check" runs purely offline, treats research artifacts with URL sources cleanly,
     and exits 0 on current repos.
4. Verify that packages/graph and apps/cli/src/commands/export.ts now discover and include research
   documents in the knowledge graph.
</task>

<verification_loop>
Run from kaioken_v2/:
  npm run typecheck
  npm test
Run smoke verification:
  node apps/cli/dist/bin.js status --root .
Confirm status reports research documents without orphaned warnings.
</verification_loop>

<action_safety>
Never allow status --check to initiate an HTTP request. Phase 1 offline determinism is absolute.
Do NOT run git add or git commit. Leave changes uncommitted in the working tree.
</action_safety>

<structured_output_contract>
End with: (1) schema changes in packages/provenance, (2) staleness computation adjustments for URL
sources, (3) test outcomes with pasted vitest counts, (4) confirmation that status --check passes
offline.
</structured_output_contract>
```
