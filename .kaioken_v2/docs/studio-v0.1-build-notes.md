# Kaioken Studio v0.1 — Build Notes

What actually happened when the build started, and the decisions it forced.
Companion to `studio-v0.1-scope.md` (the plan) and `studio-dev-setup.md` (the
environment). Where this and the plan disagree, this is what the code does.

Started 2026-09-01.

---

## 1. The spike result — the central assumption holds

`studio-v0.1-scope.md` §4 step 1 said to prove in-process consumption of the
`@kaioken/*` packages before building anything on top of it. That is done, and
it works. Measured against `kaioken_v2/packages/scan` as the target repository:

```
engineStatus: { available: true, loaded: [scan, index, wiki, search] }
scan:  40 files, 122,388 bytes, typescript:16 unknown:15 javascript:7 json:2
index: 23 files, 129 symbols, parsed 23, reused 0, skipped 17, 196ms
wiki:  tree + document read verified against kaioken_v2/apps/cli/.kaioken/wiki
```

Nothing about the engine fought the Theia build. The panes are safe to build on
this foundation.

---

## 2. ESM versus CommonJS — the one real integration constraint

**`kaioken_v2` is ESM** (`"type": "module"`). **Theia extensions are CommonJS**
(`configs/base.tsconfig` sets `"module": "commonjs"`, and that is not ours to
change — it is how every Theia extension compiles).

A literal `import()` does not solve this on its own: with `module: commonjs`,
TypeScript *rewrites* `import()` into `require()`, which cannot load ESM. The
bridge is therefore built at runtime, in one place, in
`theia-extensions/kaioken/src/node/kaioken-engine.ts`:

```ts
const dynamicImport = new Function('specifier', 'return import(specifier);');
```

This is the only place in the extension that knows the engine is ESM. Everything
else sees an ordinary async API.

---

## 3. Decision: the engine is resolved by path, not declared as a dependency

`studio-v0.1-scope.md` §6 said to decide monorepo versus published packages at
step 1. **Decided: neither, for now — runtime path resolution.**

`kaioken_studio_theia` does *not* depend on `@kaioken/*` in any `package.json`. The
backend locates a built `kaioken_v2` at runtime by walking up from its own
directory, overridable with `KAIOKEN_ENGINE_ROOT`.

Why, rather than a `file:`/`link:` workspace dependency:

- The `@kaioken/*` packages are private, unpublished, and carry **native
  tree-sitter dependencies**. Pulling them into the Theia dependency tree means
  two installs sharing native module builds across two Node/Electron ABIs.
- The standing constraint is that Studio work must not destabilise `apps/tui`.
  Entangling the dependency trees is precisely how that would happen.
- It keeps the real decision open. Merging the workspaces is still possible
  later; it is just no longer a prerequisite for having a working GUI.

The cost is honest and worth naming: **`kaioken_v2` must be built** (`npm run
build`) before Studio can do anything. A missing or unbuilt engine is reported
in words — in the repository pane and the status bar — rather than failing at
the moment a button is pressed.

---

## 4. RESOLVED blocker: `@vscode/windows-ca-certs` would not compile

Both `yarn build:dev` and `yarn electron build` fail in the **backend** bundle
(the frontend bundle succeeds):

```
[build/browser] Finished with 0 errors
X [ERROR] Could not resolve path of module: @vscode/windows-ca-certs
[build/node]    Finished with 1 errors
```

This is **not** Kaioken's doing and not browser-specific — an earlier note in
this document said it was, and that was wrong.

The chain:

1. `@vscode/windows-ca-certs` is an *optional* dependency of
   `@vscode/proxy-agent`. Optional means install failures are silent.
2. It failed during `yarn install` with
   **`MSB8040: Spectre-mitigated libraries are required for this project`**.
   The VS 2022 Build Tools here have MSVC `14.44.35207`, but that toolset has
   no `lib\spectre` directory, which is what MSB8040 is complaining about.
3. The package publishes **no prebuilt binaries** (`"install": "node-gyp
   rebuild"`), so there is no way to obtain it without compiling.
4. Theia's `@theia/bundle-plugin` esbuild plugin registers an `onResolve` for
   this exact module and, **on Windows only**, resolves it to a real
   `build/Release/crypt32.node`. On every other platform it simply marks the
   module `external`. So Windows is the only platform where a missing optional
   native module is a hard build failure.

**Fixed by installing the Spectre-mitigated libraries** — chosen over patching,
because the scope doc wants `patches/` kept as near-empty as possible:

```
vs_installer.exe modify ^
  --installPath "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools" ^
  --add Microsoft.VisualStudio.Component.VC.Runtimes.x86.x64.Spectre --quiet --norestart
```

Two traps when driving that from PowerShell, both of which cost time here:

- Pass the arguments as **one string** to `Start-Process -ArgumentList`. An array
  joins on spaces and splits `C:\Program Files (x86)`; the installer then fails
  with `An installed product matching the following parameters cannot be found:
  installPath: C:\Program` while the wrapper still exits 0.
- `vs_installer.exe` hands off to `setup.exe` and returns immediately. Wait for
  the toolset's `lib\spectre` directory to appear, not for the process to exit.

Afterwards `yarn install --check-files` recompiles the previously-skipped
optional dependency (`crypt32.node`, ~143 KB) and the build succeeds.

### Build result

```
[build/browser]  Finished with 0 errors
[build/node]     Finished with 0 errors
[build/electron] Finished with 0 errors
```

The app launches, with the window title **"Welcome - Kaioken Studio"**, 97
plugins started, and the configuration directory at `~/.kaioken-studio`. The
only log noise is Theia's own `Possible Emitter memory leak detected` listener
warnings and `Unsupported activation events` from bundled VS Code extensions -
both pre-existing and unrelated.

Verified present in the shipped bundles: the `kaioken-dark` theme and its
`Kaioken Dark` label, the pane CSS, `/services/kaioken` on the RPC channel, and
- importantly - the `return import(specifier)` bridge, which esbuild left intact
rather than rewriting into a `require`.

**Not verified: pixel rendering.** The app runs from a dev checkout and is not
an installed application, so it could not be granted to screen-capture tooling.
The theme is proven to be registered and shipped; how it *looks* still wants a
human glance.

### Also learned: esbuild is already the bundler

`applications/electron` has an `esbuild.mjs` and **no `webpack.config.js`**.
Theia 1.75 ships esbuild by default, so the "switch the bundler to esbuild"
step in `studio-v0.1-scope.md` §2 is obsolete — it is already done upstream.

---

## 5. Theme API — the research doc's guess was wrong

The theme is registered through `MonacoThemingService`, but not the way the
earlier research assumed:

- `MonacoThemingService.register` is an **instance** method, not static, and is
  for themes that still need loading from a URI.
- For a theme object already in memory the method is **`registerParsedTheme`**.
- `ThemeService` has **no `isDefaultTheme()`** — only a `defaultTheme` getter.

Registration happens in `initialize()`, the earliest frontend lifecycle hook,
because the theme service resolves `workbench.colorTheme` during start-up and a
theme registered later loses the first paint.

Theme *selection* is not done in code. `applications/electron/package.json` sets
`workbench.colorTheme` to `kaioken-dark` as a preference default, so a user who
picks another theme keeps it. Selecting the theme imperatively at start-up would
have quietly overridden that choice on every launch.

---

## 6. What was built

**Extension** — `theia-extensions/kaioken/` (`theia-ide-kaioken-ext`):

| Area | Files |
|---|---|
| RPC contract | `src/common/kaioken-protocol.ts` |
| ESM bridge | `src/node/kaioken-engine.ts` |
| Backend service | `src/node/kaioken-service-impl.ts`, `kaioken-backend-module.ts` |
| Theme | `src/browser/theme/kaioken-dark.ts`, `kaioken-theme-contribution.ts` |
| Repository pane | `src/browser/repository/kaioken-repository-widget.tsx` |
| Wiki pane | `src/browser/wiki/kaioken-wiki-widget.tsx` |
| Chrome | `kaioken-status-bar-contribution.ts`, `kaioken-commands.ts`, `kaioken-view-service.ts` |
| Styling | `src/browser/style/index.css` |

**Rebranding** — application name, product name, `appUserModelId`
(`kaioken.studio`), config folder (`.theia-ide` → `.kaioken-studio`), the
welcome/About wordmark and description, the brand accent (`#5088e7` → Kaioken
orange), and `electron-builder.yml` identity (appId, productName, copyright,
vendor).

Attribution to Eclipse Theia was deliberately **kept** in the About text. It is
both correct and required by the licences; only the product identity changed.

**Keybindings** — `Ctrl+Alt+K` (repository), `Ctrl+Alt+W` (wiki). The plain
`Ctrl+K` space belongs to the command palette and its chords.

---

## 7. Design: what "VS Code look, minimal Kaioken colour" turned into

This supersedes the heavy CRT treatment in `studio-design-brief.md` for the
shell. The brief's mood — instrumentation, density, terminal DNA — survives; its
glow, scanlines, glass and WebGL do not.

- **Structure is VS Code Dark+.** Familiar geometry, familiar affordances.
- **Surfaces are neutral near-black** (`#0f0f11` editor, `#131316` chrome,
  `#232328` hairline borders). No hue in the furniture.
- **Orange is the only accent**, and it means exactly one thing: *what is
  active*. Focus border, active tab top border, activity bar indicator, list
  selection, badges, progress, cursor.
- **The other seven ANSI hues are reserved for meaning** — green additions,
  rose deletions, amber warnings, blue links and types, tan tool calls and
  inline code, sage strings.
- **The terminal palette is exact ANSI parity** with the Kaioken CLI, which is
  the design system's terminal-parity rule taken literally.
- **No glow anywhere.** Selection is marked with a 2px inset accent bar, not a
  halo. Radii stay at 3px.

The pane CSS reads Theia's own colour variables rather than Kaioken hexes, so
the panes follow whichever theme is active instead of only looking right under
Kaioken Dark.

---

## 8. Not built, and why

- **Chat / agent pane.** It is the hero surface and it is *gated*:
  `studio-v0.1-scope.md` §4 step 2 says to answer the Theia-AI-overlap question
  first — does Kaioken replace Theia's shipped Coder/Architect agents, or expose
  itself as MCP tools inside them? Theia 1.75 ships a full AI chat UI and an AI
  Registry. Building a second, parallel chat pane before answering that would
  most likely be work thrown away. **This is the next decision to make.**
- **The approval dialog**, which belongs with the chat pane.
- **Icons.** Still Theia's artwork; there is no Kaioken icon set yet. Every
  icon path is listed in `studio-dev-setup.md` §5.
- **esbuild switch, packaging, signing, auto-update, browser target** — all
  deferred per scope.
