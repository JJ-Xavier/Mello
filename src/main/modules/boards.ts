// Quadros (QUA). Todas as funções recebem o "agora" por parâmetro.
import { randomUUID } from 'node:crypto'
import { and, asc, desc, eq, isNotNull, isNull, max, sql } from 'drizzle-orm'
import type { ArchivedItems, BoardDetail, BoardSummary, ListSummary } from '../../shared/ipc/boards'
import { AppError } from '../../shared/result'
import { DEFAULT_BACKGROUND } from '../../shared/rules/background'
import { toneForBackground } from '../../shared/rules/tone'
import type { Db, DbOrTx } from '../db/client'
import { board, card, list } from '../db/schema'
import { createDefaultLabels } from './labels'
import { keyAfter, keyAt, keysFor, rebalance, visibleIndex } from './position'

// QUA-02: as 4 listas do quadro novo. Concluído e Entregue são listas de conclusão e não envelhecem.
export const DEFAULT_LISTS = [
  { title: 'A fazer', isDoneList: false, freezesAging: false },
  { title: 'Em andamento', isDoneList: false, freezesAging: false },
  { title: 'Concluído', isDoneList: true, freezesAging: true },
  { title: 'Entregue', isDoneList: true, freezesAging: true }
]

const summary = {
  id: board.id,
  title: board.title,
  position: board.position,
  isFavorite: board.isFavorite,
  closedAt: board.closedAt,
  bgKind: board.bgKind,
  bgValue: board.bgValue
}

function requireBoard(db: DbOrTx, boardId: string) {
  const found = db.select().from(board).where(eq(board.id, boardId)).get()
  if (!found) throw new AppError('NOT_FOUND', 'Quadro não encontrado.')
  return found
}

// Quadros abertos do Início e de "Mudar de quadros": favoritos primeiro e, dentro de cada grupo,
// a ordem manual (QUA-06). Modelos ficam de fora (seção própria na etapa 11).
export function listOpen(db: DbOrTx): BoardSummary[] {
  return db
    .select(summary)
    .from(board)
    .where(and(isNull(board.closedAt), eq(board.isTemplate, false)))
    .orderBy(desc(board.isFavorite), asc(board.position))
    .all()
}

// "Ver todos os quadros fechados" (QUA-04), do fechado mais recente para o mais antigo.
export function listClosed(db: DbOrTx): BoardSummary[] {
  return db
    .select(summary)
    .from(board)
    .where(isNotNull(board.closedAt))
    .orderBy(desc(board.closedAt))
    .all()
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

export function get(db: DbOrTx, boardId: string): BoardDetail {
  const found = requireBoard(db, boardId)
  return {
    id: found.id,
    title: found.title,
    position: found.position,
    isFavorite: found.isFavorite,
    closedAt: found.closedAt,
    bgKind: found.bgKind,
    bgValue: found.bgValue,
    bgTone: found.bgTone,
    lists: activeLists(db, boardId)
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
    return tx.select(summary).from(board).where(eq(board.id, id)).get()!
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
  return db.select(summary).from(board).where(eq(board.id, input.boardId)).get()!
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
