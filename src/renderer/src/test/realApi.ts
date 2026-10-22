// window.mello de verdade para os testes da tela: as mesmas rotas do main (Zod + módulos) sobre
// um banco SQLite em memória. Só o transporte do Electron fica de fora; entradas e respostas
// passam por structuredClone, como passariam pelo IPC.
import { createTestDb } from '../../../main/db/test-db'
import { createRoutes } from '../../../main/ipc/routes'
import { createApi } from '../../../shared/ipc/api'

export function installRealApi(options: { now?: () => number } = {}) {
  const { db } = createTestDb()
  const routes = createRoutes({
    db,
    app: { version: '0.2.0', dataDir: 'C:\\dados', dev: true },
    now: options.now ?? Date.now
  })
  window.mello = createApi(async (channel, input) => {
    const handler = routes.get(channel)
    if (!handler) throw new Error(`Canal desconhecido: ${channel}`)
    return structuredClone(await handler(structuredClone(input)))
  })
  return { db, api: window.mello }
}
