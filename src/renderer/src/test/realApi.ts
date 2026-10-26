// window.mello de verdade para os testes da tela: as mesmas rotas do main (Zod + módulos) sobre
// um banco SQLite em memória. Só o transporte do Electron fica de fora; entradas e respostas
// passam por structuredClone, como passariam pelo IPC.
// Arquivos: uma pasta temporária e um Windows falso (createTestFiles); um File "solto" no modal só
// tem caminho se o teste o registrar com dropPath, como o webUtils do preload faria.
import { createClock } from '../../../main/clock'
import { createTestDb } from '../../../main/db/test-db'
import { createRoutes } from '../../../main/ipc/routes'
import { createTestFiles } from '../../../main/modules/test-files'
import { createApi } from '../../../shared/ipc/api'

// dev: o modo de desenvolvimento (relógio de teste); por padrão ligado, como no npm run dev.
export function installRealApi(options: { now?: () => number; dev?: boolean } = {}) {
  const { db } = createTestDb()
  const files = createTestFiles()
  const paths = new WeakMap<File, string>()
  const routes = createRoutes({
    db,
    app: { version: '0.7.1', dataDir: 'C:\\dados', dev: options.dev ?? true },
    clock: createClock(options.now),
    files: files.store
  })
  window.mello = createApi(
    async (channel, input) => {
      const handler = routes.get(channel)
      if (!handler) throw new Error(`Canal desconhecido: ${channel}`)
      return structuredClone(await handler(structuredClone(input)))
    },
    (file) => paths.get(file) ?? ''
  )
  const dropPath = (file: File, path: string) => paths.set(file, path)
  return { db, api: window.mello, files, dropPath }
}
