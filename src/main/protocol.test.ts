import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { fileUrl } from '../shared/files'
import { resolveFileRequest } from './protocol'

const FILES = path.resolve('C:/Users/teste/AppData/Roaming/Mello/arquivos')
const HASH = 'a'.repeat(32) + '0123456789abcdef0123456789abcdef'

describe('protocolo mello-arquivo://', () => {
  it('entrega um arquivo da pasta de arquivos pelo hash', () => {
    expect(resolveFileRequest(`mello-arquivo://arquivos/${HASH}.png`, FILES)).toBe(
      path.join(FILES, `${HASH}.png`)
    )
    expect(resolveFileRequest(fileUrl(HASH, 'pdf'), FILES)).toBe(path.join(FILES, `${HASH}.pdf`))
  })

  it.each([
    ['subir de pasta com ..', `mello-arquivo://arquivos/../mello.db`],
    ['subir de pasta codificado', `mello-arquivo://arquivos/%2e%2e/mello.db`],
    ['barra codificada', `mello-arquivo://arquivos/..%2fmello.db`],
    ['barra invertida', `mello-arquivo://arquivos/..\\mello.db`],
    ['caminho absoluto', `mello-arquivo://arquivos/C:/Windows/win.ini`],
    ['caminho absoluto codificado', `mello-arquivo://arquivos/C%3A%5CWindows%5Cwin.ini`],
    ['subpasta', `mello-arquivo://arquivos/sub/${HASH}.png`],
    ['hash curto', `mello-arquivo://arquivos/${HASH.slice(1)}.png`],
    ['hash com letra fora do hexadecimal', `mello-arquivo://arquivos/${HASH.slice(1)}g.png`],
    ['hash em maiúsculas', `mello-arquivo://arquivos/${HASH.toUpperCase()}.png`],
    ['sem extensão', `mello-arquivo://arquivos/${HASH}`],
    ['extensão inválida', `mello-arquivo://arquivos/${HASH}.p/g`],
    ['outro host', `mello-arquivo://outra/${HASH}.png`],
    ['host com usuário', `mello-arquivo://x@arquivos/${HASH}.png`],
    ['host com porta', `mello-arquivo://arquivos:8080/${HASH}.png`],
    ['outro protocolo', `file:///C:/Windows/win.ini`],
    ['endereço inválido', `não é um endereço`]
  ])('recusa: %s', (_caso, url) => {
    expect(resolveFileRequest(url, FILES)).toBeNull()
  })
})
