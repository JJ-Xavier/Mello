// Arquivos guardados pelo Mello em <pasta de dados>\arquivos\<sha256>.<ext> (ANX-01, ANX-02).
// O nome é o hash do conteúdo: o mesmo arquivo anexado duas vezes é guardado uma vez só, e um
// arquivo guardado nunca muda (o espelho do backup depende disso, DAD-05). Por isso "Abrir" abre
// uma cópia temporária (attachments.ts), nunca o arquivo guardado.
// Sem Electron: a janela do Windows e o "abrir com o programa padrão" chegam por SystemPort.
import { createHash, randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { eq } from 'drizzle-orm'
import { imageSize } from 'image-size'
import type { PickedFile } from '../../shared/ipc/files'
import { FILE_NAME_MAX } from '../../shared/limits'
import { AppError } from '../../shared/result'
import type { DbOrTx } from '../db/client'
import { file } from '../db/schema'

// O que o main usa do Windows. O index.ts passa a versão do Electron; os testes, uma falsa.
export interface SystemPort {
  // Janela "Abrir" do Windows. Devolve os caminhos escolhidos (nenhum, se cancelar).
  chooseFiles(options: { imagesOnly: boolean }): Promise<string[]>
  // Abre com o programa padrão. Devolve '' ou a mensagem de erro do Windows.
  openPath(target: string): Promise<string>
  // Abre o Explorer com o arquivo selecionado.
  showInFolder(target: string): void
  // Pasta das cópias abertas por "Abrir" (dentro da pasta temporária do Windows).
  tempDir: string
}

export interface FileStore {
  dir: string
  system: SystemPort
}

export type StoredFile = typeof file.$inferSelect

// Tamanho lido do começo do arquivo para reconhecer uma imagem. O tamanho de um JPEG fica depois
// dos metadados (EXIF, ICC), que raramente passam de algumas centenas de KB.
const HEAD_BYTES = 2 * 1024 * 1024

const IMAGE_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp'
}

const OTHER_MIME: Record<string, string> = {
  pdf: 'application/pdf',
  txt: 'text/plain',
  csv: 'text/csv',
  md: 'text/markdown',
  json: 'application/json',
  zip: 'application/zip',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  mp3: 'audio/mpeg',
  mp4: 'video/mp4',
  svg: 'image/svg+xml'
}

// A extensão do nome, em minúsculas, para o nome do arquivo guardado (o protocolo aceita só
// [a-z0-9], até 10). Sem extensão válida: "bin".
export function extensionOf(name: string): string {
  const ext = path.extname(name).slice(1).toLowerCase()
  return /^[a-z0-9]{1,10}$/.test(ext) ? ext : 'bin'
}

// Reconhece uma imagem pelo conteúdo, não pelo nome. Foto de celular girada (EXIF 5 a 8) tem a
// largura e a altura trocadas, que é como o Chromium a mostra.
export function sniffImage(
  head: Uint8Array
): { ext: string; mime: string; width: number; height: number } | null {
  try {
    const size = imageSize(head)
    const mime = size.type ? IMAGE_MIME[size.type] : undefined
    if (!mime || !size.type || !size.width || !size.height) return null
    const turned = (size.orientation ?? 1) >= 5
    return {
      ext: size.type,
      mime,
      width: turned ? size.height : size.width,
      height: turned ? size.width : size.height
    }
  } catch {
    return null
  }
}

async function readHead(target: string): Promise<Uint8Array> {
  const handle = await fs.promises.open(target, 'r')
  try {
    const buffer = Buffer.alloc(HEAD_BYTES)
    const { bytesRead } = await handle.read(buffer, 0, HEAD_BYTES, 0)
    return buffer.subarray(0, bytesRead)
  } finally {
    await handle.close()
  }
}

// Copia para um nome provisório na pasta de arquivos e calcula o hash na mesma leitura. Assim o
// hash é sempre o do que foi copiado, mesmo que o original mude no meio.
async function copyWithHash(source: string, dir: string): Promise<{ hash: string; temp: string }> {
  const temp = path.join(dir, `${randomUUID()}.tmp`)
  const hash = createHash('sha256')
  await pipeline(
    fs.createReadStream(source),
    new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        hash.update(chunk)
        callback(null, chunk)
      }
    }),
    fs.createWriteStream(temp, { flags: 'wx' })
  )
  return { hash: hash.digest('hex'), temp }
}

// Guarda o arquivo (ou reaproveita o já guardado com o mesmo conteúdo) e devolve a linha de file.
// imageOnly: recusa o que não for imagem (capa enviada na hora, CAP-01).
export async function storeFile(
  db: DbOrTx,
  store: FileStore,
  source: string,
  now: number,
  options: { imageOnly?: boolean } = {}
): Promise<StoredFile> {
  const notImage = new AppError('INVALID_INPUT', 'Escolha uma imagem PNG, JPG, GIF, WebP ou BMP.')
  const { hash, temp } = await copyWithHash(source, store.dir)
  try {
    const known = db.select().from(file).where(eq(file.id, hash)).get()
    if (known) {
      if (options.imageOnly && !known.mime.startsWith('image/')) throw notImage
      // O registro existe mas o arquivo sumiu da pasta: volta a cópia.
      const target = path.join(store.dir, `${known.id}.${known.ext}`)
      if (!fs.existsSync(target)) await fs.promises.rename(temp, target)
      return known
    }
    const image = sniffImage(await readHead(temp))
    if (options.imageOnly && !image) throw notImage
    const ext = image?.ext ?? extensionOf(source)
    const { size } = await fs.promises.stat(temp)
    await fs.promises.rename(temp, path.join(store.dir, `${hash}.${ext}`))
    db.insert(file)
      .values({
        id: hash,
        ext,
        mime: image?.mime ?? OTHER_MIME[ext] ?? 'application/octet-stream',
        size,
        width: image?.width ?? null,
        height: image?.height ?? null,
        createdAt: now
      })
      .onConflictDoNothing()
      .run()
    return db.select().from(file).where(eq(file.id, hash)).get()!
  } finally {
    await fs.promises.rm(temp, { force: true })
  }
}

interface Pick {
  path: string
  name: string
  size: number
}

// Arquivos escolhidos ou soltos, à espera de a tela confirmar (ANX-05). A tela recebe só a ficha;
// o caminho fica aqui. As fichas mais antigas saem quando passam de `max`.
export function createPicks(max = 200) {
  const picks = new Map<string, Pick>()
  return {
    async register(paths: string[]): Promise<PickedFile[]> {
      const registered: PickedFile[] = []
      for (const candidate of paths) {
        if (!path.isAbsolute(candidate)) continue
        const stat = await fs.promises.stat(candidate).catch(() => null)
        if (!stat?.isFile()) continue
        const token = randomUUID()
        const name = path.basename(candidate).slice(0, FILE_NAME_MAX)
        picks.set(token, { path: candidate, name, size: stat.size })
        registered.push({ token, name, size: stat.size })
      }
      for (const token of picks.keys()) {
        if (picks.size <= max) break
        picks.delete(token)
      }
      return registered
    },
    // Usa as fichas (cada uma vale uma vez). Ficha desconhecida: o arquivo precisa ser escolhido
    // de novo.
    take(tokens: string[]): Pick[] {
      const found = tokens.map((token) => picks.get(token))
      for (const token of tokens) picks.delete(token)
      if (found.some((pick) => pick === undefined)) {
        throw new AppError('NOT_FOUND', 'Escolha o arquivo de novo.')
      }
      return found as Pick[]
    }
  }
}

export type Picks = ReturnType<typeof createPicks>
