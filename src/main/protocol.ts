// Protocolo mello-arquivo://arquivos/<sha256>.<ext>: entrega à tela as imagens e os anexos guardados
// em %APPDATA%\Mello\arquivos, e nada além disso. Qualquer endereço fora do formato vira 404.
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { net, protocol } from 'electron'
import { FILE_HOST, FILE_SCHEME } from '../shared/files'

const FILE_NAME = /^[a-f0-9]{64}\.[a-z0-9]{1,10}$/

// Precisa ser chamado antes de o app ficar pronto (app.whenReady).
export function registerFileSchemeAsPrivileged(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: FILE_SCHEME,
      privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true }
    }
  ])
}

// Converte o endereço pedido pela tela no caminho do arquivo, ou null se ele não for válido.
export function resolveFileRequest(url: string, filesDir: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  if (parsed.protocol !== `${FILE_SCHEME}:`) return null
  if (parsed.host !== FILE_HOST || parsed.username !== '' || parsed.password !== '') return null

  const name = parsed.pathname.slice(1)
  if (!FILE_NAME.test(name)) return null

  const base = path.resolve(filesDir)
  const full = path.resolve(base, name)
  if (path.dirname(full) !== base) return null
  return full
}

export function registerFileProtocol(filesDir: string): void {
  protocol.handle(FILE_SCHEME, async (request) => {
    const full = resolveFileRequest(request.url, filesDir)
    if (full === null) return new Response('Não encontrado', { status: 404 })
    try {
      return await net.fetch(pathToFileURL(full).toString())
    } catch {
      return new Response('Não encontrado', { status: 404 })
    }
  })
}
