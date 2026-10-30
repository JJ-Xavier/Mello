// Quadros (QUA) e o fundo do quadro (FUN). Todas as funções recebem o "agora" por parâmetro.
import { randomUUID } from 'node:crypto'
import { and, asc, desc, eq, isNotNull, isNull, max, sql } from 'drizzle-orm'
import { fileUrl } from '../../shared/files'
import type {
  ArchivedItems,
  BackgroundImage,
  BoardDetail,
  BoardSummary,
  ListSummary,
  SetBackgroundInput
} from '../../shared/ipc/boards'
import { AppError } from '../../shared/result'
import {
  BACKGROUND_DEFAULTS,
  BACKGROUND_IMAGE_EXTENSIONS,
  BACKGROUND_IMAGE_MAX_BYTES,
  DEFAULT_BACKGROUND
} from '../../shared/rules/background'
import { agingTone, toneForBackground } from '../../shared/rules/tone'
import type { Db, DbOrTx } from '../db/client'
import { board, card, file, list } from '../db/schema'
import { summariesByList } from './cards'
import { sniffFile, storeFile, type FileStore } from './files'
import { createDefaultLabels } from './labels'
import { keyAfter, keyAt, keysFor, rebalance, visibleIndex } from './position'

// QUA-02: as 4 listas do quadro novo. Concluído e Entregue são listas de conclusão e não envelhecem.
export const DEFAULT_LISTS = [
  { title: 'A fazer', isDoneList: false, freezesAging: false },
  { title: 'Em andamento', isDoneList: false, freezesAging: false },
  { title: 'Concluído', isDoneList: true, freezesAging: true },
  { title: 'Entregue', isDoneList: true, freezesAging: true }
]

const summaryColumns = {
  id: board.id,
  title: board.title,
  position: board.position,
  isFavorite: board.isFavorite,
  isTemplate: board.isTemplate,
  closedAt: board.closedAt,
  bgKind: board.bgKind,
  bgValue: board.bgValue,
  bgAuto: board.bgAuto,
  bgFocus: board.bgFocus,
  bgZoom: board.bgZoom,
  bgDim: board.bgDim,
  bgBlur: board.bgBlur,
  fileExt: file.ext,
  fileWidth: file.width,
  fileHeight: file.height
}

// Os quadros com o fundo: a imagem vem da tabela de arquivos (o endereço e o tamanho).
function selectSummaries(db: DbOrTx) {
  return db
    .select(summaryColumns)
    .from(board)
    .leftJoin(file, and(eq(board.bgKind, 'image'), eq(file.id, board.bgValue)))
}

type SummaryRow = NonNullable<ReturnType<ReturnType<typeof selectSummaries>['get']>>

function toSummary(row: SummaryRow): BoardSummary {
  const ext = row.bgKind === 'image' ? row.fileExt : null
  return {
    id: row.id,
    title: row.title,
    position: row.position,
    isFavorite: row.isFavorite,
    isTemplate: row.isTemplate,
    closedAt: row.closedAt,
    background: {
      kind: row.bgKind,
      value: row.bgValue,
      url: ext ? fileUrl(row.bgValue, ext) : null,
      width: ext ? row.fileWidth : null,
      height: ext ? row.fileHeight : null,
      auto: row.bgAuto,
      focus: row.bgFocus,
      zoom: row.bgZoom,
      dim: row.bgDim,
      blur: row.bgBlur
    }
  }
}

export function summaryOf(db: DbOrTx, boardId: string): BoardSummary {
  return toSummary(selectSummaries(db).where(eq(board.id, boardId)).get()!)
}

function requireBoard(db: DbOrTx, boardId: string) {
  const found = db.select().from(board).where(eq(board.id, boardId)).get()
  if (!found) throw new AppError('NOT_FOUND', 'Quadro não encontrado.')
  return found
}

// Quadros abertos do Início e de "Mudar de quadros": favoritos primeiro e, dentro de cada grupo,
// a ordem manual (QUA-06). Modelos ficam de fora (listTemplates).
export function listOpen(db: DbOrTx): BoardSummary[] {
  return selectSummaries(db)
    .where(and(isNull(board.closedAt), eq(board.isTemplate, false)))
    .orderBy(desc(board.isFavorite), asc(board.position))
    .all()
    .map(toSummary)
}

// MOD-04: os quadros-modelo abertos, para a seção "Modelos" do Início, na ordem manual.
export function listTemplates(db: DbOrTx): BoardSummary[] {
  return selectSummaries(db)
    .where(and(isNull(board.closedAt), eq(board.isTemplate, true)))
    .orderBy(asc(board.position))
    .all()
    .map(toSummary)
}

// "Ver todos os quadros fechados" (QUA-04), do fechado mais recente para o mais antigo.
export function listClosed(db: DbOrTx): BoardSummary[] {
  return selectSummaries(db)
    .where(isNotNull(board.closedAt))
    .orderBy(desc(board.closedAt))
    .all()
    .map(toSummary)
}

// Listas ativas do quadro, em ordem, com a quantidade de cards ativos de cada uma (LIS-09).
export function activeLists(db: DbOrTx, boardId: string): ListSummary[] {
  return db
    .select({
      id: list.id,
      boardId: list.boardId,
      title: list.title,
      position: list.position,
      freezesAging: list.freezesAging,
      isDoneList: list.isDoneList,
      cardCount: sql<number>`count(${card.id})`.mapWith(Number)
    })
    .from(list)
    .leftJoin(card, and(eq(card.listId, list.id), isNull(card.archivedAt)))
    .where(and(eq(list.boardId, boardId), isNull(list.archivedAt)))
    .groupBy(list.id)
    .orderBy(asc(list.position))
    .all()
}

// O quadro aberto: listas ativas com os cards ativos de cada uma, em ordem.
export function get(db: DbOrTx, boardId: string): BoardDetail {
  const found = requireBoard(db, boardId)
  const cards = summariesByList(db, boardId)
  return {
    ...summaryOf(db, boardId),
    bgTone: found.bgTone,
    lists: activeLists(db, boardId).map((l) => ({ ...l, cards: cards.get(l.id) ?? [] }))
  }
}

// QUA-02 e QUA-03: o quadro novo vai para o fim, com as 4 listas, as 6 etiquetas e o fundo Mello.
export function create(db: Db, title: string, now: number): BoardSummary {
  return db.transaction((tx) => {
    const last =
      tx
        .select({ last: max(board.position) })
        .from(board)
        .get()?.last ?? null
    const id = randomUUID()
    tx.insert(board)
      .values({
        id,
        title,
        position: keyAfter(last),
        bgKind: DEFAULT_BACKGROUND.kind,
        bgValue: DEFAULT_BACKGROUND.value,
        bgTone: toneForBackground(DEFAULT_BACKGROUND.kind, DEFAULT_BACKGROUND.value),
        createdAt: now,
        updatedAt: now
      })
      .run()
    const positions = keysFor(DEFAULT_LISTS.length)
    DEFAULT_LISTS.forEach((defaults, i) => {
      tx.insert(list)
        .values({
          id: randomUUID(),
          boardId: id,
          position: positions[i]!,
          ...defaults,
          createdAt: now,
          updatedAt: now
        })
        .run()
    })
    createDefaultLabels(tx, id)
    return summaryOf(tx, id)
  })
}

export function update(
  db: DbOrTx,
  input: { boardId: string; title?: string; isFavorite?: boolean },
  now: number
): BoardSummary {
  requireBoard(db, input.boardId)
  const changes: Partial<typeof board.$inferInsert> = { updatedAt: now }
  if (input.title !== undefined) changes.title = input.title
  if (input.isFavorite !== undefined) changes.isFavorite = input.isFavorite
  db.update(board).set(changes).where(eq(board.id, input.boardId)).run()
  return summaryOf(db, input.boardId)
}

// Ordem manual no Início (QUA-06). O índice conta só os quadros abertos do mesmo grupo
// (favoritos ou não favoritos); fechados, modelos e o outro grupo ficam ocultos.
export function move(db: Db, boardId: string, index: number, now: number): void {
  db.transaction((tx) => {
    const moving = requireBoard(tx, boardId)
    const all = tx.select().from(board).orderBy(asc(board.position)).all()
    const hidden = (b: typeof moving) =>
      b.closedAt !== null || b.isTemplate || b.isFavorite !== moving.isFavorite
    let siblings = all.map((b) => ({ id: b.id, position: b.position, hidden: hidden(b) }))
    if (visibleIndex(siblings, boardId) === index) return
    siblings = siblings.filter((s) => s.id !== boardId)
    let key = keyAt(siblings, index)
    if (key === null) {
      for (const [id, position] of rebalance(siblings)) {
        tx.update(board).set({ position }).where(eq(board.id, id)).run()
      }
      siblings = tx
        .select()
        .from(board)
        .orderBy(asc(board.position))
        .all()
        .filter((b) => b.id !== boardId)
        .map((b) => ({ id: b.id, position: b.position, hidden: hidden(b) }))
      key = keyAt(siblings, index)!
    }
    tx.update(board).set({ position: key, updatedAt: now }).where(eq(board.id, boardId)).run()
  })
}

// QUA-04: fechar tira do Início; reabrir devolve.
export function close(db: DbOrTx, boardId: string, now: number): void {
  requireBoard(db, boardId)
  db.update(board).set({ closedAt: now, updatedAt: now }).where(eq(board.id, boardId)).run()
}

export function reopen(db: DbOrTx, boardId: string, now: number): void {
  requireBoard(db, boardId)
  db.update(board).set({ closedAt: null, updatedAt: now }).where(eq(board.id, boardId)).run()
}

// QUA-07: excluir de vez, só um quadro fechado. Listas, cards, etiquetas, checklists, atividade,
// anexos e repetições saem junto (ON DELETE CASCADE). Os arquivos sem referência são limpos na
// abertura seguinte (DAD-08, etapa 10).
export function remove(db: DbOrTx, boardId: string): void {
  const found = requireBoard(db, boardId)
  if (found.closedAt === null) {
    throw new AppError('CONFLICT', 'Feche o quadro antes de excluí-lo.')
  }
  db.delete(board).where(eq(board.id, boardId)).run()
}

// "Itens arquivados" do menu do quadro: cards arquivados um a um e listas arquivadas, do mais
// recente para o mais antigo.
export function archived(db: DbOrTx, boardId: string): ArchivedItems {
  requireBoard(db, boardId)
  const cards = db
    .select({ id: card.id, title: card.title, listTitle: list.title, archivedAt: card.archivedAt })
    .from(card)
    .innerJoin(list, eq(card.listId, list.id))
    .where(and(eq(list.boardId, boardId), isNotNull(card.archivedAt)))
    .orderBy(desc(card.archivedAt))
    .all()
  const lists = db
    .select({ id: list.id, title: list.title, archivedAt: list.archivedAt })
    .from(list)
    .where(and(eq(list.boardId, boardId), isNotNull(list.archivedAt)))
    .orderBy(desc(list.archivedAt))
    .all()
  return {
    cards: cards.map((c) => ({ ...c, archivedAt: c.archivedAt! })),
    lists: lists.map((l) => ({ ...l, archivedAt: l.archivedAt! }))
  }
}

// FUN-02: a imagem escolhida ou solta no editor, JPG, PNG ou WEBP de até 25 MB, reconhecida pelo
// conteúdo antes de ser copiada. Fica guardada para a prévia; o quadro só muda com setBackground
// (FUN-07). Uma imagem que não chegou a ser aplicada sai na limpeza dos arquivos sem uso (DAD-08).
export async function uploadBackground(
  db: Db,
  store: FileStore,
  boardId: string,
  pick: { path: string; name: string; size: number },
  now: number
): Promise<BackgroundImage> {
  requireBoard(db, boardId)
  if (pick.size > BACKGROUND_IMAGE_MAX_BYTES) {
    throw new AppError('INVALID_INPUT', 'A imagem passa de 25 MB. Escolha uma menor.')
  }
  const image = await sniffFile(pick.path)
  if (!image || !BACKGROUND_IMAGE_EXTENSIONS.includes(image.ext)) {
    throw new AppError('INVALID_INPUT', 'Escolha uma imagem JPG, PNG ou WEBP.')
  }
  const saved = await storeFile(db, store, pick.path, now, { imageOnly: true })
  return {
    fileId: saved.id,
    url: fileUrl(saved.id, saved.ext),
    width: saved.width!,
    height: saved.height!,
    name: pick.name
  }
}

// FUN-01 e FUN-07: "Aplicar ao quadro". Cor e gradiente voltam os ajustes ao padrão. O tom do
// envelhecimento (FUN-09) sai da cor ou do gradiente, ou da cor média da imagem, guardada no
// arquivo no primeiro uso. Não mexe nos cards (o envelhecimento continua contando).
export function setBackground(db: Db, input: SetBackgroundInput, now: number): void {
  const chosen = input.background
  db.transaction((tx) => {
    requireBoard(tx, input.boardId)
    if (chosen.kind !== 'image') {
      tx.update(board)
        .set({
          bgKind: chosen.kind,
          bgValue: chosen.value,
          bgAuto: BACKGROUND_DEFAULTS.auto,
          bgFocus: BACKGROUND_DEFAULTS.focus,
          bgZoom: BACKGROUND_DEFAULTS.zoom,
          bgDim: BACKGROUND_DEFAULTS.dim,
          bgBlur: BACKGROUND_DEFAULTS.blur,
          bgTone: toneForBackground(chosen.kind, chosen.value),
          updatedAt: now
        })
        .where(eq(board.id, input.boardId))
        .run()
      return
    }
    const image = tx.select().from(file).where(eq(file.id, chosen.value)).get()
    if (!image || image.width === null || !BACKGROUND_IMAGE_EXTENSIONS.includes(image.ext)) {
      throw new AppError('NOT_FOUND', 'A imagem não foi encontrada. Envie de novo.')
    }
    const avgColor = image.avgColor ?? chosen.avgColor
    if (image.avgColor === null) {
      tx.update(file).set({ avgColor }).where(eq(file.id, image.id)).run()
    }
    tx.update(board)
      .set({
        bgKind: 'image',
        bgValue: image.id,
        bgAuto: chosen.auto,
        bgFocus: chosen.focus,
        bgZoom: chosen.zoom,
        bgDim: chosen.dim,
        bgBlur: chosen.blur,
        bgTone: agingTone(avgColor),
        updatedAt: now
      })
      .where(eq(board.id, input.boardId))
      .run()
  })
}
