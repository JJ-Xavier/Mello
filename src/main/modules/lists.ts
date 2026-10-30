// Listas (LIS). Mover, copiar ou arquivar uma lista não conta como alteração dos cards dela: o
// envelhecimento não zera (ENV-06). Só as cópias dos cards nascem novas (ENV-07).
import { randomUUID } from 'node:crypto'
import { and, asc, eq, inArray, isNull, max } from 'drizzle-orm'
import type { ListSummary } from '../../shared/ipc/boards'
import { LIST_TITLE_MAX } from '../../shared/limits'
import { AppError } from '../../shared/result'
import { sortByDue } from '../../shared/rules/dates'
import { sortByPriority } from '../../shared/rules/priority'
import type { Db, DbOrTx, Tx } from '../db/client'
import { board, card, cardLabel, list, recurrence } from '../db/schema'
import { activeLists } from './boards'
import { archiveAllInList, copyCard } from './cards'
import { mapLabelsToBoard } from './labels'
import { keyAfter, keyAt, keyBetween, keysFor, rebalance, visibleIndex } from './position'

function requireList(db: DbOrTx, listId: string) {
  const found = db.select().from(list).where(eq(list.id, listId)).get()
  if (!found) throw new AppError('NOT_FOUND', 'Lista não encontrada.')
  return found
}

function requireOpenBoard(db: DbOrTx, boardId: string) {
  const found = db.select().from(board).where(eq(board.id, boardId)).get()
  if (!found) throw new AppError('NOT_FOUND', 'Quadro não encontrado.')
  if (found.closedAt !== null) throw new AppError('CONFLICT', 'O quadro está fechado.')
  return found
}

function summaryOf(db: DbOrTx, listId: string): ListSummary {
  const found = requireList(db, listId)
  const counted = activeLists(db, found.boardId).find((l) => l.id === listId)
  return (
    counted ?? {
      id: found.id,
      boardId: found.boardId,
      title: found.title,
      position: found.position,
      freezesAging: found.freezesAging,
      isDoneList: found.isDoneList,
      cardCount: 0
    }
  )
}

// Todas as listas do quadro em ordem (arquivadas ocultas), sem a que está sendo movida.
function siblingsOf(tx: DbOrTx, boardId: string, exceptId: string) {
  return tx
    .select({ id: list.id, position: list.position, archivedAt: list.archivedAt })
    .from(list)
    .where(eq(list.boardId, boardId))
    .orderBy(asc(list.position))
    .all()
    .filter((l) => l.id !== exceptId)
    .map((l) => ({ id: l.id, position: l.position, hidden: l.archivedAt !== null }))
}

// Chave para a posição `index` entre as listas visíveis do quadro, reorganizando as posições se
// houver repetidas.
function positionInBoard(tx: Tx, boardId: string, exceptId: string, index: number): string {
  const key = keyAt(siblingsOf(tx, boardId, exceptId), index)
  if (key !== null) return key
  for (const [id, position] of rebalance(siblingsOf(tx, boardId, exceptId))) {
    tx.update(list).set({ position }).where(eq(list.id, id)).run()
  }
  return keyAt(siblingsOf(tx, boardId, exceptId), index)!
}

// Lista nova vai para o fim do quadro.
export function create(db: Db, boardId: string, title: string, now: number): ListSummary {
  const id = randomUUID()
  db.transaction((tx) => {
    requireOpenBoard(tx, boardId)
    const last =
      tx
        .select({ last: max(list.position) })
        .from(list)
        .where(eq(list.boardId, boardId))
        .get()?.last ?? null
    tx.insert(list)
      .values({ id, boardId, title, position: keyAfter(last), createdAt: now, updatedAt: now })
      .run()
  })
  return summaryOf(db, id)
}

// Renomear e as duas opções independentes do menu (LIS-02). Ligar ou desligar "Lista de
// conclusão" não muda o ✓ dos cards que já estão nela (FIN-06).
export function update(
  db: DbOrTx,
  input: { listId: string; title?: string; freezesAging?: boolean; isDoneList?: boolean },
  now: number
): ListSummary {
  requireList(db, input.listId)
  const changes: Partial<typeof list.$inferInsert> = { updatedAt: now }
  if (input.title !== undefined) changes.title = input.title
  if (input.freezesAging !== undefined) changes.freezesAging = input.freezesAging
  if (input.isDoneList !== undefined) changes.isDoneList = input.isDoneList
  db.update(list).set(changes).where(eq(list.id, input.listId)).run()
  return summaryOf(db, input.listId)
}

// LIS-03: arrastar muda só a posição. Soltar no mesmo lugar não grava nada.
export function move(db: Db, listId: string, index: number, now: number): void {
  db.transaction((tx) => {
    const moving = requireList(tx, listId)
    const all = siblingsOf(tx, moving.boardId, '')
    if (visibleIndex(all, listId) === index) return
    const position = positionInBoard(tx, moving.boardId, listId, index)
    tx.update(list).set({ position, updatedAt: now }).where(eq(list.id, listId)).run()
  })
}

const COPY_SUFFIX = ' (cópia)'

// LIS-04: a cópia fica logo à direita, chamada "<nome> (cópia)", com cópias dos cards ativos na
// mesma ordem e com as mesmas opções da lista.
export function copy(db: Db, listId: string, now: number): ListSummary {
  const id = randomUUID()
  db.transaction((tx) => {
    const source = requireList(tx, listId)
    requireOpenBoard(tx, source.boardId)
    const next = tx
      .select({ position: list.position })
      .from(list)
      .where(eq(list.boardId, source.boardId))
      .orderBy(asc(list.position))
      .all()
      .find((l) => l.position > source.position)
    const title = source.title.slice(0, LIST_TITLE_MAX - COPY_SUFFIX.length) + COPY_SUFFIX
    tx.insert(list)
      .values({
        id,
        boardId: source.boardId,
        title,
        position: keyBetween(source.position, next?.position ?? null),
        freezesAging: source.freezesAging,
        isDoneList: source.isDoneList,
        createdAt: now,
        updatedAt: now
      })
      .run()
    const cards = tx
      .select({ id: card.id })
      .from(card)
      .where(and(eq(card.listId, listId), isNull(card.archivedAt)))
      .orderBy(asc(card.position))
      .all()
    const positions = keysFor(cards.length)
    cards.forEach((c, i) => copyCard(tx, c.id, { listId: id, position: positions[i]! }, now))
  })
  return summaryOf(db, id)
}

// LIS-05: a lista vai para outro quadro com os cards. As etiquetas usadas por eles são recriadas
// no destino quando ainda não existem lá (mesma cor e nome). As repetições que criam cards nesta
// lista passam a pertencer ao quadro de destino.
export function moveToBoard(
  db: Db,
  listId: string,
  targetBoardId: string,
  index: number,
  now: number
): void {
  const moving = requireList(db, listId)
  if (moving.boardId === targetBoardId) return move(db, listId, index, now)
  db.transaction((tx) => {
    requireOpenBoard(tx, targetBoardId)
    const position = positionInBoard(tx, targetBoardId, listId, index)
    tx.update(list)
      .set({ boardId: targetBoardId, position, updatedAt: now })
      .where(eq(list.id, listId))
      .run()

    const cardIds = tx
      .select({ id: card.id })
      .from(card)
      .where(eq(card.listId, listId))
      .all()
      .map((c) => c.id)
    if (cardIds.length > 0) {
      const used = tx.select().from(cardLabel).where(inArray(cardLabel.cardId, cardIds)).all()
      const map = mapLabelsToBoard(tx, [...new Set(used.map((u) => u.labelId))], targetBoardId)
      for (const row of used) {
        tx.update(cardLabel)
          .set({ labelId: map.get(row.labelId)! })
          .where(and(eq(cardLabel.cardId, row.cardId), eq(cardLabel.labelId, row.labelId)))
          .run()
      }
    }
    tx.update(recurrence)
      .set({ boardId: targetBoardId, updatedAt: now })
      .where(eq(recurrence.targetListId, listId))
      .run()
  })
}

// LIS-08: ordena os cards ativos da lista uma vez, por prioridade (PRI-05) ou por data de entrega
// (DAT-04). Os arquivados ficam depois deles, na ordem em que estavam. Reordenar a lista inteira não
// é alteração dos cards: não zera o envelhecimento (ENV-06).
export function sort(db: Db, listId: string, by: 'priority' | 'due'): void {
  db.transaction((tx) => {
    requireList(tx, listId)
    const all = tx
      .select({
        id: card.id,
        priority: card.priority,
        dueAt: card.dueAt,
        archivedAt: card.archivedAt
      })
      .from(card)
      .where(eq(card.listId, listId))
      .orderBy(asc(card.position))
      .all()
    const active = all.filter((c) => c.archivedAt === null)
    const order = [
      ...(by === 'priority' ? sortByPriority(active) : sortByDue(active)),
      ...all.filter((c) => c.archivedAt !== null)
    ]
    const keys = keysFor(order.length)
    order.forEach((c, i) => {
      tx.update(card).set({ position: keys[i]! }).where(eq(card.id, c.id)).run()
    })
  })
}

// LIS-06: arquivar esconde a lista e os cards dela; restaurar devolve na mesma posição.
export function archive(db: DbOrTx, listId: string, now: number): void {
  requireList(db, listId)
  db.update(list).set({ archivedAt: now, updatedAt: now }).where(eq(list.id, listId)).run()
}

export function restore(db: DbOrTx, listId: string, now: number): void {
  requireList(db, listId)
  db.update(list).set({ archivedAt: null, updatedAt: now }).where(eq(list.id, listId)).run()
}

// LIS-07: arquiva todos os cards da lista; a lista continua.
export function archiveCards(db: Db, listId: string, now: number): number {
  return db.transaction((tx) => {
    requireList(tx, listId)
    return archiveAllInList(tx, listId, now)
  })
}
