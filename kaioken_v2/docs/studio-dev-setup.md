# Kaioken Studio — Development Environment

Set up 2026-08-30 on this Windows 11 machine. The environment is ready; **the build
itself is still parked** — see `studio-v0.1-scope.md` for scope and the blocking
prerequisite (`apps/tui` must be finished first).

---

## 1. What is installed and verified

| Requirement | Needed | Present | Notes |
|---|---|---|---|
| Node.js | `>= 24` (Theia engine constraint) | **26.4.0** global, **24.20.0** via fnm | Node 26 is newer than Theia is tested against; 24 is pinned for this tree — see §3 |
| Yarn | `>= 1.7 < 2` (Yarn 1 classic; **not** Berry) | **1.22.22** | Installed globally this session. Theia has no `packageManager` field, so nothing auto-selects the right one |
| npm | any | 11.17.0 | Used only for the global yarn install |
| Git | any | 2.55.0 | |
| Python | 3.x for node-gyp | **3.11.15** | |
| C++ toolchain | VS 2022 Build Tools, "Desktop development with C++" | **present** | Required for native modules on Node ≥ 22 |
| fnm | — | **1.39.0** | Installed via winget (`Schniz.fnm`) |
| Disk | several GB for `yarn install` | 187 GB free on D: | |

Nothing else is required to start.

---

## 2. The clone

`kaioken_studio_theia/` at the repo root is a clone of
[`eclipse-theia/theia-ide`](https://github.com/eclipse-theia/theia-ide) — the Theia
Blueprint template — at `521cd2e`, version 1.75.0. It is 14 MB.

- Its remote is named **`upstream`**, not `origin`. That is deliberate: when Studio v0.1
  starts, the real fork becomes `origin` and `upstream` stays pointed at Eclipse for
  tracking releases.
- It is **gitignored** by the parent repo (entry at the bottom of `.gitignore`,
  alongside `opencode/` and `pi/`). It has its own `.git`; committing it would create a
  stray gitlink.
- `.node-version` containing `24` has been added at its root.

Layout worth knowing:

```
kaioken_studio_theia/
├── applications/
│   ├── browser/          # browser target (not used in v0.1)
│   ├── electron/         # the desktop target
│   └── electron-next/    # next-version electron variant
├── theia-extensions/
│   ├── product/          # branding: about dialog, welcome page, AI registry config
│   ├── updater/          # electron-updater based auto-update
│   └── launcher/         # AppImage CLI launcher
├── patches/              # patches applied to upstream @theia packages
└── package.json          # lerna monorepo root
```

Our extension will be added as `theia-extensions/kaioken/`.

---

## 3. Node version — read this before building

Theia's engine constraint is `node >= 24` and 24 is the recommended version. The global
Node here is **26.4.0**, which satisfies the constraint but is newer than Theia is
tested against. Native modules (`node-pty`, `nsfw`) and Electron's ABI are where that
difference shows up, usually as unreadable node-gyp output.

`fnm` is installed and Node 24.20.0 is available, with `.node-version` pinning it for
`kaioken_studio_theia/`. **fnm is not wired into the PowerShell profile** — this was left
alone deliberately so that the global default Node stays 26 for Kaioken itself.

Activate it per-shell before working on Studio:

```bash
fnm env --use-on-cd | Out-String | Invoke-Expression
```

To make that automatic, add the same line to `$PROFILE`. That is a persistent change to
the shell environment and has not been made.

Verify you are on the right Node before any Theia build:

```bash
node --version
```

It must print `v24.x`.

---

## 4. First build (when Studio v0.1 actually starts)

Run from `kaioken_studio_theia/`, with Node 24 active:

```bash
yarn
```

```bash
yarn electron build && yarn download:plugins
```

```bash
yarn electron start
```

Notes:
- `yarn` (not npm) — the repo's engine field requires Yarn 1 and `yarn.lock` is what is
  committed.
- **Use `yarn electron build`, not `yarn build:dev`.** `build:dev` builds the browser
  application too, and on Windows that fails; because Lerna bails on the first failure,
  the electron application then never gets built at all.
- `download:plugins` fetches the bundled VS Code extensions listed under `theiaPlugins`
  from Open VSX. Skipping it gives an IDE with no language support.
- The first install is large and slow. Later ones are not.
- The bundler is **already esbuild**. Theia 1.75 ships
  `applications/electron/esbuild.mjs` and no `webpack.config.js`, so there is
  nothing to switch.
- Build electron only. Native modules must be rebuilt when switching between the browser
  and electron targets, and v0.1 has no use for the browser target.

**One-time Windows prerequisite (already done on this machine):** the backend bundle
needs `@vscode/windows-ca-certs`, which only compiles when the **Spectre-mitigated MSVC
libraries** are installed. Without them the package fails silently at install time (it is
an optional dependency) and the build later dies with `Could not resolve path of module`.
Add the component
`Microsoft.VisualStudio.Component.VC.Runtimes.x86.x64.Spectre` to the VS Build Tools, then
run `yarn install --check-files`. Full detail in `studio-v0.1-build-notes.md` section 4.

Packaging, for later:

```bash
yarn electron package
```

Installers land in `applications/electron/dist`. Unsigned for v0.1.

---

## 5. Rebranding targets (verified against the actual clone)

| What | Where |
|---|---|
| Application name | `applications/electron/package.json` → `theia.frontend.config.applicationName` (currently `"Theia IDE"`) |
| Windows icon (app) | `applications/electron/resources/icon.ico` |
| macOS icon (app) | `applications/electron/resources/icon.icns` |
| Windows icon (installer/launcher) | `applications/electron/resources/icons/WindowsLauncherIcons/TheiaIDE.ico` |
| macOS icon (installer) | `applications/electron/resources/icons/MacLauncherIcons/icon.icns` |
| Linux icons (installer) | `applications/electron/resources/icons/LinuxLauncherIcons/` |
| Window icon | `applications/electron/resources/icons/WindowIcon/512-512.png` |
| Splash screen | `applications/electron/resources/TheiaIDESplash.svg` |
| Installer sidebar | `applications/electron/resources/icons/InstallerSidebarImage/164-314Windows.bmp` (the one `electron-builder.yml` actually references; `resources/installerSidebar.bmp` also exists but is unused) |
| Installer config | `applications/electron/electron-builder.yml` |
| About dialog | `theia-extensions/product/src/browser/theia-ide-about-dialog.tsx` |
| Welcome page | `theia-extensions/product/src/browser/theia-ide-getting-started-widget.tsx` |
| Shared branding helpers | `theia-extensions/product/src/browser/branding-util.tsx` |
| Product config | `theia-extensions/product/src/browser/theia-ide-config.ts` |
| User config directory | product extension's variables server (`.theia-blueprint` → `.kaioken`) |
| Bundled VS Code extensions | `theiaPlugins` map in `applications/electron/package.json` |

Also present: `theia-ide-ai-registry-configuration.ts`, which is where the AI Registry
(MCP servers and skills discovery) is configured — relevant to the open strategy
question in `theia-studio-research.md` §4.

---

## 6. Keeping the clone current

```bash
git fetch upstream
```

Track **community releases**, not monthly ones. Upgrades are dependency bumps plus
repairing whatever our extensions used that moved. Keep the `patches/` directory as
close to empty as possible — every patch there is future upgrade cost.
