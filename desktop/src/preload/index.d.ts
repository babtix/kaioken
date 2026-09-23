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
}

export interface StudioWindowApi {
  minimize: () => Promise<void>
  toggleMaximize: () => Promise<void>
  close: () => Promise<void>
  isMaximized: () => Promise<boolean>
  onMaximizedChange: (callback: (maximized: boolean) => void) => () => void
}

export interface StudioApi {
  window: StudioWindowApi
  studio: {
    ping: () => Promise<PingResult>
    getSystemInfo: () => Promise<SystemInfo>
  }
}

declare global {
  interface Window {
    api: StudioApi
  }
}
