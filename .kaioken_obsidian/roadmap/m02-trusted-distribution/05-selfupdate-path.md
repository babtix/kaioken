# M2-05 · Implement the selfupdate path with build-then-swap

> Implement an in-place selfupdate command that verifies release integrity, stages new files,
> and swaps the active executable obeying operating rule 7 to avoid Windows file locks.

| Field | Value |
|---|---|
| **Status** | `ready` |
| **Size** | M |
| **Depends on** | `01-decide-the-distribution-model`, `02-npm-provenance-and-signing` |
| **Blocks** | None |
| **Touches** | `kaioken_v2/apps/cli/src/commands/selfupdate.ts`, `kaioken_v2/apps/cli/src/main.ts` |
| **Risk** | High. Self-update logic touches active runtime files and can brick the CLI if rollback fails |
| **Gate-critical** | **No** |

## Why this exists

Operating rule 7 states: **build-then-swap, always — a running executable is locked on Windows.**
In v1, `.kaioken_v1/ROADMAP.md:74` placed `kaioken selfupdate` as "the highest-trust code in the
project", designed with a verify → download → swap → rollback sequence in
`internal/selfupdate/verify.go`.

On Windows, the operating system places an exclusive mandatory byte-range lock on running `.exe`
and active script files. Attempting to overwrite a running binary results in an immediate `EPERM` /
`ERROR_SHARING_VIOLATION`. However, Windows NTFS permits **renaming** an executing binary. The
update sequence must therefore stage the new payload to a temporary file, rename the active binary
to `<binary>.old`, swap the new payload into place, and immediately smoke-test the new file before
finalizing. If the new binary fails to boot, it must roll back to `<binary>.old`.

## Current state

Verified against the codebase.

| Fact | Evidence |
|---|---|
| Historical selfupdate package | `.kaioken_v1/cli/internal/selfupdate/verify.go` (archived, out of tracking) |
| Operating rule 7 | `roadmap/README.md` §10 rule 7 ("Build-then-swap, always") |
| Command table in CLI | `kaioken_v2/apps/cli/src/main.ts:400` lists command dispatch; `selfupdate` does not yet exist |
| Version declaration | `kaioken_v2/apps/cli/src/main.ts` or package metadata |
| Maintainer dev machine | Windows host (`D:\project\ai_now_know`) where file lock semantics are active |

`UNVERIFIED:` whether global npm installations (`npm install -g`) on Windows allow atomic file swaps
without administrator elevation in standard `AppData/npm` directories.

## What done looks like

- [ ] `kaioken selfupdate` is registered as a CLI command in `kaioken_v2/apps/cli/src/main.ts`.
- [ ] Running `kaioken selfupdate --check` queries the remote registry/release API, compares versions, and reports whether an update is available without touching disk.
- [ ] For npm installations:
  - Detects if running from a global npm prefix.
  - Spawns `npm install -g @kaioken/cli@latest` safely or outputs the exact command to run.
- [ ] For standalone binary installations (Rule 7 Build-then-Swap):
  1. Downloads the release asset and its SHA-256 checksum to `<binary>.tmp`.
  2. Verifies SHA-256 hash matches before touching the active file.
  3. Renames current `process.execPath` to `<binary>.old`.
  4. Moves `<binary>.tmp` to `process.execPath`.
  5. Spawns `<binary> scan --version` as a smoke test.
  6. If smoke test fails: swaps `<binary>.old` back into place, aborts, and logs the rollback.
  7. If smoke test succeeds: cleans up or schedules deletion of `<binary>.old`.
- [ ] Automated tests cover:
  - Clean upgrade flow with mocked endpoints.
  - Rollback behavior when the downloaded checksum is tampered with or corrupted.

## Steps

1. **Implement version check (`apps/cli/src/commands/selfupdate.ts`):**
   - Fetch latest release metadata from npm registry (`https://registry.npmjs.org/@kaioken/cli/latest`) or GitHub Releases API.
   - Compare `latest` against current package version using semver.
2. **Implement platform-aware swap:**
   - Detect execution mode:
     ```typescript
     const isNpm = process.argv[1]?.includes("node_modules");
     ```
   - If npm: prompt user or invoke `npm install -g @kaioken/cli@latest` with child_process.
   - If binary executable:
     ```typescript
     const currentBin = process.execPath;
     const tempBin = `${currentBin}.tmp`;
     const oldBin = `${currentBin}.old`;
     ```
3. **Enforce checksum validation:**
   - Hash downloaded bytes using `crypto.createHash('sha256')`.
   - Reject immediately if hash does not match published manifest. Never attempt swap on a failed hash.
4. **Execute atomic swap on Windows:**
   - `fs.renameSync(currentBin, oldBin)`
   - `fs.renameSync(tempBin, currentBin)`
5. **Implement smoke test & rollback:**
   - Spawn `currentBin` with `--version`.
   - If exit code !== 0, catch error:
     ```typescript
     fs.renameSync(currentBin, tempBin);
     fs.renameSync(oldBin, currentBin);
     throw new Error("Selfupdate smoke test failed; rolled back to previous version.");
     ```
6. **Register command in `main.ts`:**
   - Add `case "selfupdate": return runSelfupdate(flags);` to `main.ts`.
7. **Write tests:**
   - Add `apps/cli/test/selfupdate.test.ts` testing happy path, tampered checksum rejection, and rollback execution.

## In scope

- `kaioken_v2/apps/cli/src/commands/selfupdate.ts`
- `kaioken_v2/apps/cli/src/main.ts`
- `kaioken_v2/apps/cli/test/selfupdate.test.ts`

## Out of scope

- Updating Studio desktop application (Studio uses Electron auto-updater).
- Modifying engine core packages (`packages/*`).

## Gates

From `kaioken_v2/`:

```bash
npm run typecheck
```

```bash
npx vitest run apps/cli/test/selfupdate.test.ts
```

CLI smoke test:

```bash
node apps/cli/dist/bin.js selfupdate --check
```

## Traps

| Trap | Guard |
|---|---|
| Attempting `fs.writeFileSync` over the running binary on Windows | Windows file locks trigger `EPERM`. You must rename the running binary before writing the new one |
| Deleting `<binary>.old` while it is still running | The process itself is running the old executable. Schedule cleanup on next boot or let the OS clean temp files |
| Skipping smoke verification after swap | If the new binary has a missing dependency or was built for the wrong ABI, the installation is bricked without rollback |
| Executing remote code without checksum verification | Downloading and running arbitrary bytes without hash check destroys all trust |

## Open questions

None.

## Session brief

```xml
<task>
Implement the `kaioken selfupdate` command in kaioken_v2/apps/cli/src/commands/selfupdate.ts and
register it in apps/cli/src/main.ts.

Requirements:
1. Implement remote version discovery:
   - Query remote release metadata (npm registry or GitHub releases).
   - Support a --check flag that only checks for newer versions and exits 0.
2. Implement update execution:
   - If installed via npm, recommend or spawn `npm install -g @kaioken/cli@latest`.
   - If running as a standalone binary, implement the full Rule 7 Build-then-Swap protocol:
     a. Download to <bin>.tmp.
     b. Verify SHA-256 matches expected checksum.
     c. Rename active <bin> to <bin>.old (Windows permits renaming executing binaries).
     d. Move <bin>.tmp to <bin>.
     e. Spawn <bin> --version to verify healthy startup.
     f. If verification fails, reverse the swap and restore <bin>.old.
3. Wire the command into apps/cli/src/main.ts under command "selfupdate".
4. Add automated tests in apps/cli/test/selfupdate.test.ts with mocked download streams, testing:
   - Successful version check.
   - Hash mismatch abort (tampered checksum).
   - Rollback recovery on simulated spawn failure.
</task>

<verification_loop>
Run from kaioken_v2/:
  npm run typecheck
  npx vitest run apps/cli/test/selfupdate.test.ts
  node apps/cli/dist/bin.js selfupdate --check
Confirm all tests pass and that the command does not leave orphaned .tmp files.
</verification_loop>

<missing_context_gating>
Do not use platform-specific bash commands for file swapping. Use Node.js node:fs/promises or
node:fs (rename, unlink) to ensure native Windows cross-compatibility.
</missing_context_gating>

<action_safety>
Scope to apps/cli/src/commands/selfupdate.ts, apps/cli/src/main.ts, and its test file.
Do NOT run git add or git commit. Leave all changes uncommitted in the working tree.
</action_safety>

<structured_output_contract>
End with: (1) selfupdate command options implemented, (2) explanation of the Windows rename swap
mechanism, (3) unit test results including the tampered-checksum test, (4) typecheck outcome.
</structured_output_contract>
```
