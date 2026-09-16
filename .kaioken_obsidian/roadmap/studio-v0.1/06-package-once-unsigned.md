# STUDIO-06 · Package once, unsigned, on Windows

> Run `yarn electron package` to produce an unsigned installer and executable, discovering Windows
> toolchain and bundling costs before distribution becomes a milestone.

| Field | Value |
|---|---|
| **Status** | `ready` |
| **Size** | M |
| **Depends on** | `01-spike-and-stop`, `03-theme-and-status-bar`, `05-wiki-pane` |
| **Blocks** | Milestone M2 (Trusted distribution), milestone M12 (GA release) |
| **Touches** | `ide_kaioken/kaioken_studio_theia/applications/electron/electron-builder.yml`, `package.json` |
| **Risk** | Medium — native module bundling, electron-builder failures, and Windows binary locks |
| **Gate-critical** | No |

## Why this exists

The scope document ([`kaioken_v2/docs/studio-v0.1-scope.md:103`](../../kaioken_v2/docs/studio-v0.1-scope.md#L103))
stipulates step 6: *package once, unsigned, to learn what packaging costs before it matters*.

Packaging desktop applications in Electron with native C/C++ addons (`tree-sitter`, `@vscode/windows-ca-certs`,
`ripgrep`) routinely encounters hidden bundling failures: ASAR archive path traversal errors, missing
dynamic libraries (`.dll`), and Windows file locking. Learning these costs at the end of Studio v0.1
ensures milestone M2 (Trusted distribution) has realistic estimates rather than optimistic assumptions.

Operating rule 7 specifically enforces **build-then-swap**: on Windows, an executable or native DLL
cannot be overwritten while running because the OS locks the file on disk. Packaging and testing
must respect this constraint. Full distribution (code signing with EV certificates, macOS notarisation,
auto-updaters, and public installers) is strictly milestone M2 and stays out of scope.

## Current state

Verified against [`kaioken_v2/docs/studio-v0.1-build-notes.md:75-138`](../../kaioken_v2/docs/studio-v0.1-build-notes.md#L75-L138)
and [`ide_kaioken/kaioken_studio_theia/applications/electron/`](../../ide_kaioken/kaioken_studio_theia/applications/electron/):

| Fact | Evidence |
|---|---|
| Build system uses esbuild | `applications/electron/esbuild.mjs` generates the bundles; `webpack.config.js` does not exist |
| Windows Spectre mitigation prerequisite | `MSB8040` error previously blocked native build; fixed by installing `Microsoft.VisualStudio.Component.VC.Runtimes.x86.x64.Spectre` |
| Electron-builder configuration | `applications/electron/electron-builder.yml` defines `appId: kaioken.studio`, target `nsis` |
| Target binary size expectation | Installed Electron footprint is expected to be ~150–250MB (as noted in `theia-studio-research.md` §7) |
| File locking trap on Windows | Running `yarn electron build` while an Electron test instance is open fails with `EBUSY: resource busy or locked` |

## What done looks like

- [ ] `yarn electron package` executes to completion from `ide_kaioken/kaioken_studio_theia/`.
- [ ] An unsigned Windows executable / installer is generated in `applications/electron/dist/`.
- [ ] The packaged application launches independently (outside `yarn electron start`) on Windows.
- [ ] The bundled application boots cleanly, displays the branded welcome page, and loads the Kaioken Dark theme.
- [ ] The in-process backend successfully accesses native binaries (`rg.exe`) and tree-sitter grammars without path extraction crashes.
- [ ] Packaging duration, final artifact sizes, and bundling warnings are documented.

## Steps

1. **Verify Native Module Prerequisite:** Ensure VS 2022 C++ Build Tools with Spectre mitigation are present on PATH.
2. **Review Electron-Builder Configuration:**
   - In `applications/electron/electron-builder.yml`, verify `productName: "Kaioken Studio"`, `appId: "kaioken.studio"`.
   - Ensure native `.node` files and `rg.exe` are marked to be unpacked from ASAR (`asarUnpack`).
3. **Execute Packaging Build:**
   - Terminate any running Studio or Electron processes to avoid Windows `EBUSY` locks.
   - Run `yarn download:plugins` to ensure bundled VS Code extensions are present in cache.
   - Run `yarn electron package`.
4. **Inspect Generated Distributable:**
   - Locate the output in `applications/electron/dist/win-unpacked/` and installer `.exe`.
   - Record the size in megabytes.
5. **Execute Smoke Test:**
   - Run `applications/electron/dist/win-unpacked/Kaioken Studio.exe`.
   - Confirm it boots without terminal dependency, opens repository, and executes a scan.
6. **Record Findings:** Document all packaging warnings and failure modes for Milestone M2.

## In scope

- `ide_kaioken/kaioken_studio_theia/applications/electron/electron-builder.yml`
- `ide_kaioken/kaioken_studio_theia/applications/electron/package.json`

## Out of scope

- Code signing certificates (EV / Authenticode / Cosign) — that is milestone M2.
- macOS notarisation with Apple Developer ID — that is milestone M2.
- Electron auto-updater integration (`theia-extensions/updater`) — that is milestone M2.
- Web / browser target builds (`applications/browser`) — deferred per scope doc §3.

## Gates

From `ide_kaioken/kaioken_studio_theia/`:

```bash
yarn electron package
```

Verification command:

```powershell
& "applications\electron\dist\win-unpacked\Kaioken Studio.exe"
```

The packaged executable must boot to the welcome screen and execute an in-process scan without ASAR or DLL loading errors.

## Traps

| Trap | Guard |
|---|---|
| Packaging while Studio is running | Windows OS locks `.exe` and `.node` files. Always kill running instances before running `package`. |
| Bundling native binaries into ASAR | Node's `child_process.spawn` cannot execute binaries (`rg.exe`) directly from inside an ASAR archive. Ensure `asarUnpack` covers native executables. |
| Expecting an install without Windows SmartScreen prompt | Unsigned executables always trigger SmartScreen on Windows. Click "More info -> Run anyway" during testing; signing is M2. |
| Re-introducing browser target native rebuilds | Keep scope strictly on Electron. Switching to browser target forces a recompilation of native C++ modules against standard Node ABI. |

## Open questions

None. The packaging toolchain uses standard electron-builder.

## Session brief

```xml
<task>
In ide_kaioken/kaioken_studio_theia/, execute an unsigned packaging run on Windows:

1. Close any running instances of Kaioken Studio or Electron to prevent Windows EBUSY file locks.
2. In applications/electron/electron-builder.yml:
   - Ensure appId is "kaioken.studio" and productName is "Kaioken Studio".
   - Ensure asarUnpack includes native addons (*.node) and bundled tools like rg.exe.
   - Configure win target to nsis and dir (unpacked directory).
3. Run:
   yarn download:plugins
   yarn electron package
4. Inspect the output in applications/electron/dist/:
   - Measure the total size of the installer (.exe) and unpacked folder (win-unpacked/).
   - Check build logs for any native module linking warnings or ASAR packing issues.
5. Launch applications/electron/dist/win-unpacked/Kaioken Studio.exe:
   - Verify the application starts without node_modules or source directory dependencies.
   - Open a folder and run a scan to verify the in-process backend and native modules execute.
6. Document the build time, bundle size, and any packaging defects for milestone M2.
</task>

<verification_loop>
Run from ide_kaioken/kaioken_studio_theia/:
  yarn electron package
Run the resulting binary from PowerShell:
  & "applications\electron\dist\win-unpacked\Kaioken Studio.exe"
Confirm:
- Packaging exits 0 without unresolved native dependencies.
- The standalone executable boots, renders the Kaioken Dark theme, and performs a repository scan.
</verification_loop>

<action_safety>
Do not attempt code signing or auto-update configuration — that is M2.
Do not touch kaioken_v2/. Scope strictly to the electron-builder configuration. Do NOT run git add
or git commit. Leave changes uncommitted in the working tree.
</action_safety>

<structured_output_contract>
End with: (1) packaging build duration and exit status, (2) final installer and unpacked directory
sizes (MB), (3) smoke test verification results from the standalone executable, (4) list of gotchas
and warnings to carry into Milestone M2.
</structured_output_contract>
```
