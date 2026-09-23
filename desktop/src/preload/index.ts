import { contextBridge, ipcRenderer } from 'electron'

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

const api = {
  window: {
    minimize: (): Promise<void> => ipcRenderer.invoke('window:minimize'),
    toggleMaximize: (): Promise<void> => ipcRenderer.invoke('window:toggle-maximize'),
    close: (): Promise<void> => ipcRenderer.invoke('window:close'),
    isMaximized: (): Promise<boolean> => ipcRenderer.invoke('window:is-maximized'),
    onMaximizedChange: (callback: (maximized: boolean) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, isMax: boolean): void => callback(isMax)
      ipcRenderer.on('window:maximized-change', listener)
      return () => {
        ipcRenderer.removeListener('window:maximized-change', listener)
      }
    }
  },
  studio: {
    ping: (): Promise<PingResult> => ipcRenderer.invoke('studio:ping'),
    getSystemInfo: (): Promise<SystemInfo> => ipcRenderer.invoke('studio:get-system-info')
  }
}

try {
  contextBridge.exposeInMainWorld('api', api)
} catch (error) {
  console.error('Failed to expose preload API:', error)
}
