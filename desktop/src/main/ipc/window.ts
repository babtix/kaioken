import { BrowserWindow, ipcMain } from 'electron'

export function registerWindowIpc(mainWindow: BrowserWindow): void {
  ipcMain.handle('window:minimize', () => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.minimize()
    }
  })

  ipcMain.handle('window:toggle-maximize', () => {
    if (!mainWindow.isDestroyed()) {
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize()
      } else {
        mainWindow.maximize()
      }
    }
  })

  ipcMain.handle('window:close', () => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.close()
    }
  })

  ipcMain.handle('window:is-maximized', () => {
    return mainWindow.isDestroyed() ? false : mainWindow.isMaximized()
  })

  mainWindow.on('maximize', () => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send('window:maximized-change', true)
    }
  })

  mainWindow.on('unmaximize', () => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send('window:maximized-change', false)
    }
  })
}
