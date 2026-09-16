# STUDIO-01 · Spike in-process engine integration and stop

> Fork Theia Blueprint, rebrand the shell, boot it, expose one `@kaioken/*` package as an in-process
> backend service, invoke it from a trivial widget, verify the assumption holds — and then STOP.

| Field | Value |
|---|---|
| **Status** | `done` (spiked 2026-09-01; verified in `studio-v0.1-build-notes.md`) |
| **Size** | M |
| **Depends on** | Nothing. This is the root feasibility test of Studio v0.1 |
| **Blocks** | `02-agent-strategy-decision`, `03-theme-and-status-bar`, `04-chat-pane-and-approval-dialog`, `05-wiki-pane` |
| **Touches** | `ide_kaioken/kaioken_studio_theia/` (`theia-extensions/kaioken/`, `applications/electron/package.json`) |
| **Risk** | High if assumption fails; negligible once verified |
| **Gate-critical** | **Yes — the central thesis gate for the entire desktop application** |

## Why this exists

Operating rule 1 specifies that review is the bottleneck, and operating rule 3 demands bounded
sessions. In the desktop transition, the single most dangerous assumption is that Kaioken's
TypeScript packages can run *in-process* inside an Eclipse Theia backend without breaking either
Theia's build or the engine's Node environment.

If that assumption fails — due to ABI incompatibilities, bundler conflicts, or CommonJS/ESM
mismatches — building UI panes is wasted work because the entire integration layer must be
redesigned (e.g., falling back to a sidecar or JSON-RPC subprocess). Therefore, this step exists to
test the central assumption in isolation and immediately **STOP**. The done-condition is a
go/no-go architectural decision point, not a polished feature.

## Current state

Verified against [`kaioken_v2/docs/studio-v0.1-build-notes.md:11-46`](../../kaioken_v2/docs/studio-v0.1-build-notes.md#L11-L46)
and the working tree in `ide_kaioken/kaioken_studio_theia/`:

| Fact | Evidence |
|---|---|
| Theia Blueprint clone exists | `ide_kaioken/kaioken_studio_theia/` (Theia 1.75 platform) |
| Engine is pure ESM | `kaioken_v2/package.json:4` (`"type": "module"`) |
| Theia extensions compile as CommonJS | `ide_kaioken/kaioken_studio_theia/configs/base.tsconfig.json:15` (`"module": "commonjs"`) |
| ESM bridge implemented | `ide_kaioken/kaioken_studio_theia/node_modules/theia-ide-kaioken-ext/src/node/kaioken-engine.ts:42` uses `new Function('specifier', 'return import(specifier);')` (extension package `theia-ide-kaioken-ext`, corresponding to Blueprint path `theia-extensions/kaioken/`) |
| First package spiked | `@kaioken/scan` and `@kaioken/index` called from `node_modules/theia-ide-kaioken-ext/src/node/kaioken-service-impl.ts` |
| Windows native dependency blocker resolved | `@vscode/windows-ca-certs` failed with `MSB8040` (Spectre-mitigated libraries required); fixed by installing `Microsoft.VisualStudio.Component.VC.Runtimes.x86.x64.Spectre` |
| In-process execution verified | Scan of `kaioken_v2/packages/scan` parsed 40 files (122 KB); index parsed 23 files (129 symbols) in 196ms in-process |

## What done looks like

- [ ] A Theia desktop application boots via `yarn electron start` from `ide_kaioken/kaioken_studio_theia/`.
- [ ] Application window title is branded ("Welcome - Kaioken Studio"), with no unbranded "Theia Blueprint" strings.
- [ ] A backend service wraps at least one `@kaioken/*` package (`@kaioken/scan`).
- [ ] A frontend widget or view calls the backend service over Theia's standard JSON-RPC (`RpcConnectionHandler`).
- [ ] The call executes in-process in the Node backend, successfully scanning a directory and returning real counts.
- [ ] Zero files under `kaioken_v2/packages/` are modified or dirtied in the process.
- [ ] **STOPPING DISCIPLINE:** The session concludes upon recording the spike result. No chat panes, no wiki readers, and no chrome additions are built in this session.

## Steps

1. **Verify toolchain prerequisites on Windows:** Confirm VS 2022 Build Tools have Spectre mitigation installed (`Microsoft.VisualStudio.Component.VC.Runtimes.x86.x64.Spectre`), required for compiling `@vscode/windows-ca-certs` / `crypt32.node`.
2. **Rebrand the Blueprint shell:**
   - Update `theia.frontend.config.applicationName` to `"Kaioken Studio"` in `applications/electron/package.json`.
   - Update `appUserModelId` to `"kaioken.studio"` and config directory to `.kaioken-studio`.
3. **Establish the CommonJS-to-ESM bridge:** In `theia-extensions/kaioken/src/node/kaioken-engine.ts`, construct the dynamic import wrapper using `new Function('specifier', 'return import(specifier);')` so esbuild does not rewrite it into `require()`.
4. **Implement backend service and RPC contract:**
   - Define `KaiokenServer` interface in `theia-extensions/kaioken/src/common/kaioken-protocol.ts`.
   - Implement service in `theia-extensions/kaioken/src/node/kaioken-service-impl.ts` invoking `@kaioken/scan` via the bridge.
   - Bind via `RpcConnectionHandler` in `kaioken-backend-module.ts`.
5. **Add trivial frontend trigger:** In a repository view widget, invoke `KaiokenServer.scan(root)` and render file/byte counts.
6. **Execute and observe:** Run `yarn electron start`, open `kaioken_v2/packages/scan`, verify counts match CLI output.
7. **STOP:** Document findings, performance numbers, and any build frictions in `studio-v0.1-build-notes.md`. Commit nothing to git.

## In scope

- `ide_kaioken/kaioken_studio_theia/applications/electron/package.json`
- `ide_kaioken/kaioken_studio_theia/node_modules/theia-ide-kaioken-ext/src/` (Blueprint extension path `theia-extensions/kaioken/`)

## Out of scope

- Chat pane, transcript cards, streaming output, approval modals — that is `04`.
- Wiki browser tree — that is `05`.
- Full ANSI dark theme and custom status bar — that is `03`.
- Packaging with electron-builder — that is `06`.
- Any modification to `kaioken_v2/packages/*` or `kaioken_v2/apps/*`.

## Gates

From `ide_kaioken/kaioken_studio_theia/`:

```bash
yarn electron build
yarn electron start
```

From `kaioken_v2/`:

```bash
npm run typecheck && npm test
```

Verification is passed when the launched app displays the scanned file and symbol count from `kaioken_v2/packages/scan` without native module or RPC errors.

## Traps

| Trap | Guard |
|---|---|
| Letting the spike expand into building the chat pane | Hard stop instruction. The done-condition is proving the in-process bridge works, not shipping features. |
| Using standard `await import()` in CommonJS Theia extension | TypeScript rewrites `import()` to `require()` when `module: commonjs`, which throws `ERR_REQUIRE_ESM`. Must use `new Function(...)`. |
| Missing Windows Spectre-mitigated runtime | Fails build with `MSB8040`. Install `Microsoft.VisualStudio.Component.VC.Runtimes.x86.x64.Spectre` via VS Installer. |
| Mutating `kaioken_v2` packages to satisfy Theia types | Engine packages must remain clean. Theia extension consumes compiled dist via path resolution. |

## Open questions

None. The spike was executed on 2026-09-01; the assumption holds and was documented in `kaioken_v2/docs/studio-v0.1-build-notes.md`.

## Session brief

```xml
<task>
Spike the in-process consumption of Kaioken's TypeScript packages inside Eclipse Theia Blueprint
at ide_kaioken/kaioken_studio_theia/ and immediately STOP upon proving or disproving feasibility:

1. In ide_kaioken/kaioken_studio_theia/, configure the shell branding in applications/electron/package.json
   (applicationName: "Kaioken Studio", config dir: ".kaioken-studio").
2. Create the ESM bridge in theia-extensions/kaioken/src/node/kaioken-engine.ts using:
   const dynamicImport = new Function('specifier', 'return import(specifier);');
   This prevents TypeScript/esbuild under "module": "commonjs" from rewriting dynamic import into require().
3. In theia-extensions/kaioken/src/node/kaioken-service-impl.ts, expose a backend service method that
   dynamically loads @kaioken/scan from the built kaioken_v2/packages/scan/dist/index.js, scans a
   target folder, and returns the FileScan result over Theia's RpcConnectionHandler.
4. Render the returned counts in a minimal frontend widget in the browser contribution.
5. Launch via yarn electron start, verify scan against kaioken_v2/packages/scan, and record the
   file count, symbol count, and scan duration.
6. STOP. Do not build chat, do not build wiki, do not style the chrome. Document findings in
   kaioken_v2/docs/studio-v0.1-build-notes.md.

Do NOT touch any files under kaioken_v2/. The engine must remain clean.
</task>

<verification_loop>
From ide_kaioken/kaioken_studio_theia/:
  yarn electron build
  yarn electron start
Confirm the window launches with title "Welcome - Kaioken Studio", logs no "ERR_REQUIRE_ESM", and
displays accurate scan metrics for packages/scan.
From kaioken_v2/:
  npm run typecheck
  npm test
Confirm working tree in kaioken_v2/ has zero modified files.
</verification_loop>

<action_safety>
Scope strictly to the spike. No chat UI, no approval dialogs, no wiki tree. Do NOT run git add or
git commit — the orchestrator commits after review. Leave the work uncommitted in the working tree.
</action_safety>

<structured_output_contract>
End with: (1) whether the central in-process assumption held, (2) benchmark timings for the in-process
scan call, (3) any native module or compiler warnings encountered (specifically Spectre MSB8040),
(4) confirmation that kaioken_v2 packages were unmodified.
</structured_output_contract>
```
