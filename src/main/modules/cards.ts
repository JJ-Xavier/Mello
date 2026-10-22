// Cards: criar, mover (arrastar), abrir, a face do card no quadro, copiar (com a lista), arquivar
// todos os de uma lista, restaurar e excluir. Editar os campos entra nas etapas 4 e 5.
import { randomUUID } from 'node:crypto'
import { and, asc, count, eq, inArray, isNull, max, sql, type SQL } from 'drizzle-orm'
import type { CardDetail, CardSummary } from '../../shared/ipc/cards'
import { AppError } from '../../shared/result'
import { doneAfterMove } from '../../shared/rules/finished'
import type { Db, DbOrTx, Tx } from '../db/client'
import {
  activity,
  attachment,
  board,
  card,
  cardLabel,
  checklist,
  checklistItem,
  label,
  list
} from '../db/schema'
import { mapLabelsToBoard } from './labels'
import { keyAfter, keyAt, rebalance, visibleIndex } from './position'

type ActivityKind = (typeof activity.$inferInsert)['kind']

export function addActivity(
  tx: DbOrTx,
  cardId: string,
  kind: ActivityKind,
  data: Record<string, unknown>,
  now: number
): void {
  tx.insert(activity)
    .values({ id: randomUUID(), cardId, kind, data: JSON.stringify(data), createdAt: now })
    .run()
}

// Zera o envelhecimento (ENV-05): a última alteração do card passa a ser agora.
export function touch(tx: DbOrTx, cardId: string, now: number): void {
  tx.update(card).set({ lastActivityAt: now, updatedAt: now }).where(eq(card.id, cardId)).run()
}

// Copia um card (CAR-07): título, descrição, nota, ✓, etiquetas, prioridade, data, lembrete, capa,
// checklists com o estado dos itens e anexos. Não copia a atividade nem a repetição. A cópia
// nasce com nível 0 e com a atividade "Copiado de <título>" (ENV-07, ATV-02).
// labelMap troca as etiquetas quando a cópia vai para outro quadro (LIS-05).
export function copyCard(
  tx: Tx,
  sourceId: string,
  target: { listId: string; position: string; labelMap?: Map<string, string> },
  now: number
): string {
  const source = tx.select().from(card).where(eq(card.id, sourceId)).get()
  if (!source) throw new AppError('NOT_FOUND', 'Card não encontrado.')
  const id = randomUUID()
  tx.insert(card)
    .values({
      ...source,
      id,
      listId: target.listId,
      position: target.position,
      reminderFiredAt: null,
      recurrenceId: null,
      occurrenceDate: null,
      lastActivityAt: now,
      archivedAt: null,
      createdAt: now,
      updatedAt: now
    })
    .run()

  const labels = tx.select().from(cardLabel).where(eq(cardLabel.cardId, sourceId)).all()
  for (const row of labels) {
    const labelId = target.labelMap?.get(row.labelId) ?? row.labelId
    tx.insert(cardLabel).values({ cardId: id, labelId }).onConflictDoNothing().run()
  }

  const lists = tx
    .select()
    .from(checklist)
    .where(eq(checklist.cardId, sourceId))
    .orderBy(asc(checklist.position))
    .all()
  for (const list of lists) {
    const checklistId = randomUUID()
    tx.insert(checklist)
      .values({ ...list, id: checklistId, cardId: id })
      .run()
    const items = tx
      .select()
      .from(checklistItem)
      .where(eq(checklistItem.checklistId, list.id))
      .all()
    for (const item of items) {
      tx.insert(checklistItem)
        .values({ ...item, id: randomUUID(), checklistId, createdAt: now, updatedAt: now })
        .run()
    }
  }

  const files = tx.select().from(attachment).where(eq(attachment.cardId, sourceId)).all()
  for (const file of files) {
    tx.insert(attachment)
      .values({ ...file, id: randomUUID(), cardId: id, createdAt: now })
      .run()
  }

  addActivity(tx, id, 'copied', { from: source.title }, now)
  return id
}

// Arquiva todos os cards ativos de uma lista (LIS-07). Arquivar não zera o envelhecimento.
export function archiveAllInList(tx: Tx, listId: string, now: number): number {
  const active = tx
    .select({ id: card.id })
    .from(card)
    .where(and(eq(card.listId, listId), isNull(card.archivedAt)))
    .all()
  if (active.length === 0) return 0
  const ids = active.map((row) => row.id)
  tx.update(card).set({ archivedAt: now, updatedAt: now }).where(inArray(card.id, ids)).run()
  for (const cardId of ids) addActivity(tx, cardId, 'archived', {}, now)
  return ids.length
}

// Restaura um card arquivado (CAR-05). Restaurar zera o envelhecimento (ENV-05).
export function restore(db: DbOrTx, cardId: string, now: number): void {
  db.transaction((tx) => {
    const found = tx
      .select({ archivedAt: card.archivedAt })
      .from(card)
      .where(eq(card.id, cardId))
      .get()
    if (!found) throw new AppError('NOT_FOUND', 'Card não encontrado.')
    if (found.archivedAt === null) return
    tx.update(card).set({ archivedAt: null }).where(eq(card.id, cardId)).run()
    touch(tx, cardId, now)
    addActivity(tx, cardId, 'restored', {}, now)
  })
}

// Exclui de vez (CAR-05). Etiquetas, checklists, atividade e anexos do card saem junto (CASCADE).
export function remove(db: DbOrTx, cardId: string): void {
  const result = db.delete(card).where(eq(card.id, cardId)).run()
  if (result.changes === 0) throw new AppError('NOT_FOUND', 'Card não encontrado.')
}

function requireCard(db: DbOrTx, cardId: string) {
  const found = db.select().from(card).where(eq(card.id, cardId)).get()
  if (!found) throw new AppError('NOT_FOUND', 'Card não encontrado.')
  return found
}

// A lista que recebe um card precisa estar ativa, num quadro aberto.
function requireTargetList(db: DbOrTx, listId: string) {
  const found = db
    .select({
      id: list.id,
      boardId: list.boardId,
      title: list.title,
      isDoneList: list.isDoneList,
      archivedAt: list.archivedAt,
      boardTitle: board.title,
      boardClosedAt: board.closedAt
    })
    .from(list)
    .innerJoin(board, eq(list.boardId, board.id))
    .where(eq(list.id, listId))
    .get()
  if (!found) throw new AppError('NOT_FOUND', 'Lista não encontrada.')
  if (found.archivedAt !== null) throw new AppError('CONFLICT', 'A lista está arquivada.')
  if (found.boardClosedAt !== null) throw new AppError('CONFLICT', 'O quadro está fechado.')
  return found
}

// Os dados da face (CAR-04) dos cards que atendem `where` (sobre card + lista), em ordem.
function summaries(db: DbOrTx, where: SQL | undefined): CardSummary[] {
  const rows = db
    .select({
      id: card.id,
      listId: card.listId,
      title: card.title,
      position: card.position,
      isDone: card.isDone,
      dueAt: card.dueAt,
      descriptionText: card.descriptionText,
      noteText: card.noteText
    })
    .from(card)
    .innerJoin(list, eq(card.listId, list.id))
    .where(where)
    .orderBy(asc(card.position))
    .all()
  if (rows.length === 0) return []

  const labels = db
    .select({ cardId: cardLabel.cardId, id: label.id, color: label.color, name: label.name })
    .from(cardLabel)
    .innerJoin(label, eq(cardLabel.labelId, label.id))
    .innerJoin(card, eq(cardLabel.cardId, card.id))
    .innerJoin(list, eq(card.listId, list.id))
    .where(where)
    .orderBy(asc(label.position))
    .all()
  const checks = db
    .select({
      cardId: checklist.cardId,
      total: count(checklistItem.id),
      done: sql<number>`sum(${checklistItem.isDone})`.mapWith(Number)
    })
    .from(checklistItem)
    .innerJoin(checklist, eq(checklistItem.checklistId, checklist.id))
    .innerJoin(card, eq(checklist.cardId, card.id))
    .innerJoin(list, eq(card.listId, list.id))
    .where(where)
    .groupBy(checklist.cardId)
    .all()
  const files = db
    .select({ cardId: attachment.cardId, total: count(attachment.id) })
    .from(attachment)
    .innerJoin(card, eq(attachment.cardId, card.id))
    .innerJoin(list, eq(card.listId, list.id))
    .where(where)
    .groupBy(attachment.cardId)
    .all()

  const labelsOf = new Map<string, CardSummary['labels']>()
  for (const { cardId, ...rest } of labels) {
    labelsOf.set(cardId, [...(labelsOf.get(cardId) ?? []), rest])
  }
  const checksOf = new Map(checks.map((c) => [c.cardId, c]))
  const filesOf = new Map(files.map((f) => [f.cardId, f.total]))
  return rows.map(({ descriptionText, noteText, ...row }) => ({
    ...row,
    labels: labelsOf.get(row.id) ?? [],
    hasDescription: descriptionText.trim() !== '',
    hasNote: noteText.trim() !== '',
    attachmentCount: filesOf.get(row.id) ?? 0,
    checkDone: checksOf.get(row.id)?.done ?? 0,
    checkTotal: checksOf.get(row.id)?.total ?? 0
  }))
}

// Cards ativos do quadro (listas ativas, cards não arquivados), agrupados pela lista.
export function summariesByList(db: DbOrTx, boardId: string): Map<string, CardSummary[]> {
  const byList = new Map<string, CardSummary[]>()
  const where = and(eq(list.boardId, boardId), isNull(list.archivedAt), isNull(card.archivedAt))
  for (const summary of summaries(db, where)) {
    byList.set(summary.listId, [...(byList.get(summary.listId) ?? []), summary])
  }
  return byList
}

export function get(db: DbOrTx, cardId: string): CardDetail {
  const found = db
    .select({
      id: card.id,
      boardId: list.boardId,
      listId: card.listId,
      listTitle: list.title,
      isDoneList: list.isDoneList,
      title: card.title,
      isDone: card.isDone
    })
    .from(card)
    .innerJoin(list, eq(card.listId, list.id))
    .where(eq(card.id, cardId))
    .get()
  if (!found) throw new AppError('NOT_FOUND', 'Card não encontrado.')
  return found
}

// CAR-02: o card novo entra no fim da lista, com nível 0 (última alteração = agora). Criado direto
// numa lista de conclusão, nasce sem o ✓: o ✓ automático é só para quem chega arrastado ou movido
// (FIN-02, decidido na etapa 3).
export function create(db: Db, listId: string, title: string, now: number): CardSummary {
  const id = randomUUID()
  db.transaction((tx) => {
    const target = requireTargetList(tx, listId)
    const last =
      tx
        .select({ last: max(card.position) })
        .from(card)
        .where(eq(card.listId, listId))
        .get()?.last ?? null
    tx.insert(card)
      .values({
        id,
        listId,
        title,
        position: keyAfter(last),
        lastActivityAt: now,
        createdAt: now,
        updatedAt: now
      })
      .run()
    addActivity(tx, id, 'created', { list: target.title }, now)
  })
  return summaries(db, eq(card.id, id))[0]!
}

// Todos os cards da lista em ordem (os arquivados ocultos), sem o que está sendo movido.
function siblingsOf(tx: DbOrTx, listId: string, exceptId: string) {
  return tx
    .select({ id: card.id, position: card.position, archivedAt: card.archivedAt })
    .from(card)
    .where(eq(card.listId, listId))
    .orderBy(asc(card.position))
    .all()
    .filter((c) => c.id !== exceptId)
    .map((c) => ({ id: c.id, position: c.position, hidden: c.archivedAt !== null }))
}

// Chave para a posição `index` entre os cards visíveis da lista, reorganizando as posições se
// houver repetidas.
function positionInList(tx: Tx, listId: string, exceptId: string, index: number): string {
  const key = keyAt(siblingsOf(tx, listId, exceptId), index)
  if (key !== null) return key
  for (const [id, position] of rebalance(siblingsOf(tx, listId, exceptId))) {
    tx.update(card).set({ position }).where(eq(card.id, id)).run()
  }
  return keyAt(siblingsOf(tx, listId, exceptId), index)!
}

// Arrastar ou mover o card para a posição `index` (entre os cards visíveis, sem ele) da lista
// `listId`, que pode ser de outro quadro (CAR-06).
// - Mesmo lugar (mesma lista e mesma posição): não grava nada (CAR-03).
// - O ✓ segue FIN-02 e FIN-03, e a mudança entra na atividade (ATV-02).
// - Zera o envelhecimento (ENV-05).
// - Em outro quadro, as etiquetas do card são recriadas lá quando não existem (LIS-05).
export function move(db: Db, cardId: string, listId: string, index: number, now: number): void {
  db.transaction((tx) => {
    const moving = requireCard(tx, cardId)
    if (moving.archivedAt !== null) throw new AppError('CONFLICT', 'O card está arquivado.')
    const to = requireTargetList(tx, listId)
    const sameList = moving.listId === listId
    if (sameList && visibleIndex(siblingsOf(tx, listId, ''), cardId) === index) return
    const from = sameList ? to : requireTargetList(tx, moving.listId)

    const isDone = doneAfterMove(moving.isDone, from, to)
    const doneAt = isDone === moving.isDone ? moving.doneAt : isDone ? now : null
    const position = positionInList(tx, listId, cardId, index)
    tx.update(card).set({ listId, position, isDone, doneAt }).where(eq(card.id, cardId)).run()
    touch(tx, cardId, now)

    if (from.boardId !== to.boardId) {
      const used = tx.select().from(cardLabel).where(eq(cardLabel.cardId, cardId)).all()
      const map = mapLabelsToBoard(
        tx,
        used.map((u) => u.labelId),
        to.boardId
      )
      for (const row of used) {
        tx.update(cardLabel)
          .set({ labelId: map.get(row.labelId)! })
          .where(and(eq(cardLabel.cardId, cardId), eq(cardLabel.labelId, row.labelId)))
          .run()
      }
    }
    if (!sameList) {
      const boards =
        from.boardId === to.boardId ? {} : { fromBoard: from.boardTitle, toBoard: to.boardTitle }
      addActivity(tx, cardId, 'moved', { from: from.title, to: to.title, ...boards }, now)
    }
    if (isDone !== moving.isDone) addActivity(tx, cardId, isDone ? 'done' : 'undone', {}, now)
  })
}
