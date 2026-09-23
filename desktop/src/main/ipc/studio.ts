import os from 'os'
import { app, ipcMain } from 'electron'

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

export function registerStudioIpc(): void {
  ipcMain.handle('studio:ping', async () => {
    return {
      message: 'pong',
      timestamp: Date.now(),
      status: 'active'
    }
  })

  ipcMain.handle('studio:get-system-info', async (): Promise<SystemInfo> => {
    const totalMem = Math.round(os.totalmem() / (1024 * 1024))
    const freeMem = Math.round(os.freemem() / (1024 * 1024))

    return {
      platform: process.platform,
      arch: process.arch,
      osRelease: os.release(),
      cpuCount: os.cpus().length,
      totalMemoryMB: totalMem,
      freeMemoryMB: freeMem,
      electronVersion: process.versions.electron || 'unknown',
      nodeVersion: process.versions.node || 'unknown',
      chromeVersion: process.versions.chrome || 'unknown',
      appVersion: app.getVersion()
    }
  })
}
