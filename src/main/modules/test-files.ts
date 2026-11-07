// Pasta de arquivos temporária e um SystemPort falso, para os testes. Só os testes importam este
// arquivo. A janela "Abrir" devolve o que o teste pôs em `chosen`, e a de escolher pasta, o que pôs
// em `folders` (null é cancelar); abrir e mostrar na pasta só ficam anotados. A pasta do app (root)
// tem a pasta de arquivos (dir); os testes de dados criam o banco e os backups nela.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { FileStore } from './files'

export function createTestFiles() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mello-teste-'))
  const dir = path.join(root, 'arquivos')
  const outside = path.join(root, 'fora')
  fs.mkdirSync(dir)
  fs.mkdirSync(outside)
  const chosen: string[][] = []
  const folders: (string | null)[] = []
  const opened: string[] = []
  const shown: string[] = []
  const store: FileStore = {
    dir,
    system: {
      tempDir: path.join(root, 'abertos'),
      chooseFiles: async () => chosen.shift() ?? [],
      chooseFolder: async () => folders.shift() ?? null,
      openPath: async (target) => {
        opened.push(target)
        return ''
      },
      showInFolder: (target) => {
        shown.push(target)
      }
    }
  }
  return {
    store,
    root,
    dir,
    chosen,
    folders,
    opened,
    shown,
    // Cria um arquivo "do usuário", fora da pasta do Mello, e devolve o caminho.
    sample(name: string, content: string | Uint8Array): string {
      const target = path.join(outside, name)
      fs.writeFileSync(target, content)
      return target
    },
    stored: () => fs.readdirSync(dir),
    cleanup: () => fs.rmSync(root, { recursive: true, force: true })
  }
}

// PNG de 1 × 1 pixel, para os testes de imagem.
export const PNG_1X1 = Uint8Array.from(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64'
  )
)

// Cabeçalho de JPEG com o tamanho e a orientação EXIF (6 = foto de celular girada 90°). Não tem
// pixels: basta para o main ler o tamanho.
export function jpegHeader(width: number, height: number, orientation: number): Uint8Array {
  const u16 = (n: number) => [(n >> 8) & 0xff, n & 0xff]
  const tiff = [
    ...[0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08],
    ...u16(1),
    ...[0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, ...u16(orientation), 0x00, 0x00],
    ...[0x00, 0x00, 0x00, 0x00]
  ]
  const exif = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00, ...tiff]
  const sof = [0x08, ...u16(height), ...u16(width), 0x03, ...Array(9).fill(0x11)]
  return Uint8Array.from([
    ...[0xff, 0xd8],
    ...[0xff, 0xe1, ...u16(exif.length + 2), ...exif],
    ...[0xff, 0xc0, ...u16(sof.length + 2), ...sof],
    ...[0xff, 0xd9]
  ])
}
