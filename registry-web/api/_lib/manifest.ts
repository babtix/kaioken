// The manifest rules, ported from cli/internal/ext/manifest.go so the
// submit wizard and `kaioken ext validate` agree. The unit tests mirror the
// Go test cases; if a rule changes on either side, the mirrored tests are
// what catches the drift.

import { parse as parseYAML } from "yaml"
import type { IndexEntry, ManifestData } from "./types.js"

export const KNOWN_PERMISSIONS = ["fs:read:workspace"]

const KNOWN_TYPES = ["", "declarative", "mcp", "wasm"]

/** kebab mirrors ext.kebab: [a-z0-9-], no leading/trailing dash. */
export function kebab(s: string): boolean {
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(s)
}

/** validId mirrors ext.validateID: owner.name, both segments kebab. */
export function validId(id: string): boolean {
  const segs = id.split(".")
  return segs.length === 2 && segs.every(kebab)
}

/**
 * parseSemver mirrors ext.parseSemver: strict MAJOR.MINOR.PATCH, a leading
 * "v" tolerated, plain numbers only (no leading zeros, no pre-release).
 * Returns null when invalid.
 */
export function parseSemver(s: string): [number, number, number] | null {
  const trimmed = s.trim().replace(/^v/, "")
  const parts = trimmed.split(".")
  if (parts.length !== 3) return null
  const nums: number[] = []
  for (const p of parts) {
    if (!/^(0|[1-9][0-9]*)$/.test(p)) return null
    nums.push(Number(p))
  }
  return [nums[0], nums[1], nums[2]]
}

/** parseManifest turns extension.yaml source into structured data. */
export function parseManifest(src: string): { manifest?: ManifestData; error?: string } {
  let data: unknown
  try {
    data = parseYAML(src)
  } catch (e) {
    return { error: `extension.yaml does not parse: ${e instanceof Error ? e.message : String(e)}` }
  }
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    return { error: "extension.yaml is not a YAML mapping" }
  }
  return { manifest: data as ManifestData }
}

/** wasmEntryOK mirrors the Go containment rule for wasm.entry. */
function wasmEntryOK(entry: string): boolean {
  if (!entry.endsWith(".wasm")) return false
  if (entry.startsWith("/") || entry.includes("\\") || /^[A-Za-z]:/.test(entry)) return false
  const segs = entry.split("/")
  return segs.every((s) => s !== "" && s !== "." && s !== "..")
}

/**
 * validateManifest mirrors Manifest.Validate. Returns every problem rather
 * than the first, because a submit wizard should show the whole list.
 */
export function validateManifest(m: ManifestData): string[] {
  const errors: string[] = []
  const id = m.id ?? ""
  if (!validId(id)) {
    errors.push(`invalid extension id ${JSON.stringify(id)}: want owner.name in lowercase kebab-case`)
  }
  if (!(m.name ?? "").trim()) {
    errors.push("extension has no name")
  }
  if (parseSemver(m.version ?? "") === null) {
    errors.push(`invalid version ${JSON.stringify(m.version ?? "")}: want MAJOR.MINOR.PATCH`)
  }

  const type = m.type ?? ""
  if (!KNOWN_TYPES.includes(type)) {
    errors.push(
      `extension type ${JSON.stringify(type)} is not supported yet — only declarative, mcp and wasm extensions install in this version`,
    )
  } else if (type === "" || type === "declarative") {
    if (m.mcp) errors.push("declarative extensions must not declare an mcp server")
    if (m.wasm) errors.push("declarative extensions must not declare a wasm module")
  } else if (type === "mcp") {
    if (!(m.mcp?.command ?? "").trim()) errors.push("mcp extensions must declare mcp.command")
    if (m.wasm) errors.push("mcp extensions must not declare a wasm module")
  } else if (type === "wasm") {
    const entry = (m.wasm?.entry ?? "").trim()
    if (!entry) {
      errors.push("wasm extensions must declare wasm.entry")
    } else if (!wasmEntryOK(entry)) {
      errors.push("wasm.entry must be a relative .wasm path inside the package")
    }
    if (m.mcp) errors.push("wasm extensions must not declare an mcp server")
  }

  const permissions = m.permissions ?? []
  if (permissions.length > 0 && type !== "wasm") {
    errors.push("permissions apply to wasm extensions only")
  }
  for (const p of permissions) {
    if (!KNOWN_PERMISSIONS.includes(p)) {
      errors.push(`permission ${JSON.stringify(p)} is not supported yet`)
    }
  }

  if ((m.minKaiokenVersion ?? "").trim() && parseSemver(m.minKaiokenVersion!) === null) {
    errors.push(`invalid minKaiokenVersion ${JSON.stringify(m.minKaiokenVersion)}`)
  }
  return errors
}

/** entryFromManifest builds the ready-to-paste index entry. */
export function entryFromManifest(m: ManifestData, repo: string): IndexEntry {
  const entry: IndexEntry = {
    id: m.id ?? "",
    repo,
    name: m.name ?? "",
    description: m.description ?? "",
    author: m.author ?? "",
    type: m.type && m.type !== "" ? m.type : "declarative",
  }
  if (m.type === "wasm" && (m.permissions ?? []).length > 0) {
    entry.permissions = m.permissions
  }
  return entry
}
