// Registra no ipcMain as rotas de routes.ts. Erros inesperados vão para o log.
import { app, ipcMain } from 'electron'
import log from 'electron-log/main'
import type { Clock } from '../clock'
import type { Db } from '../db/client'
import type { DataService } from '../modules/data'
import type { FileStore } from '../modules/files'
import type { Scheduler } from '../scheduler'
import { createRoutes, type DesktopPort } from './routes'

export interface IpcContext {
  dataDir: string
  db: Db
  clock: Clock
  files: FileStore
  scheduler: Scheduler
  hideToTray: () => void
  data: DataService
  desktop: DesktopPort
}

export function registerIpc({
  dataDir,
  db,
  clock,
  files,
  scheduler,
  hideToTray,
  data,
  desktop
}: IpcContext): void {
  const routes = createRoutes({
    db,
    app: { version: app.getVersion(), dataDir, dev: !app.isPackaged },
    clock,
    files,
    scheduler,
    hideToTray,
    data,
    desktop,
    onUnexpectedError: (channel, error) => log.error(`[ipc] ${channel}`, error)
  })
  for (const [channel, handler] of routes) {
    ipcMain.handle(channel, (_event, raw: unknown) => handler(raw))
  }
}
