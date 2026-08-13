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

/**
 * Whether the app is running inside Tauri rather than a plain browser tab.
 *
 * `__TAURI_INTERNALS__` is what `@tauri-apps/api` itself dispatches on, so
 * this answers the only question that matters: will an `invoke`, `listen` or
 * `getCurrentWindow` call find a host to talk to. In a packaged build it is
 * always true, so every guard below collapses to the behaviour that shipped.
 *
 * The point of asking is `devOverride()` — pointing a browser at a manually
 * run daemon is documented as supported, but the app used to crash on the
 * first `listen()` long before that override could pay off.
 */
export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window
}

/** Unsubscribe stand-in for listeners that are never attached. */
const noopUnlisten = async () => {}

/**
 * Point the UI at a manually-run daemon: `?port=7788&token=…`.
 *
 * Dev builds only — `import.meta.env.DEV` is a compile-time constant, so this
 * whole branch is dropped from a production bundle rather than shipping a way
 * to redirect the app at an arbitrary endpoint. It exists so the showcase
 * entry and a plain browser can exercise real endpoints without Tauri.
 */
function devOverride(): DaemonInfo | null {
  if (!import.meta.env.DEV) return null
  const q = new URLSearchParams(window.location.search)
  const port = Number(q.get("port"))
  const token = q.get("token")
  if (!port || !token) return null
  return { port, token, version: "dev" }
}

export async function bootstrap(): Promise<DaemonInfo> {
  const override = devOverride()
  if (override) {
    current = override
    return current
  }
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

// Both daemon lifecycle events come from Rust. In a browser there is no
// supervisor to restart a sidecar and nothing to emit them, so there is
// nothing to listen to — and calling listen() there throws before the app
// ever renders.
export function onDaemonUp(fn: (info: DaemonInfo) => void) {
  if (!isTauri()) return noopUnlisten()
  return listen<DaemonInfo>("daemon://up", (e) => {
    current = e.payload
    fn(e.payload)
  })
}

export function onDaemonDead(fn: (message: string) => void) {
  if (!isTauri()) return noopUnlisten()
  return listen<string>("daemon://dead", (e) => fn(e.payload))
}
