# 07 — Build, dev loop, and release

## 7.1 One-time setup

```bash
# Rust — NOT currently installed on this machine
# https://rustup.rs  ·  Windows also needs "Desktop development with C++"
rustup default stable
rustc --print host-tuple      # e.g. x86_64-pc-windows-msvc — memorise this
```

```bash
cd desktop && npm install
```

Windows also needs the **WebView2 runtime** (present on Windows 11 by default;
the NSIS bundle can embed the bootstrapper for older machines — see §7.5).
Linux needs `libwebkit2gtk-4.1-dev`, `librsvg2-dev`, `patchelf`,
`build-essential`, `libssl-dev`.

## 7.2 The sidecar build script

`desktop/scripts/build-sidecar.mjs` — the one piece of glue that makes the whole
thing reproducible. It runs from `predev` and `prebuild`, so the sidecar is never
stale and nobody copies a binary by hand.

Requirements:

1. **Locate Go without trusting `PATH`.** `go` is not on `PATH` in a fresh shell
   on this machine. Order: `process.env.GOROOT/bin/go` → `which go` →
   `C:\Program Files\Go\bin\go.exe` → `/usr/local/go/bin/go`. Fail with a clear
   message naming all the places it looked.
2. **Derive the target triple** from `rustc -Vv` (the `host:` line). Map it to
   `GOOS`/`GOARCH`:

   | Rust triple | GOOS | GOARCH |
   | --- | --- | --- |
   | `x86_64-pc-windows-msvc` | windows | amd64 |
   | `aarch64-pc-windows-msvc` | windows | arm64 |
   | `x86_64-apple-darwin` | darwin | amd64 |
   | `aarch64-apple-darwin` | darwin | arm64 |
   | `x86_64-unknown-linux-gnu` | linux | amd64 |
   | `aarch64-unknown-linux-gnu` | linux | arm64 |

3. **Build to a temp name, then move.** `kaioken.exe` is frequently locked by a
   running TUI on this machine, and the same hazard applies to a running sidecar.
   Build to `kaioken-daemon.tmp`, then rename over the target.
4. **Version stamp:** `-ldflags "-s -w -X kaioken/internal/version.Version=<v>"`
   using `desktop/package.json`'s version, so `/v1/health` and the About screen
   agree with the installer.
5. **Skip when fresh:** if the staged binary is newer than every `.go` file under
   `cli/`, print `sidecar up to date` and exit 0. A dev loop that rebuilds 12k
   lines of Go on every `npm run dev` is a dev loop people stop using.
6. Output: `desktop/src-tauri/binaries/kaioken-daemon-<triple>[.exe]`.

```js
// sketch
const triple = /host:\s*(\S+)/.exec(sh("rustc -Vv"))[1]
const { GOOS, GOARCH } = TRIPLE_MAP[triple] ?? die(`unmapped triple ${triple}`)
const out = `src-tauri/binaries/kaioken-daemon-${triple}${GOOS === "windows" ? ".exe" : ""}`
if (upToDate(out, "../cli")) { console.log("sidecar up to date"); process.exit(0) }
run(goBin, ["build", "-trimpath", "-ldflags", ldflags, "-o", tmp, "./cmd/kaioken"],
    { cwd: "../cli", env: { ...process.env, GOOS, GOARCH, CGO_ENABLED: "0" } })
fs.renameSync(tmp, out)
```

`CGO_ENABLED=0` keeps the sidecar statically linked and free of glibc-version
surprises on Linux. The project is pure Go today, so nothing is lost.

## 7.3 Dev loop

```bash
cd desktop && npm run tauri dev
```

What happens: `predev` stages the sidecar → Tauri starts Vite on **1420** →
Rust builds and launches → `setup` spawns the sidecar → the window shows after
the handshake.

- **Front-end changes** hot-reload; no restart.
- **Rust changes** trigger a rebuild and relaunch (slow — batch them).
- **Go changes** need a restart, because the sidecar is spawned once. Add
  `npm run sidecar` (just the script) so the loop is: rebuild sidecar → restart
  the app.

**Debugging the daemon directly** — the fastest way to isolate a bug, and the way
an implementing agent should verify every endpoint:

```bash
cd cli && go run ./cmd/kaioken daemon -port 7788 -token devtoken
```
```bash
curl -s -H "Authorization: Bearer devtoken" http://127.0.0.1:7788/v1/health | jq
```
```bash
curl -sN -H "Authorization: Bearer devtoken" http://127.0.0.1:7788/v1/events
```

With a fixed port and token the WebView can be pointed at it too, which decouples
front-end work from Rust entirely.

WebView devtools: right-click → Inspect in dev builds; enable in release with the
`devtools` Cargo feature if needed for a bug hunt.

## 7.4 Repository changes outside `desktop/`

Append to the root `.gitignore`:

```gitignore
# Desktop app
desktop/node_modules/
desktop/dist/
desktop/src-tauri/target/
desktop/src-tauri/binaries/
desktop/src-tauri/gen/
```

Update the root `README.md`:
- Repository layout gains `desktop/  the Tauri desktop app`.
- The roadmap line *"Desktop version (Wails wrapper…)"* becomes a pointer to the
  desktop app with its status.

## 7.5 Release builds

```bash
cd desktop && npm run tauri build
```

Artifacts:

| Platform | Output |
| --- | --- |
| Windows | `src-tauri/target/release/bundle/nsis/Kaioken_0.1.0_x64-setup.exe` |
| macOS | `…/bundle/dmg/Kaioken_0.1.0_aarch64.dmg` + `.app` |
| Linux | `…/bundle/deb/kaioken_0.1.0_amd64.deb`, `…/appimage/kaioken_0.1.0_amd64.AppImage` |

Each embeds the sidecar. **Cross-compiling Tauri apps is not practical** — build
each platform on that platform (or in CI, §7.7).

### Windows specifics
- `"nsis": { "installMode": "perMachine" }` needs elevation; `currentUser`
  avoids the UAC prompt. Pick `perMachine` so the post-commit git hook can invoke
  a stable binary path for all users; document the elevation prompt.
- WebView2: `"webviewInstallMode": { "type": "downloadBootstrapper" }` keeps the
  installer small while still working on machines without it.
- **Verify sidecar replacement on upgrade** — see risk R1. Install 0.1.0, install
  0.1.1, then check `/v1/health` reports the new version. This has a known
  upstream bug and must be tested explicitly, not assumed.

### macOS specifics
- Unsigned `.app` files are quarantined; Gatekeeper blocks them. Signing needs a
  Developer ID and notarisation. For a v1 dev release, document the
  `xattr -dr com.apple.quarantine /Applications/Kaioken.app` workaround honestly
  rather than pretending it works out of the box.
- The sidecar must be signed with the same identity, or the app is killed on
  launch.

### Linux specifics
- AppImage bundles webkit2gtk; `.deb` depends on the system one. Ship both.

## 7.6 Updater

`tauri-plugin-updater` with a static JSON endpoint (a GitHub Release asset works).
Needs a keypair: `npm run tauri signer generate`, public key in
`tauri.conf.json`, private key in CI secrets **only**.

Defer to M7 and ship it disabled (`"endpoints": []`) until there is somewhere to
publish. An updater pointing nowhere is worse than none.

## 7.7 CI

`.github/workflows/desktop.yml`, matrix over
`windows-latest`, `macos-latest`, `ubuntu-22.04`:

```yaml
steps:
  - uses: actions/checkout@v4
  - uses: actions/setup-go@v5        # with: { go-version: '1.24' }
  - uses: dtolnay/rust-toolchain@stable
  - uses: actions/setup-node@v4      # with: { node-version: 22, cache: npm }
  - run: sudo apt-get install -y libwebkit2gtk-4.1-dev librsvg2-dev patchelf
    if: matrix.os == 'ubuntu-22.04'
  - run: cd cli && go vet ./... && go test ./...
  - run: cd desktop && npm ci && npm run build
  - run: cd desktop/src-tauri && cargo clippy -- -D warnings
  - uses: tauri-apps/tauri-action@v0
```

Gate every PR on the Go tests, `tsc -b`, and clippy. Bundle only on tags — a full
three-platform bundle on every push is minutes of CI for no signal.
