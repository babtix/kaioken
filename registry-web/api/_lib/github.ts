// Read-only GitHub access. Everything this module touches is public data;
// GITHUB_TOKEN only raises the rate limit. The fetcher is injectable so
// tests never hit the network.

import type { IndexEntry, ReleaseInfo } from "./types.js"

export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>

const API_BASE = "https://api.github.com"
const RAW_BASE = "https://raw.githubusercontent.com"

/** The canonical community index — the same URL the Kaioken CLI fetches. */
export const INDEX_URL = `${RAW_BASE}/babtix/kaioken-extensions/main/community-extensions.json`

/**
 * validRepo gates every URL this module builds. Only GitHub's own
 * owner/name character set passes, so request-supplied repo strings can
 * never smuggle paths, hosts or query strings into an outbound URL.
 */
export function validRepo(repo: string): boolean {
  const parts = repo.split("/")
  if (parts.length !== 2) return false
  return parts.every((p) => p !== "" && p !== "." && p !== ".." && /^[A-Za-z0-9._-]+$/.test(p))
}

/** Release tags reach raw-file URLs too, so they get the same gate. */
function validRef(ref: string): boolean {
  return /^[A-Za-z0-9._/-]+$/.test(ref) && !ref.includes("..") && !ref.startsWith("/")
}

function ghHeaders(): Record<string, string> {
  const h: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "kaioken-registry-web",
  }
  const token = process.env.GITHUB_TOKEN
  if (token) h.Authorization = `Bearer ${token}`
  return h
}

function assertRepo(repo: string) {
  if (!validRepo(repo)) throw new Error(`invalid repo ${JSON.stringify(repo)}`)
}

/** Fetches the community index. Throws when the registry is unreachable. */
export async function fetchIndex(f: Fetcher = fetch): Promise<IndexEntry[]> {
  const resp = await f(INDEX_URL, { headers: ghHeaders() })
  if (!resp.ok) throw new Error(`registry index: ${resp.status}`)
  const entries = (await resp.json()) as IndexEntry[]
  if (!Array.isArray(entries)) throw new Error("registry index is not a JSON array")
  return entries
}

type ghRelease = {
  tag_name?: string
  name?: string
  published_at?: string
  body?: string
  assets?: { download_count?: number }[]
}

function toReleaseInfo(r: ghRelease): ReleaseInfo {
  return {
    tag: r.tag_name ?? "",
    name: r.name ?? r.tag_name ?? "",
    published_at: r.published_at ?? "",
    notes: (r.body ?? "").slice(0, 4000),
    downloads: (r.assets ?? []).reduce((n, a) => n + (a.download_count ?? 0), 0),
  }
}

/** Latest release, or null when the repo has none. Throws on other failures. */
export async function fetchLatestRelease(repo: string, f: Fetcher = fetch): Promise<ReleaseInfo | null> {
  assertRepo(repo)
  const resp = await f(`${API_BASE}/repos/${repo}/releases/latest`, { headers: ghHeaders() })
  if (resp.status === 404) return null
  if (!resp.ok) throw new Error(`GitHub ${resp.status} for ${repo}`)
  return toReleaseInfo((await resp.json()) as ghRelease)
}

/** Recent releases, newest first; empty when there are none. */
export async function fetchReleases(repo: string, f: Fetcher = fetch): Promise<ReleaseInfo[]> {
  assertRepo(repo)
  const resp = await f(`${API_BASE}/repos/${repo}/releases?per_page=20`, { headers: ghHeaders() })
  if (resp.status === 404) return []
  if (!resp.ok) throw new Error(`GitHub ${resp.status} for ${repo}`)
  const list = (await resp.json()) as ghRelease[]
  return (Array.isArray(list) ? list : []).map(toReleaseInfo)
}

/** One file at a ref via raw.githubusercontent.com; null when absent. */
export async function fetchRawFile(repo: string, ref: string, path: string, f: Fetcher = fetch): Promise<string | null> {
  assertRepo(repo)
  if (!validRef(ref)) throw new Error(`invalid ref ${JSON.stringify(ref)}`)
  const resp = await f(`${RAW_BASE}/${repo}/${ref}/${path}`, { headers: ghHeaders() })
  if (resp.status === 404) return null
  if (!resp.ok) throw new Error(`GitHub ${resp.status} for ${repo}/${path}`)
  return resp.text()
}

/** The repo's rendered-source README (default branch); null when absent. */
export async function fetchReadme(repo: string, f: Fetcher = fetch): Promise<string | null> {
  assertRepo(repo)
  const resp = await f(`${API_BASE}/repos/${repo}/readme`, {
    headers: { ...ghHeaders(), Accept: "application/vnd.github.raw+json" },
  })
  if (resp.status === 404) return null
  if (!resp.ok) throw new Error(`GitHub ${resp.status} for ${repo} readme`)
  return resp.text()
}

/** Every path in the tree at ref; null when the tree cannot be listed. */
export async function fetchTreePaths(repo: string, ref: string, f: Fetcher = fetch): Promise<string[] | null> {
  assertRepo(repo)
  if (!validRef(ref)) throw new Error(`invalid ref ${JSON.stringify(ref)}`)
  const resp = await f(`${API_BASE}/repos/${repo}/git/trees/${encodeURIComponent(ref)}?recursive=1`, {
    headers: ghHeaders(),
  })
  if (!resp.ok) return null
  const data = (await resp.json()) as { tree?: { path?: string }[] }
  return (data.tree ?? []).map((t) => t.path ?? "").filter(Boolean)
}
