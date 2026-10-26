// window.mello de verdade para os testes da tela: as mesmas rotas do main (Zod + módulos) sobre
// um banco SQLite em memória. Só o transporte do Electron fica de fora; entradas e respostas
// passam por structuredClone, como passariam pelo IPC.
// Arquivos: uma pasta temporária e um Windows falso (createTestFiles); um File "solto" no modal só
// tem caminho se o teste o registrar com dropPath, como o webUtils do preload faria.
// Avisos do main (etapa 8): o teste dispara com emit, como o webContents.send faria. Os lembretes
// perdidos com o app fechado (LEM-06) são os que o teste põe em missed; a bandeja é anotada em
// hiddenToTray.
import { createClock } from '../../../main/clock'
import { createTestDb } from '../../../main/db/test-db'
import { createRoutes } from '../../../main/ipc/routes'
import { createTestFiles } from '../../../main/modules/test-files'
import { createApi, type EventPayloads, type MelloEvent } from '../../../shared/ipc/api'
import type { MissedReminder } from '../../../shared/ipc/recurrence'

// dev: o modo de desenvolvimento (relógio de teste); por padrão ligado, como no npm run dev.
export function installRealApi(options: { now?: () => number; dev?: boolean } = {}) {
  const { db } = createTestDb()
  const files = createTestFiles()
  const paths = new WeakMap<File, string>()
  const listeners = new Map<string, Set<(payload: unknown) => void>>()
  const missed: MissedReminder[] = []
  const tray = { hidden: 0 }
  const routes = createRoutes({
    db,
    app: { version: '0.8.0', dataDir: 'C:\\dados', dev: options.dev ?? true },
    clock: createClock(options.now),
    files: files.store,
    scheduler: { tick: () => {}, takeMissed: () => missed.splice(0) },
    hideToTray: () => tray.hidden++
  })
  window.mello = createApi(
    async (channel, input) => {
      const handler = routes.get(channel)
      if (!handler) throw new Error(`Canal desconhecido: ${channel}`)
      return structuredClone(await handler(structuredClone(input)))
    },
    (file) => paths.get(file) ?? '',
    (channel, listener) => {
      const set = listeners.get(channel) ?? new Set()
      set.add(listener)
      listeners.set(channel, set)
      return () => set.delete(listener)
    }
  )
  const dropPath = (file: File, path: string) => paths.set(file, path)
  const emit = <E extends MelloEvent>(event: E, payload?: EventPayloads[E]) => {
    for (const listener of listeners.get(event) ?? []) listener(structuredClone(payload))
  }
  return { db, api: window.mello, files, dropPath, emit, missed, tray }
}
