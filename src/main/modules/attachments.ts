// Anexos (ANX) e capa (CAP) do card. Anexar, remover e mudar a capa zeram o envelhecimento
// (ENV-05) e não entram na atividade (ATV-02 lista o que entra).
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { and, asc, desc, eq, isNotNull, like } from 'drizzle-orm'
import type { CardCover, SetCoverInput } from '../../shared/ipc/cards'
import type { Attachment, OpenResult } from '../../shared/ipc/files'
import { fileUrl } from '../../shared/files'
import { AppError } from '../../shared/result'
import type { Db, DbOrTx } from '../db/client'
import { attachment, card, file } from '../db/schema'
import { touch } from './activity'
import { storeFile, type FileStore } from './files'

// Extensões que o Windows executa. "Abrir" mostra o arquivo na pasta em vez de rodar (decidido
// em 23/10/2026).
const PROGRAMS = new Set([
  'exe',
  'com',
  'bat',
  'cmd',
  'msi',
  'msp',
  'msix',
  'appx',
  'ps1',
  'psm1',
  'vbs',
  'vbe',
  'vb',
  'js',
  'jse',
  'wsf',
  'wsh',
  'ws',
  'scr',
  'pif',
  'lnk',
  'hta',
  'cpl',
  'jar',
  'reg',
  'url',
  'inf',
  'msc',
  'sct',
  'chm',
  'application',
  'gadget',
  'appref-ms'
])

const nameExtension = (name: string) => path.extname(name).slice(1).toLowerCase()

function requireCard(db: DbOrTx, cardId: string) {
  const found = db
    .select({ id: card.id, coverKind: card.coverKind, coverValue: card.coverValue })
    .from(card)
    .where(eq(card.id, cardId))
    .get()
  if (!found) throw new AppError('NOT_FOUND', 'Card não encontrado.')
  return found
}

// A capa como a tela mostra (CAP-02). Uma imagem cujo arquivo não existe mais fica sem capa.
export function coverOf(
  kind: 'color' | 'image' | null,
  value: string | null,
  image: { ext: string | null; width: number | null; height: number | null } | null
): CardCover | null {
  if (kind === 'color' && value) return { kind: 'color', color: value }
  if (kind === 'image' && value && image?.ext) {
    return {
      kind: 'image',
      fileId: value,
      url: fileUrl(value, image.ext),
      width: image.width,
      height: image.height
    }
  }
  return null
}

// Anexos do card, do mais recente para o mais antigo.
export function attachmentsOf(db: DbOrTx, cardId: string): Attachment[] {
  return db
    .select({
      id: attachment.id,
      name: attachment.name,
      fileId: file.id,
      ext: file.ext,
      size: file.size,
      mime: file.mime,
      width: file.width,
      height: file.height,
      createdAt: attachment.createdAt
    })
    .from(attachment)
    .innerJoin(file, eq(attachment.fileId, file.id))
    .where(eq(attachment.cardId, cardId))
    .orderBy(desc(attachment.createdAt), asc(attachment.name))
    .all()
    .map(({ mime, ...row }) => {
      const isImage = mime.startsWith('image/') && row.width !== null
      return {
        ...row,
        isImage,
        url: isImage ? fileUrl(row.fileId, row.ext) : null,
        isProgram: PROGRAMS.has(nameExtension(row.name))
      }
    })
}

// ANX-01, ANX-02: copia os arquivos para a pasta do app (o mesmo conteúdo, uma vez só) e liga ao
// card com o nome original.
export async function add(
  db: Db,
  store: FileStore,
  cardId: string,
  picks: { path: string; name: string }[],
  now: number
): Promise<void> {
  requireCard(db, cardId)
  const stored: { fileId: string; name: string }[] = []
  for (const pick of picks) {
    const saved = await storeFile(db, store, pick.path, now)
    stored.push({ fileId: saved.id, name: pick.name })
  }
  db.transaction((tx) => {
    requireCard(tx, cardId)
    for (const { fileId, name } of stored) {
      tx.insert(attachment).values({ id: randomUUID(), cardId, fileId, name, createdAt: now }).run()
    }
    touch(tx, cardId, now)
  })
}

// ANX-04: tira o anexo do card. O arquivo continua na pasta até a limpeza dos arquivos sem uso
// (DAD-08, etapa 10). CAP-03: se ele era a capa (e nenhum outro anexo do card tem o mesmo
// arquivo), a capa sai junto.
export function remove(db: Db, attachmentId: string, now: number): void {
  db.transaction((tx) => {
    const found = tx.select().from(attachment).where(eq(attachment.id, attachmentId)).get()
    if (!found) throw new AppError('NOT_FOUND', 'Anexo não encontrado.')
    tx.delete(attachment).where(eq(attachment.id, attachmentId)).run()
    const owner = requireCard(tx, found.cardId)
    if (owner.coverKind === 'image' && owner.coverValue === found.fileId) {
      const same = tx
        .select({ id: attachment.id })
        .from(attachment)
        .where(and(eq(attachment.cardId, found.cardId), eq(attachment.fileId, found.fileId)))
        .get()
      if (!same) {
        tx.update(card)
          .set({ coverKind: null, coverValue: null })
          .where(eq(card.id, found.cardId))
          .run()
      }
    }
    touch(tx, found.cardId, now)
  })
}

// Um nome que o Windows aceita, com a extensão do arquivo guardado quando o nome não tem uma.
export function windowsName(name: string, ext: string): string {
  let safe = Array.from(name, (ch) => (ch < ' ' || '<>:"/\\|?*'.includes(ch) ? '_' : ch))
    .join('')
    .replace(/[. ]+$/, '')
    .trim()
  if (!safe) safe = 'anexo'
  if (/^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i.test(safe)) safe = `_${safe}`
  if (!path.extname(safe) && ext !== 'bin') safe = `${safe}.${ext}`
  const extension = path.extname(safe)
  return safe.length > 200 ? safe.slice(0, 200 - extension.length) + extension : safe
}

// ANX-03: abre uma cópia, só leitura, com o nome original, numa pasta temporária (decidido em
// 23/10/2026). O arquivo guardado nunca é aberto, para não mudar. Programa: mostra na pasta.
export async function open(
  db: DbOrTx,
  store: FileStore,
  attachmentId: string
): Promise<OpenResult> {
  const found = db
    .select({ name: attachment.name, fileId: file.id, ext: file.ext })
    .from(attachment)
    .innerJoin(file, eq(attachment.fileId, file.id))
    .where(eq(attachment.id, attachmentId))
    .get()
  if (!found) throw new AppError('NOT_FOUND', 'Anexo não encontrado.')
  const source = path.join(store.dir, `${found.fileId}.${found.ext}`)
  if (!fs.existsSync(source)) {
    throw new AppError('NOT_FOUND', 'O arquivo deste anexo não está mais na pasta do Mello.')
  }
  const folder = path.join(store.system.tempDir, attachmentId)
  await fs.promises.mkdir(folder, { recursive: true })
  const target = path.join(folder, windowsName(found.name, found.ext))
  try {
    await fs.promises.chmod(target, 0o644).catch(() => {})
    await fs.promises.copyFile(source, target)
  } catch (error) {
    // A cópia anterior está aberta num programa (o Windows trava o arquivo): usa ela.
    if (!fs.existsSync(target)) throw error
  }
  await fs.promises.chmod(target, 0o444).catch(() => {})

  if (PROGRAMS.has(nameExtension(target))) {
    store.system.showInFolder(target)
    return { shownInFolder: true }
  }
  const error = await store.system.openPath(target)
  if (error) throw new AppError('CONFLICT', `Não foi possível abrir “${found.name}”: ${error}`)
  return { shownInFolder: false }
}

function setCoverValue(
  tx: DbOrTx,
  cardId: string,
  next: { coverKind: 'color' | 'image' | null; coverValue: string | null },
  now: number
): void {
  const current = requireCard(tx, cardId)
  if (current.coverKind === next.coverKind && current.coverValue === next.coverValue) return
  tx.update(card).set(next).where(eq(card.id, cardId)).run()
  touch(tx, cardId, now)
}

// CAP-01: cor da paleta, imagem anexada ao card ou nenhuma. Mudar ou remover zera o
// envelhecimento (ENV-05); escolher a mesma não grava nada.
export function setCover(db: Db, cardId: string, cover: SetCoverInput['cover'], now: number): void {
  db.transaction((tx) => {
    if (cover?.kind === 'image') {
      const attached = tx
        .select({ id: attachment.id })
        .from(attachment)
        .innerJoin(file, eq(attachment.fileId, file.id))
        .where(
          and(
            eq(attachment.cardId, cardId),
            eq(file.id, cover.fileId),
            like(file.mime, 'image/%'),
            isNotNull(file.width)
          )
        )
        .get()
      if (!attached) {
        requireCard(tx, cardId)
        throw new AppError('CONFLICT', 'Escolha uma imagem anexada a este card.')
      }
    }
    const next =
      cover === null
        ? { coverKind: null, coverValue: null }
        : cover.kind === 'color'
          ? { coverKind: 'color' as const, coverValue: cover.color }
          : { coverKind: 'image' as const, coverValue: cover.fileId }
    setCoverValue(tx, cardId, next, now)
  })
}

// CAP-01: imagem enviada na hora. Fica só como capa (não vira anexo).
export async function uploadCover(
  db: Db,
  store: FileStore,
  cardId: string,
  source: string,
  now: number
): Promise<void> {
  requireCard(db, cardId)
  const saved = await storeFile(db, store, source, now, { imageOnly: true })
  db.transaction((tx) =>
    setCoverValue(tx, cardId, { coverKind: 'image', coverValue: saved.id }, now)
  )
}
