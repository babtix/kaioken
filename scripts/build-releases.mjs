import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, copyFileSync, readFileSync, writeFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { createHash } from "node:crypto"

const version = "1.3.3"
const repoRoot = "d:/project/ai_now_know"
const cliDir = join(repoRoot, "cli")
const releaseDir = join(repoRoot, "release", `v${version}`)
const realiseDir = join(repoRoot, "realise", `v${version}`)

mkdirSync(releaseDir, { recursive: true })
mkdirSync(realiseDir, { recursive: true })

const targets = [
  { os: "windows", arch: "amd64", ext: ".exe" },
  { os: "linux", arch: "amd64", ext: "" },
  { os: "linux", arch: "arm64", ext: "" },
  { os: "darwin", arch: "arm64", ext: "" },
  { os: "darwin", arch: "amd64", ext: "" },
]

console.log(`Building release binaries for v${version}...`)

for (const t of targets) {
  const binaryName = `kaioken-v${version}-${t.os}-${t.arch}${t.ext}`
  const outPath = join(releaseDir, binaryName)
  console.log(`Building ${t.os}/${t.arch} -> ${binaryName}...`)

  execFileSync(
    "go",
    [
      "build",
      "-trimpath",
      "-ldflags",
      `-s -w -X kaioken/internal/version.Version=${version}`,
      "-o",
      outPath,
      "./cmd/kaioken",
    ],
    {
      cwd: cliDir,
      env: {
        ...process.env,
        GOOS: t.os,
        GOARCH: t.arch,
        CGO_ENABLED: "0",
      },
    }
  )

  // Copy to realise directory as well
  copyFileSync(outPath, join(realiseDir, binaryName))

  // Build archive (zip for windows, tar.gz for linux/darwin)
  if (t.os === "windows") {
    const zipName = `kaioken-v${version}-${t.os}-${t.arch}.zip`
    const zipPath = join(releaseDir, zipName)
    try {
      execFileSync("tar", ["-a", "-cf", zipPath, "-C", releaseDir, binaryName], { cwd: repoRoot })
      copyFileSync(zipPath, join(realiseDir, zipName))
      console.log(`Created ${zipName}`)
    } catch (e) {
      console.warn(`Zip creation note: ${e.message}`)
    }
  } else {
    const tarName = `kaioken-v${version}-${t.os}-${t.arch}.tar.gz`
    const tarPath = join(releaseDir, tarName)
    try {
      execFileSync("tar", ["-czf", tarPath, "-C", releaseDir, binaryName], { cwd: repoRoot })
      copyFileSync(tarPath, join(realiseDir, tarName))
      console.log(`Created ${tarName}`)
    } catch (e) {
      console.warn(`Tar.gz creation note: ${e.message}`)
    }
  }
}

// Compute checksums for all files in release directory
const files = readdirSync(releaseDir).filter((f) => f !== "checksums.txt" && f !== "CHANGELOG_v1.3.3.md")
const checksumLines = []

for (const file of files.sort()) {
  const buf = readFileSync(join(releaseDir, file))
  const hash = createHash("sha256").update(buf).digest("hex")
  checksumLines.push(`${hash}  ${file}`)
}

const checksumsContent = checksumLines.join("\n") + "\n"
writeFileSync(join(releaseDir, "checksums.txt"), checksumsContent)
writeFileSync(join(realiseDir, "checksums.txt"), checksumsContent)
writeFileSync(join(repoRoot, "release", "checksums.txt"), checksumsContent)
writeFileSync(join(repoRoot, "realise", "checksums.txt"), checksumsContent)

console.log("Checksums generated:\n" + checksumsContent)
