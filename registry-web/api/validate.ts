import { fetchLatestRelease, fetchRawFile, fetchTreePaths, validRepo } from "./_lib/github.js"
import { readBody, sendError, sendJSON, type Req, type Res } from "./_lib/http.js"
import { entryFromManifest, parseManifest, parseSemver, validateManifest } from "./_lib/manifest.js"
import type { ValidationReport } from "./_lib/types.js"

// POST /api/validate — the submit wizard's engine. Body: {"repo": "..."}.
//
// Runs the same manifest rules as `kaioken ext validate` against the repo's
// latest release (or its default branch pre-release), plus author-facing
// lint, and returns the ready-to-paste index entry on success. Read-only:
// nothing is ever written anywhere — submission itself is a GitHub PR the
// author opens, so the human review step can never be bypassed.
export default async function handler(req: Req, res: Res) {
  if (req.method !== "POST") return sendError(res, 405, "Use POST.")

  const { repo: rawRepo } = readBody<{ repo?: string }>(req)
  const repo = normalizeRepo(rawRepo ?? "")
  if (!repo || !validRepo(repo)) {
    return sendError(res, 400, "Give the repository as owner/repo (or a github.com URL).")
  }

  const report: ValidationReport = { ok: false, repo, errors: [], warnings: [] }
  try {
    await validate(repo, report)
  } catch (e) {
    return sendError(res, 502, `GitHub unreachable: ${e instanceof Error ? e.message : String(e)}`)
  }
  report.ok = report.errors.length === 0
  sendJSON(res, 200, report)
}

async function validate(repo: string, report: ValidationReport) {
  const latest = await fetchLatestRelease(repo)
  const ref = latest?.tag ?? "HEAD"
  if (!latest) {
    report.warnings.push(
      "no published release yet — validated the default branch instead; tag a release before submitting",
    )
  }

  const src = await fetchRawFile(repo, ref, "extension.yaml")
  if (src === null) {
    report.errors.push(`no extension.yaml at ${ref} — this is not a Kaioken extension`)
    return
  }
  const parsed = parseManifest(src)
  if (!parsed.manifest) {
    report.errors.push(parsed.error ?? "extension.yaml is unreadable")
    return
  }
  const man = parsed.manifest
  report.errors.push(...validateManifest(man))

  // Author-facing lint, mirroring `kaioken ext validate` warnings.
  if (man.repo && man.repo !== repo) {
    report.warnings.push(`manifest repo ${JSON.stringify(man.repo)} does not match ${repo}`)
  }
  if (latest && man.version) {
    const tagVer = latest.tag.replace(/^v/, "")
    if (parseSemver(man.version) !== null && tagVer !== man.version) {
      report.warnings.push(`release tag ${latest.tag} does not match manifest version ${man.version}`)
    }
  }

  await lintTree(repo, ref, man.type ?? "", man.wasm?.entry, report)

  if (report.errors.length === 0) {
    report.entry = entryFromManifest(man, repo)
  }
}

/** Tree-level lint: skills exist and carry frontmatter; wasm entry is committed. */
async function lintTree(repo: string, ref: string, type: string, wasmEntry: string | undefined, report: ValidationReport) {
  const paths = await fetchTreePaths(repo, ref)
  if (paths === null) {
    report.warnings.push("could not list the repository tree — skills not checked")
    return
  }

  const skillFiles = paths.filter((p) => /^skills\/[^/]+\/SKILL\.md$/.test(p))
  if ((type === "" || type === "declarative") && skillFiles.length === 0) {
    report.warnings.push("no skills/<name>/SKILL.md found — a declarative extension with no skills contributes nothing")
  }
  if (wasmEntry && !paths.includes(wasmEntry)) {
    report.errors.push(
      `wasm.entry ${JSON.stringify(wasmEntry)} is not committed at ${ref} — Kaioken installs the source zipball, so the built module must be in the tree`,
    )
  }

  // Frontmatter check on a bounded number of skills, so a huge extension
  // cannot turn validation into a crawl.
  for (const path of skillFiles.slice(0, 10)) {
    const body = await fetchRawFile(repo, ref, path)
    if (body === null) continue
    if (!hasDescriptionFrontmatter(body)) {
      report.warnings.push(`${path} has no frontmatter description — agents match skills on the description`)
    }
  }
}

export function hasDescriptionFrontmatter(body: string): boolean {
  const m = body.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!m) return false
  return /^description:\s*\S/m.test(m[1])
}

/** Accepts owner/repo, github.com/owner/repo and https URLs, with .git and @version noise stripped. */
export function normalizeRepo(raw: string): string {
  let s = raw.trim()
  s = s.replace(/^https?:\/\//, "")
  s = s.replace(/^(www\.)?github\.com\//, "")
  s = s.replace(/\.git$/, "")
  s = s.replace(/\/+$/, "")
  const at = s.indexOf("@")
  if (at > 0) s = s.slice(0, at)
  return s
}
