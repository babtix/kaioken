import { invoke } from "@tauri-apps/api/core"
import { listen } from "@tauri-apps/api/event"

export type DaemonInfo = { port: number; token: string; version: string }

/**
 * The /v1 contract shape this build was written against, checked at startup
 * against `/v1/health`'s `contract` field. It lives here, beside `base()` and
 * `authHeaders()`, because this is the file you touch when the contract moves.
 *
 * Keep it in step with `version.ContractVersion` in
 * `cli/internal/version/version.go`. R1 in docs/09-risks.md: an NSIS upgrade
 * can leave the old sidecar in place, and a vN app talking to a vN−1 daemon
 * fails as scattered 404s that look like front-end bugs.
 */
export const EXPECTED_CONTRACT = 4

let current: DaemonInfo | null = null

export async function bootstrap(): Promise<DaemonInfo> {
  current = await invoke<DaemonInfo>("daemon_info")
  return current
}

export function info(): DaemonInfo {
  if (!current) throw new Error("daemon not ready")
  return current
}

export function base(): string {
  if (!current) throw new Error("daemon not ready")
  return `http://127.0.0.1:${current.port}/v1`
}

export function authHeaders(): HeadersInit {
  if (!current) throw new Error("daemon not ready")
  return { Authorization: `Bearer ${current.token}`, "Content-Type": "application/json" }
}

/**
 * The daemon URL that renders `target` inside an iframe, with the origin's
 * framing restrictions stripped by the proxy.
 *
 * The token rides in the query string because an iframe's src cannot carry an
 * Authorization header. Everything here stays on loopback.
 */
export function proxyUrl(target: string): string {
  if (!current) throw new Error("daemon not ready")
  const q = new URLSearchParams({ url: target, token: current.token })
  return `http://127.0.0.1:${current.port}/v1/browser/proxy?${q}`
}

export function onDaemonUp(fn: (info: DaemonInfo) => void) {
  return listen<DaemonInfo>("daemon://up", (e) => {
    current = e.payload
    fn(e.payload)
  })
}

export function onDaemonDead(fn: (message: string) => void) {
  return listen<string>("daemon://dead", (e) => fn(e.payload))
}
