// window.mello de verdade para os testes da tela: as mesmas rotas do main (Zod + módulos) sobre
// um banco SQLite em memória. Só o transporte do Electron fica de fora; entradas e respostas
// passam por structuredClone, como passariam pelo IPC.
// Arquivos: uma pasta temporária e um Windows falso (createTestFiles); um File "solto" no modal só
// tem caminho se o teste o registrar com dropPath, como o webUtils do preload faria.
// Avisos do main (etapa 8): o teste dispara com emit, como o webContents.send faria. Os lembretes
// perdidos com o app fechado (LEM-06) são os que o teste põe em missed; a bandeja é anotada em
// hiddenToTray.
// Dados e backup (etapa 10): o serviço de verdade, com a pasta de dados dentro da pasta temporária;
// fechar o banco e reiniciar o app só ficam contados em lifecycle. O tema: o prefers-color-scheme
// segue o tema que o main passou ao Chromium, e o do Windows em "Igual ao sistema" (setWindowsDark).
import path from 'node:path'
import { createClock } from '../../../main/clock'
import { createTestDb } from '../../../main/db/test-db'
import { createRoutes } from '../../../main/ipc/routes'
import { createData } from '../../../main/modules/data'
import { createTestFiles } from '../../../main/modules/test-files'
import { dataPaths } from '../../../main/paths'
import { createApi, EVENTS, type EventPayloads, type MelloEvent } from '../../../shared/ipc/api'
import type { MissedReminder } from '../../../shared/ipc/recurrence'
import type { Theme } from '../../../shared/ipc/settings'

// dev: o modo de desenvolvimento (relógio de teste); por padrão ligado, como no npm run dev.
export function installRealApi(options: { now?: () => number; dev?: boolean } = {}) {
  const { sqlite, db } = createTestDb()
  const files = createTestFiles()
  const paths = dataPaths(files.root)
  const listeners = new Map<string, Set<(payload: unknown) => void>>()
  const emit = <E extends MelloEvent>(event: E, payload?: EventPayloads[E]) => {
    for (const listener of listeners.get(event) ?? []) listener(structuredClone(payload))
  }
  const filePaths = new WeakMap<File, string>()
  const missed: MissedReminder[] = []
  const tray = { hidden: 0 }
  const lifecycle = { shutdowns: 0, restarts: 0 }
  const clock = createClock(options.now)

  const theme = { source: 'dark' as Theme, windowsDark: true, autoStart: [] as boolean[] }
  const media = new Set<() => void>()
  const changed = () => media.forEach((listener) => listener())
  window.matchMedia = ((query: string) => ({
    media: query,
    get matches() {
      return theme.source === 'system' ? theme.windowsDark : theme.source === 'dark'
    },
    addEventListener: (_type: string, listener: () => void) => media.add(listener),
    removeEventListener: (_type: string, listener: () => void) => media.delete(listener)
  })) as unknown as typeof window.matchMedia
  const setWindowsDark = (dark: boolean) => {
    theme.windowsDark = dark
    changed()
  }

  const data = createData({
    sqlite,
    db,
    paths,
    now: () => clock.now(),
    version: '0.10.0',
    exportsDefault: path.join(files.root, 'documentos'),
    appData: files.root,
    shutdown: () => lifecycle.shutdowns++,
    restart: () => lifecycle.restarts++,
    onNotice: () => emit(EVENTS.backupNotice)
  })
  const routes = createRoutes({
    db,
    app: { version: '0.10.0', dataDir: paths.root, dev: options.dev ?? true },
    clock,
    files: files.store,
    scheduler: { tick: () => {}, takeMissed: () => missed.splice(0) },
    hideToTray: () => tray.hidden++,
    data,
    desktop: {
      applyTheme: (next) => {
        theme.source = next
        changed()
      },
      setAutoStart: (enabled) => theme.autoStart.push(enabled)
    }
  })
  window.mello = createApi(
    async (channel, input) => {
      const handler = routes.get(channel)
      if (!handler) throw new Error(`Canal desconhecido: ${channel}`)
      return structuredClone(await handler(structuredClone(input)))
    },
    (file) => filePaths.get(file) ?? '',
    (channel, listener) => {
      const set = listeners.get(channel) ?? new Set()
      set.add(listener)
      listeners.set(channel, set)
      return () => set.delete(listener)
    }
  )
  const dropPath = (file: File, target: string) => filePaths.set(file, target)
  return {
    db,
    api: window.mello,
    files,
    paths,
    data,
    dropPath,
    emit,
    missed,
    tray,
    lifecycle,
    theme,
    setWindowsDark
  }
}
