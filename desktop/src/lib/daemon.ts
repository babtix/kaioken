import { invoke } from "@tauri-apps/api/core"
import { listen } from "@tauri-apps/api/event"

export type DaemonInfo = { port: number; token: string; version: string }

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

export function onDaemonUp(fn: (info: DaemonInfo) => void) {
  return listen<DaemonInfo>("daemon://up", (e) => {
    current = e.payload
    fn(e.payload)
  })
}

export function onDaemonDead(fn: (message: string) => void) {
  return listen<string>("daemon://dead", (e) => fn(e.payload))
}
