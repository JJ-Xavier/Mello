// Registra no ipcMain as rotas de routes.ts. Erros inesperados vão para o log.
import { app, ipcMain } from 'electron'
import log from 'electron-log/main'
import type { Db } from '../db/client'
import type { FileStore } from '../modules/files'
import { createRoutes } from './routes'

export interface IpcContext {
  dataDir: string
  db: Db
  files: FileStore
}

export function registerIpc({ dataDir, db, files }: IpcContext): void {
  const routes = createRoutes({
    db,
    app: { version: app.getVersion(), dataDir, dev: !app.isPackaged },
    now: Date.now,
    files,
    onUnexpectedError: (channel, error) => log.error(`[ipc] ${channel}`, error)
  })
  for (const [channel, handler] of routes) {
    ipcMain.handle(channel, (_event, raw: unknown) => handler(raw))
  }
}
