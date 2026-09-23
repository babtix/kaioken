import { BrowserWindow } from 'electron'
import { registerWindowIpc } from './window'
import { registerStudioIpc } from './studio'

export function registerAllIpc(mainWindow: BrowserWindow): void {
  registerWindowIpc(mainWindow)
  registerStudioIpc()
}
