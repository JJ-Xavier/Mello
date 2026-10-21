// Liga cada canal de IPC a um módulo (valida → chama → Result). Os canais estão listados em
// src/shared/ipc/api.ts e no Docs/PLANO.md, seção 4.
import { app, ipcMain } from 'electron'
import log from 'electron-log/main'
import { z } from 'zod'
import { CHANNELS, type AppInfo } from '../../shared/ipc/api'
import { createHandler } from './handler'

function handle<S extends z.ZodType, T>(
  channel: string,
  schema: S,
  fn: (input: z.output<S>) => T | Promise<T>
): void {
  const handler = createHandler(schema, fn, (error) => log.error(`[ipc] ${channel}`, error))
  ipcMain.handle(channel, (_event, raw: unknown) => handler(raw))
}

export interface IpcContext {
  dataDir: string
}

export function registerIpc(context: IpcContext): void {
  handle(CHANNELS.appInfo, z.undefined(), (): AppInfo => ({
    version: app.getVersion(),
    dataDir: context.dataDir,
    dev: !app.isPackaged
  }))
}
