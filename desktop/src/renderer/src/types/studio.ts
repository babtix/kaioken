export interface SystemInfo {
  platform: string
  arch: string
  osRelease: string
  cpuCount: number
  totalMemoryMB: number
  freeMemoryMB: number
  electronVersion: string
  nodeVersion: string
  chromeVersion: string
  appVersion: string
}

export interface PingResult {
  message: string
  timestamp: number
  status: string
  latencyMs?: number
}

export interface StarterModule {
  id: string
  title: string
  description: string
  tag: string
  icon: string
  path: string
}
