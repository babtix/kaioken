#!/usr/bin/env node
// Builds cli/cmd/kaioken as the Tauri sidecar, named for the host's Rust
// target triple as Tauri's externalBin convention requires. Runs from
// predev/prebuild so nobody hand-copies a binary and nobody ships a stale one.
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
const desktopRoot = join(here, "..")
const cliRoot = join(desktopRoot, "..", "cli")
const binariesDir = join(desktopRoot, "src-tauri", "binaries")

const TRIPLE_MAP = {
  "x86_64-pc-windows-msvc": { GOOS: "windows", GOARCH: "amd64" },
  "aarch64-pc-windows-msvc": { GOOS: "windows", GOARCH: "arm64" },
  "x86_64-apple-darwin": { GOOS: "darwin", GOARCH: "amd64" },
  "aarch64-apple-darwin": { GOOS: "darwin", GOARCH: "arm64" },
  "x86_64-unknown-linux-gnu": { GOOS: "linux", GOARCH: "amd64" },
  "aarch64-unknown-linux-gnu": { GOOS: "linux", GOARCH: "arm64" },
}

function die(msg) {
  console.error(`build-sidecar: ${msg}`)
  process.exit(1)
}

function sh(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { encoding: "utf8", ...opts })
}

/** Locate `go` without trusting PATH — it is not on PATH in a fresh shell on
 *  this machine. Order: GOROOT env, PATH, then well-known install locations. */
function findGo() {
  const candidates = []
  if (process.env.GOROOT) candidates.push(join(process.env.GOROOT, "bin", exe("go")))
  candidates.push(exe("go")) // resolved via PATH by execFileSync itself
  candidates.push("C:\\Program Files\\Go\\bin\\go.exe")
  candidates.push("/usr/local/go/bin/go")
  candidates.push("/opt/homebrew/bin/go")

  for (const c of candidates) {
    if (c === exe("go")) {
      // Bare name: let the OS resolve it against PATH.
      try {
        sh(c, ["version"])
        return c
      } catch {
        continue
      }
    }
    if (existsSync(c)) return c
  }
  die(
    `could not locate a Go toolchain. Looked in:\n` +
      candidates.map((c) => `  - ${c}`).join("\n")
  )
}

function exe(name) {
  return process.platform === "win32" ? `${name}.exe` : name
}

function hostTriple() {
  const out = sh("rustc", ["-Vv"])
  const m = /host:\s*(\S+)/.exec(out)
  if (!m) die(`could not parse "host:" from rustc -Vv:\n${out}`)
  return m[1]
}

/** True when `outPath` is newer than every .go file under `srcDir`. */
function isUpToDate(outPath, srcDir) {
  if (!existsSync(outPath)) return false
  const outMtime = statSync(outPath).mtimeMs
  let newest = 0
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, entry.name)
      if (entry.isDirectory()) walk(p)
      else if (entry.name.endsWith(".go")) newest = Math.max(newest, statSync(p).mtimeMs)
    }
  }
  walk(srcDir)
  return outMtime > newest
}

function readDesktopVersion() {
  const pkg = JSON.parse(readFileSync(join(desktopRoot, "package.json"), "utf8"))
  return pkg.version
}

const triple = hostTriple()
const target = TRIPLE_MAP[triple]
if (!target) die(`unmapped Rust target triple: ${triple}`)

const outName = `kaioken-daemon-${triple}${target.GOOS === "windows" ? ".exe" : ""}`
const outPath = join(binariesDir, outName)

if (isUpToDate(outPath, cliRoot)) {
  console.log("sidecar up to date")
  process.exit(0)
}

const goBin = findGo()
const version = readDesktopVersion()
mkdirSync(binariesDir, { recursive: true })

const tmpPath = join(binariesDir, `kaioken-daemon.tmp${target.GOOS === "windows" ? ".exe" : ""}`)

console.log(`build-sidecar: building for ${triple} (GOOS=${target.GOOS} GOARCH=${target.GOARCH})`)
sh(
  goBin,
  [
    "build",
    "-trimpath",
    "-ldflags",
    `-s -w -X kaioken/internal/version.Version=${version}`,
    "-o",
    tmpPath,
    "./cmd/kaioken",
  ],
  {
    cwd: cliRoot,
    env: { ...process.env, GOOS: target.GOOS, GOARCH: target.GOARCH, CGO_ENABLED: "0" },
  }
)

renameSync(tmpPath, outPath)
console.log(`build-sidecar: wrote ${outPath}`)
